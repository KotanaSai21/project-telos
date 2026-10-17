import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'project-telos-theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** Saved choice first, then the operating-system preference, then the dark brand default. */
export function initialTheme(): Theme {
  const saved = storedTheme();
  if (saved) return saved;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Theme state that persists the user's explicit choice and animates only on toggle. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theme-animating');
    window.setTimeout(() => root.classList.remove('theme-animating'), 320);
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Storage can be unavailable in private modes; the toggle still works for this visit.
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
