import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import type { Logger } from '../logger.js';
import type { AgentService } from '../services/agent.js';
import type { ThreadService } from '../services/threads.js';
import type { MemoryService } from '../services/memory.js';
import type { EventBus } from '../events.js';
import type { JobService } from '../services/jobs.js';
import { completionsRoute } from './routes/completions.js';
import { threadsRoute } from './routes/threads.js';
import { eventsRoute } from './routes/events.js';
import { memoryRoute } from './routes/memory.js';
import { jobsRoute } from './routes/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerDeps {
  logger: Logger;
  db: Kysely<DB>;
  agentService: AgentService;
  threadService: ThreadService;
  memoryService: MemoryService;
  eventBus: EventBus;
  jobService: JobService;
}

export function buildServer({ logger, db, agentService, threadService, memoryService, eventBus, jobService }: ServerDeps) {
  const app = Fastify({ loggerInstance: logger, forceCloseConnections: true });

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
  app.register(threadsRoute, { prefix: '/v1', threadService });
  app.register(eventsRoute, { prefix: '/v1', eventBus });
  app.register(memoryRoute, { prefix: '/v1', memoryService });
  app.register(jobsRoute, { prefix: '/v1', jobService });

  // Serve built Vue app if web/dist exists
  const webDistPath = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      decorateReply: false,
    });

    // SPA fallback — all non-API routes serve index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/v1') || req.url === '/healthz') {
        reply.code(404).send({ error: 'Not found' });
      } else {
        reply.type('text/html').send(fs.readFileSync(path.join(webDistPath, 'index.html')));
      }
    });
  }

  return app;
}
