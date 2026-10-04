import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES, THEME_COLOR_KEYS, type Theme } from './theme';
import {
  SHARE_HASH_PREFIX,
  clearThemeHash,
  copyText,
  decodeTheme,
  encodeTheme,
  extractSharedTheme,
  newThemeId,
  readThemeFromHash,
  themeShareLink,
} from './themeShare';

const LIGHT = BUILT_IN_THEMES[0]!;

const THEME: Theme = {
  id: 'custom-1',
  name: 'Закат',
  mode: 'dark',
  font: 'serif',
  colors: { ...LIGHT.colors, chatBg: '#101820' },
};

/**
 * Сборщик кодов для проверок «а что если в ссылке лежит вот это». Кодирование
 * тут своё: тесты должны уметь собрать испорченный код, а `encodeTheme` всегда
 * отдаёт только правильный.
 */
function toCode(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromCode(code: string): Record<string, unknown> {
  const normalized = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('newThemeId', () => {
  it('не повторяется и помечен как своя тема', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newThemeId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.startsWith('custom-')).toBe(true);
  });
});

describe('encodeTheme / decodeTheme', () => {
  it('тема переживает дорогу туда и обратно', () => {
    const restored = decodeTheme(encodeTheme(THEME));
    expect(restored).not.toBeNull();
    expect(restored?.name).toBe('Закат');
    expect(restored?.mode).toBe('dark');
    expect(restored?.font).toBe('serif');
    expect(restored?.colors).toEqual(THEME.colors);
  });

  it('чужой идентификатор не приезжает вместе с темой', () => {
    const restored = decodeTheme(encodeTheme(THEME));
    expect(restored?.id).not.toBe('custom-1');
    expect(restored?.id?.startsWith('custom-')).toBe(true);
  });

  it('код короткий и без символов, которые ломают адрес', () => {
    const code = encodeTheme(THEME);
    expect(code).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(code.length).toBeLessThan(400);
  });

  it('одинаковые темы дают одинаковый код', () => {
    expect(encodeTheme(THEME)).toBe(encodeTheme(THEME));
  });

  it('отказывается от мусора вместо темы', () => {
    expect(decodeTheme('')).toBeNull();
    expect(decodeTheme('не base64 !!!')).toBeNull();
    expect(decodeTheme(btoa('not json at all'))).toBeNull();
    expect(decodeTheme(btoa('[]'))).toBeNull();
  });

  it('отказывается от чужой версии формата', () => {
    const payload = fromCode(encodeTheme(THEME));
    payload.v = 99;
    expect(decodeTheme(toCode(payload))).toBeNull();
  });

  it('отказывается от неполной палитры', () => {
    const payload = fromCode(encodeTheme(THEME));
    payload.colors = (payload.colors as string[]).slice(0, THEME_COLOR_KEYS.length - 1);
    expect(decodeTheme(toCode(payload))).toBeNull();
  });

  it('отказывается, если вместо цвета в палитре лежит ерунда', () => {
    const payload = fromCode(encodeTheme(THEME));
    (payload.colors as string[])[3] = 'очень тёмный';
    expect(decodeTheme(toCode(payload))).toBeNull();
  });
});

describe('themeShareLink', () => {
  it('складывает тему во фрагмент адреса', () => {
    const link = themeShareLink(THEME, 'http://26.53.76.128:3000');
    expect(link.startsWith(`http://26.53.76.128:3000/${SHARE_HASH_PREFIX}`)).toBe(true);
    const code = link.slice(link.indexOf(SHARE_HASH_PREFIX) + SHARE_HASH_PREFIX.length);
    expect(decodeTheme(code)?.name).toBe('Закат');
  });

  it('не оставляет двойной слэш, если адрес кончается слэшем', () => {
    expect(themeShareLink(THEME, 'http://localhost:3000/')).toContain('://localhost:3000/#theme=');
  });

  it('полученную ссылку можно разобрать обратно', () => {
    expect(extractSharedTheme(themeShareLink(THEME, 'https://example.com'))?.name).toBe('Закат');
  });
});

describe('readThemeFromHash', () => {
  it('читает тему из адреса, по которому пришёл человек', () => {
    const hash = `${SHARE_HASH_PREFIX}${encodeTheme(THEME)}`;
    expect(readThemeFromHash(hash)?.name).toBe('Закат');
  });

  it('молчит, если в адресе нет темы', () => {
    expect(readThemeFromHash('')).toBeNull();
    expect(readThemeFromHash('#chat=42')).toBeNull();
    expect(readThemeFromHash(`${SHARE_HASH_PREFIX}мусор`)).toBeNull();
  });
});

describe('extractSharedTheme', () => {
  it('понимает целую ссылку', () => {
    expect(extractSharedTheme(themeShareLink(THEME, 'https://example.com'))?.name).toBe('Закат');
  });

  it('понимает голый код', () => {
    expect(extractSharedTheme(encodeTheme(THEME))?.name).toBe('Закат');
  });

  it('понимает адрес с параметрами и пробелами вокруг', () => {
    const link = `  https://example.com/?ref=telegram${SHARE_HASH_PREFIX}${encodeTheme(THEME)}  `;
    expect(extractSharedTheme(link)?.name).toBe('Закат');
  });

  it('отказывается от того, что не похоже на тему', () => {
    expect(extractSharedTheme('')).toBeNull();
    expect(extractSharedTheme('   ')).toBeNull();
    expect(extractSharedTheme('привет')).toBeNull();
    expect(extractSharedTheme('https://example.com/')).toBeNull();
    expect(extractSharedTheme('#theme=')).toBeNull();
  });
});

describe('clearThemeHash', () => {
  it('убирает тему из адреса, сохраняя остальной путь', () => {
    window.history.replaceState(null, '', `/chats?tab=all${SHARE_HASH_PREFIX}${encodeTheme(THEME)}`);
    expect(window.location.hash).not.toBe('');

    clearThemeHash();

    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/chats');
    expect(window.location.search).toBe('?tab=all');
  });

  it('не трогает адрес, в котором нет темы', () => {
    window.history.replaceState(null, '', '/chats#chat=42');
    clearThemeHash();
    expect(window.location.hash).toBe('#chat=42');
  });
});

describe('copyText', () => {
  it('отчитывается о неудаче, а не падает: на HTTP буфер недоступен', async () => {
    // jsdom не умеет ни clipboard, ни execCommand — вызывающий код обязан
    // показать ссылку текстом, поэтому важен именно `false`, а не исключение.
    expect(await copyText('https://example.com/#theme=abc')).toBe(false);
  });
});
