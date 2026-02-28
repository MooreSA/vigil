import { ref, watchEffect } from 'vue';

type Theme = 'light' | 'dark';

const mq = window.matchMedia('(prefers-color-scheme: light)');
const theme = ref<Theme>(mq.matches ? 'light' : 'dark');

function onChange(e: MediaQueryListEvent) {
  theme.value = e.matches ? 'light' : 'dark';
}

mq.addEventListener('change', onChange);

watchEffect(() => {
  const html = document.documentElement;
  if (theme.value === 'light') {
    html.classList.add('light');
  } else {
    html.classList.remove('light');
  }
});

function toggle() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}

export function useTheme() {
  return { theme, toggle };
}
