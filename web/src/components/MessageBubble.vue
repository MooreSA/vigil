<script setup lang="ts">
import MarkdownBody from './MarkdownBody.vue';
import MessageMeta from './MessageMeta.vue';
import type { ChatMessage } from '../composables/useChat';

const props = defineProps<{
  message: ChatMessage;
  isStreaming?: boolean;
}>();

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="py-3 px-4">
    <div class="max-w-3xl mx-auto min-w-0">
      <!-- User message -->
      <div v-if="message.role === 'user'" class="flex flex-col items-end">
        <div class="bg-secondary rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] overflow-hidden">
          <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
        </div>
        <span class="text-xs text-muted-foreground mt-1">{{ formatTime(message.created_at) }}</span>
      </div>

      <!-- Assistant message -->
      <div v-else-if="message.role === 'assistant'" class="space-y-1">
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
