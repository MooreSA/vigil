import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';

// Need to reset module state between tests
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.classList.remove('light');
});

describe('useTheme', () => {
  it('defaults to dark when no preference stored', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    const { useTheme } = await import('./useTheme');
    const { theme } = useTheme();
    expect(theme.value).toBe('dark');
  });

  it('restores stored theme from localStorage', async () => {
    localStorage.setItem('vigil-theme', 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    const { useTheme } = await import('./useTheme');
    const { theme } = useTheme();
    expect(theme.value).toBe('light');
  });

  it('toggle switches between dark and light', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    const { useTheme } = await import('./useTheme');
    const { theme, toggle } = useTheme();

    expect(theme.value).toBe('dark');
    toggle();
    expect(theme.value).toBe('light');
    toggle();
    expect(theme.value).toBe('dark');
  });

  it('persists to localStorage on change', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    const { useTheme } = await import('./useTheme');
    const { toggle } = useTheme();

    toggle();
    // watchEffect is async — flush it
    await nextTick();
    expect(localStorage.getItem('vigil-theme')).toBe('light');
  });
});
