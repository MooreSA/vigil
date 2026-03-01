import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { JobService } from './jobs.js';
import type { JobRepository } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';

const logger = pino({ level: 'silent' });

function mockJobRepo(): JobRepository {
  return {
    create: vi.fn().mockImplementation(async (input) => ({
      id: '1',
      ...input,
      enabled: input.enabled ?? true,
      max_retries: input.max_retries ?? 3,
      last_run_at: null,
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation(async (id, fields) => ({
      id,
      name: 'Test',
      schedule: '0 8 * * *',
      prompt: 'Do something',
      enabled: true,
      max_retries: 3,
      next_run_at: new Date(),
      last_run_at: null,
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...fields,
    })),
    softDelete: vi.fn().mockImplementation(async (id) => ({
      id,
      deleted_at: new Date(),
    })),
    findDue: vi.fn(),
  } as unknown as JobRepository;
}

function mockJobRunRepo(): JobRunRepository {
  return {
    createIdempotent: vi.fn(),
    claimPending: vi.fn(),
    refreshLock: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    resetAbandoned: vi.fn(),
    findByJobId: vi.fn().mockResolvedValue([]),
  } as unknown as JobRunRepository;
}

let jobRepo: ReturnType<typeof mockJobRepo>;
let jobRunRepo: ReturnType<typeof mockJobRunRepo>;
let service: JobService;

beforeEach(() => {
  jobRepo = mockJobRepo();
  jobRunRepo = mockJobRunRepo();
  service = new JobService({ jobRepo, jobRunRepo, validSkillNames: new Set(['departure-check']), logger });
});

describe('JobService', () => {
  describe('create', () => {
    it('validates cron and computes next_run_at', async () => {
      const job = await service.create({
        name: 'Morning briefing',
        schedule: '0 8 * * *',
        prompt: 'Good morning',
      });

      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Morning briefing',
          schedule: '0 8 * * *',
          prompt: 'Good morning',
          next_run_at: expect.any(Date),
        }),
      );
      expect(job).toBeDefined();
    });

    it('throws on invalid cron expression', async () => {
      await expect(
        service.create({
          name: 'Bad',
          schedule: 'not a cron',
          prompt: 'nope',
        }),
      ).rejects.toThrow('Invalid cron expression');
    });

    it('creates a one-shot job with run_at and null schedule', async () => {
      const runAt = new Date('2026-03-01T15:00:00Z');
      const job = await service.create({
        name: 'Reminder',
        run_at: runAt,
        prompt: 'Do the thing',
      });

      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Reminder',
          schedule: null,
          prompt: 'Do the thing',
          next_run_at: runAt,
        }),
      );
      expect(job).toBeDefined();
    });

    it('throws when neither schedule nor run_at is provided', async () => {
      await expect(
        service.create({
          name: 'Missing both',
          prompt: 'nope',
        }),
      ).rejects.toThrow('Either schedule (cron) or run_at (timestamp) is required');
    });
  });

  describe('list', () => {
    it('delegates to repository', async () => {
      await service.list();
      expect(jobRepo.findAll).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('delegates to repository', async () => {
      await service.findById('5');
      expect(jobRepo.findById).toHaveBeenCalledWith('5');
    });
  });

  describe('update', () => {
    it('updates fields without recomputing next_run_at when schedule unchanged', async () => {
      await service.update('1', { name: 'New name' });

      expect(jobRepo.update).toHaveBeenCalledWith('1', { name: 'New name' });
    });

    it('recomputes next_run_at when schedule changes', async () => {
      await service.update('1', { schedule: '*/5 * * * *' });

      expect(jobRepo.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          schedule: '*/5 * * * *',
          next_run_at: expect.any(Date),
        }),
      );
    });

    it('throws on invalid cron in update', async () => {
      await expect(
        service.update('1', { schedule: 'bad cron' }),
      ).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('delete', () => {
    it('delegates to repository soft delete', async () => {
      await service.delete('3');
      expect(jobRepo.softDelete).toHaveBeenCalledWith('3');
    });
  });

  describe('getRunHistory', () => {
    it('delegates to job run repository', async () => {
      await service.getRunHistory('7');
      expect(jobRunRepo.findByJobId).toHaveBeenCalledWith('7');
    });
  });
});
