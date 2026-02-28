import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEventStream, BASE_DELAY_MS, MAX_DELAY_MS } from './useEventStream';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners = new Map<string, EventListener>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: EventListener) {
    this.listeners.set(event, handler);
  }

  simulateEvent(event: string, data: unknown) {
    const handler = this.listeners.get(event);
    if (handler) {
      handler({ data: JSON.stringify(data) } as unknown as Event);
    }
  }

  simulateOpen() {
    this.onopen?.();
  }

  simulateError() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useEventStream', () => {
  it('creates EventSource on connect', () => {
    const { connect } = useEventStream();
    connect();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/v1/events');
  });

  it('registers listeners added before connect', () => {
    const handler = vi.fn();
    const { on, connect } = useEventStream();

    on('thread:updated', handler);
    connect();

    const es = MockEventSource.instances[0];
    es.simulateEvent('thread:updated', { id: '1', title: 'Hello' });

    expect(handler).toHaveBeenCalledWith({ id: '1', title: 'Hello' });
  });

  it('registers listeners added after connect', () => {
    const handler = vi.fn();
    const { on, connect } = useEventStream();

    connect();
    on('thread:updated', handler);

    const es = MockEventSource.instances[0];
    es.simulateEvent('thread:updated', { id: '2', title: 'World' });

    expect(handler).toHaveBeenCalledWith({ id: '2', title: 'World' });
  });

  it('closes EventSource on close()', () => {
    const { connect, close } = useEventStream();
    connect();

    const es = MockEventSource.instances[0];
    close();

    expect(es.close).toHaveBeenCalled();
  });

  it('handles close when not connected', () => {
    const { close } = useEventStream();
    // Should not throw
    close();
  });

  it('sets connected to true on open', () => {
    const { connect, connected } = useEventStream();
    connect();

    expect(connected.value).toBe(false);

    MockEventSource.instances[0].simulateOpen();
    expect(connected.value).toBe(true);
  });

  it('reconnects on error with exponential backoff', () => {
    const { connect } = useEventStream();
    connect();

    // First error: reconnect after BASE_DELAY_MS
    MockEventSource.instances[0].simulateError();
    expect(MockEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(BASE_DELAY_MS);
    expect(MockEventSource.instances).toHaveLength(2);

    // Second error: reconnect after BASE_DELAY_MS * 2
    MockEventSource.instances[1].simulateError();
    vi.advanceTimersByTime(BASE_DELAY_MS);
    expect(MockEventSource.instances).toHaveLength(2); // not yet

    vi.advanceTimersByTime(BASE_DELAY_MS);
    expect(MockEventSource.instances).toHaveLength(3);
  });

  it('caps reconnect delay at MAX_DELAY_MS', () => {
    const { connect } = useEventStream();
    connect();

    // Simulate many errors to exceed max delay
    for (let i = 0; i < 20; i++) {
      const es = MockEventSource.instances[MockEventSource.instances.length - 1];
      es.simulateError();
      vi.advanceTimersByTime(MAX_DELAY_MS);
    }

    // Should still be reconnecting (not crashed)
    expect(MockEventSource.instances.length).toBeGreaterThan(1);
  });

  it('resets attempt counter on successful open', () => {
    const { connect } = useEventStream();
    connect();

    // Fail a few times
    MockEventSource.instances[0].simulateError();
    vi.advanceTimersByTime(BASE_DELAY_MS);
    MockEventSource.instances[1].simulateError();
    vi.advanceTimersByTime(BASE_DELAY_MS * 2);

    // Successful connection
    MockEventSource.instances[2].simulateOpen();

    // Next error should use base delay again
    MockEventSource.instances[2].simulateError();
    const countBefore = MockEventSource.instances.length;

    vi.advanceTimersByTime(BASE_DELAY_MS);
    expect(MockEventSource.instances).toHaveLength(countBefore + 1);
  });

  it('does not reconnect after close()', () => {
    const { connect, close } = useEventStream();
    connect();

    MockEventSource.instances[0].simulateError();
    close();

    vi.advanceTimersByTime(MAX_DELAY_MS * 2);
    // Only the original instance, no reconnection attempts
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('sets connected to false on error', () => {
    const { connect, connected } = useEventStream();
    connect();

    MockEventSource.instances[0].simulateOpen();
    expect(connected.value).toBe(true);

    MockEventSource.instances[0].simulateError();
    expect(connected.value).toBe(false);
  });

  it('sets connected to false on close()', () => {
    const { connect, close, connected } = useEventStream();
    connect();

    MockEventSource.instances[0].simulateOpen();
    expect(connected.value).toBe(true);

    close();
    expect(connected.value).toBe(false);
  });

  it('re-registers listeners on reconnect', () => {
    const handler = vi.fn();
    const { on, connect } = useEventStream();

    on('thread:updated', handler);
    connect();

    // Trigger reconnect
    MockEventSource.instances[0].simulateError();
    vi.advanceTimersByTime(BASE_DELAY_MS);

    // Verify listener works on the new instance
    MockEventSource.instances[1].simulateEvent('thread:updated', { id: '3', title: 'Reconnected' });
    expect(handler).toHaveBeenCalledWith({ id: '3', title: 'Reconnected' });
  });
});
