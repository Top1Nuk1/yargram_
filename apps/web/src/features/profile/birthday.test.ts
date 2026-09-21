import { describe, expect, it } from 'vitest';
import { composeBirthday, daysInMonth, parseBirthday } from './birthday';

/**
 * Редактор дня рождения — три списка «день / месяц / год» вместо нативного
 * <input type="date">. Тесты фиксируют разбор, сборку и длину месяца.
 */
describe('birthday editor', () => {
  it('parses a stored YYYY-MM-DD date into select parts', () => {
    expect(parseBirthday('2010-11-01')).toEqual({ year: '2010', month: '11', day: '1' });
    // Ведущие нули не должны превращаться в восьмеричные числа.
    expect(parseBirthday('2001-03-04')).toEqual({ year: '2001', month: '3', day: '4' });
  });

  it('returns empty parts for a missing or malformed date', () => {
    expect(parseBirthday('')).toEqual({ year: '', month: '', day: '' });
    expect(parseBirthday('01.11.2010')).toEqual({ year: '', month: '', day: '' });
    expect(parseBirthday('2010-11')).toEqual({ year: '', month: '', day: '' });
  });

  it('composes a padded date only when all three parts are chosen', () => {
    expect(composeBirthday('1', '11', '2010')).toBe('2010-11-01');
    expect(composeBirthday('31', '12', '1999')).toBe('1999-12-31');
    // Неполный выбор — null, сервер сотрёт поле.
    expect(composeBirthday('', '11', '2010')).toBeNull();
    expect(composeBirthday('1', '', '2010')).toBeNull();
    expect(composeBirthday('1', '11', '')).toBeNull();
    expect(composeBirthday('', '', '')).toBeNull();
  });

  it('round-trips through parse and compose', () => {
    const date = '2010-11-01';
    const parts = parseBirthday(date);
    expect(composeBirthday(parts.day, parts.month, parts.year)).toBe(date);
  });

  it('knows how many days each month has, including leap February', () => {
    expect(daysInMonth('1', '2024')).toBe(31);
    expect(daysInMonth('4', '2024')).toBe(30);
    expect(daysInMonth('2', '2024')).toBe(29); // високосный
    expect(daysInMonth('2', '2023')).toBe(28);
    expect(daysInMonth('2', '2000')).toBe(29); // делится на 400
    expect(daysInMonth('2', '1900')).toBe(28); // делится на 100, но не на 400
  });

  it('falls back to 31 days when the month is not chosen yet', () => {
    expect(daysInMonth('', '2024')).toBe(31);
  });
});
