<script setup lang="ts">
import { useOnline } from '@vueuse/core';

const online = useOnline();
</script>

<template>
  <Transition name="slide-down">
    <div
      v-if="!online"
      class="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm text-white"
      role="status"
    >
      <!-- eslint-disable vue/max-attributes-per-line -->
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728" />
        <line x1="4" y1="4" x2="20" y2="20" stroke-linecap="round" />
      </svg>
      <!-- eslint-enable vue/max-attributes-per-line -->
      <span>You're offline. Viewing cached data.</span>
    </div>
  </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
