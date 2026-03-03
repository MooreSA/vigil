import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JobService } from '../services/jobs.js';
import type { Logger } from '../logger.js';

export function createToggleJobTool(jobService: JobService, logger: Logger) {
  return tool({
    name: 'toggle_job',
    description:
      'Enable or disable a scheduled job without changing anything else. Use list_jobs first to find the job id.',
    parameters: z.object({
      id: z.string().describe('The job id to toggle.'),
      enabled: z.boolean().describe('True to enable, false to disable.'),
    }),
    execute: async ({ id, enabled }) => {
      logger.info({ tool: 'toggle_job', id, enabled }, 'Tool called: toggle_job');
      try {
        const job = await jobService.update(id, { enabled });
        if (!job) {
          return `Job ${id} not found.`;
        }
        logger.info({ tool: 'toggle_job', jobId: id, enabled: job.enabled }, 'Tool completed: toggle_job');
        return `Job [id:${job.id}] "${job.name}" is now ${job.enabled ? 'enabled' : 'disabled'}.`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ tool: 'toggle_job', id, err: message }, 'toggle_job failed');
        return `Failed to toggle job: ${message}`;
      }
    },
  });
}
