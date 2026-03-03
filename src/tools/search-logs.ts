import { tool } from '@openai/agents';
import { z } from 'zod';
import type { LogBuffer } from '../services/log-buffer.js';
import type { Logger } from '../logger.js';

const LEVEL_MAP: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_LABELS: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

export function createSearchLogsTool(logBuffer: LogBuffer, logger: Logger) {
  return tool({
    name: 'search_logs',
    description:
      'Search recent system logs for debugging and diagnostics. Returns log entries matching the given criteria, newest first. Use this to investigate errors, trace request flows, or diagnose issues.',
    parameters: z.object({
      query: z
        .string()
        .optional()
        .describe('Text to search for in log messages and structured data.'),
      level: z
        .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
        .optional()
        .describe('Minimum log level to include. Defaults to all levels.'),
      minutes_ago: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .default(60)
        .describe('How many minutes back to search. Defaults to 60.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Maximum number of entries to return.'),
    }),
    execute: async ({ query, level, minutes_ago, limit }) => {
      logger.info({ tool: 'search_logs', query, level, minutes_ago, limit }, 'Tool called: search_logs');

      const results = logBuffer.search({
        query,
        level: level ? LEVEL_MAP[level] : undefined,
        minutesAgo: minutes_ago,
        limit,
      });

      logger.info({ tool: 'search_logs', resultCount: results.length }, 'Tool completed: search_logs');

      if (results.length === 0) {
        return 'No log entries found matching the criteria.';
      }

      return results
        .map((entry) => {
          const time = new Date(entry.time).toISOString();
          const label = LEVEL_LABELS[entry.level] ?? String(entry.level);
          const { level: _l, time: _t, msg, pid: _p, hostname: _h, ...data } = entry;
          const extra = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
          return `[${time}] ${label}: ${msg}${extra}`;
        })
        .join('\n');
    },
  });
}
