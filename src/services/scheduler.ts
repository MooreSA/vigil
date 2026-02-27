import { Cron } from 'croner';
import type { Logger } from '../logger.js';
import type { JobRepository } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';
import type { AgentService } from './agent.js';
import type { ThreadService } from './threads.js';
import type { NotificationService } from './notifications.js';
import type { SkillRegistry } from '../skills/types.js';

const TICK_INTERVAL_MS = 30_000;
const LOCK_REFRESH_INTERVAL_MS = 120_000;

interface SchedulerServiceDeps {
  jobRepo: JobRepository;
  jobRunRepo: JobRunRepository;
  agentService: AgentService;
  threadService: ThreadService;
  notificationService: NotificationService;
  skills: SkillRegistry;
  logger: Logger;
  appUrl?: string;
}

export class SchedulerService {
  private jobRepo: JobRepository;
  private jobRunRepo: JobRunRepository;
  private agentService: AgentService;
  private threadService: ThreadService;
  private notificationService: NotificationService;
  private skills: SkillRegistry;
  private logger: Logger;
  private appUrl?: string;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private activeAbortControllers = new Set<AbortController>();

  constructor(deps: SchedulerServiceDeps) {
    this.jobRepo = deps.jobRepo;
    this.jobRunRepo = deps.jobRunRepo;
    this.agentService = deps.agentService;
    this.threadService = deps.threadService;
    this.notificationService = deps.notificationService;
    this.skills = deps.skills;
    this.logger = deps.logger;
    this.appUrl = deps.appUrl;
  }

  start() {
    this.logger.info('Scheduler started');
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    // Run first tick immediately
    this.tick();
  }

  stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const controller of this.activeAbortControllers) {
      controller.abort();
    }
    this.activeAbortControllers.clear();
    this.logger.info('Scheduler stopped');
  }

  async tick(): Promise<void> {
    try {
      // 1. Reclaim stale runs
      const reset = await this.jobRunRepo.resetAbandoned();
      if (reset > 0) {
        this.logger.info({ count: reset }, 'Reset abandoned job runs');
      }

      // 2. Find due jobs and create runs
      const dueJobs = await this.jobRepo.findDue();
      for (const job of dueJobs) {
        const created = await this.jobRunRepo.createIdempotent(job.id, job.next_run_at);
        if (!created) {
          this.logger.info({ jobId: job.id }, 'Skipped run creation — job already has a running instance');
        }

        // Advance next_run_at
        const nextFireTime = this.computeNextRun(job.schedule);
        if (nextFireTime) {
          await this.jobRepo.update(job.id, { next_run_at: nextFireTime });
        } else {
          this.logger.warn({ jobId: job.id, schedule: job.schedule }, 'Could not compute next run time, disabling job');
          await this.jobRepo.update(job.id, { enabled: false });
        }
      }

      // 3. Claim and execute one pending run
      const claimed = await this.jobRunRepo.claimPending();
      if (!claimed) return;

      this.logger.info({ runId: claimed.id, jobId: claimed.job_id }, 'Claimed job run');

      // Look up the job for its prompt and metadata
      const job = await this.jobRepo.findById(claimed.job_id);
      if (!job) {
        this.logger.warn({ jobId: claimed.job_id }, 'Job not found for claimed run');
        await this.jobRunRepo.fail(claimed.id, 'Job not found');
        return;
      }

      // Start lock refresh interval
      const lockRefresh = setInterval(
        () => this.jobRunRepo.refreshLock(claimed.id),
        LOCK_REFRESH_INTERVAL_MS,
      );

      const abortController = new AbortController();
      this.activeAbortControllers.add(abortController);

      try {
        if (job.skill_name) {
          // --- Skill dispatch path ---
          const skill = this.skills.get(job.skill_name);
          if (!skill) {
            await this.jobRunRepo.fail(claimed.id, `Unknown skill: ${job.skill_name}`);
            this.logger.error({ runId: claimed.id, skillName: job.skill_name }, 'Unknown skill');
            return;
          }

          const result = await skill.execute({
            job: { id: job.id, name: job.name, skill_config: job.skill_config as Record<string, unknown> | null },
            logger: this.logger.child({ skill: job.skill_name, runId: claimed.id }),
            signal: abortController.signal,
          });

          if (!result.success) {
            throw new Error(result.message);
          }

          if (result.disableJob) {
            await this.jobRepo.update(job.id, { enabled: false });
          }

          await this.jobRunRepo.complete(claimed.id, null);
          await this.jobRepo.update(job.id, { last_run_at: new Date() });

          this.logger.info({ runId: claimed.id, jobName: job.name, result: result.message }, 'Skill run completed');
        } else {
          // --- Agent prompt path ---
          const thread = await this.threadService.create({ source: 'wake', job_run_id: claimed.id });

          const { stream } = await this.agentService.runStream(thread.id, job.prompt!);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _event of stream) {
            // Drain — events are consumed but not forwarded anywhere
          }

          await this.jobRunRepo.complete(claimed.id, thread.id);
          await this.jobRepo.update(job.id, { last_run_at: new Date() });

          this.logger.info({ runId: claimed.id, threadId: thread.id, jobName: job.name }, 'Job run completed');

          const clickUrl = this.appUrl ? `${this.appUrl}/threads/${thread.id}` : undefined;
          await this.notificationService.notify({
            title: `Job completed: ${job.name}`,
            body: (job.prompt ?? '').slice(0, 200),
            tag: 'white_check_mark',
            clickUrl,
          });
        }
      } catch (err) {
        clearInterval(lockRefresh);
        this.activeAbortControllers.delete(abortController);
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.jobRunRepo.fail(claimed.id, errorMsg);
        this.logger.error({ err, runId: claimed.id, jobId: job.id }, 'Job run failed');

        // Send failure notification if retries exhausted
        if (claimed.retry_count + 1 >= job.max_retries) {
          await this.notificationService.notify({
            title: `Job failed: ${job.name}`,
            body: errorMsg.slice(0, 200),
            tag: 'x',
          });
        }
        return;
      }

      clearInterval(lockRefresh);
      this.activeAbortControllers.delete(abortController);
    } catch (err) {
      this.logger.error({ err }, 'Scheduler tick failed');
    }
  }

  private computeNextRun(schedule: string): Date | null {
    try {
      const cron = new Cron(schedule);
      const next = cron.nextRun();
      return next;
    } catch {
      return null;
    }
  }
}
