# Personal AI Agent -- Project Brief

## Overview

A self-hosted personal AI agent with threaded conversations, persistent memory, scheduled task execution ("wake" behavior), and push notifications. Built from scratch rather than forking an existing framework. Single-user, personal tool.

---

## Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Agent Runtime | OpenAI Agents SDK (TypeScript) | Handles the agent tool-calling loop, streaming, handoffs, guardrails, and error recovery. Avoids writing ~50-80 lines of loop management plus edge case handling. |
| LLM Provider | OpenRouter | Single API key for both chat completions and embeddings. Model-agnostic -- can swap models per task or route cheap models for simple requests. OpenAI-compatible API. |
| Embeddings | OpenRouter (`openai/text-embedding-3-small`) | Cheap, fast, 1536 dimensions. Good enough for semantic memory search at personal scale (thousands of entries). Keeps everything under one provider and billing relationship. |
| Database | Postgres + pgvector | Threads, messages, and memory with vector similarity search in one place. No separate vector database needed. |
| Frontend | Vue (custom, minimal) | Threaded chat with SSE streaming. Custom-built to support agent-initiated threads (wake-to-conversation flow). |
| Push Notifications | ntfy (self-hosted) | Lightweight, open-source Go server. Agent sends HTTP POST on wake, notification links back to the relevant thread in the Vue app. |

---

## Architecture

```
+----------------+                           +------------------+
|                |   /v1/chat/completions     |                  |
|  Vue App       | -------------------------> |  TS Backend      |
|  (frontend)    | <-------------------------  |  (Agents SDK)    |
|                |     SSE stream response    |                  |
+----------------+                           |  - Agent loop    |
                                             |  - Tool execution|
+----------------+     HTTP POST             |  - Memory R/W    |
|                | <-------------------------  |  - Scheduler     |
|  ntfy          |                           |                  |
|  (push)        |                           +--------+---------+
+----------------+                                    |
                                            +---------+---------+
                                            |                   |
                                            |  Postgres +       |
                                            |  pgvector         |
                                            |                   |
                                            +-------------------+
```

The TS backend is the only service that touches Postgres, OpenRouter, and ntfy. The Vue frontend is a replaceable consumer of the OpenAI-compatible API.

---

## Memory Model

### Thread Memory
- Scoped to a single conversation
- Stored as message history in Postgres
- Each thread has its own `thread_id` and is independent

### Core Memory
- Persistent facts extracted from conversations
- Stored in Postgres with vector embeddings (pgvector) for semantic search
- Injected into every new thread's system prompt via similarity search
- Queryable across all threads

### Extraction Strategy
- Agent has explicit `remember` and `recall` tools
- Memory extraction is intentional (tool-call driven) rather than heuristic-based
- Users can review, edit, and delete memory entries via admin endpoints

### Deduplication
- On insert, embed the new content and similarity search existing entries
- Cosine similarity > 0.95: update existing entry instead of inserting
- Lives in MemoryService, not the repository layer
- Threshold may need tuning down to 0.90 based on empirical testing

---

## Wake System

Three types of autonomous triggers, all backed by a Postgres job queue:

1. **Scheduled triggers (day one):** Cron-style jobs. Scheduler fires a prompt into the agent loop with relevant tools.
2. **Reactive triggers (later):** Event listeners or webhooks. Lightweight filter layer (code, not LLM) to decide if something is worth waking for.
3. **Autonomous triggers (later):** Agent-initiated follow-ups via a `remind_me` tool that writes future tasks into the job queue.

### Wake-to-Conversation Flow

1. Scheduler fires a task
2. Agent loop runs, produces output
3. Backend creates a new thread in Postgres with the agent's output
4. ntfy push notification sent with link to `/chat/{thread_id}`
5. User taps notification, lands in the thread, can reply

This flow is the primary reason for building a custom frontend.

---

## API Endpoints

### OpenAI-Compatible (consumed by Vue frontend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/models` | Returns available "models" (the agent). Open WebUI compatibility if ever needed. |
| POST | `/v1/chat/completions` | Main chat endpoint. Receives messages, runs agent loop, streams SSE response. |

### Internal (admin/management)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/threads` | List all conversation threads |
| GET | `/v1/threads/:id` | Get thread with message history (TODO: cursor pagination via `?after=` param) |
| POST | `/v1/threads` | Create a new thread |
| GET | `/v1/memory` | Review core memory entries |
| DELETE | `/v1/memory/:id` | Remove a memory entry |
| PUT | `/v1/memory/:id` | Edit a memory entry |
| GET | `/v1/jobs` | List scheduled tasks |
| POST | `/v1/jobs` | Create a scheduled task |
| DELETE | `/v1/jobs/:id` | Remove a scheduled task |

---

## Build Order

Each step is independently usable:

1. **Data model and backend scaffolding** -- Postgres schema, Express/Fastify server, OpenAI-compatible endpoints
2. **Agent loop** -- Basic chat completions through OpenRouter via the Agents SDK, no tools yet
3. **Thread management** -- Create, list, continue conversations with isolated history
4. **Minimal Vue frontend** -- Thread list, chat view, SSE streaming
5. **Core memory** -- Embedding storage via OpenRouter, similarity recall via pgvector, `remember`/`recall` tools
6. **Tools** -- Start with 1-2 useful ones (e.g., web search, shell command)
7. **Scheduler + ntfy** -- Job queue, wake behavior, thread creation, push notifications

After step 4: working chat app.
After step 5: it remembers things across threads.
After step 7: it wakes up and reaches out to you.

---

## Known Risks

| Risk | Mitigation |
|------|-----------|
| Cost runaway | Max iterations per loop, daily spend caps, tiered model routing |
| Tool execution safety | Confirmation gates for destructive actions, read-only vs write tool separation, Docker sandboxing later |
| Memory quality | Tool-call-driven extraction, admin endpoints for review/edit/delete |
| Context window growth | Embedding-based semantic search, top-N relevant memories per thread |
| Wake task reliability | Postgres-backed job queue, idempotent creation, stale run recovery |
| Model inconsistency via OpenRouter | Settle on 1-2 models, test tool calling before swapping |
| Agent loop latency (15-20s) | SSE streaming, UI shows tool execution status |
| Agents SDK + OpenRouter compatibility | Spike in step 2 before building on top of it |
| Scope creep | Build order defines the MVP. Ship it, live with it, then decide. |
