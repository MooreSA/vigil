import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useThreads } from './useThreads';

vi.mock('../lib/api', () => ({
  fetchThreads: vi.fn(),
}));

import { fetchThreads } from '../lib/api';

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset shared state between tests
  const { threads } = useThreads();
  threads.value = [];
});

describe('useThreads', () => {
  describe('load', () => {
    it('fetches and stores threads', async () => {
      const data = [
        { id: '1', title: 'Thread 1', source: 'web', job_run_id: null, created_at: '', updated_at: ''},
        { id: '2', title: 'Thread 2', source: 'web', job_run_id: null, created_at: '', updated_at: ''},
      ];
      vi.mocked(fetchThreads).mockResolvedValue(data);

      const { threads, loading, load } = useThreads();
      const loadPromise = load();

      expect(loading.value).toBe(true);
      await loadPromise;

      expect(threads.value).toEqual(data);
      expect(loading.value).toBe(false);
    });

    it('resets loading on error', async () => {
      vi.mocked(fetchThreads).mockRejectedValue(new Error('fail'));

      const { loading, load } = useThreads();

      await expect(load()).rejects.toThrow('fail');
      expect(loading.value).toBe(false);
    });
  });

  describe('addOrUpdate', () => {
    it('prepends a new thread', () => {
      const { threads, addOrUpdate } = useThreads();
      threads.value = [
        { id: '1', title: 'Existing', source: 'web', job_run_id: null, created_at: '', updated_at: ''},
      ];

      addOrUpdate({ id: '2', title: 'New', source: 'web', job_run_id: null, created_at: '', updated_at: ''});

      expect(threads.value).toHaveLength(2);
      expect(threads.value[0].id).toBe('2');
    });

    it('updates an existing thread in place', () => {
      const { threads, addOrUpdate } = useThreads();
      threads.value = [
        { id: '1', title: 'Old Title', source: 'web', job_run_id: null, created_at: '', updated_at: ''},
      ];

      addOrUpdate({ id: '1', title: 'New Title', source: 'web', job_run_id: null, created_at: '', updated_at: ''});

      expect(threads.value).toHaveLength(1);
      expect(threads.value[0].title).toBe('New Title');
    });
  });
});
