import {
  Agent,
  run as sdkRun,
  user,
  assistant,
  system,
} from '@openai/agents';
import type { OpenAIChatCompletionsModel, StreamedRunResult, Tool } from '@openai/agents';
import type { AgentInputItem } from '@openai/agents';
import type { EventBus } from '../events.js';
import type { Logger } from '../logger.js';
import type { ThreadService } from './threads.js';
import type { MemoryService } from './memory.js';

export type RunFn = (
  agent: Agent,
  input: AgentInputItem[],
  options: { stream: true; maxTurns: number },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<StreamedRunResult<any, any>>;

interface AgentServiceDeps {
  model: OpenAIChatCompletionsModel;
  modelName: string;
  eventBus: EventBus;
  threadService: ThreadService;
  memoryService: MemoryService;
  logger: Logger;
  maxIterations: number;
  tools: Tool[];
  run?: RunFn;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'tool_call'; callId: string; name: string; arguments: string }
  | { type: 'tool_result'; callId: string; name: string; output: string };

export interface StreamResult {
  stream: AsyncIterable<StreamEvent>;
  model: string;
  usage: Promise<TokenUsage | null>;
}

const BASE_INSTRUCTIONS = `You are a helpful personal AI assistant called Vigil.

You have persistent memory across conversations. Use the "remember" tool to store important facts, preferences, or context that would be useful in future conversations. Use the "recall" tool to search your memory when you need context from previous conversations.

Memory guidelines:
- Store ONE fact per "remember" call. Break compound information into separate atomic facts (e.g. name, location, and job title are three separate memories).
- Before remembering something, ALWAYS use "recall" first to check for existing related memories.
- When recall returns a related memory, decide how to handle it:
  - REPLACE: pass the memory's id as replace_id to overwrite it (e.g. a preference changed, a fact was corrected)
  - AUGMENT: create a new memory alongside the existing one (e.g. adding a new detail that doesn't contradict the old one)
  - COMBINE: pass replace_id and write a merged version that incorporates both old and new information
- Be proactive about remembering things the user tells you about themselves, their preferences, projects, and decisions. But be selective — only remember things that are genuinely useful long-term.`;

export class AgentService {
  private model: OpenAIChatCompletionsModel;
  private modelName: string;
  private eventBus: EventBus;
  private threadService: ThreadService;
  private memoryService: MemoryService;
  private logger: Logger;
  private maxIterations: number;
  private tools: Tool[];
  private run: RunFn;

  constructor(deps: AgentServiceDeps) {
    this.model = deps.model;
    this.modelName = deps.modelName;
    this.eventBus = deps.eventBus;
    this.threadService = deps.threadService;
    this.memoryService = deps.memoryService;
    this.logger = deps.logger;
    this.maxIterations = deps.maxIterations;
    this.tools = deps.tools;
    this.run = deps.run ?? sdkRun;
  }

  async runStream(threadId: string, userMessage: string): Promise<StreamResult> {
    await this.threadService.addMessage({
      thread_id: threadId,
      role: 'user',
      content: { role: 'user', content: userMessage },
    });

    const messages = await this.threadService.getMessages(threadId);
    const isFirstMessage = messages.filter(
      (m) => (m.content as { role: string }).role !== 'system',
    ).length === 1;

    if (isFirstMessage) {
      await this.assembleSystemPrompt(threadId, userMessage);
    }

    // Re-fetch to include system prompt if just assembled
    const allMessages = isFirstMessage
      ? await this.threadService.getMessages(threadId)
      : messages;
    const inputItems = toInputItems(allMessages);

    const agent = new Agent({
      name: 'vigil',
      instructions: BASE_INSTRUCTIONS,
      model: this.model,
      tools: this.tools,
    });

    const result = await this.run(agent, inputItems, {
      stream: true,
      maxTurns: this.maxIterations,
    });

    let fullText = '';
    let usageResolve: (v: TokenUsage | null) => void;
    const usagePromise = new Promise<TokenUsage | null>((r) => { usageResolve = r; });

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const stream = (async function* (): AsyncGenerator<StreamEvent> {
      const callIdToName = new Map<string, string>();

      for await (const event of result) {
        if (
          event.type === 'raw_model_stream_event' &&
          event.data.type === 'output_text_delta'
        ) {
          fullText += event.data.delta;
          yield { type: 'delta', content: event.data.delta };
        } else if (event.type === 'run_item_stream_event') {
          const item = event.item as { type?: string; rawItem?: Record<string, unknown> };
          if (item.type === 'tool_call_item' && item.rawItem) {
            const callId = (item.rawItem.callId as string) ?? '';
            const toolName = (item.rawItem.name as string) ?? '';
            const toolArgs = (item.rawItem.arguments as string) ?? '';
            callIdToName.set(callId, toolName);
            self.logger.info({ tool: toolName, callId, threadId }, 'Tool call started');
            yield { type: 'tool_call', callId, name: toolName, arguments: toolArgs };
          } else if (item.type === 'tool_call_output_item' && item.rawItem) {
            const callId = (item.rawItem.callId as string) ?? '';
            const toolName = callIdToName.get(callId) ?? '';
            const toolOutput = (item.rawItem.output as string) ?? '';
            self.logger.info({ tool: toolName, callId, threadId }, 'Tool call completed');
            yield { type: 'tool_result', callId, name: toolName, output: toolOutput };
          }
        }
      }

      await result.completed;

      let usage: TokenUsage | null = null;
      try {
        const u = result.state.usage;
        if (u) {
          usage = {
            input_tokens: u.inputTokens,
            output_tokens: u.outputTokens,
            total_tokens: u.totalTokens,
          };
        }
      } catch {
        // Usage not available
      }

      await self.threadService.addMessage({
        thread_id: threadId,
        role: 'assistant',
        model: self.modelName,
        content: {
          role: 'assistant',
          content: fullText,
          ...(usage ? { usage } : {}),
        },
      });

      self.eventBus.emit('response:complete', { threadId });
      usageResolve!(usage);
    })();

    return { stream, model: this.modelName, usage: usagePromise };
  }

  private async assembleSystemPrompt(threadId: string, userMessage: string): Promise<void> {
    try {
      const memories = await this.memoryService.recall(userMessage);

      const now = new Date();
      const currentTime = now.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });

      let systemContent = `${BASE_INSTRUCTIONS}\n\nCurrent time: ${currentTime}`;
      if (memories.length > 0) {
        const memoryBlock = memories
          .map((m) => `- ${m.content}`)
          .join('\n');
        systemContent += `\n\nRelevant context from memory:\n${memoryBlock}`;
      }

      await this.threadService.addMessage({
        thread_id: threadId,
        role: 'system',
        content: { role: 'system', content: systemContent },
      });
    } catch (err) {
      this.logger.warn({ err, threadId }, 'Failed to assemble system prompt with memories');
      // Fall back to base instructions without memory injection
      await this.threadService.addMessage({
        thread_id: threadId,
        role: 'system',
        content: { role: 'system', content: BASE_INSTRUCTIONS },
      });
    }
  }
}

function toInputItems(
  messages: Awaited<ReturnType<ThreadService['getMessages']>>,
): AgentInputItem[] {
  const items: AgentInputItem[] = [];
  for (const msg of messages) {
    const content = msg.content as { role: string; content: string };
    switch (content.role) {
      case 'system':
        items.push(system(content.content));
        break;
      case 'user':
        items.push(user(content.content));
        break;
      case 'assistant':
        items.push(assistant(content.content));
        break;
      // Tool call/result messages are ephemeral within a single run —
      // the SDK handles them internally. We only persist the final text output.
    }
  }
  return items;
}
