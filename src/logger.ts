import pino from 'pino';

interface LoggerOptions {
  level: string;
  pretty: boolean;
  logBuffer?: { write(msg: string): void };
}

export async function createLogger(options: LoggerOptions) {
  if (!options.logBuffer) {
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

  const streams: pino.StreamEntry[] = [{ stream: options.logBuffer }];

  if (options.pretty) {
    try {
      const { default: pinoPretty } = await import('pino-pretty');
      streams.push({ stream: pinoPretty({ colorize: true }) });
    } catch {
      streams.push({ stream: process.stdout });
    }
  } else {
    streams.push({ stream: process.stdout });
  }

  return pino({ level: options.level }, pino.multistream(streams));
}

export type Logger = pino.Logger;
