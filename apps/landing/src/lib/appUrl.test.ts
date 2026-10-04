import { describe, expect, it, vi, afterEach } from 'vitest';
import { appHref, appUrl } from './appUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('адрес приложения', () => {
  it('без переменной ведёт на /app', () => {
    vi.stubEnv('VITE_APP_URL', '');
    expect(appUrl()).toBe('/app');
    expect(appHref()).toBe('/app');
  });

  it('берёт адрес из VITE_APP_URL и снимает хвостовой слеш', () => {
    vi.stubEnv('VITE_APP_URL', 'https://yargram.example.com/');
    expect(appUrl()).toBe('https://yargram.example.com');
  });

  it('снимает несколько слешей подряд', () => {
    vi.stubEnv('VITE_APP_URL', 'https://yargram.example.com///');
    expect(appUrl()).toBe('https://yargram.example.com');
  });

  it('пробелы вокруг адреса не ломают ссылку', () => {
    // Значение из .env часто копируют с пробелом — ссылка не должна уехать
    // на «пробел-https://…», иначе браузер уйдёт в поиск вместо Yargram.
    vi.stubEnv('VITE_APP_URL', '  https://yargram.example.com  ');
    expect(appUrl()).toBe('https://yargram.example.com');
  });

  it('путь без домена тоже годится', () => {
    vi.stubEnv('VITE_APP_URL', '/app/');
    expect(appUrl()).toBe('/app');
  });
});
