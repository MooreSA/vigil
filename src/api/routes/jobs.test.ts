import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { jobsRoute } from './jobs.js';
import type { JobService } from '../../services/jobs.js';

function mockJobService(): JobService {
  return {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getRunHistory: vi.fn().mockResolvedValue([]),
  } as unknown as JobService;
}

let jobService: ReturnType<typeof mockJobService>;

beforeEach(() => {
  jobService = mockJobService();
});

async function buildApp() {
  const app = Fastify();
  await app.register(jobsRoute, {
    prefix: '/v1',
    jobService,
  });
  await app.ready();
  return app;
}

describe('POST /v1/jobs', () => {
  it('creates a job and returns 201', async () => {
    const created = { id: '1', name: 'Morning', schedule: '0 8 * * *', prompt: 'Hello' };
    vi.mocked(jobService.create).mockResolvedValue(created as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: { name: 'Morning', schedule: '0 8 * * *', prompt: 'Hello' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Morning');
    expect(jobService.create).toHaveBeenCalledWith({
      name: 'Morning',
      schedule: '0 8 * * *',
      prompt: 'Hello',
    });
  });

  it('returns 400 for missing required fields', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: { name: 'No prompt' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid cron expression', async () => {
    vi.mocked(jobService.create).mockRejectedValue(new Error('Invalid cron expression: bad'));
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: { name: 'Bad', schedule: 'bad', prompt: 'Hello' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid cron/);
  });
});

describe('GET /v1/jobs', () => {
  it('returns jobs from service', async () => {
    const jobs = [{ id: '1', name: 'Job 1' }, { id: '2', name: 'Job 2' }];
    vi.mocked(jobService.list).mockResolvedValue(jobs as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/jobs' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });
});

describe('GET /v1/jobs/:id', () => {
  it('returns job with run history', async () => {
    vi.mocked(jobService.findById).mockResolvedValue({ id: '1', name: 'Test' } as any);
    vi.mocked(jobService.getRunHistory).mockResolvedValue([{ id: '10', status: 'completed' }] as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/jobs/1' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job.name).toBe('Test');
    expect(body.runs).toHaveLength(1);
  });

  it('returns 404 for non-existent job', async () => {
    vi.mocked(jobService.findById).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/v1/jobs/999' });

    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /v1/jobs/:id', () => {
  it('updates a job', async () => {
    vi.mocked(jobService.update).mockResolvedValue({ id: '1', name: 'Updated' } as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/jobs/1',
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(jobService.update).toHaveBeenCalledWith('1', { name: 'Updated' });
  });

  it('returns 404 when job not found', async () => {
    vi.mocked(jobService.update).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/jobs/999',
      payload: { name: 'nope' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid cron in update', async () => {
    vi.mocked(jobService.update).mockRejectedValue(new Error('Invalid cron expression: bad'));
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/jobs/1',
      payload: { schedule: 'bad' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/jobs/1',
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /v1/jobs/:id', () => {
  it('soft-deletes a job', async () => {
    vi.mocked(jobService.delete).mockResolvedValue({ id: '1' } as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'DELETE', url: '/v1/jobs/1' });

    expect(res.statusCode).toBe(200);
    expect(jobService.delete).toHaveBeenCalledWith('1');
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 404 for non-existent job', async () => {
    vi.mocked(jobService.delete).mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({ method: 'DELETE', url: '/v1/jobs/999' });

    expect(res.statusCode).toBe(404);
  });
});
