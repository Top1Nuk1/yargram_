export type TextToken =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const URL_OR_EMAIL_REGEX =
  /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|ru|org|net|site|app|io|me|dev|рф|ua|by|kz|info|biz|tv|online|space|xyz|edu|gov|su|cc|to)(?:\/[^\s<]*)?)/gi;

/**
 * Отделяет от ссылки знаки препинания, стоящие в конце предложения
 * (точки, запятые, скобки и т. д.), чтобы ссылка открывалась чисто.
 */
export function cleanUrl(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = '';
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (['.', ',', '!', '?', ';', ':', '"', "'", '»', '«', '>', '}', '`'].includes(last!)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
    } else if (last === ')') {
      const open = (url.match(/\(/g) || []).length;
      const close = (url.match(/\)/g) || []).length;
      if (close > open) {
        trailing = last + trailing;
        url = url.slice(0, -1);
      } else {
        break;
      }
    } else if (last === ']') {
      const open = (url.match(/\[/g) || []).length;
      const close = (url.match(/\]/g) || []).length;
      if (close > open) {
        trailing = last + trailing;
        url = url.slice(0, -1);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return { url, trailing };
}

/**
 * Нормализует адрес для href. Ссылкам без протокола добавляет https://,
 * адресам почты — mailto:.
 */
export function formatHref(url: string): string {
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i.test(url)) {
    return `mailto:${url}`;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

/**
 * Разбивает строку на текстовые фрагменты и ссылки.
 */
export function tokenizeText(text: string): TextToken[] {
  if (!text) return [];
  const tokens: TextToken[] = [];
  let lastIndex = 0;

  URL_OR_EMAIL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = URL_OR_EMAIL_REGEX.exec(text)) !== null) {
    const matchStart = match.index;
    const matchRaw = match[0];
    const { url } = cleanUrl(matchRaw);

    if (!url) {
      continue;
    }

    if (matchStart > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, matchStart) });
    }

    tokens.push({
      type: 'link',
      value: url,
      href: formatHref(url),
    });

    lastIndex = matchStart + url.length;
    URL_OR_EMAIL_REGEX.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}
