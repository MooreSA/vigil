import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatInput from './ChatInput.vue';

describe('ChatInput', () => {
  it('emits send with trimmed text on submit', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');

    await textarea.setValue('  hello world  ');
    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('send')).toEqual([['hello world']]);
  });

  it('clears input after submit', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');

    await textarea.setValue('hello');
    await wrapper.find('button').trigger('click');

    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('does not emit send for empty/whitespace input', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');

    await textarea.setValue('   ');
    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('submits on Enter without Shift', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');

    await textarea.setValue('test');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });

    expect(wrapper.emitted('send')).toEqual([['test']]);
  });

  it('does not submit on Shift+Enter', async () => {
    const wrapper = mount(ChatInput);
    const textarea = wrapper.find('textarea');

    await textarea.setValue('test');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });

    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('disables textarea and button when disabled prop is true', () => {
    const wrapper = mount(ChatInput, { props: { disabled: true } });

    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });
});
