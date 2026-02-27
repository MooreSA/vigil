import { tool } from '@openai/agents';
import { z } from 'zod';
import type { MemoryService } from '../services/memory.js';
import type { Logger } from '../logger.js';

export function createRememberTool(memoryService: MemoryService, logger: Logger) {
  return tool({
    name: 'remember',
    description:
      'Store a single atomic fact in long-term memory. Each call should store ONE specific fact — not compound statements. If the user shares multiple facts (e.g. their name AND their job), call this tool separately for each fact. Before storing, use the "recall" tool to check if a similar fact already exists — if so, update it by storing a more complete version rather than creating a near-duplicate.',
    parameters: z.object({
      content: z.string().describe('A single, specific fact or preference. Good: "User\'s name is Seamus Moore". Bad: "User is named Seamus Moore and works as a developer in Halifax".'),
    }),
    execute: async ({ content }) => {
      logger.info({ tool: 'remember', content }, 'Tool called: remember');
      const result = await memoryService.remember(content, 'agent');
      logger.info({ tool: 'remember', memoryId: result?.id }, 'Tool completed: remember');
      return `Remembered: "${content}"`;
    },
  });
}
