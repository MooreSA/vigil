import type { Logger } from '../logger.js';

interface NotificationServiceDeps {
  url?: string;
  topic?: string;
  logger: Logger;
}

interface NotifyInput {
  title: string;
  body: string;
  tag?: string;
  clickUrl?: string;
}

export class NotificationService {
  private url?: string;
  private topic?: string;
  private logger: Logger;

  constructor(deps: NotificationServiceDeps) {
    this.url = deps.url;
    this.topic = deps.topic;
    this.logger = deps.logger;
  }

  async notify({ title, body, tag, clickUrl }: NotifyInput): Promise<void> {
    if (!this.url || !this.topic) {
      return;
    }

    try {
      const headers: Record<string, string> = {
        Title: title,
      };
      if (tag) headers.Tags = tag;
      if (clickUrl) headers.Click = clickUrl;

      const response = await fetch(`${this.url}/${this.topic}`, {
        method: 'POST',
        body,
        headers,
      });

      if (!response.ok) {
        this.logger.warn(
          { status: response.status, statusText: response.statusText },
          'ntfy request failed',
        );
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to send ntfy notification');
    }
  }
}
