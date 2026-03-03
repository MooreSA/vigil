import { describe, it, expect } from 'vitest';
import { LogBuffer } from './log-buffer.js';

function entry(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ level: 30, time: Date.now(), msg: 'hello', ...overrides });
}

describe('LogBuffer', () => {
  it('stores and retrieves entries', () => {
    const buf = new LogBuffer(10);
    buf.write(entry({ msg: 'one' }));
    buf.write(entry({ msg: 'two' }));

    const results = buf.search();
    expect(results).toHaveLength(2);
    expect(results[0].msg).toBe('two'); // newest first
    expect(results[1].msg).toBe('one');
  });

  it('wraps around when capacity is exceeded', () => {
    const buf = new LogBuffer(3);
    buf.write(entry({ msg: 'a' }));
    buf.write(entry({ msg: 'b' }));
    buf.write(entry({ msg: 'c' }));
    buf.write(entry({ msg: 'd' })); // overwrites 'a'

    const results = buf.search();
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.msg)).toEqual(['d', 'c', 'b']);
  });

  it('filters by minimum level', () => {
    const buf = new LogBuffer(10);
    buf.write(entry({ level: 30, msg: 'info' }));
    buf.write(entry({ level: 50, msg: 'error' }));
    buf.write(entry({ level: 20, msg: 'debug' }));

    const results = buf.search({ level: 40 });
    expect(results).toHaveLength(1);
    expect(results[0].msg).toBe('error');
  });

  it('filters by text query in msg', () => {
    const buf = new LogBuffer(10);
    buf.write(entry({ msg: 'Connection timeout' }));
    buf.write(entry({ msg: 'Request received' }));
    buf.write(entry({ msg: 'timeout again' }));

    const results = buf.search({ query: 'timeout' });
    expect(results).toHaveLength(2);
  });

  it('filters by text query in structured data', () => {
    const buf = new LogBuffer(10);
    buf.write(entry({ msg: 'Tool called', tool: 'recall' }));
    buf.write(entry({ msg: 'Tool called', tool: 'remember' }));

    const results = buf.search({ query: 'recall' });
    expect(results).toHaveLength(1);
    expect(results[0].tool).toBe('recall');
  });

  it('filters by minutesAgo', () => {
    const buf = new LogBuffer(10);
    const now = Date.now();
    buf.write(entry({ time: now - 120_000, msg: 'old' })); // 2 min ago
    buf.write(entry({ time: now, msg: 'recent' }));

    const results = buf.search({ minutesAgo: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].msg).toBe('recent');
  });

  it('respects limit', () => {
    const buf = new LogBuffer(10);
    for (let i = 0; i < 10; i++) {
      buf.write(entry({ msg: `msg-${i}` }));
    }

    const results = buf.search({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('skips malformed JSON', () => {
    const buf = new LogBuffer(10);
    buf.write('not json');
    buf.write(entry({ msg: 'valid' }));

    const results = buf.search();
    expect(results).toHaveLength(1);
    expect(results[0].msg).toBe('valid');
  });

  it('query matching is case-insensitive', () => {
    const buf = new LogBuffer(10);
    buf.write(entry({ msg: 'Database ERROR occurred' }));

    const results = buf.search({ query: 'database error' });
    expect(results).toHaveLength(1);
  });
});
