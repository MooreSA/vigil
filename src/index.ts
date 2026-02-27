import 'dotenv/config';
import OpenAI from 'openai';
import { OpenAIChatCompletionsModel, setTracingDisabled } from '@openai/agents';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createLogger } from './logger.js';
import { ThreadRepository } from './repositories/threads.js';
import { MessageRepository } from './repositories/messages.js';
import { MemoryRepository } from './repositories/memory.js';
import { JobRepository } from './repositories/jobs.js';
import { JobRunRepository } from './repositories/job-runs.js';
import { ThreadService } from './services/threads.js';
import { EmbeddingService } from './services/embedding.js';
import { MemoryService } from './services/memory.js';
import { AgentService } from './services/agent.js';
import { JobService } from './services/jobs.js';
import { NotificationService } from './services/notifications.js';
import { SchedulerService } from './services/scheduler.js';
import { createTools } from './tools/index.js';
import { createEventBus } from './events.js';
import { registerThreadTitleHandler } from './handlers/thread-title.js';
import { buildServer } from './api/server.js';

setTracingDisabled(true);

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, pretty: config.prettyLogs });

const db = createDb(config.databaseUrl);
const threadRepo = new ThreadRepository(db);
const messageRepo = new MessageRepository(db);
const memoryRepo = new MemoryRepository(db);
const jobRepo = new JobRepository(db);
const jobRunRepo = new JobRunRepository(db);

const threadService = new ThreadService({ threadRepo, messageRepo });

const openRouterClient = new OpenAI({
  apiKey: config.openRouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
});
// @ts-expect-error: openai ships dual CJS/ESM .d.ts with incompatible #private fields.
// Runtime class is identical — pure TS dual-package-hazard artifact.
const chatModel = new OpenAIChatCompletionsModel(openRouterClient, config.openRouterChatModel);

const embeddingService = new EmbeddingService({
  openai: openRouterClient,
  model: config.openRouterEmbeddingModel,
});

const memoryService = new MemoryService({
  memoryRepo,
  embeddingService,
  logger: logger.child({ service: 'memory' }),
});

const jobService = new JobService({
  jobRepo,
  jobRunRepo,
  logger: logger.child({ service: 'jobs' }),
});

const tools = createTools({
  memoryService,
  jobService,
  logger,
  googleMapsApiKey: config.googleMapsApiKey,
});

const eventBus = createEventBus();

registerThreadTitleHandler({
  eventBus,
  openai: openRouterClient,
  modelName: config.openRouterChatModel,
  threadService,
  logger: logger.child({ handler: 'thread-title' }),
});

const agentService = new AgentService({
  model: chatModel,
  modelName: config.openRouterChatModel,
  eventBus,
  threadService,
  memoryService,
  logger: logger.child({ service: 'agent' }),
  maxIterations: config.agentMaxIterations,
  tools,
});

const notificationService = new NotificationService({
  url: config.ntfyUrl,
  topic: config.ntfyTopic,
  logger: logger.child({ service: 'notifications' }),
});

const schedulerService = new SchedulerService({
  jobRepo,
  jobRunRepo,
  agentService,
  threadService,
  notificationService,
  logger: logger.child({ service: 'scheduler' }),
  appUrl: config.appUrl,
});

const server = buildServer({ logger, db, agentService, threadService, memoryService, eventBus, jobService });

const port = config.port;

async function start() {
  try {
    await server.listen({ port, host: '0.0.0.0' });
    schedulerService.start();
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  schedulerService.stop();
  await server.close();
  await db.destroy();
  process.exit(0);
}

// SIGTERM: exit immediately so tsx watch can reclaim the port
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
