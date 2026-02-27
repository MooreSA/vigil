import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { registerThreadTitleHandler } from './thread-title.js';
import type { ThreadService } from '../services/threads.js';
import type OpenAI from 'openai';
import pino from 'pino';

function mockThreadService(): ThreadService {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    addMessage: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
    updateTitle: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
  } as unknown as ThreadService;
}

function mockOpenAI(titleResponse = 'Generated Title'): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: titleResponse } }],
        }),
      },
    },
  } as unknown as OpenAI;
}

const logger = pino({ level: 'silent' });

let eventBus: EventEmitter;
let threadService: ReturnType<typeof mockThreadService>;
let openai: ReturnType<typeof mockOpenAI>;

beforeEach(() => {
  eventBus = new EventEmitter();
  threadService = mockThreadService();
  openai = mockOpenAI();
});

function register(opts?: { openai?: OpenAI }) {
  registerThreadTitleHandler({
    eventBus,
    openai: opts?.openai ?? openai,
    modelName: 'anthropic/claude-sonnet-4',
    threadService,
    logger,
  });
}

describe('thread-title handler', () => {
  it('generates title on first exchange (user + assistant only)', async () => {
    vi.mocked(threadService.getMessages).mockResolvedValue([
      { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '2', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'Hi there!' }, model: 'test', deleted_at: null, created_at: new Date() },
    ] as any);

    register();
    eventBus.emit('response:complete', { threadId: 't1' });

    await vi.waitFor(() => {
      expect(threadService.updateTitle).toHaveBeenCalledWith('t1', 'Generated Title');
    });
  });

  it('emits thread:updated SSE event after saving title', async () => {
    vi.mocked(threadService.getMessages).mockResolvedValue([
      { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '2', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'Hi there!' }, model: 'test', deleted_at: null, created_at: new Date() },
    ] as any);

    const sseEvents: Array<{ type: string; data: Record<string, unknown> }> = [];
    eventBus.on('sse', (payload) => sseEvents.push(payload));

    register();
    eventBus.emit('response:complete', { threadId: 't1' });

    await vi.waitFor(() => {
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0]).toEqual({
        type: 'thread:updated',
        data: { id: 't1', title: 'Generated Title' },
      });
    });
  });

  it('generates title on first exchange (system + user + assistant)', async () => {
    vi.mocked(threadService.getMessages).mockResolvedValue([
      { id: '1', thread_id: 't1', role: 'system', content: { role: 'system', content: 'You are helpful' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '2', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '3', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'Hi there!' }, model: 'test', deleted_at: null, created_at: new Date() },
    ] as any);

    register();
    eventBus.emit('response:complete', { threadId: 't1' });

    await vi.waitFor(() => {
      expect(threadService.updateTitle).toHaveBeenCalledWith('t1', 'Generated Title');
    });
  });

  it('does not generate title when thread has prior messages', async () => {
    vi.mocked(threadService.getMessages).mockResolvedValue([
      { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'old msg' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '2', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'old reply' }, model: 'test', deleted_at: null, created_at: new Date() },
      { id: '3', thread_id: 't1', role: 'user', content: { role: 'user', content: 'new msg' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '4', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'new reply' }, model: 'test', deleted_at: null, created_at: new Date() },
    ] as any);

    register();
    eventBus.emit('response:complete', { threadId: 't1' });

    await new Promise(r => setTimeout(r, 20));
    expect(threadService.updateTitle).not.toHaveBeenCalled();
  });

  it('does not update title when LLM returns empty content', async () => {
    vi.mocked(threadService.getMessages).mockResolvedValue([
      { id: '1', thread_id: 't1', role: 'user', content: { role: 'user', content: 'hello' }, model: null, deleted_at: null, created_at: new Date() },
      { id: '2', thread_id: 't1', role: 'assistant', content: { role: 'assistant', content: 'Hi' }, model: 'test', deleted_at: null, created_at: new Date() },
    ] as any);

    register({ openai: mockOpenAI('   ') });
    eventBus.emit('response:complete', { threadId: 't1' });

    await new Promise(r => setTimeout(r, 20));
    expect(threadService.updateTitle).not.toHaveBeenCalled();
  });

  it('logs warning on failure without throwing', async () => {
    vi.mocked(threadService.getMessages).mockRejectedValue(new Error('db down'));

    register();
    // Should not throw
    eventBus.emit('response:complete', { threadId: 't1' });

    await new Promise(r => setTimeout(r, 20));
    expect(threadService.updateTitle).not.toHaveBeenCalled();
  });
});
