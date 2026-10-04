import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Лендинг живёт отдельным приложением и **без прокси к серверу**: он не должен
 * знать ни про API, ни про сокеты. Единственная связь с Yargram — адрес кнопки
 * «Открыть Yargram», и тот приходит переменной `VITE_APP_URL` на сборке.
 *
 * Такой лендинг можно положить куда угодно: на Cloudflare Pages, в nginx, в
 * тот же сервер отдельной папкой. Он статический: ни Node, ни базы ему не нужно.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    restoreMocks: true,
  },
});
