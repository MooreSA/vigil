import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { NotificationService } from './notifications.js';

const logger = pino({ level: 'silent' });

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationService', () => {
  it('sends POST to ntfy with correct headers', async () => {
    const service = new NotificationService({
      url: 'https://ntfy.example.com',
      topic: 'agent',
      logger,
    });

    await service.notify({
      title: 'Job done',
      body: 'The job completed successfully',
      tag: 'white_check_mark',
      clickUrl: 'https://app.example.com/threads/1',
    });

    expect(fetchSpy).toHaveBeenCalledWith('https://ntfy.example.com/agent', {
      method: 'POST',
      body: 'The job completed successfully',
      headers: {
        Title: 'Job done',
        Tags: 'white_check_mark',
        Click: 'https://app.example.com/threads/1',
      },
    });
  });

  it('omits optional headers when not provided', async () => {
    const service = new NotificationService({
      url: 'https://ntfy.example.com',
      topic: 'agent',
      logger,
    });

    await service.notify({ title: 'Test', body: 'Hello' });

    expect(fetchSpy).toHaveBeenCalledWith('https://ntfy.example.com/agent', {
      method: 'POST',
      body: 'Hello',
      headers: { Title: 'Test' },
    });
  });

  it('no-ops when url is not configured', async () => {
    const service = new NotificationService({ topic: 'agent', logger });

    await service.notify({ title: 'Test', body: 'Hello' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no-ops when topic is not configured', async () => {
    const service = new NotificationService({ url: 'https://ntfy.example.com', logger });

    await service.notify({ title: 'Test', body: 'Hello' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('logs warning on fetch error without throwing', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));
    const service = new NotificationService({
      url: 'https://ntfy.example.com',
      topic: 'agent',
      logger,
    });

    await expect(service.notify({ title: 'Test', body: 'Hello' })).resolves.toBeUndefined();
  });

  it('logs warning on non-ok response without throwing', async () => {
    fetchSpy.mockResolvedValue(new Response('error', { status: 500, statusText: 'Internal Server Error' }));
    const service = new NotificationService({
      url: 'https://ntfy.example.com',
      topic: 'agent',
      logger,
    });

    await expect(service.notify({ title: 'Test', body: 'Hello' })).resolves.toBeUndefined();
  });
});
