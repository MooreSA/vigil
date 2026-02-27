import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MemoryService } from '../../services/memory.js';

interface MemoryRouteDeps {
  memoryService: MemoryService;
}

const updateBodySchema = z.object({
  content: z.string().min(1),
});

export async function memoryRoute(
  app: FastifyInstance,
  opts: MemoryRouteDeps,
) {
  const { memoryService } = opts;

  app.get('/memory', async () => {
    return memoryService.list();
  });

  app.put<{ Params: { id: string } }>('/memory/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const updated = await memoryService.update(id, parsed.data.content);
    if (!updated) {
      return reply.code(404).send({ error: 'Memory entry not found' });
    }

    return updated;
  });

  app.delete<{ Params: { id: string } }>('/memory/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = await memoryService.delete(id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Memory entry not found' });
    }

    return { ok: true };
  });
}
