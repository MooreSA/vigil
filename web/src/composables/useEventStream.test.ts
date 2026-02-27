import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEventStream } from './useEventStream';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners = new Map<string, EventListener>();
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
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
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
});
