import { formatMessageTime } from './format';
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

export const presenceBucketLabels: Record<PresenceBucket, string> = {
  online: 'В сети',
  recent: 'Недавно',
  within_week: 'На прошлой неделе',
  within_month: 'В прошлом месяце',
  long_ago: 'Давно',
};

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

/**
 * Подпись присутствия: «в сети», «был(а) сегодня в 15:00», «был(а) в прошлом
 * месяце». Одно место для шапки чата и списка участников.
 */
export function formatLastSeen(user: User | null | undefined, now = new Date()): string {
  if (!user) return 'Статус неизвестен';
  if (user.lastSeenStatus) {
    return {
      recently: 'Был(а) недавно',
      within_week: 'Был(а) на прошлой неделе',
      within_month: 'Был(а) в прошлом месяце',
      long_ago: 'Был(а) давно',
    }[user.lastSeenStatus];
  }
  if (user.showLastSeen === false) return 'Был(а) давно';
  if (isUserOnline(user)) return 'В сети';
  if (!user.lastSeenAt) return 'Был(а) давно';
  const seen = new Date(user.lastSeenAt);
  if (Number.isNaN(seen.getTime())) return 'Был(а) давно';

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startSeen = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = formatMessageTime(user.lastSeenAt);
  if (startSeen.getTime() === startToday.getTime()) return `Был(а) сегодня в ${time}`;
  if (startSeen.getTime() === yesterday.getTime()) return `Был(а) вчера в ${time}`;
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(seen.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(seen);
  return `Был(а) ${date} в ${time}`;
}

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
