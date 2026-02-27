import 'dotenv/config';
import { createDb } from './db/client.js';
import { createLogger } from './logger.js';
import { ThreadRepository } from './repositories/threads.js';
import { MessageRepository } from './repositories/messages.js';
import { buildServer } from './api/server.js';

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  logger.fatal('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(connectionString);
const threadRepo = new ThreadRepository(db);
const messageRepo = new MessageRepository(db);

const server = buildServer(logger);

const port = parseInt(process.env.PORT ?? '3000', 10);

async function start() {
  try {
    await server.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  await server.close();
  await db.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
