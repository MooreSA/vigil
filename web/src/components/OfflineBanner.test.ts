import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

const online = ref(true);

vi.mock('@vueuse/core', () => ({
  useOnline: () => online,
}));

import OfflineBanner from './OfflineBanner.vue';

beforeEach(() => {
  online.value = true;
});

describe('OfflineBanner', () => {
  it('is hidden when online', () => {
    const wrapper = mount(OfflineBanner);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('shows banner when offline', () => {
    online.value = false;
    const wrapper = mount(OfflineBanner);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("You're offline");
  });

  it('hides banner when coming back online', async () => {
    online.value = false;
    const wrapper = mount(OfflineBanner);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);

    online.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
});
