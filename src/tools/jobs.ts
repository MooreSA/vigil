import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JobService } from '../services/jobs.js';
import type { Logger } from '../logger.js';
import type { SkillRegistry } from '../skills/types.js';

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

      const lines = jobs.map((j) => {
        const parts = [`- [id:${j.id}] "${j.name}" — ${j.schedule} — ${j.enabled ? 'enabled' : 'disabled'} — next: ${j.next_run_at?.toISOString() ?? 'n/a'}`];
        if (j.skill_name) parts.push(` — skill: ${j.skill_name}`);
        return parts.join('');
      });
      logger.info({ tool: 'list_jobs', count: jobs.length }, 'Tool completed: list_jobs');
      return lines.join('\n');
    },
  });
}

export function createCreateJobTool(jobService: JobService, logger: Logger) {
  return tool({
    name: 'create_job',
    description:
      'Create a new scheduled job. The schedule is a cron expression (e.g. "0 8 * * *" for daily at 8am, "*/30 * * * *" for every 30 minutes). For prompt jobs, the prompt is what the agent will execute. For skill jobs, set skill_name and skill_config instead (use list_skills to see available skills).',
    parameters: z.object({
      name: z.string().describe('Human-readable name for this job.'),
      schedule: z.string().describe('Cron expression for when the job should run.'),
      prompt: z.string().nullable().optional().describe('The prompt/instruction the agent will execute on each run. Required for prompt jobs, omit for skill jobs.'),
      enabled: z.boolean().nullable().optional().describe('Whether the job is active. Defaults to true.'),
      max_retries: z.number().int().min(0).max(10).nullable().optional().describe('Max retry attempts on failure. Defaults to 3.'),
      skill_name: z.string().nullable().optional().describe('Name of the skill to run instead of a prompt. Use list_skills to see available skills.'),
      skill_config: z.record(z.string(), z.unknown()).nullable().optional().describe('Configuration object for the skill. Schema depends on the skill — use list_skills to see required fields.'),
    }),
    execute: async ({ name, schedule, prompt, enabled, max_retries, skill_name, skill_config }) => {
      logger.info({ tool: 'create_job', name, schedule, skill_name }, 'Tool called: create_job');
      try {
        const job = await jobService.create({
          name,
          schedule,
          prompt: prompt ?? undefined,
          enabled: enabled ?? undefined,
          max_retries: max_retries ?? undefined,
          skill_name: skill_name ?? undefined,
          skill_config: skill_config ?? undefined,
        });
        logger.info({ tool: 'create_job', jobId: job.id }, 'Tool completed: create_job');
        const suffix = job.skill_name ? ` — skill: ${job.skill_name}` : '';
        return `Created job [id:${job.id}] "${job.name}" — schedule: ${job.schedule}${suffix} — next run: ${job.next_run_at?.toISOString() ?? 'n/a'}`;
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
      name: z.string().nullable().optional().describe('New name for the job.'),
      schedule: z.string().nullable().optional().describe('New cron expression.'),
      prompt: z.string().nullable().optional().describe('New prompt/instruction.'),
      enabled: z.boolean().nullable().optional().describe('Enable or disable the job.'),
      max_retries: z.number().int().min(0).max(10).nullable().optional().describe('New max retry count.'),
      skill_name: z.string().nullable().optional().describe('Name of the skill to run.'),
      skill_config: z.record(z.string(), z.unknown()).nullable().optional().describe('Configuration object for the skill.'),
    }),
    execute: async ({ id, ...fields }) => {
      logger.info({ tool: 'update_job', id, fields }, 'Tool called: update_job');
      try {
        // Strip nulls — Zod schema uses .nullable() for SDK compatibility
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined && v !== null) cleaned[k] = v;
        }
        const job = await jobService.update(id, cleaned);
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

export function createListSkillsTool(skillRegistry: SkillRegistry, logger: Logger) {
  return tool({
    name: 'list_skills',
    description:
      'List available skills that can be used with skill jobs. Returns each skill\'s name, description, and config schema.',
    parameters: z.object({}),
    execute: async () => {
      logger.info({ tool: 'list_skills' }, 'Tool called: list_skills');

      if (skillRegistry.size === 0) {
        return 'No skills available.';
      }

      const lines: string[] = [];
      for (const skill of skillRegistry.values()) {
        lines.push(`## ${skill.name}`);
        lines.push(skill.description);
        lines.push(`Config schema: ${JSON.stringify(skill.configSchema.description ?? zodSchemaToDescription(skill.configSchema))}`);
        lines.push('');
      }

      logger.info({ tool: 'list_skills', count: skillRegistry.size }, 'Tool completed: list_skills');
      return lines.join('\n');
    },
  });
}

function zodSchemaToDescription(schema: z.ZodType): Record<string, string> {
  const desc: Record<string, string> = {};
  if ('shape' in schema && schema.shape) {
    const shape = schema.shape as Record<string, z.ZodType>;
    for (const [key, value] of Object.entries(shape)) {
      desc[key] = value.description ?? 'unknown';
    }
  }
  return desc;
}
