import { tokenizeText } from './linkify';

export type InlineStyle = 'bold' | 'italic' | 'strike' | 'underline' | 'code';

export interface FormattedInline {
  type: 'text' | 'link' | InlineStyle;
  value: string;
  href?: string;
}

export interface FormattedBlock {
  type: 'paragraph' | 'quote' | 'codeblock';
  inlines: FormattedInline[];
}

/**
 * Регулярное выражение для инлайн-стилей:
 * - ```code block``` (в строке)
 * - `code`
 * - **bold**
 * - *italic*
 * - ~~strike~~
 * - __underline__
 */
const INLINE_REGEX = /(```[\s\S]*?```|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|__[^_\n]+__)/g;

/**
 * Разбивает текстовую строку на инлайн-токены форматирования и ссылки.
 */
export function parseInlines(text: string): FormattedInline[] {
  if (!text) return [];

  // Сначала разбиваем на ссылки и обычный текст через tokenizeText
  const linkTokens = tokenizeText(text);
  const result: FormattedInline[] = [];

  for (const token of linkTokens) {
    if (token.type === 'link') {
      result.push({ type: 'link', value: token.value, href: token.href });
      continue;
    }

    // Для обычного текста разбираем Markdown-стили
    const subText = token.value;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    INLINE_REGEX.lastIndex = 0;

    while ((match = INLINE_REGEX.exec(subText)) !== null) {
      const matchIndex = match.index;
      const rawMatch = match[0];

      if (matchIndex > lastIndex) {
        result.push({ type: 'text', value: subText.slice(lastIndex, matchIndex) });
      }

      if (rawMatch.startsWith('```') && rawMatch.endsWith('```')) {
        result.push({ type: 'code', value: rawMatch.slice(3, -3) });
      } else if (rawMatch.startsWith('`') && rawMatch.endsWith('`')) {
        result.push({ type: 'code', value: rawMatch.slice(1, -1) });
      } else if (rawMatch.startsWith('**') && rawMatch.endsWith('**')) {
        result.push({ type: 'bold', value: rawMatch.slice(2, -2) });
      } else if (rawMatch.startsWith('~~') && rawMatch.endsWith('~~')) {
        result.push({ type: 'strike', value: rawMatch.slice(2, -2) });
      } else if (rawMatch.startsWith('__') && rawMatch.endsWith('__')) {
        result.push({ type: 'underline', value: rawMatch.slice(2, -2) });
      } else if (rawMatch.startsWith('*') && rawMatch.endsWith('*')) {
        result.push({ type: 'italic', value: rawMatch.slice(1, -1) });
      } else {
        result.push({ type: 'text', value: rawMatch });
      }

      lastIndex = matchIndex + rawMatch.length;
    }

    if (lastIndex < subText.length) {
      result.push({ type: 'text', value: subText.slice(lastIndex) });
    }
  }

  return result;
}

/**
 * Разбирает сообщение на блоки: цитаты (> ...), блоки кода (```...```) и параграфы.
 */
export function parseFormattedMessage(text: string): FormattedBlock[] {
  if (!text) return [];

  // 1. Проверяем многострочные блоки кода ``` ... ```
  if (text.includes('```')) {
    const blocks: FormattedBlock[] = [];
    const parts = text.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('```') && part.endsWith('```')) {
        const codeContent = part.slice(3, -3).replace(/^\n+|\n+$/g, '');
        blocks.push({
          type: 'codeblock',
          inlines: [{ type: 'code', value: codeContent }],
        });
      } else {
        blocks.push(...parseLines(part));
      }
    }
    return blocks;
  }

  return parseLines(text);
}

function parseLines(raw: string): FormattedBlock[] {
  const lines = raw.split('\n');
  const blocks: FormattedBlock[] = [];
  let currentQuoteLines: string[] = [];
  let currentParagraphLines: string[] = [];

  const flushQuote = () => {
    if (currentQuoteLines.length > 0) {
      blocks.push({
        type: 'quote',
        inlines: parseInlines(currentQuoteLines.join('\n')),
      });
      currentQuoteLines = [];
    }
  };

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        inlines: parseInlines(currentParagraphLines.join('\n')),
      });
      currentParagraphLines = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('> ') || line === '>') {
      flushParagraph();
      currentQuoteLines.push(line.startsWith('> ') ? line.slice(2) : '');
    } else {
      flushQuote();
      currentParagraphLines.push(line);
    }
  }

  flushQuote();
  flushParagraph();

  return blocks;
}

