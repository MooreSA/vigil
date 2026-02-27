# Personal AI Agent

Self-hosted personal AI agent with threaded conversations, persistent memory, scheduled wake behavior, and push notifications. Single-user tool, TypeScript backend, Vue frontend.

See PROJECT_BRIEF.md for full context, ARCHITECTURE.md for design decisions, SCHEMA.sql for the data model.

## Stack

- **Runtime:** OpenAI Agents SDK (TypeScript) + OpenRouter
- **Database:** Postgres + pgvector, Kysely query builder
- **Frontend:** Vue with SSE streaming
- **Logging:** Pino (Fastify's native logger)
- **Notifications:** ntfy (self-hosted)

## Layer Rules

```
routes -> services -> repositories -> db
tools  -> services
```

Nothing points upward. Ever.

- **Repositories** talk to Postgres only. Plain inputs, plain outputs. No business logic, no OpenRouter calls, no SDK imports.
- **Services** own business logic. Call repositories and each other. Never touch HTTP.
- **Tools** are thin SDK wrappers. Validate input, delegate to a service. No logic.
- **Routes** handle HTTP only. Parse requests, call services, format responses. Never touch the database.
- **`index.ts`** is the composition root. Manual DI, no container.

## Conventions

- Soft deletes everywhere via `deleted_at TIMESTAMPTZ`. Always filter `deleted_at IS NULL` in queries.
- Message ordering by `id` (bigserial), never by timestamp.
- Message content is JSONB — the entire OpenAI message object. `role` and `model` columns duplicate for indexing; JSONB is source of truth.
- `model` column on messages tracks which model produced the response.
- `src/config.ts` owns all env var reading. Nothing below the composition root reads `process.env`.
- Constructor injection — never import singletons.
- Kysely for all DB access. Repositories receive the `Kysely<DB>` instance via constructor.
- Pino logger created in composition root, passed to Fastify via `loggerInstance`. Use `pino-pretty` in dev (controlled by `config.prettyLogs`).
- Migrations are TS files in `src/db/migrations/` using Kysely's migrator (`up`/`down` exports).
- DB type interface lives in `src/db/types.ts` — keep in sync with migrations manually.
- Use `croner` for cron parsing.

## Testing

- Repositories: integration tests against a test Postgres database.
- Services: unit tests with mocked repositories.
- Routes: lightweight integration tests with mocked services.

## Git

- No AI attribution in commits. Never add `Co-Authored-By` lines.

## Do Not

- Put business logic in repositories or routes.
- Hard delete anything.
- Use a DI container.
- Rely on `created_at` for ordering.
- Auto-extract memories — memory is tool-call driven (`remember`/`recall`).
- Store the system prompt outside the messages table — it's the first message in the thread, role `system`.
- Read `process.env` outside of `src/config.ts` or `src/index.ts` (standalone scripts like `migrate.ts` are fine).
