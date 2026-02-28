# PWA Feasibility Assessment

**Date:** 2026-02-28
**Verdict:** High feasibility. The app is a natural fit for PWA conversion.

---

## Current State

| Capability | Status |
|------------|--------|
| Build tool | Vite 6.3 — fully supported by `vite-plugin-pwa` v1.2 |
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
- **`@vueuse/core` is already installed** — provides `useOnline()`, `useStorage()`, and other composables useful for offline state.

**Tooling is mature and well-matched:**

- `vite-plugin-pwa` v1.2.0 (latest, Nov 2025) has full Vite 6 support (added in v0.21.1) and ships Workbox 7.3. It's the standard approach for Vue + Vite PWAs.
- The plugin provides a Vue-specific `useRegisterSW` composable (from `virtual:pwa-register/vue`) that exposes `offlineReady`, `needRefresh`, and `updateServiceWorker` — integrates cleanly with Vue 3's Composition API.
- `@vitejs/plugin-pwa` auto-generates the manifest, registers the service worker, and handles precaching with zero config for the basic case.

---

## Key Design Decision: `generateSW` vs `injectManifest`

The plugin offers two service worker strategies:

| | `generateSW` (default) | `injectManifest` |
|---|---|---|
| Custom SW code | Not possible | Full control |
| Setup complexity | Zero-config | Write your own SW |
| Push notifications | No | Yes |
| Background sync | No | Yes |
| Custom caching | Limited (via config) | Full flexibility |

**Recommendation for this project:** Start with `generateSW`. It handles asset precaching and runtime caching via config alone. Switch to `injectManifest` only if/when you add Web Push (Phase 4) — that requires a custom `push` event handler in the service worker.

When using `injectManifest`, the plugin compiles your custom SW as a separate Vite build, bundling all dependencies. The `self.__WB_MANIFEST` variable is the injection point for the precache manifest. Use `workbox-*` packages as dev dependencies (not `importScripts`).

---

## What Needs Work

### 1. Core PWA Shell (Low effort)

Add `vite-plugin-pwa` to Vite config with `registerType: 'autoUpdate'`:

```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Vigil',
        short_name: 'Vigil',
        theme_color: '#...',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})
```

Optionally use `useRegisterSW` from `virtual:pwa-register/vue` to show an update-available prompt instead of silent auto-update. This is the recommended Vue pattern — it exposes reactive `offlineReady` and `needRefresh` refs.

You also need app icons (192px and 512px minimum) in `web/public/`.

**Files touched:** `web/vite.config.ts`, `web/package.json`, `web/src/main.ts` or a new `ReloadPWA.vue` component, new icon files in `web/public/`.

### 2. Offline Chat Viewing (Medium effort)

Thread list and message history are read-heavy and immutable once created. Use Workbox runtime caching configured in the plugin:

```ts
workbox: {
  runtimeCaching: [
    {
      urlPattern: /\/v1\/threads$/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'threads-list' },
    },
    {
      urlPattern: /\/v1\/threads\/.+/,
      handler: 'CacheFirst',
      options: { cacheName: 'thread-messages' },
    },
  ],
}
```

For richer offline data (search, filtering), cache to IndexedDB from application code using `@vueuse/core`'s storage composables.

### 3. Offline Message Sending (Medium effort)

Chat completions (`POST /v1/chat/completions`) use SSE streaming and require the backend. True offline chat completion is impossible — the agent needs OpenRouter.

**Realistic strategy:**
- Show the user's outgoing message immediately (optimistic UI).
- Queue it to IndexedDB with a "pending" status.
- When back online, replay the queue and stream the response.
- Display a clear "offline — message queued" indicator using `useOnline()` from `@vueuse/core`.

**Files touched:** `web/src/composables/useChat.ts` (add queue logic), new `useOfflineQueue` composable.

### 4. SSE Reconnection (Low effort)

The event stream (`GET /v1/events`) uses `EventSource` with no reconnection logic. The chat stream uses `fetch` + `ReadableStream` with no retry.

