<script setup lang="ts">
import { ref } from 'vue';
import type { TokenUsage } from '../composables/useChat';

const props = defineProps<{
  model: string | null;
  createdAt: string;
  elapsed?: string;
  usage?: TokenUsage;
}>();

const expanded = ref(false);

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatModel(model: string) {
  // Strip provider prefix for cleaner display
  const parts = model.split('/');
  return parts[parts.length - 1];
}

function formatTokens(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
</script>

<template>
  <div class="mt-2 text-xs text-muted-foreground/70">
    <button
      @click="expanded = !expanded"
      class="hover:text-foreground hover:bg-muted rounded-md px-1.5 py-0.5 -ml-1.5 transition-all flex items-center gap-1"
    >
      <svg
        class="w-3 h-3 transition-transform"
        :class="expanded ? 'rotate-90' : ''"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
      <span v-if="elapsed">{{ elapsed }}s</span>
      <span v-if="usage" class="mx-0.5">&middot;</span>
      <span v-if="usage">{{ formatTokens(usage.total_tokens) }} tokens</span>
      <span v-if="model" class="mx-0.5">&middot;</span>
      <span v-if="model">{{ formatModel(model) }}</span>
    </button>
    <div v-if="expanded" class="mt-1 pl-4 space-y-0.5 border-l-2 border-border/40 text-muted-foreground/60">
      <div v-if="elapsed">Duration: {{ elapsed }}s</div>
      <div v-if="usage">Tokens: {{ usage.input_tokens.toLocaleString() }} in / {{ usage.output_tokens.toLocaleString() }} out</div>
      <div v-if="model">Model: {{ model }}</div>
      <div>Time: {{ formatTime(createdAt) }}</div>
    </div>
  </div>
</template>
