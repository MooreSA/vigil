# Architecture Decisions

## Key Tradeoffs

### TypeScript over Go
Go is the stronger language professionally, but the OpenAI Agents SDK only exists for Python and TypeScript. The SDK handles the agent loop, streaming, tool orchestration, error recovery, handoffs, guardrails, and tracing. TypeScript also shares types with the Vue frontend.

### OpenRouter over direct provider APIs
Adds a middleman (slight latency, additional point of failure) but provides model flexibility through a single API. Enables cost-tiered routing and avoids vendor lock-in. Consolidates embeddings under the same provider.

**Known risk:** The Agents SDK expects to talk to OpenAI's API. OpenRouter is "OpenAI-compatible" but gaps show up in streaming chunk formats, tool call deltas, and error shapes. Spike this early (build step 2) before building on top of it. Budget time for a compatibility shim.

### Custom Vue frontend over Open WebUI
Open WebUI owns its own conversation storage. The backend cannot create threads programmatically, which breaks the wake-to-conversation flow. Building a basic chat UI (~2-3 days) gives full control over thread creation and the wake notification flow.

### Postgres over SQLite
SQLite can handle single-user load, but pgvector is mature and battle-tested while SQLite vector extensions are experimental. Postgres also handles write concurrency (scheduler + active chat simultaneously) and supports multi-device access.

### ntfy for push notifications
Agent's scheduler sends an HTTP POST to ntfy when a wake task produces output. Notification includes a link to the relevant thread. Dead simple, no complex notification infrastructure.

### Kysely over raw pg / ORMs
Type-safe query builder — still reads like SQL but catches column and table typos at compile time. No ORM magic, no schema-as-code generation step. Repositories receive the `Kysely` instance via constructor injection. Kysely's built-in migration runner handles schema changes (TS files with `up()`/`down()`). pgvector support via `kysely-pgvector` plugin.

---

## Application Layers

```
routes -> services -> repositories -> db
tools  -> services
```

Nothing points upward.

**Repositories** talk to Postgres and nothing else. Plain inputs, plain outputs. No business logic.

**Services** own business logic and orchestration. Can call repositories and each other. Never touch HTTP.

**Tools** are thin SDK wrappers that validate input and delegate to a service.

**Routes** handle HTTP concerns only: parse requests, call services, format responses.

**`index.ts`** is the composition root. Manual DI -- no container.

---

## Directory Structure

```
src/
├── db/
│   ├── client.ts          # Kysely instance factory
│   ├── types.ts           # Generated/maintained DB interface for Kysely
│   └── migrations/        # TS files with up()/down()
├── repositories/
│   ├── threads.ts
│   ├── messages.ts
│   ├── memory.ts
│   └── jobs.ts
├── services/
│   ├── agent.ts
│   ├── memory.ts
│   ├── scheduler.ts
│   └── notifications.ts
├── tools/
│   ├── remember.ts
│   ├── recall.ts
│   └── index.ts
├── api/
│   ├── routes/
│   │   ├── completions.ts
│   │   ├── threads.ts
│   │   ├── memory.ts
│   │   └── jobs.ts
│   └── server.ts
└── index.ts
```

---

## Data Model Conventions

- **Soft deletes** on all tables via `deleted_at TIMESTAMPTZ`. Always filter `deleted_at IS NULL`.
- **Message ordering** by `id` (bigserial). `created_at` is for display only.
- **Message content** stored as JSONB — the entire OpenAI message object (`role`, `content`, `tool_calls`, `tool_call_id`, etc.). The `role` and `model` columns duplicate values from the JSONB for indexing and filtering; the JSONB is the source of truth.
- **`model` column on messages** tracks which model produced each response. Null for user/system/tool messages.
- **HNSW index** on memory embeddings over IVFFlat. Builds incrementally from the first row.
- **`next_run_at`** advanced at claim time, not completion time.
- **Stale job recovery** via `locked_until`. Worker refreshes every 2 minutes against 5 minute expiry. Scheduler resets abandoned `running` rows to `pending` on every tick.
- **Idempotent job creation** via `UNIQUE (job_id, scheduled_for)` and `INSERT ... ON CONFLICT DO NOTHING`.
- **Job retry limit** via `max_retries` on jobs and `retry_count` on job_runs. Exponential backoff on failure. Job disabled at terminal failure. ntfy notification fires on final failure.

---

## System Prompt Assembly

Assembled on the first message of a new thread:

1. User sends first message
2. Embed the user's message
3. Similarity search against core memory (top-N results above 0.75 threshold)
4. Assemble system prompt with relevant memories injected
5. Store as `role: 'system'` as the first message in the thread
6. **Frozen for the life of the thread** -- never regenerated on subsequent messages

Mid-thread memory surfacing is handled by the `recall` tool, which the agent calls intentionally. Consistent with the tool-call-driven philosophy.

---

## Memory Deduplication

Lives in `MemoryService`, not the repository layer.

On insert:
1. Embed the new content
2. Similarity search against existing entries
3. Cosine similarity > 0.95: update the existing entry's content and re-embed
4. Below threshold: insert as new entry

The 0.95 threshold may need tuning. `text-embedding-3-small` can produce different vectors for semantically identical statements with different phrasing. Test empirically at ~50 entries and consider lowering to 0.90 or adding a two-pass check (auto-merge at high threshold, agent confirmation at medium threshold).

---

## Scheduler Tick Sequence

1. Reset abandoned runs: `status = 'running' AND locked_until < NOW()` → `pending`
2. Find due jobs: `enabled = TRUE AND next_run_at <= NOW() AND deleted_at IS NULL`
3. `INSERT INTO job_runs (job_id, scheduled_for) ON CONFLICT DO NOTHING`
4. Advance `jobs.next_run_at` to next cron fire time (use `croner` library)
5. Claim run: `SELECT ... FOR UPDATE SKIP LOCKED`
6. Check `retry_count < max_retries` before executing
7. Execute agent loop
8. Worker refreshes `locked_until` every 2 minutes during execution
9. On failure: increment `retry_count`, reschedule with exponential backoff
10. On terminal failure (`retry_count >= max_retries`): mark failed, notify via ntfy

---

## Testing Strategy

- **Repositories:** integration tests against a test Postgres database
- **Services:** unit tests with mocked repositories
- **Routes:** lightweight integration tests with mocked services

Constructor injection throughout -- never import singletons.
