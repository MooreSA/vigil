import 'dotenv/config';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createLogger } from './logger.js';
import { ThreadRepository } from './repositories/threads.js';
import { MessageRepository } from './repositories/messages.js';
import { buildServer } from './api/server.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, pretty: config.prettyLogs });

const db = createDb(config.databaseUrl);
const threadRepo = new ThreadRepository(db);
const messageRepo = new MessageRepository(db);

const server = buildServer(logger);

const port = config.port;

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
