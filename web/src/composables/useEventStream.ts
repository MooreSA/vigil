export function useEventStream() {
  let es: EventSource | null = null;
  const listeners = new Map<string, (data: any) => void>();

  function connect() {
    es = new EventSource('/v1/events');
    for (const [event, handler] of listeners) {
      es.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }
  }

  function on(event: string, handler: (data: any) => void) {
    listeners.set(event, handler);
    if (es) {
      es.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }
  }

  function close() {
    es?.close();
    es = null;
  }

  return { connect, on, close };
}
