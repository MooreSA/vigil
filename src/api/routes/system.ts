import type { FastifyInstance } from 'fastify';
import type { SystemService } from '../../services/system.js';

interface SystemRouteDeps {
  systemService: SystemService;
}

export async function systemRoute(app: FastifyInstance, opts: SystemRouteDeps) {
  const { systemService } = opts;

  app.get('/system/logs', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const level = query.level ? parseInt(query.level, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : 200;
    const service = query.service || undefined;

    return systemService.getLogs({ level, limit, service });
  });

  app.get('/system/logs/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const keepAlive = setInterval(() => {
      reply.raw.write(': keep-alive\n\n');
    }, 30_000);

    const unsubscribe = systemService.subscribeLogs((entry) => {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`);
    });

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.get('/system/stats', async () => {
    return systemService.getStats();
  });
}
