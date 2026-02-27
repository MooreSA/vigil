import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchThreads, fetchThread, streamChat } from './api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchThreads', () => {
  it('returns parsed thread list', async () => {
    const threads = [{ id: '1', title: 'Test', source: 'web', created_at: '', updated_at: '' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(threads), { status: 200 }),
    );

    const result = await fetchThreads();
    expect(result).toEqual(threads);
    expect(fetch).toHaveBeenCalledWith('/v1/threads');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    await expect(fetchThreads()).rejects.toThrow('Failed to fetch threads: 500');
  });
});

describe('fetchThread', () => {
  it('returns thread with messages', async () => {
    const data = { thread: { id: '1' }, messages: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 }),
    );

    const result = await fetchThread('1');
    expect(result).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/v1/threads/1');
  });

  it('throws on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 404 }),
    );

    await expect(fetchThread('nope')).rejects.toThrow('Failed to fetch thread: 404');
  });
});

describe('streamChat', () => {
  function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
  }

  it('parses SSE events from stream', async () => {
    const sse = [
      'event: thread\ndata: {"thread_id":"t1"}\n\n',
      'event: delta\ndata: {"content":"Hello"}\n\n',
      'event: done\ndata: {}\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(makeSSEStream(sse), { status: 200 }),
    );

    const events = [];
    for await (const e of streamChat(null, 'hi')) {
      events.push(e);
    }

    expect(events).toEqual([
      { event: 'thread', data: { thread_id: 't1' } },
      { event: 'delta', data: { content: 'Hello' } },
      { event: 'done', data: {} },
    ]);
  });

  it('handles chunked SSE (split across reads)', async () => {
    // Split an event across two chunks
    const sse = [
      'event: delta\ndata: {"con',
      'tent":"world"}\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(makeSSEStream(sse), { status: 200 }),
    );

    const events = [];
    for await (const e of streamChat('t1', 'test')) {
      events.push(e);
    }

    expect(events).toEqual([
      { event: 'delta', data: { content: 'world' } },
    ]);
  });

  it('sends thread_id when provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(makeSSEStream(['event: done\ndata: {}\n\n']), { status: 200 }),
    );

    for await (const _ of streamChat('t1', 'hello')) { /* drain */ }

    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ thread_id: 't1', message: 'hello' });
  });

  it('omits thread_id when null', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(makeSSEStream(['event: done\ndata: {}\n\n']), { status: 200 }),
    );

    for await (const _ of streamChat(null, 'hello')) { /* drain */ }

    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ message: 'hello' });
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    await expect(async () => {
      for await (const _ of streamChat(null, 'hi')) { /* drain */ }
    }).rejects.toThrow('Chat request failed: 500');
  });
});
