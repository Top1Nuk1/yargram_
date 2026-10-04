import { describe, expect, it } from 'vitest';
import {
  formatConversationTime,
  formatDayLabel,
  formatMessageTime,
  formatShortDate,
  initials,
  plural,
  safeDate,
} from './format';
import { LANGUAGES, LANGUAGE_LOCALES } from './i18n';

describe('formatShortDate', () => {
  it('пишет дату на языке интерфейса, а не всегда по-русски', () => {
    const value = '2026-01-02T10:00:00.000Z';
    // Без локали — русский по умолчанию: так звали прежние вызовы.
    expect(formatShortDate(value)).toContain('январ');
    // Английский месяц появляется только при явной локали — иначе поле
    // «заходил» оставалось бы русским на всех языках интерфейса.
    expect(formatShortDate(value, 'en-US')).toContain('January');
    expect(formatShortDate(value, 'en-US')).not.toContain('январ');
  });

  it('для каждого языка интерфейса есть своя локаль', () => {
    // Новый язык без строки в LANGUAGE_LOCALES молча получил бы русские даты.
    for (const language of LANGUAGES) {
      expect(LANGUAGE_LOCALES[language]).toBeTruthy();
    }
  });

  it('пустое и битое значение дают пустую строку', () => {
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate('не дата')).toBe('');
  });
});

describe('plural', () => {
  it('склоняет по числу', () => {
    expect(plural(1, ['файл', 'файла', 'файлов'])).toBe('файл');
    expect(plural(2, ['файл', 'файла', 'файлов'])).toBe('файла');
    expect(plural(5, ['файл', 'файла', 'файлов'])).toBe('файлов');
  });

  it('не ошибается на 11–14 и на большие числа', () => {
    expect(plural(11, ['файл', 'файла', 'файлов'])).toBe('файлов');
    expect(plural(21, ['файл', 'файла', 'файлов'])).toBe('файл');
    expect(plural(114, ['файл', 'файла', 'файлов'])).toBe('файлов');
    expect(plural(0, ['файл', 'файла', 'файлов'])).toBe('файлов');
  });
});

const now = new Date('2026-09-21T12:00:00');

describe('safeDate', () => {
  it('returns null for empty and broken values', () => {
    expect(safeDate(null)).toBeNull();
    expect(safeDate('')).toBeNull();
    expect(safeDate('not-a-date')).toBeNull();
  });

  it('parses a real value', () => {
    expect(safeDate('2026-09-21T10:00:00')?.getFullYear()).toBe(2026);
  });
});

describe('formatDayLabel', () => {
  it('names today and yesterday', () => {
    expect(formatDayLabel('2026-09-21T09:00:00', now)).toBe('Сегодня');
    expect(formatDayLabel('2026-09-20T23:59:00', now)).toBe('Вчера');
  });

  it('falls back to the full date', () => {
    const label = formatDayLabel('2026-09-15T09:00:00', now);
    expect(label).toContain('2026');
    expect(label).toMatch(/сентябр/);
  });

  it('returns an empty string without a date', () => {
    expect(formatDayLabel(null, now)).toBe('');
  });
});

describe('formatConversationTime', () => {
  it('shows the clock time for today', () => {
    expect(formatConversationTime('2026-09-21T09:05:00', now)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows the weekday within the last week', () => {
    const label = formatConversationTime('2026-09-18T09:05:00', now);
    expect(label).not.toContain(':');
    expect(label.trim()).not.toBe('');
  });

  it('shows the date for older conversations', () => {
    const label = formatConversationTime('2026-08-01T09:05:00', now);
    expect(label).not.toContain(':');
    expect(label).toMatch(/\d/);
  });
});

describe('formatMessageTime', () => {
  it('formats hours and minutes', () => {
    expect(formatMessageTime('2026-09-21T09:05:00')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns an empty string for a broken value', () => {
    expect(formatMessageTime('nonsense')).toBe('');
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Алиса Борисовна')).toBe('АБ');
    expect(initials('алиса')).toBe('А');
  });

  it('falls back to "Я" for an empty name', () => {
    expect(initials('')).toBe('Я');
    expect(initials(null)).toBe('Я');
  });
});
