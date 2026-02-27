import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { threadsRoute } from './threads.js';
import type { ThreadService } from '../../services/threads.js';

function mockThreadService(): ThreadService {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    addMessage: vi.fn(),
    getMessages: vi.fn(),
  } as unknown as ThreadService;
}

let threadService: ReturnType<typeof mockThreadService>;

beforeEach(() => {
  threadService = mockThreadService();
});

async function buildApp() {
  const app = Fastify();
  await app.register(threadsRoute, {
    prefix: '/v1',
    threadService,
  });
  await app.ready();
  return app;
}

describe('GET /v1/threads', () => {
  it('returns thread list from service', async () => {
    const threads = [
      { id: '2', title: 'Second', source: 'user', created_at: new Date(), updated_at: new Date() },
      { id: '1', title: null, source: 'user', created_at: new Date(), updated_at: new Date() },
    ];
    vi.mocked(threadService.list).mockResolvedValue(threads as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/threads' });

    expect(res.statusCode).toBe(200);
    expect(threadService.list).toHaveBeenCalled();
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('2');
  });
});

describe('GET /v1/threads/:id', () => {
  it('returns thread and messages', async () => {
    const thread = { id: '42', title: 'Test', source: 'user' };
    const messages = [
      { id: '1', thread_id: '42', role: 'user', content: { role: 'user', content: 'hi' } },
      { id: '2', thread_id: '42', role: 'assistant', content: { role: 'assistant', content: 'hello' } },
    ];
    vi.mocked(threadService.findById).mockResolvedValue(thread as any);
    vi.mocked(threadService.getMessages).mockResolvedValue(messages as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/threads/42' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.thread.id).toBe('42');
    expect(body.messages).toHaveLength(2);
    expect(threadService.findById).toHaveBeenCalledWith('42');
    expect(threadService.getMessages).toHaveBeenCalledWith('42');
  });

  it('returns 404 for non-existent thread', async () => {
    vi.mocked(threadService.findById).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/threads/999' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Thread not found' });
  });
});
