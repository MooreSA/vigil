<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import MarkdownIt from 'markdown-it';
import type { BundledLanguage } from 'shiki';

const props = defineProps<{ content: string }>();

const highlighter = ref<any>(null);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapCode(html: string): string {
  return `<div class="code-block-wrapper">${html}<button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code')?.textContent || '')">Copy</button></div>`;
}

function highlight(str: string, lang: string): string {
  if (highlighter.value && lang) {
    try {
      const html: string = highlighter.value.codeToHtml(str, {
        lang: lang as BundledLanguage,
        theme: 'github-dark',
      });
      return wrapCode(html);
    } catch {
      // Fall through to default
    }
  }
  return wrapCode(`<pre><code>${escapeHtml(str)}</code></pre>`);
}

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight,
});

onMounted(async () => {
  try {
    const { createHighlighter } = await import('shiki');
    highlighter.value = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'javascript', 'typescript', 'python', 'bash', 'json',
        'html', 'css', 'sql', 'yaml', 'markdown', 'rust', 'go',
      ],
    });
  } catch {
    // Shiki failed to load, fall back to unstyled code blocks
  }
});

const rendered = computed(() => md.render(props.content));
</script>

<template>
  <div class="markdown-body" v-html="rendered" />
</template>
