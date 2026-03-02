<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';

defineProps<{
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean]; confirm: [] }>();
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-80 rounded-2xl bg-card border border-border shadow-xl p-5 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        @keydown.enter="emit('confirm')"
      >
        <DialogTitle class="text-sm font-semibold text-foreground mb-1">
          {{ title }}
        </DialogTitle>
        <DialogDescription v-if="description" class="text-sm text-muted-foreground mb-4">
          {{ description }}
        </DialogDescription>
        <div class="flex justify-end gap-2 mt-4">
          <DialogClose
            class="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </DialogClose>
          <button
            class="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            @click="emit('confirm')"
          >
            {{ confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
