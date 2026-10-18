import { describe, expect, it } from 'vitest';
import { applyFormatting, parseFormattedMessage, parseInlines } from './formatting';

describe('formatting', () => {
  describe('parseInlines', () => {
    it('parses plain text without styles', () => {
      const res = parseInlines('Привет, как дела?');
      expect(res).toEqual([{ type: 'text', value: 'Привет, как дела?' }]);
    });

    it('parses bold text', () => {
      const res = parseInlines('Это **важный** текст');
      expect(res).toEqual([
        { type: 'text', value: 'Это ' },
        { type: 'bold', value: 'важный' },
        { type: 'text', value: ' текст' },
      ]);
    });

    it('parses italic text', () => {
      const res = parseInlines('Это *курсив* здесь');
      expect(res).toEqual([
        { type: 'text', value: 'Это ' },
        { type: 'italic', value: 'курсив' },
        { type: 'text', value: ' здесь' },
      ]);
    });

    it('parses strikethrough and underline', () => {
      const res = parseInlines('~~старое~~ и __новое__');
      expect(res).toEqual([
        { type: 'strike', value: 'старое' },
        { type: 'text', value: ' и ' },
        { type: 'underline', value: 'новое' },
      ]);
    });

    it('parses inline code', () => {
      const res = parseInlines('Выполни `npm run build` сейчас');
      expect(res).toEqual([
        { type: 'text', value: 'Выполни ' },
        { type: 'code', value: 'npm run build' },
        { type: 'text', value: ' сейчас' },
      ]);
    });

    it('preserves links alongside formatting', () => {
      const res = parseInlines('Смотри **ссылку**: https://yargram.site');
      expect(res).toEqual([
        { type: 'text', value: 'Смотри ' },
        { type: 'bold', value: 'ссылку' },
        { type: 'text', value: ': ' },
        { type: 'link', value: 'https://yargram.site', href: 'https://yargram.site' },
      ]);
    });
  });

  describe('parseFormattedMessage', () => {
    it('parses quotes starting with > ', () => {
      const text = 'Обычный текст\n> Это цитата собеседника\nОтвет на цитату';
      const blocks = parseFormattedMessage(text);
      expect(blocks).toHaveLength(3);
      expect(blocks[0]?.type).toBe('paragraph');
      expect(blocks[1]?.type).toBe('quote');
      expect(blocks[1]?.inlines).toEqual([{ type: 'text', value: 'Это цитата собеседника' }]);
      expect(blocks[2]?.type).toBe('paragraph');
    });

    it('parses multiline code blocks', () => {
      const text = 'Пример кода:\n```\nconst a = 10;\nconsole.log(a);\n```';
      const blocks = parseFormattedMessage(text);
      expect(blocks).toHaveLength(2);
      expect(blocks[1]?.type).toBe('codeblock');
      expect(blocks[1]?.inlines[0]?.value).toBe('const a = 10;\nconsole.log(a);');
    });
  });

  describe('applyFormatting', () => {
    it('wraps selected text with bold markdown', () => {
      const result = applyFormatting('hello world', 0, 5, 'bold');
      expect(result.text).toBe('**hello** world');
      expect(result.selectionStart).toBe(2);
      expect(result.selectionEnd).toBe(7);
    });

    it('unwraps already bold text when selection includes tags', () => {
      const result = applyFormatting('**hello** world', 0, 9, 'bold');
      expect(result.text).toBe('hello world');
      expect(result.selectionStart).toBe(0);
      expect(result.selectionEnd).toBe(5);
    });

    it('unwraps bold text when selection is inside tags', () => {
      const result = applyFormatting('**hello** world', 2, 7, 'bold');
      expect(result.text).toBe('hello world');
      expect(result.selectionStart).toBe(0);
      expect(result.selectionEnd).toBe(5);
    });

    it('inserts tags and places cursor in between when nothing is selected', () => {
      const result = applyFormatting('hello ', 6, 6, 'italic');
      expect(result.text).toBe('hello **');
      expect(result.selectionStart).toBe(7);
      expect(result.selectionEnd).toBe(7);
    });

    it('toggles quote on line with empty selection', () => {
      const addQuote = applyFormatting('hello world', 3, 3, 'quote');
      expect(addQuote.text).toBe('> hello world');

      const removeQuote = applyFormatting('> hello world', 5, 5, 'quote');
      expect(removeQuote.text).toBe('hello world');
    });

    it('quotes multi-line selection', () => {
      const result = applyFormatting('line1\nline2', 0, 11, 'quote');
      expect(result.text).toBe('> line1\n> line2');
    });
  });
});

