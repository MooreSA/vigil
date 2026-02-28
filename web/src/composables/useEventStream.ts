import { ref } from 'vue';

export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 30000;

export function useEventStream() {
  let es: EventSource | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<string, (data: any) => void>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let shouldReconnect = true;

  const connected = ref(false);

  function getDelay() {
    return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    const delay = getDelay();
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (es) {
      es.close();
    }

    es = new EventSource('/v1/events');

    es.onopen = () => {
      attempt = 0;
      connected.value = true;
    };

    es.onerror = () => {
      connected.value = false;
      es?.close();
      es = null;
      scheduleReconnect();
    };

    for (const [event, handler] of listeners) {
      es.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function on(event: string, handler: (data: any) => void) {
    listeners.set(event, handler);
    if (es) {
      es.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }
  }

  function close() {
    shouldReconnect = false;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    es?.close();
    es = null;
    connected.value = false;
  }

  return { connect, on, close, connected };
}
