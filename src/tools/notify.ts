import { tool } from '@openai/agents';
import { z } from 'zod';
import type { NotificationService } from '../services/notifications.js';
import type { Logger } from '../logger.js';

export function createNotifyTool(notificationService: NotificationService, logger: Logger) {
  return tool({
    name: 'notify',
    description:
      'Send a push notification to the user via ntfy. Use this to alert the user about something important — for example, when a long-running task reaches a milestone, when you need their attention, or when something time-sensitive happens. Keep titles short and bodies concise.',
    parameters: z.object({
      title: z.string().describe('Short notification title.'),
      body: z.string().describe('Notification body text.'),
      tag: z.string().optional().describe('Optional emoji shortcode for the notification icon (e.g. "white_check_mark", "warning").'),
    }),
    execute: async ({ title, body, tag }) => {
      logger.info({ tool: 'notify', title }, 'Tool called: notify');

      try {
        await notificationService.notify({ title, body, tag });
        logger.info({ tool: 'notify', title }, 'Tool completed: notify');
        return `Notification sent: "${title}"`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ tool: 'notify', err: message }, 'notify failed');
        return `Failed to send notification: ${message}`;
      }
    },
  });
}
