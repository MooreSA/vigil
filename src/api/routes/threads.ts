import type { FastifyInstance } from 'fastify';
import type { ThreadService } from '../../services/threads.js';

interface ThreadsRouteDeps {
  threadService: ThreadService;
}

export async function threadsRoute(
  app: FastifyInstance,
  opts: ThreadsRouteDeps,
) {
  const { threadService } = opts;

  app.get('/threads', async () => {
    return threadService.list();
  });

  app.get('/threads/archived', async () => {
    return threadService.listArchived();
  });

  app.post<{ Params: { id: string } }>('/threads/:id/archive', async (request, reply) => {
    const { id } = request.params;
    const thread = await threadService.archive(id);
    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }
    return thread;
  });

  app.post<{ Params: { id: string } }>('/threads/:id/unarchive', async (request, reply) => {
    const { id } = request.params;
    const thread = await threadService.unarchive(id);
    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }
    return thread;
  });

  app.get<{ Params: { id: string } }>('/threads/:id', async (request, reply) => {
    const { id } = request.params;
    const thread = await threadService.findById(id);

    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    const messages = await threadService.getMessages(id);

    return { thread, messages };
  });
}
