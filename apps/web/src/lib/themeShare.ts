import { THEME_COLOR_KEYS, sanitizeTheme, type Theme } from './theme';

/**
 * Обмен темами по ссылке.
 *
 * Тема целиком уезжает в саму ссылку (`…/#theme=<код>`), а не на сервер: так
 * обмен работает без хранилища, ссылка не протухает и её не нужно чистить.
 * Код — это base64url от короткого JSON, где цвета лежат массивом в порядке
 * `THEME_COLOR_KEYS`: так строка выходит почти вдвое короче, чем с именами.
 *
 * Фрагмент (`#…`), а не параметр запроса, выбран намеренно: фрагмент не уходит
 * на сервер, поэтому ссылку можно открыть и на другом стенде.
 */

export const SHARE_VERSION = 1;
export const SHARE_HASH_PREFIX = '#theme=';

interface SharedPayload {
  v: number;
  name: string;
  mode: 'light' | 'dark';
  font: string;
  colors: string[];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Идентификатор своей темы. `crypto.randomUUID` в браузере доступен только на
 * защищённом соединении, а приложение живёт на обычном HTTP — поэтому берём
 * случайность попроще: идентификатор нужен лишь чтобы не путать темы между собой.
 */
export function newThemeId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function encodeTheme(theme: Theme): string {
  const payload: SharedPayload = {
    v: SHARE_VERSION,
    name: theme.name,
    mode: theme.mode,
    font: theme.font,
    colors: THEME_COLOR_KEYS.map((key) => theme.colors[key]),
  };
  return toBase64Url(JSON.stringify(payload));
}

/** Разбирает код темы. Чужой payload проверяется так же строго, как свой. */
export function decodeTheme(payload: string): Theme | null {
  let json: string;
  try {
    json = fromBase64Url(payload.trim());
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  if (source.v !== SHARE_VERSION) return null;
  const colors = Array.isArray(source.colors) ? source.colors : [];
  if (colors.length !== THEME_COLOR_KEYS.length) return null;
  const palette: Record<string, string> = {};
  THEME_COLOR_KEYS.forEach((key, index) => {
    const value = colors[index];
    if (typeof value === 'string') palette[key] = value;
  });
  // Идентификатор не берём из ссылки: он принадлежал чужой теме, а нам нужна своя.
  return sanitizeTheme({
    id: newThemeId(),
    name: typeof source.name === 'string' ? source.name : '',
    mode: source.mode,
    font: source.font,
    colors: palette,
  });
}

export function themeShareLink(theme: Theme, origin?: string): string {
  const base = (origin ?? window.location.origin).replace(/\/+$/, '');
  return `${base}/${SHARE_HASH_PREFIX}${encodeTheme(theme)}`;
}

/** Тема из адресной строки, если человек пришёл по ссылке. */
export function readThemeFromHash(hash: string): Theme | null {
  if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
  return decodeTheme(hash.slice(SHARE_HASH_PREFIX.length));
}

/**
 * Достаёт тему из того, что человек вставил в поле: это может быть и целая
 * ссылка, и голый код, и ссылка с лишними параметрами.
 */
export function extractSharedTheme(input: string): Theme | null {
  const text = input.trim();
  if (!text) return null;
  const match = /[#?&]theme=([A-Za-z0-9\-_+/=]+)/.exec(text);
  const payload = match?.[1] ?? (/^[A-Za-z0-9\-_+/=]{16,}$/.test(text) ? text : null);
  if (!payload) return null;
  return decodeTheme(payload);
}

/** Убирает `#theme=…` из адреса, чтобы перезагрузка не спрашивала снова. */
export function clearThemeHash(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.hash || (!window.location.hash.startsWith(SHARE_HASH_PREFIX) && !window.location.hash.includes('theme='))) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

/**
 * Копирует текст в буфер обмена.
 *
 * Приложение открывают по обычному HTTP, а там `navigator.clipboard` браузер не
 * даёт: это защищённый контекст. Поэтому есть запасной путь через скрытое поле —
 * он устаревший, но работает. Если не вышло ни то, ни другое, вызывающий код
 * обязан показать ссылку текстом, чтобы её можно было выделить руками.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Ниже — запасной путь.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '0';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}
