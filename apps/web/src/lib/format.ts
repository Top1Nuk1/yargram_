const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMessageTime(value?: string | null): string {
  const date = safeDate(value);
  return date ? timeFormatter.format(date) : '';
}

export function formatConversationTime(value?: string | null, now = new Date()): string {
  const date = safeDate(value);
  if (!date) return '';

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startToday - startDate) / 86_400_000);

  if (dayDifference === 0) return timeFormatter.format(date);
  if (dayDifference > 0 && dayDifference < 7) return weekdayFormatter.format(date);
  return dateFormatter.format(date);
}

export function formatDayLabel(value?: string | null, now = new Date()): string {
  const date = safeDate(value);
  if (!date) return '';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const difference = Math.round((startToday - startDate) / 86_400_000);
  if (difference === 0) return 'Сегодня';
  if (difference === 1) return 'Вчера';
  return fullDateFormatter.format(date);
}

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Я';
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('ru-RU')).join('');
}
