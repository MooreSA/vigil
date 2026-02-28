<script setup lang="ts">
import MarkdownBody from './MarkdownBody.vue';
import MessageMeta from './MessageMeta.vue';
import type { ChatMessage } from '../composables/useChat';

const props = defineProps<{
  message: ChatMessage;
  isStreaming?: boolean;
  isWakePrompt?: boolean;
}>();

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="py-2 first:pt-4 px-4">
    <div class="max-w-3xl mx-auto min-w-0">
      <!-- Wake prompt banner -->
      <div v-if="isWakePrompt && message.role === 'user'" class="flex flex-col items-center text-center py-3 px-4 rounded-xl bg-muted/50 border border-border/40">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="font-medium">Scheduled</span>
        </div>
        <p class="text-sm text-muted-foreground whitespace-pre-wrap">{{ message.content }}</p>
      </div>

      <!-- User message -->
      <div v-else-if="message.role === 'user'" class="flex flex-col items-end">
        <div class="bg-secondary rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] overflow-hidden shadow-sm shadow-black/5">
          <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
        </div>
        <span class="text-xs text-muted-foreground/70 mt-1.5">{{ formatTime(message.created_at) }}</span>
      </div>

      <!-- Assistant message -->
      <div v-else-if="message.role === 'assistant'" class="space-y-1.5">
        <!-- Persisted tool calls (collapsible) -->
        <details v-if="message.toolCalls?.length" class="mb-2 group">
          <summary class="flex items-center gap-1.5 text-xs text-muted-foreground/80 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-muted rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors">
            <svg class="w-3 h-3 text-green-500 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708-.708L7 8.586 5.354 6.94a.5.5 0 10-.708.708l2 2a.5.5 0 00.708 0l4-4z" />
            </svg>
            <span>Used {{ message.toolCalls.length }} tool{{ message.toolCalls.length > 1 ? 's' : '' }}</span>
            <svg class="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
            </svg>
          </summary>
          <div class="mt-1 ml-5 space-y-0.5">
            <div
              v-for="(tc, i) in message.toolCalls"
              :key="i"
              class="text-xs text-muted-foreground/70 font-mono"
            >
              {{ tc.name }}
            </div>
          </div>
        </details>
        <div :class="isStreaming ? 'streaming-cursor' : ''">
          <MarkdownBody :content="message.content" />
        </div>
        <MessageMeta
          v-if="!isStreaming"
          :model="message.model"
          :created-at="message.created_at"
          :elapsed="(message as any)._elapsed"
          :usage="message.usage"
        />
      </div>
    </div>
  </div>
</template>
