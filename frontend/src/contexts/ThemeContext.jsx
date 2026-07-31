import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { getItem, setItem, onStorageChange } from '../utils/storage';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'theme';

function getInitialTheme() {
  const stored = getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  // Sync .dark class on <html> and persist to storage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    setItem(STORAGE_KEY, theme);
  }, [theme]);

  // React to OS preference changes (only if user hasn't explicitly chosen)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      const stored = getItem(STORAGE_KEY);
      if (!stored) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    return onStorageChange(STORAGE_KEY, (value) => {
      if (value === 'dark' || value === 'light') {
        setThemeState(value);
      }
    });
  }, []);

  const applyTheme = useCallback((next) => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Modern browsers: cross-fade the whole page via the View Transitions API.
    if (!reduceMotion && typeof document.startViewTransition === 'function') {
      document.startViewTransition(() => {
        root.classList.toggle('dark', next === 'dark');
        setItem(STORAGE_KEY, next);
        // Flush React synchronously so the snapshot captures the new theme.
        flushSync(() => setThemeState(next));
      });
      return;
    }

    // Fallback: temporarily enable color transitions so every themeable
    // property cross-fades smoothly, then remove the class so normal
    // interactions keep their snappy timings.
    root.classList.add('theme-transition');
    root.classList.toggle('dark', next === 'dark');
    setItem(STORAGE_KEY, next);
    setThemeState(next);
    window.setTimeout(() => root.classList.remove('theme-transition'), 600);
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
