import { describe, expect, it } from 'vitest';
import {
  formatLastSeen,
  isUserOnline,
  mergeUserProfile,
  presenceBucket,
  presenceBucketLabels,
  presenceBucketOrder,
  presenceTextClass,
  updateUserPresence,
} from './presence';
import type { User } from '../types';

const user: User = { id: 'peer', displayName: 'Peer', lastSeenAt: '2026-05-14T10:00:00Z', online: true };

describe('presence privacy', () => {
  it('replaces stale timestamps with explicit null', () => {
    expect(updateUserPresence(user, { userId: 'peer', online: false, lastSeenAt: null }).lastSeenAt).toBeNull();
  });
  it('clears precision and online flags on approximate profile and presence updates', () => {
    const profile = mergeUserProfile(user, { lastSeenStatus: 'within_week' });
    const presence = updateUserPresence(user, { userId: 'peer', lastSeenStatus: 'within_week' });
    for (const updated of [profile, presence]) {
      expect(updated).toMatchObject({ lastSeenAt: null, lastSeenStatus: 'within_week', online: false, isOnline: false });
      expect(formatLastSeen(updated)).toBe('Был(а) на прошлой неделе');
    }
  });
  it('removes an old approximation when exact timestamps resume without a status', () => {
    const updated = updateUserPresence({ ...user, lastSeenStatus: 'recently' }, { userId: 'peer', lastSeenAt: user.lastSeenAt, online: false });
    expect(updated.lastSeenStatus).toBeNull();
  });
  it('preserves status in partial updates and leaves unrelated users alone', () => {
    expect(updateUserPresence({ ...user, lastSeenStatus: 'recently', lastSeenAt: null }, { userId: 'peer', online: false }).lastSeenStatus).toBe('recently');
    expect(updateUserPresence(user, { userId: 'other', lastSeenAt: null })).toBe(user);
  });
});

describe('last seen in the viewer device timezone', () => {
  const now = new Date(2026, 4, 14, 12, 0);
  const at = (year: number, month: number, day: number) => ({ ...user, online: false, lastSeenAt: new Date(year, month, day, 9, 5).toISOString() });
  it('shows local today and yesterday with time', () => {
    // Сегодня «сегодня» не пишем: «Был(а) в 09:05» короче и понятнее.
    expect(formatLastSeen(at(2026, 4, 14), now)).toBe('Был(а) в 09:05');
    expect(formatLastSeen(at(2026, 4, 13), now)).toBe('Был(а) вчера в 09:05');
  });
  it('says «только что» вместо времени, если видели минуту назад', () => {
    const now = new Date(2026, 4, 14, 12, 0);
    const minuteAgo = { ...user, online: false, lastSeenAt: new Date(2026, 4, 14, 11, 59).toISOString() };
    const tenMinutesAgo = { ...user, online: false, lastSeenAt: new Date(2026, 4, 14, 11, 50).toISOString() };
    expect(formatLastSeen(minuteAgo, now)).toBe('Был(а) только что');
    expect(formatLastSeen(tenMinutesAgo, now)).toBe('Был(а) в 11:50');
  });
  it('красит подпись: в сети голубым, иначе серым', () => {
    expect(presenceTextClass({ ...user, online: true, isOnline: true })).toBe('text-brand');
    expect(presenceTextClass({ ...user, online: false, isOnline: false })).toBe('text-muted');
    // Кто скрыл время, в сети не показывается — подпись серая.
    expect(presenceTextClass({ ...user, online: true, showLastSeen: false })).toBe('text-muted');
  });
  it('shows numeric day, full month, time, and year for previous years', () => {
    expect(formatLastSeen(at(2026, 4, 12), now)).toBe('Был(а) 12 мая в 09:05');
    expect(formatLastSeen(at(2025, 11, 31), now)).toMatch(/^Был\(а\) 31 декабря 2025.* в 09:05$/);
  });
  it.each([
    ['recently', 'Был(а) недавно'], ['within_week', 'Был(а) на прошлой неделе'],
    ['within_month', 'Был(а) в прошлом месяце'], ['long_ago', 'Был(а) давно'],
  ] as const)('uses server category %s even if stale precise data exists', (lastSeenStatus, expected) => {
    const hidden = { ...user, lastSeenStatus };
    expect(formatLastSeen(hidden, now)).toBe(expected);
    expect(isUserOnline(hidden)).toBe(false);
  });
  it('handles missing and invalid timestamps', () => {
    expect(formatLastSeen({ ...user, online: false, lastSeenAt: 'invalid' })).toBe('Был(а) давно');
    expect(formatLastSeen(null)).toBe('Статус неизвестен');
  });
});

describe('группы присутствия для списка участников', () => {
  const now = Date.parse('2026-09-24T16:00:00.000Z');
  const at = (id: string, patch: Partial<User>) =>
    ({ id, displayName: id, ...patch }) as User;

  it('сверху те, кто в сети, потом недавние с точным временем, ниже давние', () => {
    expect(presenceBucket(at('a', { isOnline: true }), now)).toBe('online');
    expect(presenceBucket(at('b', { lastSeenAt: '2026-09-24T15:00:00.000Z' }), now)).toBe('recent');
    expect(presenceBucket(at('c', { lastSeenAt: '2026-09-23T15:00:00.000Z' }), now)).toBe('recent');
    expect(presenceBucket(at('d', { lastSeenAt: '2026-09-21T15:00:00.000Z' }), now)).toBe('within_week');
    expect(presenceBucket(at('e', { lastSeenAt: '2026-09-05T15:00:00.000Z' }), now)).toBe('within_month');
    expect(presenceBucket(at('f', { lastSeenAt: '2026-06-05T15:00:00.000Z' }), now)).toBe('long_ago');
  });

  it('приблизительный статус важнее точного времени, а скрытое время — давно', () => {
    expect(presenceBucket(at('a', { lastSeenStatus: 'recently', lastSeenAt: null }), now)).toBe('recent');
    expect(presenceBucket(at('b', { lastSeenStatus: 'within_month', lastSeenAt: null }), now)).toBe('within_month');
    expect(presenceBucket(at('c', { showLastSeen: false, lastSeenAt: '2026-09-24T15:00:00.000Z' }), now)).toBe('long_ago');
    expect(presenceBucket(at('d', { lastSeenAt: null }), now)).toBe('long_ago');
    expect(presenceBucket(at('e', { lastSeenAt: 'не дата' }), now)).toBe('long_ago');
    expect(presenceBucket(null, now)).toBe('long_ago');
  });

  it('в сети не показывается тому, кто скрыл время или отдал только давность', () => {
    expect(presenceBucket(at('a', { isOnline: true, lastSeenStatus: 'within_week' }), now)).toBe('within_week');
    expect(presenceBucket(at('b', { isOnline: true, showLastSeen: false }), now)).toBe('long_ago');
  });

  it('порядок групп и подписи заданы явно', () => {
    expect(presenceBucketOrder).toEqual(['online', 'recent', 'within_week', 'within_month', 'long_ago']);
    expect(presenceBucketLabels.online).toBe('В сети');
    expect(presenceBucketLabels.recent).toBe('Недавно');
    expect(presenceBucketLabels.long_ago).toBe('Давно');
  });
});
