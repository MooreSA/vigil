import { describe, it, expect, vi, beforeEach } from 'vitest';

let listeners: ((e: MediaQueryListEvent) => void)[] = [];

beforeEach(() => {
  vi.resetModules();
  listeners = [];
  document.documentElement.classList.remove('light');
});

function mockMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    },
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
}

describe('useTheme', () => {
  it('defaults to dark when system prefers dark', async () => {
    mockMatchMedia(false);
    const { useTheme } = await import('./useTheme');
    const { theme } = useTheme();
    expect(theme.value).toBe('dark');
  });

  it('uses light when system prefers light', async () => {
    mockMatchMedia(true);
    const { useTheme } = await import('./useTheme');
    const { theme } = useTheme();
    expect(theme.value).toBe('light');
  });
});
