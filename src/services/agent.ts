import {
  Agent,
  run as sdkRun,
  user,
  assistant,
  system,
} from '@openai/agents';
import type { OpenAIChatCompletionsModel, StreamedRunResult } from '@openai/agents';
import type { AgentInputItem } from '@openai/agents';
import type { EventBus } from '../events.js';
import type { Logger } from '../logger.js';
import type { ThreadService } from './threads.js';

export type RunFn = (
  agent: Agent,
  input: AgentInputItem[],
  options: { stream: true; maxTurns: number },
) => Promise<StreamedRunResult<any, any>>;

interface AgentServiceDeps {
  model: OpenAIChatCompletionsModel;
  modelName: string;
  eventBus: EventBus;
  threadService: ThreadService;
  logger: Logger;
  maxIterations: number;
  run?: RunFn;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface StreamResult {
  stream: AsyncIterable<string>;
  usage: Promise<TokenUsage | null>;
}

export class AgentService {
  private model: OpenAIChatCompletionsModel;
  private modelName: string;
  private eventBus: EventBus;
  private threadService: ThreadService;
  private logger: Logger;
  private maxIterations: number;
  private run: RunFn;

  constructor(deps: AgentServiceDeps) {
    this.model = deps.model;
    this.modelName = deps.modelName;
    this.eventBus = deps.eventBus;
    this.threadService = deps.threadService;
    this.logger = deps.logger;
    this.maxIterations = deps.maxIterations;
    this.run = deps.run ?? sdkRun;
  }

  async runStream(threadId: string, userMessage: string): Promise<StreamResult> {
    await this.threadService.addMessage({
      thread_id: threadId,
      role: 'user',
      content: { role: 'user', content: userMessage },
    });

    const messages = await this.threadService.getMessages(threadId);
    const inputItems = toInputItems(messages);

    const agent = new Agent({
      name: 'vigil',
      instructions: 'You are a helpful personal AI assistant.',
      model: this.model,
    });

    const result = await this.run(agent, inputItems, {
      stream: true,
      maxTurns: this.maxIterations,
    });

    let fullText = '';
    let usageResolve: (v: TokenUsage | null) => void;
    const usagePromise = new Promise<TokenUsage | null>((r) => { usageResolve = r; });

    const self = this;
    const stream = (async function* () {
      for await (const event of result) {
        if (
          event.type === 'raw_model_stream_event' &&
          event.data.type === 'output_text_delta'
        ) {
          fullText += event.data.delta;
          yield event.data.delta;
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

    return { stream, usage: usagePromise };
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
      // tool messages: skip for now (no tools in step 2)
    }
  }
  return items;
}
