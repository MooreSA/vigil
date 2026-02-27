import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { SchedulerService } from './scheduler.js';
import type { JobRepository } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';
import type { AgentService, StreamResult } from './agent.js';
import type { ThreadService } from './threads.js';
import type { NotificationService } from './notifications.js';

const logger = pino({ level: 'silent' });

function mockJobRepo(): JobRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findDue: vi.fn().mockResolvedValue([]),
  } as unknown as JobRepository;
}

function mockJobRunRepo(): JobRunRepository {
  return {
    createIdempotent: vi.fn().mockResolvedValue(true),
    claimPending: vi.fn().mockResolvedValue(null),
    refreshLock: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    resetAbandoned: vi.fn().mockResolvedValue(0),
    findByJobId: vi.fn(),
  } as unknown as JobRunRepository;
}

function mockAgentService(): AgentService {
  return {
    runStream: vi.fn(),
  } as unknown as AgentService;
}

function mockThreadService(): ThreadService {
  return {
    create: vi.fn().mockResolvedValue({ id: 'thread-1', source: 'wake' }),
    findById: vi.fn(),
    addMessage: vi.fn(),
    updateTitle: vi.fn(),
    list: vi.fn(),
    getMessages: vi.fn(),
  } as unknown as ThreadService;
}

function mockNotificationService(): NotificationService {
  return {
    notify: vi.fn(),
  } as unknown as NotificationService;
}

function fakeStreamResult(): StreamResult {
  async function* emptyStream() {
    // no events
  }
  return {
    stream: emptyStream(),
    model: 'test-model',
    usage: Promise.resolve(null),
  };
}

let jobRepo: ReturnType<typeof mockJobRepo>;
let jobRunRepo: ReturnType<typeof mockJobRunRepo>;
let agentService: ReturnType<typeof mockAgentService>;
let threadService: ReturnType<typeof mockThreadService>;
let notificationService: ReturnType<typeof mockNotificationService>;
let scheduler: SchedulerService;

beforeEach(() => {
  jobRepo = mockJobRepo();
  jobRunRepo = mockJobRunRepo();
  agentService = mockAgentService();
  threadService = mockThreadService();
  notificationService = mockNotificationService();
  scheduler = new SchedulerService({
    jobRepo,
    jobRunRepo,
    agentService,
    threadService,
    notificationService,
    logger,
    appUrl: 'https://app.example.com',
  });
});

describe('SchedulerService', () => {
  describe('tick', () => {
    it('resets abandoned runs on each tick', async () => {
      await scheduler.tick();

      expect(jobRunRepo.resetAbandoned).toHaveBeenCalled();
    });

    it('creates idempotent runs for due jobs and advances next_run_at', async () => {
      const dueJob = {
        id: '1',
        name: 'Test',
        schedule: '0 8 * * *',
        prompt: 'Hello',
        enabled: true,
        max_retries: 3,
        next_run_at: new Date('2026-02-27T08:00:00Z'),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      vi.mocked(jobRepo.findDue).mockResolvedValue([dueJob]);

      await scheduler.tick();

      expect(jobRunRepo.createIdempotent).toHaveBeenCalledWith('1', dueJob.next_run_at);
      expect(jobRepo.update).toHaveBeenCalledWith('1', {
        next_run_at: expect.any(Date),
      });
    });

    it('disables job if next run time cannot be computed', async () => {
      const dueJob = {
        id: '1',
        name: 'Bad schedule',
        schedule: '0 0 30 2 *', // Feb 30 never fires
        prompt: 'Hello',
        enabled: true,
        max_retries: 3,
        next_run_at: new Date('2020-01-01T00:00:00Z'),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      vi.mocked(jobRepo.findDue).mockResolvedValue([dueJob]);

      await scheduler.tick();

      expect(jobRepo.update).toHaveBeenCalledWith('1', { enabled: false });
    });

    it('does nothing when no pending runs to claim', async () => {
      await scheduler.tick();

      expect(agentService.runStream).not.toHaveBeenCalled();
    });

    it('executes a claimed run end-to-end', async () => {
      const claimed = {
        id: '10',
        job_id: '1',
        scheduled_for: new Date(),
        status: 'running',
        retry_count: 0,
      };
      vi.mocked(jobRunRepo.claimPending).mockResolvedValue(claimed);
      vi.mocked(jobRepo.findById).mockResolvedValue({
        id: '1',
        name: 'Test Job',
        schedule: '0 8 * * *',
        prompt: 'Do stuff',
        enabled: true,
        max_retries: 3,
        next_run_at: new Date(),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      vi.mocked(agentService.runStream).mockResolvedValue(fakeStreamResult());

      await scheduler.tick();

      expect(threadService.create).toHaveBeenCalledWith({ source: 'wake' });
      expect(agentService.runStream).toHaveBeenCalledWith('thread-1', 'Do stuff');
      expect(jobRunRepo.complete).toHaveBeenCalledWith('10', 'thread-1');
      expect(jobRepo.update).toHaveBeenCalledWith('1', { last_run_at: expect.any(Date) });
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Job completed: Test Job',
          clickUrl: 'https://app.example.com/threads/thread-1',
        }),
      );
    });

    it('handles run failure and notifies when retries exhausted', async () => {
      const claimed = {
        id: '10',
        job_id: '1',
        scheduled_for: new Date(),
        status: 'running',
        retry_count: 2, // will be 3 after this failure
      };
      vi.mocked(jobRunRepo.claimPending).mockResolvedValue(claimed);
      vi.mocked(jobRepo.findById).mockResolvedValue({
        id: '1',
        name: 'Failing Job',
        schedule: '0 8 * * *',
        prompt: 'Do stuff',
        enabled: true,
        max_retries: 3,
        next_run_at: new Date(),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      vi.mocked(agentService.runStream).mockRejectedValue(new Error('LLM exploded'));

      await scheduler.tick();

      expect(jobRunRepo.fail).toHaveBeenCalledWith('10', 'LLM exploded');
      expect(jobRunRepo.complete).not.toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Job failed: Failing Job',
          tag: 'x',
        }),
      );
    });

    it('does not send failure notification if retries remain', async () => {
      const claimed = {
        id: '10',
        job_id: '1',
        scheduled_for: new Date(),
        status: 'running',
        retry_count: 0,
      };
      vi.mocked(jobRunRepo.claimPending).mockResolvedValue(claimed);
      vi.mocked(jobRepo.findById).mockResolvedValue({
        id: '1',
        name: 'Retry Job',
        schedule: '0 8 * * *',
        prompt: 'Do stuff',
        enabled: true,
        max_retries: 3,
        next_run_at: new Date(),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      vi.mocked(agentService.runStream).mockRejectedValue(new Error('Temporary failure'));

      await scheduler.tick();

      expect(jobRunRepo.fail).toHaveBeenCalledWith('10', 'Temporary failure');
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('fails run if job is not found', async () => {
      vi.mocked(jobRunRepo.claimPending).mockResolvedValue({
        id: '10',
        job_id: '999',
        scheduled_for: new Date(),
        status: 'running',
        retry_count: 0,
      });
      vi.mocked(jobRepo.findById).mockResolvedValue(undefined);

      await scheduler.tick();

      expect(jobRunRepo.fail).toHaveBeenCalledWith('10', 'Job not found');
      expect(agentService.runStream).not.toHaveBeenCalled();
    });
  });

  describe('start / stop', () => {
    it('start and stop manage the interval', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(42 as any);
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      scheduler.start();
      expect(setIntervalSpy).toHaveBeenCalled();

      scheduler.stop();
      expect(clearIntervalSpy).toHaveBeenCalledWith(42);

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });
});
