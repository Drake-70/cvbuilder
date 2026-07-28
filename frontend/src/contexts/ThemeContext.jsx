import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

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
