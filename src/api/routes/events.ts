import type { FastifyInstance } from 'fastify';
import type { EventBus } from '../../events.js';

interface EventsRouteDeps {
  eventBus: EventBus;
}

export async function eventsRoute(app: FastifyInstance, opts: EventsRouteDeps) {
  const { eventBus } = opts;

  app.get('/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const keepAlive = setInterval(() => {
      reply.raw.write(': keep-alive\n\n');
    }, 30_000);

    const listener = (payload: { type: string; data: Record<string, unknown> }) => {
      reply.raw.write(`event: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`);
    };

    eventBus.on('sse', listener);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      eventBus.off('sse', listener);
    });
  });
}
