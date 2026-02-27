import pino from 'pino';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.string().default('development'),
});

export type Config = {
  databaseUrl: string;
  port: number;
  logLevel: string;
  prettyLogs: boolean;
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
  };
}
