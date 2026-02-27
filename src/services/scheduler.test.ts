import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { SchedulerService } from './scheduler.js';
import type { JobRepository } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';
import type { AgentService, StreamResult } from './agent.js';
import type { ThreadService } from './threads.js';
import type { NotificationService } from './notifications.js';
import type { Skill, SkillRegistry } from '../skills/types.js';

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
    skills: new Map(),
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
        skill_name: null,
        skill_config: null,
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
        skill_name: null,
        skill_config: null,
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
        skill_name: null,
        skill_config: null,
        next_run_at: new Date(),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      vi.mocked(agentService.runStream).mockResolvedValue(fakeStreamResult());

      await scheduler.tick();

      expect(threadService.create).toHaveBeenCalledWith({ source: 'wake', job_run_id: '10' });
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
        skill_name: null,
        skill_config: null,
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
        skill_name: null,
        skill_config: null,
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

  describe('skill dispatch', () => {
    function makeSkillJob(skillResult: { success: boolean; message: string; disableJob?: boolean }) {
      const claimed = {
        id: '20',
        job_id: '2',
        scheduled_for: new Date(),
        status: 'running',
        retry_count: 0,
      };

      const mockSkill: Skill = {
        name: 'test-skill',
        description: 'A test skill',
        configSchema: {} as any,
        execute: vi.fn().mockResolvedValue(skillResult),
      };

      const skills: SkillRegistry = new Map([['test-skill', mockSkill]]);

      const skillScheduler = new SchedulerService({
        jobRepo,
        jobRunRepo,
        agentService,
        threadService,
        notificationService,
        skills,
        logger,
        appUrl: 'https://app.example.com',
      });

      vi.mocked(jobRunRepo.claimPending).mockResolvedValue(claimed);
      vi.mocked(jobRepo.findById).mockResolvedValue({
        id: '2',
        name: 'Skill Job',
        schedule: '*/5 * * * *',
        prompt: null,
        enabled: true,
        max_retries: 3,
        skill_name: 'test-skill',
        skill_config: { version: 1, foo: 'bar' },
        next_run_at: new Date(),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      return { skillScheduler, mockSkill, claimed };
    }

    it('executes skill and completes with null threadId', async () => {
      const { skillScheduler, mockSkill } = makeSkillJob({
        success: true,
        message: 'Not yet',
      });

      await skillScheduler.tick();

      expect(mockSkill.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          job: expect.objectContaining({ id: '2', name: 'Skill Job' }),
        }),
      );
      expect(jobRunRepo.complete).toHaveBeenCalledWith('20', null);
      expect(agentService.runStream).not.toHaveBeenCalled();
      expect(threadService.create).not.toHaveBeenCalled();
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('disables job when skill returns disableJob: true', async () => {
      const { skillScheduler } = makeSkillJob({
        success: true,
        message: 'Sent notification',
        disableJob: true,
      });

      await skillScheduler.tick();

      expect(jobRepo.update).toHaveBeenCalledWith('2', { enabled: false });
      expect(jobRunRepo.complete).toHaveBeenCalledWith('20', null);
    });

    it('does not disable job when disableJob is absent', async () => {
      const { skillScheduler } = makeSkillJob({
        success: true,
        message: 'Not yet',
      });

      await skillScheduler.tick();

      // update called for last_run_at but not for enabled: false
      const updateCalls = vi.mocked(jobRepo.update).mock.calls;
      const disableCall = updateCalls.find(([, fields]) => 'enabled' in fields);
      expect(disableCall).toBeUndefined();
    });

    it('fails run when skill returns success: false', async () => {
      const { skillScheduler } = makeSkillJob({
        success: false,
        message: 'Config invalid',
      });

      await skillScheduler.tick();

      expect(jobRunRepo.fail).toHaveBeenCalledWith('20', 'Config invalid');
      expect(jobRunRepo.complete).not.toHaveBeenCalled();
    });

    it('fails run when skill_name is not in registry', async () => {
      vi.mocked(jobRunRepo.claimPending).mockResolvedValue({
        id: '30',
        job_id: '3',
        scheduled_for: new Date(),
        status: 'running',
        retry_count: 0,
      });
      vi.mocked(jobRepo.findById).mockResolvedValue({
        id: '3',
        name: 'Unknown Skill Job',
        schedule: '*/5 * * * *',
        prompt: null,
        enabled: true,
        max_retries: 3,
        skill_name: 'nonexistent',
        skill_config: {},
        next_run_at: new Date(),
        last_run_at: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await scheduler.tick();

      expect(jobRunRepo.fail).toHaveBeenCalledWith('30', 'Unknown skill: nonexistent');
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
