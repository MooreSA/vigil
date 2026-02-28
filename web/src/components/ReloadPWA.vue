<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue';

const {
  needRefresh,
  updateServiceWorker,
} = useRegisterSW();

function update() {
  updateServiceWorker();
}

function dismiss() {
  needRefresh.value = false;
}
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="needRefresh"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
      role="alert"
    >
      <span class="text-sm text-foreground">A new version is available.</span>
      <button
        class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        @click="update"
      >
        Update
      </button>
      <button
        class="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        @click="dismiss"
      >
        Dismiss
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 1rem);
}
</style>
