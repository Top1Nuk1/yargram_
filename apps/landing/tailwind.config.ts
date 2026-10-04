import type { Config } from 'tailwindcss';

/**
 * Лендинг не использует темы Yargram (их выбирают в приложении и они лежат на
 * устройстве), поэтому цвета здесь заданы прямо — светлая и тёмная палитры
 * сайта, а не `--brand` из приложения. Так лендинг выглядит одинаково у всех,
 * впервые открывших ссылку.
 *
 * 🔥 Цвета берутся из CSS-переменных (`index.css`), а не жёсткими значениями:
 * иначе класс `text-ink` остался бы тёмно-синим и на тёмной теме, и текст
 * пропадал бы на тёмном фоне. Переключатель темы ставит `data-theme` на
 * `<html>` — и всё меняется само, без второго набора классов вида `dark:`.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'rgb(var(--page) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--title) / <alpha-value>)',
        body: 'rgb(var(--body) / <alpha-value>)',
        stroke: 'rgb(var(--stroke) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          deep: 'rgb(var(--accent-deep) / <alpha-value>)',
        },
        success: 'rgb(var(--ok) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 35, 50, 0.04), 0 8px 28px rgba(15, 35, 50, 0.07)',
        float: '0 18px 48px rgba(15, 35, 50, 0.16)',
      },
      animation: {
        'fade-up': 'fade-up 520ms cubic-bezier(0.22, 1, 0.36, 1) both',
        float: 'float 7s ease-in-out infinite',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
