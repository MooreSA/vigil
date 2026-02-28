<script setup lang="ts">
import { ref, nextTick } from 'vue';

const emit = defineEmits<{ send: [message: string] }>();
defineProps<{ disabled?: boolean; borderless?: boolean }>();

const input = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);
const wrapper = ref<HTMLElement | null>(null);

function adjustHeight() {
  const el = textarea.value;
  const wrap = wrapper.value;
  if (!el || !wrap) return;
  // Pin the wrapper height so the flex layout doesn't shift
  // while we measure the textarea's natural content height.
  const pinned = wrap.offsetHeight;
  wrap.style.minHeight = pinned + 'px';
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  wrap.style.minHeight = '';
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
  <div
    ref="wrapper"
    :class="[
      borderless
        ? ''
        : 'border-t border-border/60 bg-background/80 backdrop-blur-xl p-3 md:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-4'
    ]"
  >
    <div
      :class="[
        'relative',
        borderless ? '' : 'max-w-3xl mx-auto'
      ]"
    >
      <textarea
        ref="textarea"
        v-model="input"
        :disabled="disabled"
        placeholder="Send a message..."
        rows="1"
        :class="[
          'w-full resize-none overflow-hidden border text-foreground placeholder-muted-foreground outline-none disabled:opacity-50 transition-all',
          borderless
            ? 'rounded-2xl bg-card border-border/60 shadow-lg shadow-black/5 px-4 md:px-5 py-4 pr-14 text-base focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:shadow-xl focus:shadow-primary/5'
            : 'rounded-2xl bg-card border-border/60 shadow-sm shadow-black/5 px-3 md:px-4 py-3 pr-14 text-base focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:shadow-md focus:shadow-primary/5'
        ]"
        @input="adjustHeight"
        @keydown="handleKeydown"
      />
      <button
        :disabled="disabled || !input.trim()"
        :class="[
          'absolute right-2 transition-all',
          borderless
            ? 'bottom-2.5 p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-20 disabled:bg-muted disabled:text-muted-foreground hover:bg-primary/90 active:scale-95'
            : 'bottom-2.5 p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:opacity-20 disabled:bg-muted disabled:text-muted-foreground'
        ]"
        @click="submit"
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
            d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
