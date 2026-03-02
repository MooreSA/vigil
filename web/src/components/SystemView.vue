<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { fetchSystemLogs, fetchSystemStats, type LogEntry, type SystemStats } from '../lib/api';

type Tab = 'logs' | 'stats';
type LevelFilter = 'all' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_MAP: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

const LEVEL_NUM: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const LEVEL_COLORS: Record<string, string> = {
  trace: 'text-muted-foreground/60',
  debug: 'text-muted-foreground',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  fatal: 'text-red-500 font-bold',
};

const activeTab = ref<Tab>('logs');
const logs = ref<LogEntry[]>([]);
const stats = ref<SystemStats | null>(null);
const levelFilter = ref<LevelFilter>('all');
const liveTail = ref(false);
const autoScroll = ref(true);
const logContainer = ref<HTMLElement | null>(null);

let eventSource: EventSource | null = null;
let statsInterval: ReturnType<typeof setInterval> | null = null;

const filteredLogs = computed(() => {
  if (levelFilter.value === 'all') return logs.value;
  const minLevel = LEVEL_NUM[levelFilter.value] ?? 0;
  return logs.value.filter((e) => e.level >= minLevel);
});

function levelLabel(level: number): string {
  return LEVEL_MAP[level] ?? String(level);
}

function levelColor(level: number): string {
  return LEVEL_COLORS[LEVEL_MAP[level] ?? 'info'] ?? 'text-foreground';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function contextTag(entry: LogEntry): string | null {
  if (entry.service) return String(entry.service);
  if (entry.handler) return String(entry.handler);
  if (entry.skill) return String(entry.skill);
  return null;
}

function scrollToBottom() {
  nextTick(() => {
    const el = logContainer.value;
    if (el && autoScroll.value) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

function handleLogScroll() {
  const el = logContainer.value;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  autoScroll.value = atBottom;
}

async function loadLogs() {
  try {
    logs.value = await fetchSystemLogs({ limit: 500 });
    scrollToBottom();
  } catch {
    // ignore
  }
}

async function loadStats() {
  try {
    stats.value = await fetchSystemStats();
  } catch {
    // ignore
  }
}

function startLiveTail() {
  if (eventSource) return;
  eventSource = new EventSource('/v1/system/logs/stream');
  eventSource.onmessage = (e) => {
    try {
      const entry = JSON.parse(e.data) as LogEntry;
      logs.value.push(entry);
      if (logs.value.length > 2000) {
        logs.value = logs.value.slice(-1000);
      }
      scrollToBottom();
    } catch {
      // ignore
    }
  };
  eventSource.onerror = () => {
    stopLiveTail();
    liveTail.value = false;
  };
}

function stopLiveTail() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function toggleLiveTail() {
  liveTail.value = !liveTail.value;
  if (liveTail.value) {
    startLiveTail();
  } else {
    stopLiveTail();
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

onMounted(() => {
  loadLogs();
  loadStats();
  statsInterval = setInterval(loadStats, 10_000);
});

onUnmounted(() => {
  stopLiveTail();
  if (statsInterval) clearInterval(statsInterval);
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-4 px-4 md:px-6 py-3 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <h1 class="text-sm font-semibold tracking-tight">System</h1>

      <div class="flex rounded-lg bg-muted/70 p-0.5 text-sm font-medium">
        <button
          v-for="tab in (['logs', 'stats'] as const)"
          :key="tab"
          class="px-3 py-1.5 rounded-md transition-colors capitalize"
          :class="activeTab === tab
            ? 'bg-background text-foreground shadow-sm shadow-black/10'
            : 'text-foreground/50 hover:text-foreground/70'"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>
    </div>

    <!-- Logs Tab -->
    <div
      v-if="activeTab === 'logs'"
      class="flex-1 flex flex-col min-h-0"
    >
      <!-- Logs toolbar -->
      <div class="flex items-center gap-2 px-4 md:px-6 py-2 border-b border-border/40 flex-wrap">
        <div class="flex rounded-md bg-muted/50 p-0.5 text-xs font-medium">
          <button
            v-for="opt in (['all', 'error', 'warn', 'info', 'debug', 'trace'] as const)"
            :key="opt"
            class="px-2 py-1 rounded transition-colors capitalize"
            :class="levelFilter === opt
              ? 'bg-background text-foreground shadow-sm'
              : 'text-foreground/50 hover:text-foreground/70'"
            @click="levelFilter = opt"
          >
            {{ opt }}
          </button>
        </div>

        <div class="flex-1" />

        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          :class="liveTail
            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            : 'bg-muted/50 text-muted-foreground hover:text-foreground'"
          @click="toggleLiveTail"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="liveTail ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/50'"
          />
          Live
        </button>

        <button
          class="px-2.5 py-1 rounded-md text-xs font-medium bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          @click="loadLogs"
        >
          Refresh
        </button>
      </div>

      <!-- Log entries -->
      <div
        ref="logContainer"
        class="flex-1 overflow-y-auto font-mono text-xs leading-5 p-2 md:p-3"
        @scroll="handleLogScroll"
      >
        <div
          v-for="(entry, i) in filteredLogs"
          :key="i"
          class="flex gap-2 px-2 py-0.5 rounded hover:bg-muted/30 transition-colors"
        >
          <span class="text-muted-foreground/50 shrink-0 select-none">{{ formatTime(entry.time) }}</span>
          <span
            class="w-10 shrink-0 uppercase text-right"
            :class="levelColor(entry.level)"
          >{{ levelLabel(entry.level) }}</span>
          <span
            v-if="contextTag(entry)"
            class="text-primary/70 shrink-0"
          >[{{ contextTag(entry) }}]</span>
          <span class="text-foreground/90 break-all">{{ entry.msg }}</span>
        </div>

        <div
          v-if="filteredLogs.length === 0"
          class="flex items-center justify-center h-32 text-muted-foreground/50 text-sm"
        >
          No log entries
        </div>
      </div>
    </div>

    <!-- Stats Tab -->
    <div
      v-if="activeTab === 'stats'"
      class="flex-1 overflow-y-auto p-4 md:p-6"
    >
      <div
        v-if="stats"
        class="max-w-2xl mx-auto space-y-6"
      >
        <!-- Host info -->
        <section>
          <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Host
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Hostname</div>
              <div class="text-sm font-medium mt-0.5 truncate">{{ stats.hostname }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Platform</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.platform }} / {{ stats.arch }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Uptime</div>
              <div class="text-sm font-medium mt-0.5">{{ formatUptime(stats.uptime) }}</div>
            </div>
          </div>
        </section>

        <!-- Memory -->
        <section>
          <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Memory
          </h2>
          <div class="bg-card rounded-xl p-4 border border-border/40 space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">System RAM</span>
              <span class="font-medium">{{ formatBytes(stats.memory.used) }} / {{ formatBytes(stats.memory.total) }}</span>
            </div>
            <div class="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="stats.memory.usagePercent > 90 ? 'bg-red-500' : stats.memory.usagePercent > 70 ? 'bg-yellow-500' : 'bg-primary'"
                :style="{ width: `${stats.memory.usagePercent.toFixed(1)}%` }"
              />
            </div>
            <div class="text-xs text-muted-foreground">
              {{ stats.memory.usagePercent.toFixed(1) }}% used
            </div>
          </div>
        </section>

        <!-- CPU -->
        <section>
          <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            CPU
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Cores</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.cpu.cores }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Load (1m)</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.cpu.loadAvg['1m'].toFixed(2) }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Load (5m)</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.cpu.loadAvg['5m'].toFixed(2) }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Load (15m)</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.cpu.loadAvg['15m'].toFixed(2) }}</div>
            </div>
          </div>
          <div class="mt-2 text-xs text-muted-foreground/60 truncate">{{ stats.cpu.model }}</div>
        </section>

        <!-- Process -->
        <section>
          <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Process
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">PID</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.process.pid }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Uptime</div>
              <div class="text-sm font-medium mt-0.5">{{ formatUptime(stats.process.uptime) }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Node.js</div>
              <div class="text-sm font-medium mt-0.5">{{ stats.process.nodeVersion }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">RSS</div>
              <div class="text-sm font-medium mt-0.5">{{ formatBytes(stats.process.memory.rss) }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Heap Used</div>
              <div class="text-sm font-medium mt-0.5">{{ formatBytes(stats.process.memory.heapUsed) }}</div>
            </div>
            <div class="bg-card rounded-xl p-3 border border-border/40">
              <div class="text-xs text-muted-foreground">Heap Total</div>
              <div class="text-sm font-medium mt-0.5">{{ formatBytes(stats.process.memory.heapTotal) }}</div>
            </div>
          </div>
        </section>
      </div>

      <div
        v-else
        class="flex items-center justify-center h-32 text-muted-foreground/50 text-sm"
      >
        Loading stats...
      </div>
    </div>
  </div>
</template>
