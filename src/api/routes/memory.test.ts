import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { memoryRoute } from './memory.js';
import type { MemoryService } from '../../services/memory.js';

function mockMemoryService(): MemoryService {
  return {
    remember: vi.fn(),
    recall: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    update: vi.fn(),
  } as unknown as MemoryService;
}

let memoryService: ReturnType<typeof mockMemoryService>;

beforeEach(() => {
  memoryService = mockMemoryService();
});

async function buildApp() {
  const app = Fastify();
  await app.register(memoryRoute, {
    prefix: '/v1',
    memoryService,
  });
  await app.ready();
  return app;
}

describe('GET /v1/memory', () => {
  it('returns memory entries from service', async () => {
    const entries = [
      { id: '1', content: 'User likes dark mode', source: 'agent', thread_id: null },
      { id: '2', content: 'User is a developer', source: 'agent', thread_id: null },
    ];
    vi.mocked(memoryService.list).mockResolvedValue(entries as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/memory' });

    expect(res.statusCode).toBe(200);
    expect(memoryService.list).toHaveBeenCalled();
    const body = res.json();
    expect(body).toHaveLength(2);
  });
});

describe('PUT /v1/memory/:id', () => {
  it('updates a memory entry', async () => {
    const updated = { id: '1', content: 'Updated content', source: 'agent' };
    vi.mocked(memoryService.update).mockResolvedValue(updated as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/memory/1',
      payload: { content: 'Updated content' },
    });

    expect(res.statusCode).toBe(200);
    expect(memoryService.update).toHaveBeenCalledWith('1', 'Updated content');
    expect(res.json().content).toBe('Updated content');
  });

  it('returns 404 for non-existent entry', async () => {
    vi.mocked(memoryService.update).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/memory/999',
      payload: { content: 'nope' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for missing content', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/memory/1',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty content', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/memory/1',
      payload: { content: '' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /v1/memory/:id', () => {
  it('soft-deletes a memory entry', async () => {
    vi.mocked(memoryService.delete).mockResolvedValue({ id: '1' } as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/memory/1',
    });

    expect(res.statusCode).toBe(200);
    expect(memoryService.delete).toHaveBeenCalledWith('1');
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 404 for non-existent entry', async () => {
    vi.mocked(memoryService.delete).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/memory/999',
    });

    expect(res.statusCode).toBe(404);
  });
});
