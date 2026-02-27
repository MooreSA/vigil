import { tool } from '@openai/agents';
import { z } from 'zod';
import type { MemoryService } from '../services/memory.js';
import type { Logger } from '../logger.js';

export function createRememberTool(memoryService: MemoryService, logger: Logger) {
  return tool({
    name: 'remember',
    description:
      'Store a single atomic fact in long-term memory. Each call should store ONE specific fact — not compound statements. Always use "recall" first to check for existing related memories. When a related memory exists, decide: (1) pass its id as replace_id to UPDATE it with a revised version, or (2) omit replace_id to store a NEW memory alongside the existing one. Use your judgement — replace when the new fact supersedes the old, create new when both facts should coexist.',
    parameters: z.object({
      content: z.string().describe('A single, specific fact or preference.'),
      replace_id: z.string().optional().describe('ID of an existing memory to replace (from recall results). Omit to create a new memory.'),
    }),
    execute: async ({ content, replace_id }) => {
      logger.info({ tool: 'remember', content, replace_id }, 'Tool called: remember');
      const result = await memoryService.remember(content, 'agent', undefined, replace_id);
      logger.info({ tool: 'remember', memoryId: result?.id, replaced: !!replace_id }, 'Tool completed: remember');
      return replace_id
        ? `Updated memory ${replace_id}: "${content}"`
        : `Remembered: "${content}"`;
    },
  });
}
