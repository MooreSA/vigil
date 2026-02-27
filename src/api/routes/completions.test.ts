import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { completionsRoute } from './completions.js';
import type { AgentService } from '../../services/agent.js';
import type { ThreadService } from '../../services/threads.js';

function mockThreadService(): ThreadService {
  return {
    create: vi.fn().mockResolvedValue({ id: 'new-thread', title: null, source: 'user' }),
    findById: vi.fn().mockResolvedValue({ id: 'existing-thread' }),
    addMessage: vi.fn(),
    getMessages: vi.fn(),
  } as unknown as ThreadService;
}

function mockAgentService(chunks: string[] = ['Hello', ' world'], usage = { input_tokens: 100, output_tokens: 50, total_tokens: 150 }): AgentService {
  return {
    runStream: vi.fn().mockImplementation(async () => ({
      stream: (async function* () {
        for (const chunk of chunks) {
          yield { type: 'delta', content: chunk };
        }
      })(),
      usage: Promise.resolve(usage),
    })),
  } as unknown as AgentService;
}

function parseSSE(body: string): Array<{ event: string; data: string }> {
  return body
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim() ?? '';
      const data = lines.find((l) => l.startsWith('data:'))?.slice(5).trim() ?? '';
      return { event, data };
    });
}

let threadService: ReturnType<typeof mockThreadService>;
let agentService: ReturnType<typeof mockAgentService>;

beforeEach(() => {
  threadService = mockThreadService();
  agentService = mockAgentService();
});

async function buildApp() {
  const app = Fastify();
  await app.register(completionsRoute, {
    prefix: '/v1',
    agentService,
    threadService,
  });
  await app.ready();
  return app;
}

describe('POST /v1/chat/completions', () => {
  it('streams SSE with thread, delta, and done events', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { thread_id: 'existing-thread', message: 'hi' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    const events = parseSSE(res.body);

    expect(events[0]).toEqual({
      event: 'thread',
      data: JSON.stringify({ thread_id: 'existing-thread' }),
    });
    expect(events[1]).toEqual({
      event: 'delta',
      data: JSON.stringify({ content: 'Hello' }),
    });
    expect(events[2]).toEqual({
      event: 'delta',
      data: JSON.stringify({ content: ' world' }),
    });
    expect(events[events.length - 1]).toEqual({
      event: 'done',
      data: JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }),
    });
  });

  it('auto-creates thread when thread_id omitted', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { message: 'hello' },
    });

    const events = parseSSE(res.body);

    expect(threadService.create).toHaveBeenCalled();
    expect(events[0]).toEqual({
      event: 'thread',
      data: JSON.stringify({ thread_id: 'new-thread' }),
    });
  });

  it('returns 404 for non-existent thread', async () => {
    vi.mocked(threadService.findById).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { thread_id: 'bad-id', message: 'hello' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Thread not found' });
  });

  it('returns 400 for missing message', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty message', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { message: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('sends error event when stream throws', async () => {
    agentService = {
      runStream: vi.fn().mockImplementation(async () => ({
        stream: (async function* () {
          yield { type: 'delta', content: 'partial' };
          throw new Error('LLM exploded');
        })(),
        usage: Promise.resolve(null),
      })),
    } as unknown as ReturnType<typeof mockAgentService>;
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { thread_id: 'existing-thread', message: 'hi' },
    });

    const events = parseSSE(res.body);
    const errorEvent = events.find((e) => e.event === 'error');

    expect(errorEvent).toBeDefined();
    expect(JSON.parse(errorEvent!.data)).toEqual({ message: 'LLM exploded' });
  });

  it('calls agentService.runStream with correct args', async () => {
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { thread_id: 'existing-thread', message: 'what is 2+2' },
    });

    expect(agentService.runStream).toHaveBeenCalledWith('existing-thread', 'what is 2+2');
  });
});
