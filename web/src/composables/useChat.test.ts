import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChat } from './useChat';

// Mock the api module
vi.mock('../lib/api', () => ({
  fetchThread: vi.fn(),
  streamChat: vi.fn(),
}));

import { fetchThread, streamChat } from '../lib/api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useChat', () => {
  describe('initial state', () => {
    it('starts empty', () => {
      const { messages, isStreaming, streamingContent, threadId } = useChat();
      expect(messages.value).toEqual([]);
      expect(isStreaming.value).toBe(false);
      expect(streamingContent.value).toBe('');
      expect(threadId.value).toBeNull();
    });
  });

  describe('loadThread', () => {
    it('loads and transforms messages', async () => {
      vi.mocked(fetchThread).mockResolvedValue({
        thread: { id: 't1', title: 'Test', source: 'web', created_at: '', updated_at: '' },
        messages: [
          { id: '1', thread_id: 't1', role: 'system', model: null, content: { content: 'system prompt' }, created_at: '2025-01-01T00:00:00Z' },
          { id: '2', thread_id: 't1', role: 'user', model: null, content: { content: 'hello' }, created_at: '2025-01-01T00:00:01Z' },
          { id: '3', thread_id: 't1', role: 'assistant', model: 'openai/gpt-4o', content: { content: 'hi there' }, created_at: '2025-01-01T00:00:02Z' },
        ],
      });

      const chat = useChat();
      await chat.loadThread('t1');

      expect(chat.threadId.value).toBe('t1');
      // System messages filtered out
      expect(chat.messages.value).toHaveLength(2);
      expect(chat.messages.value[0].content).toBe('hello');
      expect(chat.messages.value[1].content).toBe('hi there');
    });

    it('extracts content from JSONB message format', async () => {
      vi.mocked(fetchThread).mockResolvedValue({
        thread: { id: 't1', title: null, source: 'web', created_at: '', updated_at: '' },
        messages: [
          { id: '1', thread_id: 't1', role: 'user', model: null, content: { content: 'plain text' }, created_at: '' },
          { id: '2', thread_id: 't1', role: 'assistant', model: null, content: { role: 'assistant', tool_calls: [] }, created_at: '' },
        ],
      });

      const chat = useChat();
      await chat.loadThread('t1');

      expect(chat.messages.value[0].content).toBe('plain text');
      // Non-string content falls back to JSON.stringify
      expect(chat.messages.value[1].content).toContain('tool_calls');
    });
  });

  describe('reset', () => {
    it('clears all state', async () => {
      vi.mocked(fetchThread).mockResolvedValue({
        thread: { id: 't1', title: null, source: 'web', created_at: '', updated_at: '' },
        messages: [
          { id: '1', thread_id: 't1', role: 'user', model: null, content: { content: 'x' }, created_at: '' },
        ],
      });

      const chat = useChat();
      await chat.loadThread('t1');
      expect(chat.messages.value).toHaveLength(1);

      chat.reset();
      expect(chat.messages.value).toEqual([]);
      expect(chat.threadId.value).toBeNull();
      expect(chat.streamingContent.value).toBe('');
      expect(chat.isStreaming.value).toBe(false);
    });
  });

  describe('send', () => {
    it('adds user message, streams response, adds assistant message', async () => {
      async function* fakeStream() {
        yield { event: 'thread', data: { thread_id: 'new-t' } };
        yield { event: 'delta', data: { content: 'Hello ' } };
        yield { event: 'delta', data: { content: 'world' } };
        yield { event: 'done', data: {} };
      }
      vi.mocked(streamChat).mockReturnValue(fakeStream() as any);

      const chat = useChat();
      const newThreadId = await chat.send('hi');

      expect(newThreadId).toBe('new-t');
      expect(chat.messages.value).toHaveLength(2);
      expect(chat.messages.value[0].role).toBe('user');
      expect(chat.messages.value[0].content).toBe('hi');
      expect(chat.messages.value[1].role).toBe('assistant');
      expect(chat.messages.value[1].content).toBe('Hello world');
      expect(chat.isStreaming.value).toBe(false);
      expect(chat.streamingContent.value).toBe('');
    });

    it('appends error message on error event', async () => {
      async function* fakeStream() {
        yield { event: 'delta', data: { content: 'partial' } };
        yield { event: 'error', data: { message: 'something broke' } };
      }
      vi.mocked(streamChat).mockReturnValue(fakeStream() as any);

      const chat = useChat();
      await chat.send('test');

      const assistant = chat.messages.value[1];
      expect(assistant.content).toContain('partial');
      expect(assistant.content).toContain('something broke');
    });

    it('returns null when thread already exists', async () => {
      async function* fakeStream() {
        yield { event: 'delta', data: { content: 'ok' } };
        yield { event: 'done', data: {} };
      }
      vi.mocked(streamChat).mockReturnValue(fakeStream() as any);

      const chat = useChat();
      // Simulate existing thread
      vi.mocked(fetchThread).mockResolvedValue({
        thread: { id: 'existing', title: null, source: 'web', created_at: '', updated_at: '' },
        messages: [],
      });
      await chat.loadThread('existing');

      const newThreadId = await chat.send('more');
      expect(newThreadId).toBeNull();
    });
  });
});
