<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Sidebar from './components/Sidebar.vue';
import { useThreads } from './composables/useThreads';
import { useTheme } from './composables/useTheme';
import { useEventStream } from './composables/useEventStream';

useTheme(); // Initialize theme on mount

const { threads, load } = useThreads();
const router = useRouter();
const eventStream = useEventStream();

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
  router.push('/');
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-bg text-text">
    <Sidebar @new-chat="onNewChat" />
    <main class="flex-1 flex flex-col min-w-0">
      <router-view />
    </main>
  </div>
</template>
