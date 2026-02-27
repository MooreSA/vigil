<script setup lang="ts">
import MarkdownBody from './MarkdownBody.vue';
import MessageMeta from './MessageMeta.vue';
import type { ChatMessage } from '../composables/useChat';

const props = defineProps<{
  message: ChatMessage;
  isStreaming?: boolean;
}>();
</script>

<template>
  <div class="py-3 px-4">
    <div class="max-w-3xl mx-auto">
      <!-- User message -->
      <div v-if="message.role === 'user'" class="flex justify-end">
        <div class="bg-secondary rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
          <p class="whitespace-pre-wrap">{{ message.content }}</p>
        </div>
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
        />
      </div>
    </div>
  </div>
</template>
