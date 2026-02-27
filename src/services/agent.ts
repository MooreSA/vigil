import {
  Agent,
  run,
  user,
  assistant,
  system,
  setTracingDisabled,
} from '@openai/agents';
import type { OpenAIChatCompletionsModel } from '@openai/agents';
import type { AgentInputItem } from '@openai/agents';
import type { Logger } from '../logger.js';
import type { ThreadService } from './threads.js';

// Disable SDK tracing — we're not using OpenAI's backend
setTracingDisabled(true);

interface AgentServiceDeps {
  model: OpenAIChatCompletionsModel;
  threadService: ThreadService;
  logger: Logger;
  maxIterations: number;
}

export class AgentService {
  private model: OpenAIChatCompletionsModel;
  private threadService: ThreadService;
  private logger: Logger;
  private maxIterations: number;

  constructor(deps: AgentServiceDeps) {
    this.model = deps.model;
    this.threadService = deps.threadService;
    this.logger = deps.logger;
    this.maxIterations = deps.maxIterations;
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

    const result = await run(agent, inputItems, {
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
