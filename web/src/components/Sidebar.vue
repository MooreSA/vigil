<script setup lang="ts">
import { useRoute } from 'vue-router';
import ThemeToggle from './ThemeToggle.vue';
import { useThreads } from '../composables/useThreads';

const emit = defineEmits<{ 'new-chat': []; 'thread-select': [] }>();

const route = useRoute();
const { threads } = useThreads();

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
</script>

<template>
  <aside class="w-[280px] flex-shrink-0 bg-card md:border-r border-border flex flex-col h-full">
    <div class="p-3 flex items-center justify-between border-b border-border">
      <ThemeToggle />
      <button
        @click="$emit('new-chat')"
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
               bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Chat
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto py-2">
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        move-class="transition-transform duration-300 ease-out"
      >
        <router-link
          v-for="thread in threads"
          :key="thread.id"
          :to="`/${thread.id}`"
          @click="emit('thread-select')"
          class="block mx-2 mb-0.5 px-3 py-2.5 rounded-lg text-sm transition-colors truncate"
          :class="isActive(thread.id)
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
        >
          <Transition
            mode="out-in"
            enter-active-class="transition-opacity duration-200 ease-out"
            leave-active-class="transition-opacity duration-150 ease-in"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <div class="truncate" :key="threadTitle(thread)">{{ threadTitle(thread) }}</div>
          </Transition>
          <div class="text-xs text-muted-foreground mt-0.5">{{ formatDate(thread.updated_at) }}</div>
        </router-link>
      </TransitionGroup>

      <div v-if="threads.length === 0" class="px-5 py-8 text-center text-muted-foreground text-sm">
        No conversations yet
      </div>
    </nav>
  </aside>
</template>
