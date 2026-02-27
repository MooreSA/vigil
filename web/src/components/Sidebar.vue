<script setup lang="ts">
import { useRoute } from 'vue-router';
import ThemeToggle from './ThemeToggle.vue';
import { useThreads } from '../composables/useThreads';

defineEmits<{ 'new-chat': [] }>();

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
  <aside class="w-[280px] flex-shrink-0 bg-surface border-r border-border flex flex-col h-screen">
    <div class="p-3 flex items-center justify-between border-b border-border">
      <ThemeToggle />
      <button
        @click="$emit('new-chat')"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
               bg-accent text-white hover:bg-accent-hover transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Chat
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto py-2">
      <TransitionGroup name="thread-list">
        <router-link
          v-for="thread in threads"
          :key="thread.id"
          :to="`/${thread.id}`"
          class="block mx-2 mb-0.5 px-3 py-2.5 rounded-lg text-sm transition-colors truncate"
          :class="isActive(thread.id)
            ? 'bg-surface-hover text-text'
            : 'text-text-muted hover:bg-surface-hover hover:text-text'"
        >
          <Transition name="title-fade" mode="out-in">
            <div class="truncate thread-title" :key="threadTitle(thread)">{{ threadTitle(thread) }}</div>
          </Transition>
          <div class="text-xs text-text-muted mt-0.5">{{ formatDate(thread.updated_at) }}</div>
        </router-link>
      </TransitionGroup>

      <div v-if="threads.length === 0" class="px-5 py-8 text-center text-text-muted text-sm">
        No conversations yet
      </div>
    </nav>
  </aside>
</template>
