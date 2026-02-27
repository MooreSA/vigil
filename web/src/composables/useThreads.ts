import { ref } from 'vue';
import { fetchThreads, type Thread } from '../lib/api';

const threads = ref<Thread[]>([]);
const loading = ref(false);

export function useThreads() {
  async function load() {
    loading.value = true;
    try {
      threads.value = await fetchThreads();
    } finally {
      loading.value = false;
    }
  }

  function addOrUpdate(thread: Thread) {
    const idx = threads.value.findIndex((t) => t.id === thread.id);
    if (idx >= 0) {
      threads.value[idx] = thread;
    } else {
      threads.value.unshift(thread);
    }
  }

  return { threads, loading, load, addOrUpdate };
}
