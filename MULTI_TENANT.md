# Multi-Tenant Architecture Plan

**Context:** 1–10 users, realistically probably one. This is a "leave the door open" design, not an enterprise multi-tenancy effort.

## TL;DR

Add a `user_id` column to the three root tables (`threads`, `memory_entries`, `jobs`). Add a lightweight auth middleware (API key per user). Filter every query by user. That's it — no partitioning, no RLS, no separate databases.

## Current State

Everything is single-user. No auth, no user identification, no row-level scoping. All data is implicitly owned by "the one user." The architecture is clean (routes → services → repositories → db) with constructor injection, so threading a user context through is straightforward.

## What Changes

### 1. Schema: Add `user_id` to Root Tables

**New table:**

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Alter existing tables:**

```sql
ALTER TABLE threads ADD COLUMN user_id BIGINT NOT NULL REFERENCES users(id);
ALTER TABLE memory_entries ADD COLUMN user_id BIGINT NOT NULL REFERENCES users(id);
ALTER TABLE jobs ADD COLUMN user_id BIGINT NOT NULL REFERENCES users(id);
```

Child tables (`messages` via `thread_id`, `job_runs` via `job_id`) inherit scoping from their parent — no `user_id` needed on them.

### 2. Auth: API Key Middleware

A Fastify `onRequest` hook that:

1. Reads `Authorization: Bearer <api_key>` header
2. Looks up the user (cache the handful of keys in memory, invalidate on change)
3. Decorates the request with `request.user = { id, name }`
4. 401s if missing/invalid

Skip for `/healthz` and static assets.

At 1–10 users, API keys are fine. No OAuth, no JWT, no sessions. Each user gets a key, stores it in their client. If this ever needs to get fancier, swap the middleware — nothing downstream cares how the user was identified.

### 3. Request Context Through the Stack

The user ID flows: **route → service → repository**.

Options, roughly ordered by preference:

| Approach | Tradeoff |
|----------|----------|
| Pass `userId` as a parameter to every service/repo method | Explicit, no magic, slightly verbose |
| Scoped service instances per request | Clean call sites, more object creation (irrelevant at this scale) |
| AsyncLocalStorage | Invisible threading, easy to forget, harder to test |

**Recommendation: just pass `userId` as a parameter.** It's the most boring option and the easiest to grep for missed call sites. At this scale the verbosity is negligible.

### 4. Repository Changes

Every `findAll`, `findById`, `similaritySearch`, etc. gets a `WHERE user_id = $1` clause. Example for memory:

```typescript
async similaritySearch(userId: string, embedding: number[], limit: number, threshold: number) {
  return this.db
    .selectFrom('memory_entries')
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .where(sql`1 - (embedding <=> ${vector}) >= ${threshold}`)
    .orderBy(sql`embedding <=> ${vector}`)
    .limit(limit)
    .selectAll()
    .execute();
}
```

The existing HNSW index works fine here. At a few thousand rows total, pgvector will post-filter after the index scan with zero perceptible cost. No partial indexes, no partitioning needed.

### 5. Tool Scoping

Tools currently have no user context. The agent service already knows which thread it's running in — and threads will now have a `user_id`. So:

- `AgentService.runStream()` already receives `threadId`
- Look up the thread's `user_id` once at the start
- Pass it to every tool invocation / service call

Tools remain thin wrappers. They don't need to know about auth — they just forward the `userId` they receive.

### 6. Scheduler

Jobs get a `user_id`. The scheduler doesn't change much:

- `findDueJobs()` already returns jobs — now they carry a `user_id`
- When the scheduler creates a thread for a wake task, it sets `user_id` from the job
- Notification routing (ntfy topic) could become per-user if needed, but at 1–10 users a shared topic with the user name in the message is fine

### 7. Frontend

The Vue app needs to send the API key with every request. Simplest approach:

- Prompt for API key on first visit, store in `localStorage`
- Attach as `Authorization: Bearer <key>` header on every fetch/SSE connection
- Show a "wrong key" screen if the backend 401s

No login page, no session management, no refresh tokens. This is a self-hosted tool for a handful of people.

## What Doesn't Change

- **Layer rules** — same `routes → services → repositories → db` flow
- **Soft deletes** — same pattern
- **Message ordering** — still by `id`
- **JSONB content** — still source of truth
- **Constructor injection** — same DI approach
- **HNSW index** — works fine with post-filter at this scale
- **Scheduler architecture** — same tick/claim/execute loop
- **Event bus** — same pattern (events are already thread-scoped)

## What We're Explicitly NOT Doing

| Thing | Why not |
|-------|---------|
| Row-Level Security (Postgres RLS) | Adds operational complexity for zero benefit at 1–10 users. App-level filtering is sufficient and easier to reason about. |
| Separate databases per user | Absurd at this scale. |
| Per-user HNSW indexes / partitioning | A few thousand vectors total. The brute-force scan alone would be sub-millisecond. |
| OAuth / OIDC / JWT | Self-hosted tool for known users. API keys are appropriate. |
| Per-user encryption keys | If someone has DB access, you have bigger problems. |
| Overselect + rerank for vector search | Relevant when you have millions of rows and need to filter post-index. Not at this scale. |
| Rate limiting per user | 1–10 known, trusted users on a self-hosted instance. |

## Migration Strategy

Since this is a single-user system being upgraded:

1. Create the `users` table
2. Insert a row for the existing user
3. Add `user_id` columns (nullable initially)
4. Backfill all existing rows with that user's ID
5. Make columns `NOT NULL`
6. Add the auth middleware
7. Update the frontend to send the key

This can be a single migration + deploy. No data loss, no downtime concerns at this scale.

## Effort Estimate

This is a small-to-medium change touching every layer but not deeply:

- **Migration:** 1 new table, 3 altered tables
- **Auth middleware:** ~30 lines
- **Repository changes:** Add `user_id` param to ~15 methods
- **Service changes:** Thread `userId` through ~10 methods
- **Route changes:** Extract `request.user.id`, pass to services
- **Tool changes:** Receive and forward `userId`
- **Frontend:** Add key storage + header attachment
- **Config:** Add seed user API key to env (optional, could also be a CLI script)
