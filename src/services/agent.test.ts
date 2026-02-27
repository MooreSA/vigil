import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { AgentService } from './agent.js';
import type { RunFn } from './agent.js';
import type { ThreadService } from './threads.js';
import type { OpenAIChatCompletionsModel } from '@openai/agents';
import pino from 'pino';

function mockThreadService(): ThreadService {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    addMessage: vi.fn().mockResolvedValue({ id: '1' }),
    getMessages: vi.fn().mockResolvedValue([]),
    updateTitle: vi.fn().mockResolvedValue(undefined),
  } as unknown as ThreadService;
}

function fakeStreamResult(chunks: string[]) {
  let completed: () => void;
  const completedPromise = new Promise<void>((r) => { completed = r; });

  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield {
          type: 'raw_model_stream_event' as const,
          data: { type: 'output_text_delta' as const, delta: chunk },
        };
      }
      completed!();
    },
    completed: completedPromise,
  };
}

const logger = pino({ level: 'silent' });

let threadService: ReturnType<typeof mockThreadService>;
let eventBus: EventEmitter;
let runFn: ReturnType<typeof vi.fn<RunFn>>;
let service: AgentService;

beforeEach(() => {
  threadService = mockThreadService();
  eventBus = new EventEmitter();
  runFn = vi.fn<RunFn>();
  service = new AgentService({
    model: {} as OpenAIChatCompletionsModel,
    modelName: 'anthropic/claude-sonnet-4',
    eventBus,
    threadService,
    logger,
    maxIterations: 5,
    run: runFn,
  });
});

describe('AgentService', () => {
  describe('runStream', () => {
    it('persists user message before calling SDK', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['hi']) as any);

      const gen = service.runStream('t1', 'hello');
      await gen.next();
      await gen.next(); // drain

      expect(threadService.addMessage).toHaveBeenCalledWith({
        thread_id: 't1',
        role: 'user',
        content: { role: 'user', content: 'hello' },
      });

      // user message persisted before getMessages was called
      const addOrder = vi.mocked(threadService.addMessage).mock.invocationCallOrder[0];
      const getOrder = vi.mocked(threadService.getMessages).mock.invocationCallOrder[0];
      expect(addOrder).toBeLessThan(getOrder);
    });

    it('yields text deltas from stream events', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['Hello', ', ', 'world!']) as any);

      const chunks: string[] = [];
      for await (const chunk of service.runStream('t1', 'hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ', ', 'world!']);
    });

    it('persists assembled assistant message after stream', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['Good ', 'morning']) as any);

      // drain the generator
      for await (const _ of service.runStream('t1', 'hi')) { /* noop */ }

      const calls = vi.mocked(threadService.addMessage).mock.calls;
      const assistantCall = calls.find((c) => c[0].role === 'assistant');
      expect(assistantCall).toBeDefined();
      expect(assistantCall![0]).toEqual({
        thread_id: 't1',
        role: 'assistant',
        model: 'anthropic/claude-sonnet-4',
        content: { role: 'assistant', content: 'Good morning' },
      });
    });

    it('loads thread history and passes to run', async () => {
      const history = [
        { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hey' }, model: null, deleted_at: null, created_at: new Date() },
      ];
      vi.mocked(threadService.getMessages).mockResolvedValue(history as any);
      runFn.mockResolvedValue(fakeStreamResult(['yo']) as any);

      for await (const _ of service.runStream('t1', 'hi')) { /* noop */ }

      expect(threadService.getMessages).toHaveBeenCalledWith('t1');
      expect(runFn).toHaveBeenCalledWith(
        expect.any(Object), // Agent
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        expect.objectContaining({ stream: true, maxTurns: 5 }),
      );
    });

    it('emits response:complete after persisting assistant message', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['Hi']) as any);

      const emitted: { threadId: string }[] = [];
      eventBus.on('response:complete', (data) => emitted.push(data));

      for await (const _ of service.runStream('t1', 'hello')) { /* drain */ }

      expect(emitted).toEqual([{ threadId: 't1' }]);
    });

    it('skips non-text-delta events', async () => {
      let completed: () => void;
      const completedPromise = new Promise<void>((r) => { completed = r; });

      const result = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'agent_updated_stream_event', agent: { name: 'vigil' } };
          yield { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'only this' } };
          yield { type: 'run_item_stream_event', item: {} };
          completed!();
        },
        completed: completedPromise,
      };
      runFn.mockResolvedValue(result as any);

      const chunks: string[] = [];
      for await (const chunk of service.runStream('t1', 'hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['only this']);
    });
  });
});
