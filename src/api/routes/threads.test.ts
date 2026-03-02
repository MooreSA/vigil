import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { threadsRoute } from './threads.js';
import type { ThreadService } from '../../services/threads.js';

function mockThreadService(): ThreadService {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    listArchived: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
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

describe('GET /v1/threads/archived', () => {
  it('returns archived thread list', async () => {
    const threads = [
      { id: '5', title: 'Old Chat', source: 'user', archived_at: new Date(), created_at: new Date(), updated_at: new Date() },
    ];
    vi.mocked(threadService.listArchived).mockResolvedValue(threads as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/threads/archived' });

    expect(res.statusCode).toBe(200);
    expect(threadService.listArchived).toHaveBeenCalled();
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('5');
  });
});

describe('POST /v1/threads/:id/archive', () => {
  it('archives a thread and returns it', async () => {
    const thread = { id: '10', title: 'Test', source: 'user', archived_at: new Date() };
    vi.mocked(threadService.archive).mockResolvedValue(thread as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/v1/threads/10/archive' });

    expect(res.statusCode).toBe(200);
    expect(threadService.archive).toHaveBeenCalledWith('10');
    expect(res.json().id).toBe('10');
  });

  it('returns 404 when thread not found', async () => {
    vi.mocked(threadService.archive).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/v1/threads/999/archive' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Thread not found' });
  });
});

describe('POST /v1/threads/:id/unarchive', () => {
  it('unarchives a thread and returns it', async () => {
    const thread = { id: '10', title: 'Test', source: 'user', archived_at: null };
    vi.mocked(threadService.unarchive).mockResolvedValue(thread as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/v1/threads/10/unarchive' });

    expect(res.statusCode).toBe(200);
    expect(threadService.unarchive).toHaveBeenCalledWith('10');
    expect(res.json().archived_at).toBeNull();
  });

  it('returns 404 when thread not found', async () => {
    vi.mocked(threadService.unarchive).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/v1/threads/999/unarchive' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Thread not found' });
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
