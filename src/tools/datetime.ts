import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Logger } from '../logger.js';

export function createDatetimeTool(logger: Logger) {
  return tool({
    name: 'current_datetime',
    description:
      'Get the current date and time. Use this whenever you need to know what time or day it is.',
    parameters: z.object({}),
    execute: async () => {
      logger.info({ tool: 'current_datetime' }, 'Tool called: current_datetime');
      const now = new Date();
      return now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    },
  });
}
