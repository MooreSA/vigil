import { tool } from '@openai/agents';
import { z } from 'zod';
import type { ThreadService } from '../services/threads.js';
import type { Logger } from '../logger.js';

export function createArchiveThreadTool(threadService: ThreadService, logger: Logger) {
  return tool({
    name: 'archive_thread',
    description:
      'Archive a conversation thread so it is hidden from the main list. Use this to tidy up after completing a task or when the user asks you to clean up old conversations. The thread is not deleted and can be restored.',
    parameters: z.object({
      thread_id: z.string().describe('The ID of the thread to archive.'),
    }),
    execute: async ({ thread_id }) => {
      logger.info({ tool: 'archive_thread', thread_id }, 'Tool called: archive_thread');

      const thread = await threadService.archive(thread_id);

      if (!thread) {
        return `Thread ${thread_id} not found.`;
      }

      logger.info({ tool: 'archive_thread', thread_id }, 'Tool completed: archive_thread');
      return `Thread ${thread_id} archived.`;
    },
  });
}
