import Fastify from 'fastify';
import type { Logger } from '../logger.js';

export function buildServer(logger: Logger) {
  const app = Fastify({ loggerInstance: logger });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
