import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import type { JobService } from '../services/jobs.js';
import { createToggleJobTool } from './toggle-job.js';

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

function invoke(t: { invoke: (...args: any[]) => Promise<string> }, args: Record<string, unknown> = {}) {
  return t.invoke({}, JSON.stringify(args));
}

describe('toggle_job tool', () => {
  it('enables a job', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockResolvedValue({
      id: '1', name: 'Morning', enabled: true,
    } as any);
    const tool = createToggleJobTool(service, logger);

    const result = await invoke(tool, { id: '1', enabled: true });

    expect(result).toContain('[id:1]');
    expect(result).toContain('"Morning"');
    expect(result).toContain('now enabled');
    expect(service.update).toHaveBeenCalledWith('1', { enabled: true });
  });

  it('disables a job', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockResolvedValue({
      id: '2', name: 'Weekly', enabled: false,
    } as any);
    const tool = createToggleJobTool(service, logger);

    const result = await invoke(tool, { id: '2', enabled: false });

    expect(result).toContain('[id:2]');
    expect(result).toContain('now disabled');
    expect(service.update).toHaveBeenCalledWith('2', { enabled: false });
  });

  it('returns not found message', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockResolvedValue(undefined);
    const tool = createToggleJobTool(service, logger);

    const result = await invoke(tool, { id: '999', enabled: true });

    expect(result).toBe('Job 999 not found.');
  });

  it('returns error message on failure', async () => {
    const service = mockJobService();
    vi.mocked(service.update).mockRejectedValue(new Error('db connection lost'));
    const tool = createToggleJobTool(service, logger);

    const result = await invoke(tool, { id: '1', enabled: true });

    expect(result).toContain('Failed to toggle job');
    expect(result).toContain('db connection lost');
  });
});
