import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

/**
 * Адрес, по которому Yargram открывают снаружи. Раньше он был зашит строкой в
 * `allowedHosts`, и смена адреса ломала режим разработки: Vite отвечал
 * «Blocked request. This host is not allowed». Теперь берём из окружения —
 * переменной `PUBLIC_ORIGIN` (её же читает сервер и печатает лаунчер), а если
 * она не задана, оставляем прежний адрес Radmin.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const publicOrigin = env.PUBLIC_ORIGIN ?? '';
  const allowedHosts = ['26.53.76.128', 'localhost', '127.0.0.1'];
  if (publicOrigin) {
    try {
      allowedHosts.push(new URL(publicOrigin).hostname);
    } catch {
      // Значение не похоже на адрес — молча оставляем список по умолчанию:
      // разработка не должна падать из-за одной переменной.
    }
  }
  const backendTarget = env.BACKEND_TARGET || 'http://127.0.0.1:3000';

  return {
    /**
     * 🔥 Сборка живёт по `/app`, а не в корне: корень занимает лендинг
     * (`apps/landing`), и без этого все ссылки на бандлы (`/assets/…`) вели бы
     * мимо — приложение открывалось бы белым экраном.
     *
     * Базовый путь можно переопределить (`VITE_BASE`), если приложение
     * разворачивают отдельным сайтом на своём домене: тогда достаточно `VITE_BASE=/`.
     */
    base: env.VITE_BASE || '/app/',
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      restoreMocks: true,
    },
  };
});