export interface FormatApplyResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export type FormatType = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'quote';

/**
 * Применяет или снимает форматирование с выделенного текста в поле ввода сообщения.
 */
export function applyFormatting(
  text: string,
  start: number,
  end: number,
  format: FormatType,
): FormatApplyResult {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));

  if (format === 'quote') {
    if (safeStart === safeEnd) {
      const lineStart = text.lastIndexOf('\n', safeStart - 1) + 1;
      const nextNewline = text.indexOf('\n', safeStart);
      const lineEnd = nextNewline === -1 ? text.length : nextNewline;
      const line = text.slice(lineStart, lineEnd);

      if (line.startsWith('> ')) {
        const nextText = text.slice(0, lineStart) + line.slice(2) + text.slice(lineEnd);
        const newCursor = Math.max(lineStart, safeStart - 2);
        return { text: nextText, selectionStart: newCursor, selectionEnd: newCursor };
      } else {
        const nextText = text.slice(0, lineStart) + '> ' + line + text.slice(lineEnd);
        const newCursor = safeStart + 2;
        return { text: nextText, selectionStart: newCursor, selectionEnd: newCursor };
      }
    }

    const selected = text.slice(safeStart, safeEnd);
    const lines = selected.split('\n');
    const allQuoted = lines.every((line) => line.startsWith('> ') || line === '>');

    if (allQuoted) {
      const unquoted = lines.map((l) => (l.startsWith('> ') ? l.slice(2) : l === '>' ? '' : l)).join('\n');
      const nextText = text.slice(0, safeStart) + unquoted + text.slice(safeEnd);
      return { text: nextText, selectionStart: safeStart, selectionEnd: safeStart + unquoted.length };
    } else {
      const quoted = lines.map((l) => `> ${l}`).join('\n');
      const nextText = text.slice(0, safeStart) + quoted + text.slice(safeEnd);
      return { text: nextText, selectionStart: safeStart, selectionEnd: safeStart + quoted.length };
    }
  }

  const tagMap: Record<Exclude<FormatType, 'quote'>, string> = {
    bold: '**',
    italic: '*',
    underline: '__',
    strike: '~~',
    code: '`',
  };

  const tag = tagMap[format];

  // Пустое выделение: вставляем пару тегов и ставим курсор между ними
  if (safeStart === safeEnd) {
    const beforeTag = text.slice(Math.max(0, safeStart - tag.length), safeStart);
    const afterTag = text.slice(safeStart, safeStart + tag.length);
    if (beforeTag === tag && afterTag === tag) {
      const nextText = text.slice(0, safeStart - tag.length) + text.slice(safeStart + tag.length);
      const newPos = safeStart - tag.length;
      return { text: nextText, selectionStart: newPos, selectionEnd: newPos };
    }

    const nextText = text.slice(0, safeStart) + tag + tag + text.slice(safeStart);
    const newPos = safeStart + tag.length;
    return { text: nextText, selectionStart: newPos, selectionEnd: newPos };
  }

  const selected = text.slice(safeStart, safeEnd);

  // Если само выделение уже обрамлено тегами
  if (selected.length >= tag.length * 2 && selected.startsWith(tag) && selected.endsWith(tag)) {
    const inner = selected.slice(tag.length, -tag.length);
    const nextText = text.slice(0, safeStart) + inner + text.slice(safeEnd);
    return { text: nextText, selectionStart: safeStart, selectionEnd: safeStart + inner.length };
  }

  // Если теги находятся снаружи выделения
  const outerBefore = text.slice(Math.max(0, safeStart - tag.length), safeStart);
  const outerAfter = text.slice(safeEnd, safeEnd + tag.length);
  if (outerBefore === tag && outerAfter === tag) {
    const nextText = text.slice(0, safeStart - tag.length) + selected + text.slice(safeEnd + tag.length);
    const newStart = safeStart - tag.length;
    return { text: nextText, selectionStart: newStart, selectionEnd: newStart + selected.length };
  }

  // Обычное обрамление выделенного текста
  const wrapped = tag + selected + tag;
  const nextText = text.slice(0, safeStart) + wrapped + text.slice(safeEnd);
  return { text: nextText, selectionStart: safeStart + tag.length, selectionEnd: safeEnd + tag.length };
}
