<script setup lang="ts">
import { ref, nextTick } from 'vue';

const emit = defineEmits<{ send: [message: string] }>();
defineProps<{ disabled?: boolean }>();

const input = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);

function adjustHeight() {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  const text = input.value.trim();
  if (!text) return;
  emit('send', text);
  input.value = '';
  nextTick(adjustHeight);
}
</script>

<template>
  <div class="border-t border-border bg-background p-3 md:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-4">
    <div class="max-w-3xl mx-auto relative">
      <textarea
        ref="textarea"
        v-model="input"
        @input="adjustHeight"
        @keydown="handleKeydown"
        :disabled="disabled"
        placeholder="Send a message..."
        rows="1"
        class="w-full resize-none overflow-hidden rounded-xl bg-input border border-border
               px-3 md:px-4 py-3 pr-14
               text-base text-foreground placeholder-muted-foreground outline-none
               focus:border-primary focus:ring-1 focus:ring-primary
               disabled:opacity-50 transition-colors"
      />
      <button
        @click="submit"
        :disabled="disabled || !input.trim()"
        class="absolute right-2 bottom-2 p-2.5 rounded-lg
               text-muted-foreground hover:text-primary disabled:opacity-30
               disabled:hover:text-muted-foreground transition-colors"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </button>
    </div>
  </div>
</template>
