import { tool } from '@openai/agents';
import { z } from 'zod';
import type { MemoryService } from '../services/memory.js';
import type { Logger } from '../logger.js';

export function createRecallTool(memoryService: MemoryService, logger: Logger) {
  return tool({
    name: 'recall',
    description:
      'Search long-term memory for relevant facts, preferences, or context. Use this when you need to look up something the user may have told you before, or when context from previous conversations would help answer the current question.',
    parameters: z.object({
      query: z.string().describe('What to search for in memory. Use natural language.'),
      limit: z.number().int().min(1).max(20).default(10).describe('Maximum number of results to return.'),
    }),
    execute: async ({ query, limit }) => {
      logger.info({ tool: 'recall', query, limit }, 'Tool called: recall');
      const results = await memoryService.recall(query, limit);
      logger.info({ tool: 'recall', resultCount: results.length }, 'Tool completed: recall');
      if (results.length === 0) {
        return 'No relevant memories found.';
      }
      return results
        .map((r) => `- ${r.content} (relevance: ${(r.similarity * 100).toFixed(0)}%)`)
        .join('\n');
    },
  });
}
