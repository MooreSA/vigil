<script setup lang="ts">
import { watch, ref, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChatInput from './ChatInput.vue';
import MessageBubble from './MessageBubble.vue';
import { useChat } from '../composables/useChat';
import { useThreads } from '../composables/useThreads';

const props = defineProps<{ threadId?: string }>();

const route = useRoute();
const router = useRouter();
const { messages, isStreaming, streamingContent, activeToolCalls, threadSource, loadThread, reset, send } = useChat();
const { load: reloadThreads, addOrUpdate } = useThreads();
const messagesContainer = ref<HTMLElement | null>(null);

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  nextTick(() => {
    const el = messagesContainer.value;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  });
}

// Watch for route changes
watch(
  () => route.params.threadId as string | undefined,
  async (id) => {
    if (id) {
      await loadThread(id);
      scrollToBottom('instant');
    } else {
      reset();
    }
  },
  { immediate: true },
);

// Auto-scroll during streaming and tool calls
watch(streamingContent, () => {
  scrollToBottom();
});
watch(activeToolCalls, () => {
  scrollToBottom();
}, { deep: true });

// Auto-scroll when messages change
watch(() => messages.value.length, () => {
  scrollToBottom();
});

async function handleSend(text: string) {
  scrollToBottom();
  const newThreadId = await send(text);

  if (newThreadId && !route.params.threadId) {
    // Navigated from new chat — update URL without reloading
    router.replace(`/${newThreadId}`);
  }

  // Refresh thread list to show new/updated thread
  reloadThreads();
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 min-w-0">
    <!-- Messages area -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto overscroll-contain"
    >
      <!-- Empty state -->
      <div
        v-if="messages.length === 0 && !isStreaming"
        class="h-full flex items-center justify-center"
      >
        <div class="text-center text-muted-foreground">
          <svg class="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          <p class="text-lg">Start a conversation</p>
        </div>
      </div>

      <!-- Message list -->
      <div class="py-4">
        <MessageBubble
          v-for="(msg, idx) in messages"
          :key="msg.id"
          :message="msg"
          :is-wake-prompt="threadSource === 'wake' && idx === 0 && msg.role === 'user'"
        />

        <!-- Active tool calls -->
        <div v-if="activeToolCalls.length > 0" class="py-2 px-4">
          <div class="max-w-3xl mx-auto space-y-1.5">
            <div
              v-for="(tc, i) in activeToolCalls"
              :key="i"
              class="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <svg v-if="tc.status === 'running'" class="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
                <path d="M8 1.5a6.5 6.5 0 014.596 1.904" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
              <svg v-else class="w-3 h-3 text-green-500" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-9.354a.5.5 0 00-.708-.708L7 8.586 5.354 6.94a.5.5 0 10-.708.708l2 2a.5.5 0 00.708 0l4-4z" />
              </svg>
              <span class="font-mono">{{ tc.name }}</span>
              <span v-if="tc.status === 'running'" class="italic">running...</span>
            </div>
          </div>
        </div>

        <!-- Streaming message -->
        <MessageBubble
          v-if="isStreaming && streamingContent"
          :message="{
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            model: null,
            created_at: new Date().toISOString(),
          }"
          :is-streaming="true"
        />
      </div>
    </div>

    <!-- Input -->
    <ChatInput :disabled="isStreaming" @send="handleSend" />
  </div>
</template>
