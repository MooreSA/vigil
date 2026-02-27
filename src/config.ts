import pino from 'pino';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.string().default('development'),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_CHAT_MODEL: z.string().default('anthropic/claude-sonnet-4'),
  OPENROUTER_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().default(25),
});

export type Config = {
  databaseUrl: string;
  port: number;
  logLevel: string;
  prettyLogs: boolean;
  openRouterApiKey: string;
  openRouterChatModel: string;
  openRouterEmbeddingModel: string;
  agentMaxIterations: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const log = pino({ level: 'fatal' });
    for (const issue of result.error.issues) {
      log.fatal({ field: issue.path.join('.'), code: issue.code }, issue.message);
    }
    process.exit(1);
  }

  const parsed = result.data;

  return {
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    prettyLogs: parsed.NODE_ENV !== 'production',
    openRouterApiKey: parsed.OPENROUTER_API_KEY,
    openRouterChatModel: parsed.OPENROUTER_CHAT_MODEL,
    openRouterEmbeddingModel: parsed.OPENROUTER_EMBEDDING_MODEL,
    agentMaxIterations: parsed.AGENT_MAX_ITERATIONS,
  };
}
