import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Tool } from '@openai/agents';
import type { JobService } from '../../services/jobs.js';
import type { SkillRegistry } from '../../skills/types.js';
import { zodSchemaToFields } from '../../skills/schema-introspect.js';

interface JobsRouteDeps {
  jobService: JobService;
  skillRegistry: SkillRegistry;
  agentTools: Tool[];
}

const createBodySchema = z.object({
  name: z.string().min(1),
  schedule: z.string().min(1).nullable().optional(),
  run_at: z.string().optional(),
  prompt: z.string().min(1).nullable().optional(),
  notify: z.boolean().optional(),
  enabled: z.boolean().optional(),
  max_retries: z.number().int().min(0).optional(),
  skill_name: z.string().min(1).nullable().optional(),
  skill_config: z.record(z.string(), z.unknown()).nullable().optional(),
  tool_allowlist: z.array(z.string()).nullable().optional(),
});

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  schedule: z.string().min(1).nullable().optional(),
  prompt: z.string().min(1).nullable().optional(),
  notify: z.boolean().optional(),
  enabled: z.boolean().optional(),
  max_retries: z.number().int().min(0).optional(),
  skill_name: z.string().min(1).nullable().optional(),
  skill_config: z.record(z.string(), z.unknown()).nullable().optional(),
  tool_allowlist: z.array(z.string()).nullable().optional(),
});

export async function jobsRoute(
  app: FastifyInstance,
  opts: JobsRouteDeps,
) {
  const { jobService, skillRegistry, agentTools } = opts;

  app.get('/tools', async () => {
    return agentTools.map((t) => ({ name: t.name, description: 'description' in t ? (t.description ?? '') : '' }));
  });

  app.get('/skills', async () => {
    const skills: Array<{ name: string; description: string; fields: ReturnType<typeof zodSchemaToFields> }> = [];
    for (const skill of skillRegistry.values()) {
      skills.push({
        name: skill.name,
        description: skill.description,
        fields: zodSchemaToFields(skill.configSchema),
      });
    }
    return skills;
  });

  app.post('/jobs', async (request, reply) => {
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const job = await jobService.create(parsed.data);
      return reply.code(201).send(job);
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith('Invalid cron') || err.message.startsWith('Either schedule') || err.message.startsWith('Unknown skill'))) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/jobs', async () => {
    return jobService.list();
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    const job = await jobService.findById(id);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    const runs = await jobService.getRunHistory(id);
    return { job, runs };
  });

  app.put<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const updated = await jobService.update(id, parsed.data);
      if (!updated) {
        return reply.code(404).send({ error: 'Job not found' });
      }
      return updated;
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith('Invalid cron') || err.message.startsWith('Unknown skill'))) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = await jobService.delete(id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return { ok: true };
  });
}
