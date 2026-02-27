import Fastify from 'fastify';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import type { Logger } from '../logger.js';
import type { AgentService } from '../services/agent.js';
import type { ThreadService } from '../services/threads.js';
import { completionsRoute } from './routes/completions.js';

interface ServerDeps {
  logger: Logger;
  db: Kysely<DB>;
  agentService: AgentService;
  threadService: ThreadService;
}

export function buildServer({ logger, db, agentService, threadService }: ServerDeps) {
  const app = Fastify({ loggerInstance: logger });

  app.get('/healthz', async (_req, reply) => {
    try {
      await sql`SELECT 1`.execute(db);
      return { status: 'ok' };
    } catch (err) {
      app.log.error(err, 'Health check failed');
      return reply.code(503).send({ status: 'error', message: 'database unreachable' });
    }
  });

  app.register(completionsRoute, { prefix: '/v1', agentService, threadService });

  return app;
}
