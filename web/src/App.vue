<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Sidebar from './components/Sidebar.vue';
import { Sheet, SheetContent } from './components/ui/sheet';
import { useThreads } from './composables/useThreads';
import { useTheme } from './composables/useTheme';
import { useEventStream } from './composables/useEventStream';

useTheme(); // Initialize theme on mount

const { threads, load } = useThreads();
const router = useRouter();
const route = useRoute();
const eventStream = useEventStream();
const sidebarOpen = ref(false);

eventStream.on('thread:updated', (data: { id: string; title: string }) => {
  const thread = threads.value.find(t => t.id === data.id);
  if (thread) {
    thread.title = data.title;
  }
});

onMounted(() => {
  load();
  eventStream.connect();
});

onUnmounted(() => {
  eventStream.close();
});

function onNewChat() {
  sidebarOpen.value = false;
  router.push('/');
}

function onThreadSelect() {
  sidebarOpen.value = false;
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background text-foreground">
    <!-- Desktop sidebar -->
    <div class="hidden md:block">
      <Sidebar @new-chat="onNewChat" />
    </div>

    <!-- Mobile sidebar (sheet) -->
    <Sheet v-model:open="sidebarOpen">
      <SheetContent side="left" class="w-[280px] p-0">
        <Sidebar @new-chat="onNewChat" @thread-select="onThreadSelect" />
      </SheetContent>
    </Sheet>

    <main class="flex-1 flex flex-col min-w-0">
      <!-- Mobile header -->
      <div class="flex md:hidden items-center gap-3 px-4 py-3 border-b border-border">
        <button
          @click="sidebarOpen = true"
          class="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <span class="text-sm font-medium truncate">Vigil</span>
      </div>

      <router-view />
    </main>
  </div>
</template>
