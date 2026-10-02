'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

/**
 * Tracks the light/dark theme in one place and keeps it in sync with the `.dark`
 * class on `<html>` and localStorage, so every page follows the same toggle. The
 * no-flash script in the root layout already applies the class before paint; this
 * only reads it back so the toggle icon starts in sync.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    const saved = (localStorage.getItem('theme') as Theme | null) || (isDark ? 'dark' : 'light');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage/DOM on mount (fleet-standard ThemeProvider pattern)
    setTheme(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
