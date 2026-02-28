# PWA Feasibility Assessment

**Date:** 2026-02-28
**Verdict:** High feasibility. The app is a natural fit for PWA conversion.

---

## Current State

| Capability | Status |
|------------|--------|
| Build tool | Vite 6.3 — first-class PWA plugin support |
| Frontend framework | Vue 3.5 + Vue Router (SPA, `createWebHistory`) |
| Responsive design | Already implemented (mobile breakpoints, sheet/drawer UI) |
| Service worker | None |
| Web app manifest | None |
| App icons | None |
| Offline support | None |
| Web Push notifications | None (ntfy only, server-side) |

The frontend is served by Fastify via `@fastify/static` with an SPA fallback — all non-API routes return `index.html`. Vite produces hash-named assets, which are ideal for service worker caching.

---

## What Makes This Easy

**Single-user architecture eliminates the hardest PWA problems:**

- **No auth workflow** — no login/logout in the service worker, no token refresh, no per-user cache isolation. Self-hosted, network-level trust.
- **No conflict resolution** — one user means no merge conflicts on offline sync.
- **No data partitioning** — single IndexedDB namespace, simple cache keys.
- **Vite + Vue are PWA-first-class** — `@vitejs/plugin-pwa` (Workbox under the hood) handles manifest generation, service worker registration, and asset precaching with minimal config.
- **@vueuse/core is already installed** — provides `useOnline()`, `useStorage()`, and other composables useful for offline state.

---

## What Needs Work

### 1. Core PWA Shell (Low effort)

Add `@vitejs/plugin-pwa` to Vite config. This auto-generates:
- A service worker that precaches all built assets
- A `manifest.webmanifest` from config
- Registration code in the app entry point

You also need app icons (192px and 512px minimum) and a `<link rel="manifest">` in `index.html`.

**Files touched:** `web/vite.config.ts`, `web/index.html`, `web/src/main.ts`, new icon files in `web/public/`.

### 2. Offline Chat Viewing (Medium effort)

Thread list and message history are read-heavy and immutable once created. A cache-first strategy works well:

- **Thread list** (`GET /v1/threads`) — cache on fetch, serve from cache when offline.
- **Thread messages** (`GET /v1/threads/:id`) — cache per thread, update when new messages arrive.
- **Storage:** IndexedDB (via @vueuse/core or a thin wrapper). No need for PouchDB or SQLite.js — overkill for single-user.

### 3. Offline Message Sending (Medium effort)

Chat completions (`POST /v1/chat/completions`) use SSE streaming and require the backend. True offline chat completion is impossible — the agent needs OpenRouter.

**Realistic strategy:**
- Show the user's outgoing message immediately (optimistic UI).
- Queue it to IndexedDB with a "pending" status.
- When back online, replay the queue and stream the response.
- Display a clear "offline — message queued" indicator.

**Files touched:** `web/src/composables/useChat.ts` (add queue logic), new `useOfflineQueue` composable.

### 4. SSE Reconnection (Low effort)

The event stream (`GET /v1/events`) uses `EventSource` with no reconnection logic. The chat stream uses `fetch` + `ReadableStream` with no retry.

- Add exponential backoff reconnection to `useEventStream.ts`.
- Add retry-on-failure to the chat stream reader.

### 5. Push Notifications via Web Push (Medium-high effort, optional)

The app currently uses ntfy (server-side HTTP POST to a topic). This works independently of PWA — users subscribe to the ntfy topic via the ntfy app.

Adding Web Push would let the browser receive notifications even when the tab is closed:

- Service worker needs a `push` event handler.
- Backend needs a new endpoint to store push subscriptions.
- Backend notification service needs to send via Web Push API alongside ntfy.
- New DB table: `push_subscriptions`.

**This is optional.** ntfy already handles the notification use case well. Web Push adds browser-native notifications without requiring the ntfy app, but iOS support for Web Push in PWAs is still limited.

---

## What Can't Work Offline

| Feature | Why |
|---------|-----|
| Sending messages (agent responses) | Requires OpenRouter API |
| Memory search (`recall`) | Requires pgvector embeddings |
| Scheduled skills (departure-check) | Backend cron job |
| New thread creation with system prompt | Requires backend |

These are inherent to the architecture — the AI agent runs server-side. Offline mode is about **viewing cached data and queuing outgoing messages**, not running the agent locally.

---

## Proposed Caching Strategy

| Resource | Strategy | Notes |
|----------|----------|-------|
| App shell (JS, CSS, HTML) | Precache (Workbox) | Automatic via Vite PWA plugin |
| Thread list | StaleWhileRevalidate | Show cached list, refresh in background |
| Thread messages | CacheFirst | Messages are immutable once created |
| Chat completions | NetworkOnly | Can't cache SSE streams meaningfully |
| Static assets (fonts, icons) | CacheFirst | Long-lived, hash-named |

---

## Implementation Phases

### Phase 1: Installable PWA (~1-2 days)
- Add `@vitejs/plugin-pwa` with manifest config
- Create app icons
- Precache app shell assets
- Test "Add to Home Screen" on mobile

### Phase 2: Offline Reading (~2-3 days)
- Cache thread list and messages in IndexedDB
- Add `useOnline()` indicator in UI
- Serve cached threads when offline
- Add stale data indicators

### Phase 3: Offline Queueing (~2-3 days)
- Queue outgoing messages to IndexedDB
- Optimistic UI for queued messages
- Auto-sync on reconnect
- SSE reconnection with backoff

### Phase 4: Web Push (optional, ~2-3 days)
- Service worker push handler
- Backend push subscription endpoint + DB table
- Extend `NotificationService` with Web Push
- Permission prompt UI

**Total: ~5-8 days for Phases 1-3, ~8-11 days including Phase 4.**

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSE streams bypass service worker cache | Low | Accept it — use NetworkOnly strategy for streams |
| iOS PWA limitations (no background sync, limited Web Push) | Medium | ntfy handles iOS notifications; offline reading still works |
| IndexedDB storage quota | Low | Single user, text-only messages — well under 50MB typical limit |
| Service worker update propagation | Low | Workbox `skipWaiting` + `clientsClaim` handle this |
| Stale cached data after backend changes | Low | Version service worker with each deploy (Vite handles via content hash) |

---

## Recommendation

**Start with Phase 1.** It's < 2 days of work, mostly config, and immediately gives you:
- "Add to Home Screen" / "Install App" prompt
- Full-screen standalone app experience (no browser chrome)
- Cached app shell (instant load on revisit)
- Foundation for all subsequent phases

Phase 1 requires **zero backend changes** — it's entirely frontend config and assets.
