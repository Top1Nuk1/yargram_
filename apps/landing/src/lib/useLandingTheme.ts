import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'yargram.landing.theme';

/**
 * Тема лендинга. Хранится на устройстве и применяется атрибутом
 * `data-theme` на `<html>` — от него отталкиваются CSS-переменные, см.
 * `index.css`. Отдельная от приложения: там тема принадлежит аккаунту и может
 * быть любой из семи, здесь достаточно светлой и тёмной.
 */
export function useLandingTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Приватный режим: остаёмся на системном предпочтении.
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Сохранить не удалось — тема всё равно применится до перезагрузки.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
