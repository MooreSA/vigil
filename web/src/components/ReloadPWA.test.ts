import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

const needRefresh = ref(false);
const offlineReady = ref(false);
const updateServiceWorker = vi.fn();

vi.mock('virtual:pwa-register/vue', () => ({
  useRegisterSW: () => ({
    needRefresh,
    offlineReady,
    updateServiceWorker,
  }),
}));

import ReloadPWA from './ReloadPWA.vue';

beforeEach(() => {
  needRefresh.value = false;
  offlineReady.value = false;
  vi.restoreAllMocks();
});

describe('ReloadPWA', () => {
  it('is hidden when no update is available', () => {
    const wrapper = mount(ReloadPWA);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows banner when update is available', async () => {
    needRefresh.value = true;
    const wrapper = mount(ReloadPWA);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('A new version is available');
  });

  it('calls updateServiceWorker when Update is clicked', async () => {
    needRefresh.value = true;
    const wrapper = mount(ReloadPWA);

    await wrapper.findAll('button')[0].trigger('click');
    expect(updateServiceWorker).toHaveBeenCalled();
  });

  it('hides banner when Dismiss is clicked', async () => {
    needRefresh.value = true;
    const wrapper = mount(ReloadPWA);

    await wrapper.findAll('button')[1].trigger('click');
    expect(needRefresh.value).toBe(false);
  });
});
