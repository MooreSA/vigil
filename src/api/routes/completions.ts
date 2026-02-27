import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentService } from '../../services/agent.js';
import type { ThreadService } from '../../services/threads.js';

const bodySchema = z.object({
  thread_id: z.string().optional(),
  message: z.string().min(1),
});

interface CompletionsRouteDeps {
  agentService: AgentService;
  threadService: ThreadService;
}

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function completionsRoute(
  app: FastifyInstance,
  opts: CompletionsRouteDeps,
) {
  const { agentService, threadService } = opts;

  app.post('/chat/completions', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { message } = parsed.data;
    let threadId = parsed.data.thread_id;

    if (threadId) {
      const thread = await threadService.findById(threadId);
      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found' });
      }
    } else {
      const thread = await threadService.create();
      threadId = thread.id;
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    reply.raw.write(sseEvent('thread', { thread_id: threadId }));

    try {
      const { stream, usage } = await agentService.runStream(threadId, message);
      for await (const event of stream) {
        if (event.type === 'delta') {
          reply.raw.write(sseEvent('delta', { content: event.content }));
        } else if (event.type === 'tool_call') {
          reply.raw.write(sseEvent('tool_call', { name: event.name, arguments: event.arguments }));
        } else if (event.type === 'tool_result') {
          reply.raw.write(sseEvent('tool_result', { name: event.name, output: event.output }));
        }
      }
      const tokenUsage = await usage;
      reply.raw.write(sseEvent('done', tokenUsage ? { usage: tokenUsage } : {}));
    } catch (err) {
      app.log.error(err, 'Stream error');
      const msg = err instanceof Error ? err.message : 'Internal error';
      reply.raw.write(sseEvent('error', { message: msg }));
    }

    reply.raw.end();
  });
}
