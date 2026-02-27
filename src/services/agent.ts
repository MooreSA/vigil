import {
  Agent,
  run as sdkRun,
  user,
  assistant,
  system,
} from '@openai/agents';
import type { OpenAIChatCompletionsModel, StreamedRunResult } from '@openai/agents';
import type { AgentInputItem } from '@openai/agents';
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
  threadService: ThreadService;
  logger: Logger;
  maxIterations: number;
  run?: RunFn;
}

export class AgentService {
  private model: OpenAIChatCompletionsModel;
  private modelName: string;
  private threadService: ThreadService;
  private logger: Logger;
  private maxIterations: number;
  private run: RunFn;

  constructor(deps: AgentServiceDeps) {
    this.model = deps.model;
    this.modelName = deps.modelName;
    this.threadService = deps.threadService;
    this.logger = deps.logger;
    this.maxIterations = deps.maxIterations;
    this.run = deps.run ?? sdkRun;
  }

  async *runStream(threadId: string, userMessage: string): AsyncGenerator<string> {
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

    await this.threadService.addMessage({
      thread_id: threadId,
      role: 'assistant',
      model: this.modelName,
      content: { role: 'assistant', content: fullText },
    });
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
