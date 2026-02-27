import type OpenAI from 'openai';
import type { EventBus } from '../events.js';
import type { ThreadService } from '../services/threads.js';
import type { Logger } from '../logger.js';

interface ThreadTitleHandlerDeps {
  eventBus: EventBus;
  openai: OpenAI;
  modelName: string;
  threadService: ThreadService;
  logger: Logger;
}

export function registerThreadTitleHandler(deps: ThreadTitleHandlerDeps) {
  const { eventBus, openai, modelName, threadService, logger } = deps;

  eventBus.on('response:complete', async ({ threadId }: { threadId: string }) => {
    try {
      const messages = await threadService.getMessages(threadId);
      const nonSystem = messages.filter(
        m => (m.content as { role: string }).role !== 'system',
      );

      // First exchange = exactly one user message + one assistant message
      if (nonSystem.length !== 2) return;

      const userMsg = nonSystem.find(
        m => (m.content as { role: string }).role === 'user',
      );
      const assistantMsg = nonSystem.find(
        m => (m.content as { role: string }).role === 'assistant',
      );
      if (!userMsg || !assistantMsg) return;

      const userText = (userMsg.content as { content: string }).content;
      const assistantSnippet = (assistantMsg.content as { content: string }).content.slice(0, 300);

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: `Summarize this conversation in 3-6 words for a sidebar title.\nReply with only the title text, no quotes.\n\nUser: ${userText}\nAssistant: ${assistantSnippet}`,
          },
        ],
      });

      const title = completion.choices[0]?.message?.content?.trim();
      if (title) {
        await threadService.updateTitle(threadId, title);
        eventBus.emit('sse', {
          type: 'thread:updated',
          data: { id: threadId, title },
        });
      }
    } catch (err) {
      logger.warn({ err, threadId }, 'Failed to generate thread title');
    }
  });
}
