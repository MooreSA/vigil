<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useThreads } from '../composables/useThreads';
import { archiveThread } from '../lib/api';
import ConfirmDialog from './ConfirmDialog.vue';

type Filter = 'all' | 'user' | 'wake';

const emit = defineEmits<{ 'new-chat': []; 'thread-select': []; 'close': [] }>();

const route = useRoute();
const { threads, remove } = useThreads();
const filter = ref<Filter>('all');
const search = ref('');
const archiveDialogOpen = ref(false);
const archiveTargetId = ref<string | null>(null);

const filteredThreads = computed(() => {
  let list = threads.value;
  if (filter.value !== 'all') {
    list = list.filter((t) => t.source === filter.value);
  }
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter((t) => (t.title || '').toLowerCase().includes(q));
  }
  return list;
});

function threadTitle(thread: { title: string | null; id: string }) {
  return thread.title || `Thread ${thread.id}`;
}

function isActive(id: string) {
  return route.params.threadId === id;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function promptArchive(id: string) {
  archiveTargetId.value = id;
  archiveDialogOpen.value = true;
}

async function onArchiveConfirmed() {
  if (!archiveTargetId.value) return;
  await archiveThread(archiveTargetId.value);
  remove(archiveTargetId.value);
  archiveDialogOpen.value = false;
  archiveTargetId.value = null;
}
</script>

<template>
  <aside class="w-full md:w-[280px] flex-shrink-0 bg-card md:border-r border-border/60 flex flex-col h-full pl-[env(safe-area-inset-left)] md:pl-0">
    <!-- Mobile close -->
    <div class="md:hidden p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.5rem,env(safe-area-inset-left))] border-b border-border/60">
      <button
        class="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent active:scale-95 transition-all"
        @click="emit('close')"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
      </button>
    </div>

    <!-- Filter toggle -->
    <div class="px-3 pt-3">
      <div class="flex rounded-xl bg-muted/70 p-0.5 text-sm font-medium">
        <button
          v-for="opt in ([
            { key: 'all', label: 'All' },
            { key: 'user', label: 'Chats' },
            { key: 'wake', label: 'Scheduled' },
          ] as const)"
          :key="opt.key"
          class="flex-1 rounded-md px-2 py-2 text-center transition-colors"
          :class="filter === opt.key
            ? 'bg-background text-foreground shadow-sm shadow-black/10'
            : 'text-foreground/50 hover:text-foreground/70'"
          @click="filter = opt.key"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 py-2 pt-3">
      <div class="relative">
        <svg
          class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          v-model="search"
          type="text"
          placeholder="Search threads..."
          class="w-full rounded-lg bg-muted/50 border border-border/40 pl-8 pr-3 py-1.5 text-sm text-foreground placeholder-muted-foreground/50 outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:bg-muted/70"
        >
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto">
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        move-class="transition-transform duration-300 ease-out"
      >
        <div
          v-for="thread in filteredThreads"
          :key="thread.id"
          class="group relative mx-2 mb-0.5"
        >
          <router-link
            :to="`/${thread.id}`"
            class="block px-3 py-3 rounded-xl text-sm transition-all truncate"
            :class="isActive(thread.id)
              ? 'bg-accent text-foreground shadow-sm shadow-black/5'
              : 'text-foreground/80 hover:bg-accent/70 hover:text-foreground'"
            @click="emit('thread-select')"
          >
            <Transition
              mode="out-in"
              enter-active-class="transition-opacity duration-200 ease-out"
              leave-active-class="transition-opacity duration-150 ease-in"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <div
                :key="threadTitle(thread)"
                class="truncate flex items-center gap-1.5 pr-6"
              >
                <svg
                  v-if="thread.source === 'wake'"
                  class="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span class="truncate">{{ threadTitle(thread) }}</span>
              </div>
            </Transition>
            <div class="text-xs text-muted-foreground/60 mt-0.5">
              {{ formatDate(thread.updated_at) }}
            </div>
          </router-link>
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
            title="Archive"
            @click.prevent="promptArchive(thread.id)"
          >
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </button>
        </div>
      </TransitionGroup>

      <div
        v-if="filteredThreads.length === 0"
        class="px-5 py-8 text-center text-muted-foreground text-sm"
      >
        {{ search.trim() ? 'No matching threads' : filter === 'all' ? 'No conversations yet' : 'No threads found' }}
      </div>
    </nav>

    <!-- New Chat -->
    <div class="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border/60">
      <button
        class="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium
               bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm shadow-primary/20 transition-all"
        @click="$emit('new-chat')"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        New Chat
      </button>
    </div>
  </aside>

  <ConfirmDialog
    v-model:open="archiveDialogOpen"
    title="Archive this thread?"
    description="It will be hidden from your thread list. You can restore it later."
    confirm-label="Archive"
    @confirm="onArchiveConfirmed"
  />
</template>
