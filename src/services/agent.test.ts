import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { AgentService } from './agent.js';
import type { RunFn, StreamEvent } from './agent.js';
import type { ThreadService } from './threads.js';
import type { MemoryService } from './memory.js';
import type { OpenAIChatCompletionsModel } from '@openai/agents';
import pino from 'pino';

function mockThreadService(): ThreadService {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    addMessage: vi.fn().mockResolvedValue({ id: '1' }),
    getMessages: vi.fn().mockResolvedValue([]),
    updateTitle: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as ThreadService;
}

function mockMemoryService(): MemoryService {
  return {
    remember: vi.fn().mockResolvedValue({ id: '1', content: 'test' }),
    recall: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    update: vi.fn(),
  } as unknown as MemoryService;
}

function fakeStreamResult(chunks: string[], usage?: { inputTokens: number; outputTokens: number; totalTokens: number }) {
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
    state: {
      usage: usage ?? { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    },
  };
}

const logger = pino({ level: 'silent' });

let threadService: ReturnType<typeof mockThreadService>;
let memoryService: ReturnType<typeof mockMemoryService>;
let eventBus: EventEmitter;
let runFn: ReturnType<typeof vi.fn<RunFn>>;
let service: AgentService;

beforeEach(() => {
  threadService = mockThreadService();
  memoryService = mockMemoryService();
  eventBus = new EventEmitter();
  runFn = vi.fn<RunFn>();
  service = new AgentService({
    model: {} as OpenAIChatCompletionsModel,
    modelName: 'anthropic/claude-sonnet-4',
    eventBus,
    threadService,
    memoryService,
    logger,
    maxIterations: 5,
    tools: [],
    run: runFn,
  });
});

describe('AgentService', () => {
  describe('runStream', () => {
    it('persists user message before calling SDK', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['hi']) as any);

      const { stream } = await service.runStream('t1', 'hello');
      for await (const _ of stream) { /* drain */ }

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

      const events: StreamEvent[] = [];
      const { stream } = await service.runStream('t1', 'hi');
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'delta', content: 'Hello' },
        { type: 'delta', content: ', ' },
        { type: 'delta', content: 'world!' },
      ]);
    });

    it('persists assembled assistant message with usage after stream', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['Good ', 'morning'], { inputTokens: 200, outputTokens: 80, totalTokens: 280 }) as any);

      const { stream } = await service.runStream('t1', 'hi');
      for await (const _ of stream) { /* noop */ }

      const calls = vi.mocked(threadService.addMessage).mock.calls;
      const assistantCall = calls.find((c) => c[0].role === 'assistant');
      expect(assistantCall).toBeDefined();
      expect(assistantCall![0]).toEqual({
        thread_id: 't1',
        role: 'assistant',
        model: 'anthropic/claude-sonnet-4',
        content: {
          role: 'assistant',
          content: 'Good morning',
          usage: { input_tokens: 200, output_tokens: 80, total_tokens: 280 },
        },
      });
    });

    it('resolves usage promise after stream completes', async () => {
      runFn.mockResolvedValue(fakeStreamResult(['hi'], { inputTokens: 10, outputTokens: 5, totalTokens: 15 }) as any);

      const { stream, usage } = await service.runStream('t1', 'hello');
      for await (const _ of stream) { /* drain */ }

      const tokenUsage = await usage;
      expect(tokenUsage).toEqual({ input_tokens: 10, output_tokens: 5, total_tokens: 15 });
    });

    it('loads thread history and passes to run', async () => {
      const history = [
        { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hey' }, model: null, deleted_at: null, created_at: new Date() },
      ];
      vi.mocked(threadService.getMessages).mockResolvedValue(history as any);
      runFn.mockResolvedValue(fakeStreamResult(['yo']) as any);

      const { stream } = await service.runStream('t1', 'hi');
      for await (const _ of stream) { /* noop */ }

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

      const { stream } = await service.runStream('t1', 'hello');
      for await (const _ of stream) { /* drain */ }

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
        state: { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } },
      };
      runFn.mockResolvedValue(result as any);

      const events: StreamEvent[] = [];
      const { stream } = await service.runStream('t1', 'hi');
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([{ type: 'delta', content: 'only this' }]);
    });

    it('assembles system prompt with memories on first message', async () => {
      // First call to getMessages returns just the user message (no system)
      vi.mocked(threadService.getMessages).mockResolvedValueOnce([
        { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      ] as any);

      vi.mocked(memoryService.recall).mockResolvedValue([
        { id: '10', content: 'User prefers dark mode', source: 'agent', thread_id: null, similarity: 0.85, created_at: new Date(), updated_at: new Date() },
      ]);

      // Second call (after system prompt assembled) returns system + user
      vi.mocked(threadService.getMessages).mockResolvedValueOnce([
        { id: '2', thread_id: 't1', role: 'system', content: { role: 'system', content: 'system prompt here' }, model: null, deleted_at: null, created_at: new Date() },
        { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      ] as any);

      runFn.mockResolvedValue(fakeStreamResult(['Hi!']) as any);

      const { stream } = await service.runStream('t1', 'hello');
      for await (const _ of stream) { /* drain */ }

      // Should have called recall with user message
      expect(memoryService.recall).toHaveBeenCalledWith('hello');

      // Should have persisted system prompt with memories
      const systemCall = vi.mocked(threadService.addMessage).mock.calls.find(
        (c) => c[0].role === 'system',
      );
      expect(systemCall).toBeDefined();
      const systemContent = (systemCall![0].content as { content: string }).content;
      expect(systemContent).toContain('User prefers dark mode');
    });

    it('skips system prompt assembly on subsequent messages', async () => {
      // Return system + user + assistant + new user (existing thread)
      vi.mocked(threadService.getMessages).mockResolvedValue([
        { id: '1', thread_id: 't1', role: 'system', content: { role: 'system', content: 'system prompt' }, model: null, deleted_at: null, created_at: new Date() },
        { id: '2', thread_id: 't1', role: 'user', content: { role: 'user', content: 'first msg' }, model: null, deleted_at: null, created_at: new Date() },
        { id: '3', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'response' }, model: 'test', deleted_at: null, created_at: new Date() },
        { id: '4', thread_id: 't1', role: 'user', content: { role: 'user', content: 'second msg' }, model: null, deleted_at: null, created_at: new Date() },
      ] as any);

      runFn.mockResolvedValue(fakeStreamResult(['Reply']) as any);

      const { stream } = await service.runStream('t1', 'second msg');
      for await (const _ of stream) { /* drain */ }

      // Should NOT call recall for system prompt assembly
      expect(memoryService.recall).not.toHaveBeenCalled();
    });

    it('assembles system prompt without memories when recall fails', async () => {
      vi.mocked(threadService.getMessages).mockResolvedValueOnce([
        { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      ] as any);

      vi.mocked(memoryService.recall).mockRejectedValue(new Error('Embedding API down'));

      vi.mocked(threadService.getMessages).mockResolvedValueOnce([
        { id: '2', thread_id: 't1', role: 'system', content: { role: 'system', content: 'fallback' }, model: null, deleted_at: null, created_at: new Date() },
        { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      ] as any);

      runFn.mockResolvedValue(fakeStreamResult(['Hi!']) as any);

      const { stream } = await service.runStream('t1', 'hello');
      for await (const _ of stream) { /* drain */ }

      // Should still have persisted a system prompt (fallback without memories)
      const systemCall = vi.mocked(threadService.addMessage).mock.calls.find(
        (c) => c[0].role === 'system',
      );
      expect(systemCall).toBeDefined();
    });
  });
});
