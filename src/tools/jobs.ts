import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JobService } from '../services/jobs.js';
import type { Logger } from '../logger.js';

export function createListJobsTool(jobService: JobService, logger: Logger) {
  return tool({
    name: 'list_jobs',
    description:
      'List all scheduled jobs. Returns each job\'s id, name, schedule (cron expression), prompt, enabled status, and next run time.',
    parameters: z.object({}),
    execute: async () => {
      logger.info({ tool: 'list_jobs' }, 'Tool called: list_jobs');
      const jobs = await jobService.list();

      if (jobs.length === 0) {
        return 'No scheduled jobs.';
      }

      const lines = jobs.map(
        (j) =>
          `- [id:${j.id}] "${j.name}" — ${j.schedule} — ${j.enabled ? 'enabled' : 'disabled'} — next: ${j.next_run_at?.toISOString() ?? 'n/a'}`,
      );
      logger.info({ tool: 'list_jobs', count: jobs.length }, 'Tool completed: list_jobs');
      return lines.join('\n');
    },
  });
}

export function createCreateJobTool(jobService: JobService, logger: Logger) {
  return tool({
    name: 'create_job',
    description:
      'Create a new scheduled job. The schedule is a cron expression (e.g. "0 8 * * *" for daily at 8am, "*/30 * * * *" for every 30 minutes). The prompt is what the agent will be asked to do when the job fires.',
    parameters: z.object({
      name: z.string().describe('Human-readable name for this job.'),
      schedule: z.string().describe('Cron expression for when the job should run.'),
      prompt: z.string().describe('The prompt/instruction the agent will execute on each run.'),
      enabled: z.boolean().optional().describe('Whether the job is active. Defaults to true.'),
      max_retries: z.number().int().min(0).max(10).optional().describe('Max retry attempts on failure. Defaults to 3.'),
    }),
    execute: async ({ name, schedule, prompt, enabled, max_retries }) => {
      logger.info({ tool: 'create_job', name, schedule }, 'Tool called: create_job');
      try {
        const job = await jobService.create({ name, schedule, prompt, enabled, max_retries });
        logger.info({ tool: 'create_job', jobId: job.id }, 'Tool completed: create_job');
        return `Created job [id:${job.id}] "${job.name}" — schedule: ${job.schedule} — next run: ${job.next_run_at?.toISOString() ?? 'n/a'}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ tool: 'create_job', err: message }, 'create_job failed');
        return `Failed to create job: ${message}`;
      }
    },
  });
}

export function createUpdateJobTool(jobService: JobService, logger: Logger) {
  return tool({
    name: 'update_job',
    description:
      'Update an existing scheduled job. Pass only the fields you want to change. Use list_jobs first to find the job id.',
    parameters: z.object({
      id: z.string().describe('The job id to update.'),
      name: z.string().optional().describe('New name for the job.'),
      schedule: z.string().optional().describe('New cron expression.'),
      prompt: z.string().optional().describe('New prompt/instruction.'),
      enabled: z.boolean().optional().describe('Enable or disable the job.'),
      max_retries: z.number().int().min(0).max(10).optional().describe('New max retry count.'),
    }),
    execute: async ({ id, ...fields }) => {
      logger.info({ tool: 'update_job', id, fields }, 'Tool called: update_job');
      try {
        const job = await jobService.update(id, fields);
        if (!job) {
          return `Job ${id} not found.`;
        }
        logger.info({ tool: 'update_job', jobId: id }, 'Tool completed: update_job');
        return `Updated job [id:${job.id}] "${job.name}" — schedule: ${job.schedule} — ${job.enabled ? 'enabled' : 'disabled'} — next run: ${job.next_run_at?.toISOString() ?? 'n/a'}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ tool: 'update_job', id, err: message }, 'update_job failed');
        return `Failed to update job: ${message}`;
      }
    },
  });
}

export function createDeleteJobTool(jobService: JobService, logger: Logger) {
  return tool({
    name: 'delete_job',
    description:
      'Delete a scheduled job by id. This is a soft delete — the job will no longer run but can be seen in the database. Use list_jobs first to find the job id.',
    parameters: z.object({
      id: z.string().describe('The job id to delete.'),
    }),
    execute: async ({ id }) => {
      logger.info({ tool: 'delete_job', id }, 'Tool called: delete_job');
      const job = await jobService.delete(id);
      if (!job) {
        return `Job ${id} not found.`;
      }
      logger.info({ tool: 'delete_job', jobId: id }, 'Tool completed: delete_job');
      return `Deleted job [id:${job.id}] "${job.name}".`;
    },
  });
}
