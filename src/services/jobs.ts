import { Cron } from 'croner';
import type { Logger } from '../logger.js';
import type { JobRepository, UpdateJobInput as RepoUpdateInput } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';

interface JobServiceDeps {
  jobRepo: JobRepository;
  jobRunRepo: JobRunRepository;
  logger: Logger;
}

interface CreateJobInput {
  name: string;
  schedule: string;
  prompt: string;
  enabled?: boolean;
  max_retries?: number;
}

interface UpdateJobInput {
  name?: string;
  schedule?: string;
  prompt?: string;
  enabled?: boolean;
  max_retries?: number;
}

export class JobService {
  private jobRepo: JobRepository;
  private jobRunRepo: JobRunRepository;
  private logger: Logger;

  constructor(deps: JobServiceDeps) {
    this.jobRepo = deps.jobRepo;
    this.jobRunRepo = deps.jobRunRepo;
    this.logger = deps.logger;
  }

  async create(input: CreateJobInput) {
    const nextRunAt = this.computeNextRun(input.schedule);
    if (!nextRunAt) {
      throw new Error(`Invalid cron expression: ${input.schedule}`);
    }

    return this.jobRepo.create({
      name: input.name,
      schedule: input.schedule,
      prompt: input.prompt,
      enabled: input.enabled,
      max_retries: input.max_retries,
      next_run_at: nextRunAt,
    });
  }

  async list() {
    return this.jobRepo.findAll();
  }

  async findById(id: string) {
    return this.jobRepo.findById(id);
  }

  async update(id: string, fields: UpdateJobInput) {
    const updateFields: RepoUpdateInput = { ...fields };

    // Recompute next_run_at if schedule changes
    if (fields.schedule) {
      const nextRunAt = this.computeNextRun(fields.schedule);
      if (!nextRunAt) {
        throw new Error(`Invalid cron expression: ${fields.schedule}`);
      }
      updateFields.next_run_at = nextRunAt;
    }

    return this.jobRepo.update(id, updateFields);
  }

  async delete(id: string) {
    return this.jobRepo.softDelete(id);
  }

  async getRunHistory(jobId: string) {
    return this.jobRunRepo.findByJobId(jobId);
  }

  private computeNextRun(schedule: string): Date | null {
    try {
      const cron = new Cron(schedule);
      return cron.nextRun();
    } catch {
      return null;
    }
  }
}
