import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { createArchiveThreadTool } from './threads.js';
import type { ThreadService } from '../services/threads.js';

const logger = pino({ level: 'silent' });

function mockThreadService(): ThreadService {
  return {
    archive: vi.fn(),
  } as unknown as ThreadService;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke(t: { invoke: (...args: any[]) => Promise<string> }, args: Record<string, unknown> = {}) {
  return t.invoke({}, JSON.stringify(args));
}

let threadService: ReturnType<typeof mockThreadService>;

beforeEach(() => {
  threadService = mockThreadService();
});

describe('archive_thread tool', () => {
  it('archives the thread and returns a confirmation message', async () => {
    vi.mocked(threadService.archive).mockResolvedValue({ id: '42' } as any);
    const tool = createArchiveThreadTool(threadService, logger);

    const result = await invoke(tool, { thread_id: '42' });

    expect(threadService.archive).toHaveBeenCalledWith('42');
    expect(result).toBe('Thread 42 archived.');
  });

  it('returns not found message when thread does not exist', async () => {
    vi.mocked(threadService.archive).mockResolvedValue(undefined);
    const tool = createArchiveThreadTool(threadService, logger);

    const result = await invoke(tool, { thread_id: '999' });

    expect(result).toBe('Thread 999 not found.');
  });
});
