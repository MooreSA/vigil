import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import type { NotificationService } from '../services/notifications.js';
import { createNotifyTool } from './notify.js';

const logger = pino({ level: 'silent' });

function mockNotificationService(): NotificationService {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke(t: { invoke: (...args: any[]) => Promise<string> }, args: Record<string, unknown> = {}) {
  return t.invoke({}, JSON.stringify(args));
}

describe('notify tool', () => {
  it('sends notification and returns confirmation', async () => {
    const service = mockNotificationService();
    const tool = createNotifyTool(service, logger);

    const result = await invoke(tool, { title: 'Task done', body: 'Finished processing data' });

    expect(result).toBe('Notification sent: "Task done"');
    expect(service.notify).toHaveBeenCalledWith({
      title: 'Task done',
      body: 'Finished processing data',
      tag: undefined,
    });
  });

  it('passes optional tag to service', async () => {
    const service = mockNotificationService();
    const tool = createNotifyTool(service, logger);

    const result = await invoke(tool, {
      title: 'Warning',
      body: 'Disk usage at 90%',
      tag: 'warning',
    });

    expect(result).toBe('Notification sent: "Warning"');
    expect(service.notify).toHaveBeenCalledWith({
      title: 'Warning',
      body: 'Disk usage at 90%',
      tag: 'warning',
    });
  });

  it('returns error message on failure', async () => {
    const service = mockNotificationService();
    vi.mocked(service.notify).mockRejectedValue(new Error('Network timeout'));
    const tool = createNotifyTool(service, logger);

    const result = await invoke(tool, { title: 'Test', body: 'Hello' });

    expect(result).toContain('Failed to send notification');
    expect(result).toContain('Network timeout');
  });
});
