import { formatMessageTime } from './format';
import { interpolate, type TranslateFn } from './i18n';
import type { User } from '../types';

export interface PresencePayload {
  userId: string;
  online?: boolean;
  isOnline?: boolean;
  lastSeenAt?: User['lastSeenAt'];
  lastSeenStatus?: User['lastSeenStatus'];
}

// Explicit null revokes previously visible precision. Approximate server statuses
// also revoke precision, including when an older payload omits lastSeenAt.
export function mergeUserProfile<T extends Partial<User>>(previous: T, update: Partial<User>): T {
  const next = { ...previous, ...update };
  if (update.lastSeenStatus || update.showLastSeen === false) {
    next.lastSeenAt = null;
    next.online = false;
    next.isOnline = false;
  } else if (update.lastSeenAt !== undefined && update.lastSeenStatus === undefined) {
    next.lastSeenStatus = null;
  }
  return next;
}

/**
 * Человек в сети: только если он не скрывает время и сервер не заменил его
 * приблизительным статусом давности.
 */
export function isUserOnline(
  user: Pick<User, 'isOnline' | 'online' | 'lastSeenStatus' | 'showLastSeen'> | null | undefined,
): boolean {
  return !user?.lastSeenStatus && user?.showLastSeen !== false && Boolean(user?.isOnline ?? user?.online);
}

/**
 * Группа присутствия для списка участников: сначала те, кто в сети, потом
 * недавние с точным временем, дальше — всё более давние.
 */
export type PresenceBucket = 'online' | 'recent' | 'within_week' | 'within_month' | 'long_ago';

/** Порядок групп в списке: сверху те, кто ближе по времени. */
export const presenceBucketOrder: readonly PresenceBucket[] = [
  'online',
  'recent',
  'within_week',
  'within_month',
  'long_ago',
];

/** Ключи подписей групп присутствия — по ним их переводит вызывающий код. */
export const presenceBucketKeys: Record<PresenceBucket, string> = {
  online: 'presence.bucketOnline',
  recent: 'presence.bucketRecent',
  within_week: 'presence.bucketWeek',
  within_month: 'presence.bucketMonth',
  long_ago: 'presence.bucketLongAgo',
};

/** Русские подписи — запасной вариант, когда переводчик не передан. */
export const presenceBucketLabels: Record<PresenceBucket, string> = {
  online: 'В сети',
  recent: 'Недавно',
  within_week: 'На прошлой неделе',
  within_month: 'В прошлом месяце',
  long_ago: 'Давно',
};

/** Подпись группы присутствия на нужном языке (или по-русски без переводчика). */
export function presenceBucketLabel(bucket: PresenceBucket, t?: TranslateFn): string {
  return t ? t(presenceBucketKeys[bucket]) : presenceBucketLabels[bucket];
}

const DAY = 24 * 60 * 60 * 1_000;

export function presenceBucket(user: User | null | undefined, now: number = Date.now()): PresenceBucket {
  if (!user) return 'long_ago';
  if (isUserOnline(user)) return 'online';
  switch (user.lastSeenStatus) {
    case 'recently':
      return 'recent';
    case 'within_week':
      return 'within_week';
    case 'within_month':
      return 'within_month';
    case 'long_ago':
      return 'long_ago';
    default:
      break;
  }
  // Точное время скрыто или его нет — считаем, что человек был давно.
  if (user.showLastSeen === false || !user.lastSeenAt) return 'long_ago';
  const seen = Date.parse(user.lastSeenAt);
  if (Number.isNaN(seen)) return 'long_ago';
  const elapsed = now - seen;
  if (elapsed < 2 * DAY) return 'recent';
  if (elapsed < 7 * DAY) return 'within_week';
  if (elapsed < 30 * DAY) return 'within_month';
  return 'long_ago';
}

/** Сколько времени считается «только что». */
const JUST_NOW = 5 * 60 * 1_000;

