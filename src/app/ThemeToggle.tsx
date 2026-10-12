'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'reservalab-theme';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = saved ? saved === 'dark' : prefersDark;
    setDark(initialDark);
    document.documentElement.dataset.theme = initialDark ? 'dark' : 'light';
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
    window.localStorage.setItem(STORAGE_KEY, nextDark ? 'dark' : 'light');
  }

  return <button type="button" className="btn btnlight theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'} title={dark ? 'Tema claro' : 'Tema escuro'}>
    {dark ? <Sun size={16} /> : <Moon size={16} />}
    <span>{dark ? 'Tema claro' : 'Tema escuro'}</span>
  </button>;
}
