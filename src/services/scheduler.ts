import { Cron } from 'croner';
import type { Logger } from '../logger.js';
import type { JobRepository } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';
import type { AgentService } from './agent.js';
import type { ThreadService } from './threads.js';
import type { NotificationService } from './notifications.js';

const TICK_INTERVAL_MS = 30_000;
const LOCK_REFRESH_INTERVAL_MS = 120_000;

interface SchedulerServiceDeps {
  jobRepo: JobRepository;
  jobRunRepo: JobRunRepository;
  agentService: AgentService;
  threadService: ThreadService;
  notificationService: NotificationService;
  logger: Logger;
  appUrl?: string;
}

export class SchedulerService {
  private jobRepo: JobRepository;
  private jobRunRepo: JobRunRepository;
  private agentService: AgentService;
  private threadService: ThreadService;
  private notificationService: NotificationService;
  private logger: Logger;
  private appUrl?: string;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: SchedulerServiceDeps) {
    this.jobRepo = deps.jobRepo;
    this.jobRunRepo = deps.jobRunRepo;
    this.agentService = deps.agentService;
    this.threadService = deps.threadService;
    this.notificationService = deps.notificationService;
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
      this.logger.info('Scheduler stopped');
    }
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
        await this.jobRunRepo.createIdempotent(job.id, job.next_run_at);

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

      try {
        // Create thread with source 'wake', linked to this run
        const thread = await this.threadService.create({ source: 'wake', job_run_id: claimed.id });

        // Run the agent and drain the stream
        const { stream } = await this.agentService.runStream(thread.id, job.prompt);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _event of stream) {
          // Drain — events are consumed but not forwarded anywhere
        }

        // Mark complete
        await this.jobRunRepo.complete(claimed.id, thread.id);
        await this.jobRepo.update(job.id, { last_run_at: new Date() });

        this.logger.info({ runId: claimed.id, threadId: thread.id, jobName: job.name }, 'Job run completed');

        // Send success notification
        const clickUrl = this.appUrl ? `${this.appUrl}/threads/${thread.id}` : undefined;
        await this.notificationService.notify({
          title: `Job completed: ${job.name}`,
          body: job.prompt.slice(0, 200),
          tag: 'white_check_mark',
          clickUrl,
        });
      } catch (err) {
        clearInterval(lockRefresh);
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
