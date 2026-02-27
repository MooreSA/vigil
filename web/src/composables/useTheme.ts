import { ref, watchEffect } from 'vue';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vigil-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const theme = ref<Theme>(getInitialTheme());

watchEffect(() => {
  const html = document.documentElement;
  if (theme.value === 'light') {
    html.classList.add('light');
  } else {
    html.classList.remove('light');
  }
  localStorage.setItem(STORAGE_KEY, theme.value);
});

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  return { theme, toggle };
}
