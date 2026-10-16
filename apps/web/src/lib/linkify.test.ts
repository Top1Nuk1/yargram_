import { describe, expect, it } from 'vitest';
import { cleanUrl, formatHref, tokenizeText } from './linkify';

describe('linkify', () => {
  it('отделяет знаки препинания от адреса', () => {
    expect(cleanUrl('https://example.com.')).toEqual({ url: 'https://example.com', trailing: '.' });
    expect(cleanUrl('https://example.com,')).toEqual({ url: 'https://example.com', trailing: ',' });
    expect(cleanUrl('https://example.com!')).toEqual({ url: 'https://example.com', trailing: '!' });
    expect(cleanUrl('https://example.com?')).toEqual({ url: 'https://example.com', trailing: '?' });
    expect(cleanUrl('https://example.com;')).toEqual({ url: 'https://example.com', trailing: ';' });
    expect(cleanUrl('https://example.com:')).toEqual({ url: 'https://example.com', trailing: ':' });
    expect(cleanUrl('https://example.com)')).toEqual({ url: 'https://example.com', trailing: ')' });
    expect(cleanUrl('https://en.wikipedia.org/wiki/Portal_(video_game)')).toEqual({
      url: 'https://en.wikipedia.org/wiki/Portal_(video_game)',
      trailing: '',
    });
  });

  it('формирует корректный href', () => {
    expect(formatHref('https://yargram.site/app')).toBe('https://yargram.site/app');
    expect(formatHref('http://example.com')).toBe('http://example.com');
    expect(formatHref('www.youtube.com')).toBe('https://www.youtube.com');
    expect(formatHref('google.com')).toBe('https://google.com');
    expect(formatHref('t.me/durov')).toBe('https://t.me/durov');
    expect(formatHref('support@yargram.site')).toBe('mailto:support@yargram.site');
  });

  it('разбивает текст со ссылками на токены', () => {
    const text = 'Привет, смотри https://yargram.site/app, а также google.com и www.ya.ru!';
    const tokens = tokenizeText(text);

    expect(tokens).toEqual([
      { type: 'text', value: 'Привет, смотри ' },
      { type: 'link', value: 'https://yargram.site/app', href: 'https://yargram.site/app' },
      { type: 'text', value: ', а также ' },
      { type: 'link', value: 'google.com', href: 'https://google.com' },
      { type: 'text', value: ' и ' },
      { type: 'link', value: 'www.ya.ru', href: 'https://www.ya.ru' },
      { type: 'text', value: '!' },
    ]);
  });

  it('не ломает текст без ссылок', () => {
    expect(tokenizeText('Просто обычный текст без ссылок')).toEqual([
      { type: 'text', value: 'Просто обычный текст без ссылок' },
    ]);
    expect(tokenizeText('')).toEqual([]);
  });

  it('не принимает версии за ссылки', () => {
    expect(tokenizeText('Вышла версия 1.2.3 программы')).toEqual([
      { type: 'text', value: 'Вышла версия 1.2.3 программы' },
    ]);
  });
});
