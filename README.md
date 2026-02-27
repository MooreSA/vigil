# Vigil

Self-hosted personal AI agent with threaded conversations, persistent memory, scheduled tasks, and push notifications.

Single-user tool. TypeScript backend, Vue frontend.

## What it does

- **Threaded chat** with SSE streaming through an OpenAI-compatible API
- **Persistent memory** — the agent has `remember` and `recall` tools backed by pgvector semantic search
- **Scheduled tasks** — cron-based job queue with a wake-to-conversation flow (agent runs a task, creates a thread, sends a push notification, you tap and reply)
- **Skills** — long-running jobs like `departure-check` that poll traffic and notify when it's time to leave
- **Push notifications** via [ntfy](https://ntfy.sh)

## Stack

| Layer | Tech |
|-------|------|
| Agent runtime | [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) (TypeScript) |
| LLM provider | [OpenRouter](https://openrouter.ai) |
| Database | Postgres + [pgvector](https://github.com/pgvector/pgvector) |
| Query builder | [Kysely](https://kysely.dev) |
| Frontend | Vue + SSE |
| Notifications | [ntfy](https://ntfy.sh) |

## Setup

### Prerequisites

- Node.js 20+
- Docker (for Postgres)
- An [OpenRouter](https://openrouter.ai) API key

### Quick start

```bash
# Clone and install
git clone https://github.com/MooreSA/vigil.git
cd vigil
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Start Postgres
docker compose up -d postgres

# Run migrations
npm run migrate

# Start the dev server
npm run dev
```

### Environment variables

See `.env.example` for the full list. The essentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `NTFY_URL` | No | ntfy server URL (e.g. `https://ntfy.sh`) |
| `NTFY_TOPIC` | No | ntfy topic for push notifications |
| `GOOGLE_MAPS_API_KEY` | No | Required for the `departure-check` skill |

### Docker (full stack)

```bash
docker compose up
```

Starts Postgres, runs migrations, and launches the app on port 3000.

## Architecture

```
routes -> services -> repositories -> db
tools  -> services
```

Nothing points upward. Services own business logic. Repositories talk to Postgres only. Tools are thin wrappers that delegate to services. Manual dependency injection throughout — no container.

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed design decisions.

## Testing

```bash
npm test
```

- **Services**: unit tests with mocked repositories
- **Routes**: integration tests with mocked services
- **Repositories**: integration tests against a test Postgres instance

## License

MIT
