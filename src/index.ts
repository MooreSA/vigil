import 'dotenv/config';
import OpenAI from 'openai';
import { OpenAIChatCompletionsModel } from '@openai/agents';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createLogger } from './logger.js';
import { ThreadRepository } from './repositories/threads.js';
import { MessageRepository } from './repositories/messages.js';
import { ThreadService } from './services/threads.js';
import { AgentService } from './services/agent.js';
import { buildServer } from './api/server.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, pretty: config.prettyLogs });

const db = createDb(config.databaseUrl);
const threadRepo = new ThreadRepository(db);
const messageRepo = new MessageRepository(db);

const threadService = new ThreadService({ threadRepo, messageRepo });

const openRouterClient = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
});
// @ts-expect-error: openai ships dual CJS/ESM .d.ts with incompatible #private fields.
// Runtime class is identical — pure TS dual-package-hazard artifact.
const chatModel = new OpenAIChatCompletionsModel(openRouterClient, config.openRouterChatModel);

const agentService = new AgentService({
  model: chatModel,
  threadService,
  logger: logger.child({ service: 'agent' }),
  maxIterations: config.agentMaxIterations,
});

const server = buildServer({ logger, db, agentService, threadService });

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
