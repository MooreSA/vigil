import pino from 'pino';
import pinoPretty from 'pino-pretty';
import type { LogBuffer } from './services/log-buffer.js';

interface LoggerOptions {
  level: string;
  pretty: boolean;
  logBuffer?: LogBuffer;
}

export function createLogger(options: LoggerOptions) {
  const streams: pino.StreamEntry[] = [
    {
      stream: options.pretty
        ? pinoPretty({ colorize: true })
        : pino.destination(1),
    },
  ];

  if (options.logBuffer) {
    streams.push({ stream: options.logBuffer });
  }

  return pino({ level: options.level }, pino.multistream(streams));
}

export type Logger = pino.Logger;
