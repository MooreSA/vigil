import pino from 'pino';

interface LoggerOptions {
  level: string;
  pretty: boolean;
}

export function createLogger(options: LoggerOptions) {
  return pino({
    level: options.level,
    ...(options.pretty && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    }),
  });
}

export type Logger = pino.Logger;
