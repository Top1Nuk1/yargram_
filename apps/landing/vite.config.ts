import { resolve } from 'node:path';
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
  build: {
    // 🔥 Две точки входа, а не одна. По умолчанию Vite берёт только
    // `index.html`, и `terms.html` молча пропадал бы из сборки: страница
    // соглашения отдавалась бы 404, а ссылка из подвала вела бы в никуда.
    // Порядок важен только для читаемости вывода — сервер всё равно ищет файлы
    // по именам.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        terms: resolve(import.meta.dirname, 'terms.html'),
      },
    },
  },
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
