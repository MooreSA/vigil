import { ref, type Ref } from 'vue';
import { fetchThread, streamChat, type Message } from '../lib/api';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ToolCall {
  callId: string;
  name: string;
  arguments: string;
  output?: string;
  status: 'running' | 'done';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model: string | null;
  created_at: string;
  usage?: TokenUsage;
  toolCalls?: ToolCall[];
}

function extractContent(msg: Message): string {
  const c = msg.content as Record<string, unknown>;
  if (typeof c.content === 'string') return c.content;
  return JSON.stringify(c);
}

function extractUsage(msg: Message): TokenUsage | undefined {
  const c = msg.content as Record<string, unknown>;
  const u = c.usage as TokenUsage | undefined;
  if (u && typeof u.total_tokens === 'number') return u;
  return undefined;
}

export function useChat() {
  const messages: Ref<ChatMessage[]> = ref([]);
  const isStreaming = ref(false);
  const streamingContent = ref('');
  const activeToolCalls: Ref<ToolCall[]> = ref([]);
  const threadId: Ref<string | null> = ref(null);
  const threadSource: Ref<string> = ref('user');
  const loadingHistory = ref(false);

  async function loadThread(id: string) {
    loadingHistory.value = true;
    try {
      const data = await fetchThread(id);
      threadId.value = id;
      threadSource.value = data.thread.source;
      messages.value = data.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: extractContent(m),
          model: m.model,
          created_at: m.created_at,
          usage: extractUsage(m),
        }));
    } finally {
      loadingHistory.value = false;
    }
  }

  function reset() {
    messages.value = [];
    threadId.value = null;
    threadSource.value = 'user';
    streamingContent.value = '';
    isStreaming.value = false;
  }

  async function send(text: string): Promise<string | null> {
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      model: null,
      created_at: new Date().toISOString(),
    };
    messages.value.push(userMsg);

    isStreaming.value = true;
    streamingContent.value = '';
    activeToolCalls.value = [];
    const startTime = Date.now();
    let newThreadId: string | null = null;
    let model: string | null = null;
    let usage: TokenUsage | undefined;

    try {
      for await (const event of streamChat(threadId.value, text)) {
        switch (event.event) {
          case 'thread':
            newThreadId = event.data.thread_id as string;
            threadId.value = newThreadId;
            break;
          case 'delta':
            streamingContent.value += event.data.content as string;
            break;
          case 'done': {
            model = (event.data.model as string) ?? null;
            const u = event.data.usage as TokenUsage | undefined;
            if (u && typeof u.total_tokens === 'number') usage = u;
            break;
          }
          case 'tool_call':
            activeToolCalls.value.push({
              callId: event.data.callId as string,
              name: event.data.name as string,
              arguments: event.data.arguments as string,
              status: 'running',
            });
            break;
          case 'tool_result': {
            const tc = activeToolCalls.value.find(
              (t) => t.callId === event.data.callId,
            );
            if (tc) {
              tc.output = event.data.output as string;
              tc.status = 'done';
            }
            break;
          }
          case 'error':
            streamingContent.value += `\n\n**Error:** ${event.data.message}`;
            break;
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const completedTools = activeToolCalls.value.length > 0
        ? activeToolCalls.value.map((t) => ({ ...t, status: 'done' as const }))
        : undefined;
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: streamingContent.value,
        model,
        created_at: new Date().toISOString(),
        usage,
        toolCalls: completedTools,
      };
      // Store timing in a way we can access it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (assistantMsg as any)._elapsed = elapsed;
      messages.value.push(assistantMsg);
    } finally {
      isStreaming.value = false;
      streamingContent.value = '';
      activeToolCalls.value = [];
    }

    return newThreadId;
  }

  return {
    messages,
    isStreaming,
    streamingContent,
    activeToolCalls,
    threadId,
    threadSource,
    loadingHistory,
    loadThread,
    reset,
    send,
  };
}
