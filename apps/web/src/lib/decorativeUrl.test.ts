import { describe, expect, it } from 'vitest';
import { isDecorativeUrl } from './decorativeUrl';

describe('ссылки оформления', () => {
  it('пустая строка — «снять», это допустимо', () => {
    expect(isDecorativeUrl('')).toBe(true);
    expect(isDecorativeUrl('   ')).toBe(true);
  });

  it('пропускает внешние ссылки', () => {
    expect(isDecorativeUrl('https://example.com/pic.png')).toBe(true);
    expect(isDecorativeUrl('http://example.com/pic.png')).toBe(true);
    expect(isDecorativeUrl('HTTPS://Example.com/pic.png')).toBe(true);
  });

  it('пропускает свою загрузку вместе с подписью', () => {
    expect(isDecorativeUrl('/api/uploads/att-1?t=abc.def')).toBe(true);
    expect(isDecorativeUrl('/api/uploads/att-1')).toBe(true);
  });

  it('пропускает настоящую подпись из профиля', () => {
    // Настоящая ссылка, из-за которой профиль не сохранялся: прежняя проверка
    // «начинается с http» ругалась на неё ровно тогда, когда фон уже стоит.
    expect(
      isDecorativeUrl(
        '/api/uploads/att-1fc30f5e-0000-0000-0000-000000000000?t=eyJzIjoiOTNmN2RhZTktYzI1ZS00YWZjLTk3ZGQtYzEwMjYzMmMyZjBlIiwiZSI6MTc5MTU3ODA0NH0.cSmUMsN7XtGotm-DYMfIrCDsnFXc7aJwQxK26z0X4q8',
      ),
    ).toBe(true);
  });

  it('пропускает готовые файлы приложения', () => {
    expect(isDecorativeUrl('/wallpapers/Yargram-wallpaper-blue.png')).toBe(true);
  });

  it('не пропускает чужой хост, замаскированный под путь', () => {
    // `//evil.com` — это ссылка на чужой сайт, а не наш файл.
    expect(isDecorativeUrl('//evil.com/pic.png')).toBe(false);
  });

  it('не пропускает опасные схемы и просто текст', () => {
    expect(isDecorativeUrl('javascript:alert(1)')).toBe(false);
    expect(isDecorativeUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isDecorativeUrl('просто текст')).toBe(false);
    expect(isDecorativeUrl('example.com/pic.png')).toBe(false);
  });

  it('не спотыкается о пробелы по краям', () => {
    expect(isDecorativeUrl('  https://example.com/pic.png  ')).toBe(true);
    expect(isDecorativeUrl('  /wallpapers/a.png  ')).toBe(true);
  });
});
