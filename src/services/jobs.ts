import { Cron } from 'croner';
import type { Logger } from '../logger.js';
import type { JobRepository, UpdateJobInput as RepoUpdateInput } from '../repositories/jobs.js';
import type { JobRunRepository } from '../repositories/job-runs.js';

interface JobServiceDeps {
  jobRepo: JobRepository;
  jobRunRepo: JobRunRepository;
  validSkillNames: Set<string>;
  logger: Logger;
}

interface CreateJobInput {
  name: string;
  schedule?: string | null;
  run_at?: Date | string;
  prompt?: string | null;
  enabled?: boolean;
  max_retries?: number;
  skill_name?: string | null;
  skill_config?: Record<string, unknown> | null;
}

interface UpdateJobInput {
  name?: string;
  schedule?: string | null;
  prompt?: string | null;
  enabled?: boolean;
  max_retries?: number;
  skill_name?: string | null;
  skill_config?: Record<string, unknown> | null;
}

export class JobService {
  private jobRepo: JobRepository;
  private jobRunRepo: JobRunRepository;
  private validSkillNames: Set<string>;
  private logger: Logger;

  constructor(deps: JobServiceDeps) {
    this.jobRepo = deps.jobRepo;
    this.jobRunRepo = deps.jobRunRepo;
    this.validSkillNames = deps.validSkillNames;
    this.logger = deps.logger;
  }

  private validateSkillName(skillName: string) {
    if (!this.validSkillNames.has(skillName)) {
      throw new Error(`Unknown skill: "${skillName}". Valid skills: ${[...this.validSkillNames].join(', ')}`);
    }
  }

  async create(input: CreateJobInput) {
    let nextRunAt: Date | string;

    if (input.schedule) {
      // Recurring job — compute next fire time from cron
      const computed = this.computeNextRun(input.schedule);
      if (!computed) {
        throw new Error(`Invalid cron expression: ${input.schedule}`);
      }
      nextRunAt = computed;
    } else if (input.run_at) {
      // One-shot job — use the provided timestamp directly
      nextRunAt = input.run_at;
    } else {
      throw new Error('Either schedule (cron) or run_at (timestamp) is required');
    }

    if (input.skill_name) {
      this.validateSkillName(input.skill_name);
      if (!input.skill_config) {
        this.logger.warn({ skill_name: input.skill_name }, 'Skill job created without skill_config');
      }
    }

    return this.jobRepo.create({
      name: input.name,
      schedule: input.schedule ?? null,
      prompt: input.prompt,
      enabled: input.enabled,
      max_retries: input.max_retries,
      skill_name: input.skill_name,
      skill_config: input.skill_config,
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
    const { skill_name, skill_config, ...rest } = fields;
    const updateFields: RepoUpdateInput = { ...rest };

    if (skill_name !== undefined) {
      if (skill_name !== null) this.validateSkillName(skill_name);
      updateFields.skill_name = skill_name;
    }
    if (skill_config !== undefined) updateFields.skill_config = skill_config;

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

  private computeNextRun(schedule: string | null): Date | null {
    if (!schedule) return null;
    try {
      const cron = new Cron(schedule);
      return cron.nextRun();
    } catch {
      return null;
    }
  }
}
