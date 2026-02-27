import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import type { JobService } from '../services/jobs.js';
import { createListJobsTool, createCreateJobTool, createUpdateJobTool, createDeleteJobTool } from './jobs.js';

const logger = pino({ level: 'silent' });

function mockJobService(): JobService {
  return {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getRunHistory: vi.fn(),
  } as unknown as JobService;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke(t: { invoke: (...args: any[]) => Promise<string> }, args: Record<string, unknown> = {}) {
  return t.invoke({}, JSON.stringify(args));
}

describe('list_jobs tool', () => {
  it('returns message when no jobs exist', async () => {
    const service = mockJobService();
    const tool = createListJobsTool(service, logger);

    const result = await invoke(tool);

    expect(result).toBe('No scheduled jobs.');
  });

  it('lists all jobs with details', async () => {
    const service = mockJobService();
    vi.mocked(service.list).mockResolvedValue([
      { id: '1', name: 'Morning', schedule: '0 8 * * *', enabled: true, next_run_at: new Date('2026-02-28T08:00:00Z') },
      { id: '2', name: 'Weekly', schedule: '0 9 * * 1', enabled: false, next_run_at: new Date('2026-03-02T09:00:00Z') },
    ] as any);
    const tool = createListJobsTool(service, logger);

    const result = await invoke(tool);

    expect(result).toContain('[id:1]');
    expect(result).toContain('"Morning"');
    expect(result).toContain('enabled');
    expect(result).toContain('[id:2]');
    expect(result).toContain('disabled');
  });
});

describe('create_job tool', () => {
  it('creates a job and returns confirmation', async () => {
    const service = mockJobService();
    vi.mocked(service.create).mockResolvedValue({
      id: '5', name: 'Daily check', schedule: '0 8 * * *', next_run_at: new Date('2026-02-28T08:00:00Z'),
    } as any);
    const tool = createCreateJobTool(service, logger);

    const result = await invoke(tool, { name: 'Daily check', schedule: '0 8 * * *', prompt: 'Check things' });

    expect(result).toContain('[id:5]');
    expect(result).toContain('Daily check');
    expect(service.create).toHaveBeenCalledWith({
      name: 'Daily check',
      schedule: '0 8 * * *',
      prompt: 'Check things',
    });
  });

  it('returns error message for invalid cron', async () => {
    const service = mockJobService();
    vi.mocked(service.create).mockRejectedValue(new Error('Invalid cron expression: bad'));
    const tool = createCreateJobTool(service, logger);

    const result = await invoke(tool, { name: 'Bad', schedule: 'bad', prompt: 'Hello' });

    expect(result).toContain('Failed to create job');
    expect(result).toContain('Invalid cron');
  });
});

describe('update_job tool', () => {
  it('updates a job and returns confirmation', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockResolvedValue({
      id: '1', name: 'Renamed', schedule: '0 9 * * *', enabled: true, next_run_at: new Date('2026-02-28T09:00:00Z'),
    } as any);
    const tool = createUpdateJobTool(service, logger);

    const result = await invoke(tool, { id: '1', name: 'Renamed' });

    expect(result).toContain('Updated job');
    expect(result).toContain('Renamed');
    expect(service.update).toHaveBeenCalledWith('1', { name: 'Renamed' });
  });

  it('returns not found message', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockResolvedValue(undefined);
    const tool = createUpdateJobTool(service, logger);

    const result = await invoke(tool, { id: '999', name: 'nope' });

    expect(result).toBe('Job 999 not found.');
  });

  it('returns error message for invalid cron', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockRejectedValue(new Error('Invalid cron expression: bad'));
    const tool = createUpdateJobTool(service, logger);

    const result = await invoke(tool, { id: '1', schedule: 'bad' });

    expect(result).toContain('Failed to update job');
  });
});

describe('delete_job tool', () => {
  it('deletes a job and returns confirmation', async () => {
    const service = mockJobService();
    vi.mocked(service.delete).mockResolvedValue({ id: '1', name: 'Old job' } as any);
    const tool = createDeleteJobTool(service, logger);

    const result = await invoke(tool, { id: '1' });

    expect(result).toContain('Deleted job');
    expect(result).toContain('Old job');
    expect(service.delete).toHaveBeenCalledWith('1');
  });

  it('returns not found message', async () => {
    const service = mockJobService();
    vi.mocked(service.delete).mockResolvedValue(undefined);
    const tool = createDeleteJobTool(service, logger);

    const result = await invoke(tool, { id: '999' });

    expect(result).toBe('Job 999 not found.');
  });
});
