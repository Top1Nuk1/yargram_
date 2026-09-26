import { plural } from '../../lib/format';

/** Месяцы в родительном падеже — как их показывает Telegram. */
export const MONTH_NAMES = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Годы от текущего и вниз — день рождения не бывает в будущем. */
export const BIRTHDAY_YEARS = Array.from(
  { length: 120 },
  (_, index) => new Date().getFullYear() - index,
);

export type BirthdayParts = { day: string; month: string; year: string };

export const EMPTY_BIRTHDAY: BirthdayParts = { day: '', month: '', year: '' };

/** Разбирает сохранённую дату (YYYY-MM-DD или MM-DD) на части для трёх списков. */
export function parseBirthday(value: string | null | undefined): BirthdayParts {
  const match = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return { ...EMPTY_BIRTHDAY };
  return {
    // Год необязателен: MM-DD означает «год не показываем».
    year: match[1] ? String(Number(match[1])) : '',
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

/**
 * Собирает дату: «YYYY-MM-DD», а без года — «MM-DD». Год необязателен, чтобы
 * день рождения можно было показать, не раскрывая возраст. Если не выбраны
 * день или месяц — null, и сервер сотрёт поле.
 */
export function composeBirthday(day: string, month: string, year: string): string | null {
  if (!day || !month) return null;
  const monthAndDay = `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return year ? `${year}-${monthAndDay}` : monthAndDay;
}

/** Сколько дней в месяце; без выбранного месяца считаем 31. */
export function daysInMonth(month: string, year: string): number {
  const m = Number(month);
  const y = Number(year || 2000);
  if (!m) return 31;
  return new Date(y, m, 0).getDate();
}

/** «1 ноября 2010», а без года — просто «1 ноября». */
export function formatBirthday(value: string | null | undefined): string {
  const parts = parseBirthday(value);
  if (!parts.day || !parts.month) return '';
  const monthName = MONTH_NAMES[Number(parts.month) - 1];
  return parts.year ? `${parts.day} ${monthName} ${parts.year}` : `${parts.day} ${monthName}`;
}

/** Возраст по дате; null, если год не указан или даты нет. */
export function ageFromBirthday(value: string | null | undefined): number | null {
  const parts = parseBirthday(value);
  if (!parts.day || !parts.month || !parts.year) return null;
  const today = new Date();
  let age = today.getFullYear() - Number(parts.year);
  const monthDiff = today.getMonth() + 1 - Number(parts.month);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < Number(parts.day))) age -= 1;
  return age >= 0 ? age : null;
}

/** Русское склонение для «N лет»: 1 год, 2–4 года, 5–20 лет (кроме 11–14). */
export function pluralYears(n: number): string {
  return plural(n, ['год', 'года', 'лет']);
}
