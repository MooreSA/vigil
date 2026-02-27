export interface Thread {
  id: string;
  title: string | null;
  source: string;
  job_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  model: string | null;
  content: Record<string, unknown>;
  created_at: string;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch('/v1/threads');
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
  return res.json();
}

export async function fetchThread(id: string): Promise<{ thread: Thread; messages: Message[] }> {
  const res = await fetch(`/v1/threads/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
  return res.json();
}

export async function* streamChat(
  threadId: string | null,
  message: string,
): AsyncGenerator<SSEEvent> {
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(threadId ? { thread_id: threadId } : {}),
      message,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    // Keep the last part as it may be incomplete
    buffer = parts.pop()!;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));

      if (eventLine && dataLine) {
        const event = eventLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim());
        yield { event, data };
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const lines = buffer.trim().split('\n');
    const eventLine = lines.find((l) => l.startsWith('event:'));
    const dataLine = lines.find((l) => l.startsWith('data:'));

    if (eventLine && dataLine) {
      const event = eventLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());
      yield { event, data };
    }
  }
}