/** Подпись «в сети» / «был(а) …» красится: в сети — голубым, иначе серым. */
export function presenceTextClass(user: User | null | undefined): string {
  return isUserOnline(user) ? 'text-brand' : 'text-muted';
}

/**
 * Подпись присутствия: «в сети», «был(а) сегодня в 15:00», «был(а) в прошлом
 * месяце». Одно место для шапки чата и списка участников.
 *
 * Без переводчика остаётся русский текст — так функцию можно звать из мест,
 * где нет доступа к хуку (тесты, утилиты).
 */
export function formatLastSeen(
  user: User | null | undefined,
  t?: TranslateFn,
  now = new Date(),
): string {
  const tr = (key: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : interpolate(RU_LAST_SEEN[key] ?? key, params);
  if (!user) return tr('presence.unknown');
  if (user.lastSeenStatus) {
    return tr(
      {
        recently: 'presence.wasRecently',
        within_week: 'presence.wasWeek',
        within_month: 'presence.wasMonth',
        long_ago: 'presence.wasLongAgo',
      }[user.lastSeenStatus],
    );
  }
  if (user.showLastSeen === false) return tr('presence.wasLongAgo');
  if (isUserOnline(user)) return tr('presence.onlineShort');
  if (!user.lastSeenAt) return tr('presence.wasLongAgo');
  const seen = new Date(user.lastSeenAt);
  if (Number.isNaN(seen.getTime())) return tr('presence.wasLongAgo');

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startSeen = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = formatMessageTime(user.lastSeenAt);
  // Совсем недавно время не называем: «был(а) только что» понятнее.
  if (now.getTime() - seen.getTime() < JUST_NOW) return tr('presence.wasJustNow');
  if (startSeen.getTime() === startToday.getTime()) return tr('presence.wasTodayAt', { time });
  if (startSeen.getTime() === yesterday.getTime()) return tr('presence.wasYesterdayAt', { time });
  // Дату форматируем по правилам языка интерфейса, а «Был(а) … в …» — из словаря.
  const date = new Intl.DateTimeFormat(localeOf(t), {
    day: 'numeric',
    month: 'long',
    ...(seen.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(seen);
  return tr('presence.wasDateAt', { date, time });
}

/** Локаль для даты. Переводчик помечен своим языком, иначе — русская. */
function localeOf(t?: TranslateFn): string {
  const language = (t as { language?: string } | undefined)?.language;
  return language === 'en' ? 'en-GB' : language === 'bg' ? 'bg-BG' : 'ru-RU';
}

/** Русские подписи присутствия — фолбэк, когда переводчик не передан. */
const RU_LAST_SEEN: Record<string, string> = {
  'presence.unknown': 'Статус неизвестен',
  'presence.onlineShort': 'В сети',
  'presence.wasRecently': 'Был(а) недавно',
  'presence.wasWeek': 'Был(а) на прошлой неделе',
  'presence.wasMonth': 'Был(а) в прошлом месяце',
  'presence.wasLongAgo': 'Был(а) давно',
  'presence.wasJustNow': 'Был(а) только что',
  'presence.wasTodayAt': 'Был(а) в {time}',
  'presence.wasYesterdayAt': 'Был(а) вчера в {time}',
  'presence.wasDateAt': 'Был(а) {date} в {time}',
};

export function updateUserPresence(user: User, payload: PresencePayload): User {
  if (user.id !== payload.userId) return user;
  const update: Partial<User> = {};
  if (payload.isOnline !== undefined || payload.online !== undefined) {
    update.online = update.isOnline = payload.isOnline ?? payload.online;
  }
  if (payload.lastSeenAt !== undefined) update.lastSeenAt = payload.lastSeenAt;
  if (payload.lastSeenStatus !== undefined) update.lastSeenStatus = payload.lastSeenStatus;
  return mergeUserProfile(user, update);
}
