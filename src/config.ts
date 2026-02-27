export interface Config {
  databaseUrl: string;
  port: number;
  logLevel: string;
  prettyLogs: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return {
    databaseUrl,
    port: parseInt(env.PORT ?? '3000', 10),
    logLevel: env.LOG_LEVEL ?? 'info',
    prettyLogs: env.NODE_ENV !== 'production',
  };
}
