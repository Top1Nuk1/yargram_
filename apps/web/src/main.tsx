import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { applyUiScale, readUiScale } from './lib/uiScale';

const root = document.getElementById('root');

if (!root) throw new Error('Root element was not found');

// Масштаб применяем до первого кадра: иначе интерфейс нарисовался бы обычным
// размером и на глазах дёрнулся. Читаем его отдельно от React-состояния —
// хранилище устройства доступно сразу.
applyUiScale(readUiScale());

// PWA: регистрируем service worker только в сборке (PROD). В dev (Vite HMR)
// регистрация сломала бы горячую перезагрузку и могла бы отдавать старый бандл.
// Путь указываем абсолютный относительно базы `/app`, чтобы работать на любом
// хосте (Radmin, Raven, свой домен).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js').catch(() => {
      // Тихо: отсутствие SW не должно мешать работе мессенджера.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
