import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageMeta from './MessageMeta.vue';

describe('MessageMeta', () => {
  const baseProps = {
    model: 'openrouter/anthropic/claude-sonnet-4',
    createdAt: '2025-06-01T14:30:00Z',
    elapsed: '3.2',
  };

  it('shows elapsed time and short model name in collapsed state', () => {
    const wrapper = mount(MessageMeta, { props: baseProps });

    const text = wrapper.text();
    expect(text).toContain('3.2s');
    expect(text).toContain('claude-sonnet-4');
    // Should not show the full model path when collapsed
    expect(text).not.toContain('openrouter/anthropic/claude-sonnet-4');
  });

  it('expands on click to show full details', async () => {
    const wrapper = mount(MessageMeta, { props: baseProps });

    await wrapper.find('button').trigger('click');

    const text = wrapper.text();
    expect(text).toContain('Duration: 3.2s');
    expect(text).toContain('Model: openrouter/anthropic/claude-sonnet-4');
    expect(text).toContain('Time:');
  });

  it('collapses on second click', async () => {
    const wrapper = mount(MessageMeta, { props: baseProps });

    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Duration:');

    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).not.toContain('Duration:');
  });

  it('handles null model gracefully', () => {
    const wrapper = mount(MessageMeta, {
      props: { ...baseProps, model: null },
    });

    const text = wrapper.text();
    expect(text).toContain('3.2s');
    expect(text).not.toContain('null');
  });

  it('handles missing elapsed gracefully', () => {
    const wrapper = mount(MessageMeta, {
      props: { model: 'gpt-4o', createdAt: baseProps.createdAt },
    });

    const text = wrapper.text();
    expect(text).toContain('gpt-4o');
    expect(text).not.toContain('undefined');
  });
});
