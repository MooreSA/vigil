import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { LogBuffer } from '../services/log-buffer.js';
import { createSearchLogsTool } from './search-logs.js';

const logger = pino({ level: 'silent' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke(t: { invoke: (...args: any[]) => Promise<string> }, args: Record<string, unknown> = {}) {
  return t.invoke({}, JSON.stringify(args));
}

describe('search_logs tool', () => {
  it('returns formatted log entries', async () => {
    const buf = new LogBuffer(10);
    buf.write(JSON.stringify({ level: 50, time: Date.now(), msg: 'Something broke', service: 'agent' }));

    const tool = createSearchLogsTool(buf, logger);
    const result = await invoke(tool, { minutes_ago: 1440 });

    expect(result).toContain('ERROR');
    expect(result).toContain('Something broke');
    expect(result).toContain('"service":"agent"');
  });

  it('returns empty message when no matches', async () => {
    const buf = new LogBuffer(10);
    const tool = createSearchLogsTool(buf, logger);
    const result = await invoke(tool, { query: 'nonexistent' });

    expect(result).toBe('No log entries found matching the criteria.');
  });

  it('filters by level', async () => {
    const buf = new LogBuffer(10);
    buf.write(JSON.stringify({ level: 30, time: Date.now(), msg: 'info line' }));
    buf.write(JSON.stringify({ level: 50, time: Date.now(), msg: 'error line' }));

    const tool = createSearchLogsTool(buf, logger);
    const result = await invoke(tool, { level: 'error', minutes_ago: 1440 });

    expect(result).toContain('error line');
    expect(result).not.toContain('info line');
  });

  it('strips pid and hostname from output', async () => {
    const buf = new LogBuffer(10);
    buf.write(JSON.stringify({ level: 30, time: Date.now(), msg: 'test', pid: 12345, hostname: 'server' }));

    const tool = createSearchLogsTool(buf, logger);
    const result = await invoke(tool, { minutes_ago: 1440 });

    expect(result).not.toContain('12345');
    expect(result).not.toContain('server');
  });
});