**Important caveat:** SSE and service workers are a known difficult combination. `EventSource` expects a long-lived streaming connection, which is hard to replicate with synthetic responses in a service worker. The best approach is to let SSE requests pass through the service worker unintercepted (Workbox's `NetworkOnly` strategy, or exclude the `/v1/` prefix from caching entirely).

- Add exponential backoff reconnection to `useEventStream.ts`.
- Add retry-on-failure to the chat stream reader.
- Do **not** try to cache or intercept SSE streams in the service worker.

### 5. Push Notifications via Web Push (Medium-high effort, optional)

The app currently uses ntfy (server-side HTTP POST to a topic). This works independently of PWA — users subscribe to the ntfy topic via the ntfy app.

Adding Web Push would let the browser receive notifications even when the tab is closed:

- **Requires switching to `injectManifest`** — the custom service worker needs a `push` event handler.
- Backend needs a new endpoint to store push subscriptions.
- Backend notification service needs to send via Web Push API alongside ntfy.
- New DB migration: `push_subscriptions` table.

**This is optional.** ntfy already handles the notification use case well. Web Push adds browser-native notifications without requiring the ntfy app, but has iOS caveats (see below).

---

## iOS Limitations

iOS PWA support has improved but still has meaningful gaps as of early 2026:

| Capability | iOS Status |
|------------|-----------|
| Install to Home Screen | Yes, but manual (Share > Add to Home Screen, 4+ taps, no install prompt) |
| Web Push notifications | Yes (since iOS 16.4), but **only when installed as PWA** — not from Safari tabs |
| Background Sync | Not supported |
| Persistent storage | ~50MB Cache API limit; iOS may evict storage if app unused for weeks |
| Service worker | Supported, but no Background Fetch or Periodic Sync |

**Key risks:**
- iOS can auto-clear IndexedDB/Cache storage after ~7 days of inactivity.
- No install prompt — users must know the manual "Add to Home Screen" flow.
- Web Push permission must be triggered by a user gesture (tap), not on page load.
- All browsers on iOS use WebKit — no Chrome/Firefox engine, so PWA capabilities are entirely at Apple's discretion.

**Mitigation:** For a single-user self-hosted tool, the iOS install friction is a one-time cost. The storage eviction risk is low if you use the app regularly. ntfy remains the more reliable notification channel on iOS.

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
| Chat completions (SSE) | NetworkOnly | Cannot cache streams; let them bypass SW |
| Event stream (SSE) | NetworkOnly | Long-lived connection, bypass SW |
| Static assets (fonts, icons) | CacheFirst | Long-lived, hash-named |

---

## Implementation Phases

### Phase 1: Installable PWA (~1-2 days)
- `npm install -D vite-plugin-pwa` (v1.2.0, compatible with Vite 6.3)
- Add `VitePWA()` plugin to `web/vite.config.ts` with `generateSW` strategy
- Create app icons (192px, 512px) in `web/public/`
- Optionally add `ReloadPWA.vue` component using `useRegisterSW` composable
- Test "Add to Home Screen" on mobile, run Lighthouse PWA audit

### Phase 2: Offline Reading (~2-3 days)
- Configure Workbox runtime caching for `/v1/threads` endpoints
- Add `useOnline()` indicator in UI
- Serve cached threads when offline
- Add stale data indicators

### Phase 3: Offline Queueing + SSE Resilience (~2-3 days)
- Queue outgoing messages to IndexedDB
- Optimistic UI for queued messages
- Auto-sync on reconnect
- SSE reconnection with exponential backoff in `useEventStream.ts`

### Phase 4: Web Push (optional, ~2-3 days)
- Switch to `injectManifest` strategy with custom service worker
- Add `push` event handler in SW
- Backend push subscription endpoint + DB migration
- Extend `NotificationService` with Web Push
- Permission prompt UI

**Total: ~5-8 days for Phases 1-3, ~8-11 days including Phase 4.**

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSE streams bypass service worker cache | Low | Accept it — use NetworkOnly strategy, don't intercept streams |
| iOS storage eviction after inactivity | Medium | Regular use prevents it; ntfy as backup notification channel |
| iOS install friction (no prompt) | Low | One-time cost for single user; document the flow |
| iOS Web Push only in installed PWA | Medium | ntfy works regardless; Web Push is a bonus |
| IndexedDB storage quota | Low | Single user, text-only messages — well under 50MB |
| Service worker update propagation | Low | `registerType: 'autoUpdate'` or `useRegisterSW` prompt |
| Stale cached data after backend changes | Low | Vite content hashes + Workbox precache versioning |

---

## Recommendation

**Start with Phase 1.** It's ~1-2 days of work, mostly config, and immediately gives you:
- "Add to Home Screen" / "Install App" prompt (Android; manual on iOS)
- Full-screen standalone app experience (no browser chrome)
- Cached app shell (instant load on revisit)
- Foundation for all subsequent phases

Phase 1 requires **zero backend changes** — it's entirely frontend config and assets. Use `generateSW` and don't overthink it. The only reason to reach for `injectManifest` is Phase 4 (Web Push), and that's optional given ntfy already works.

---

## References

- [vite-plugin-pwa official docs](https://vite-pwa-org.netlify.app/guide/)
- [vite-plugin-pwa Vue framework guide](https://vite-pwa-org.netlify.app/frameworks/vue)
- [vite-plugin-pwa GitHub releases](https://github.com/vite-pwa/vite-plugin-pwa/releases)
- [Service Worker Strategies (generateSW vs injectManifest)](https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors)
- [Workbox runtime caching](https://vite-pwa-org.netlify.app/workbox/)
- [PWA best practices for 2026](https://wirefuture.com/post/progressive-web-apps-pwa-best-practices-for-2026)
- [PWA iOS limitations guide](https://brainhub.eu/library/pwa-on-ios)
- [iOS Web Push support](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [SSE + Service Workers (W3C issue)](https://github.com/w3c/ServiceWorker/issues/885)
- [SSEGWSW: SSE gateway via service workers](https://medium.com/its-tinkoff/ssegwsw-server-sent-events-gateway-by-service-workers-6212c1c55184)
- [web.dev Workbox guide](https://web.dev/learn/pwa/workbox/)
