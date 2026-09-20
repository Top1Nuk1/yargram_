import { describe, expect, it } from 'vitest';
import { mergeUserProfile, updateUserPresence } from './presence';
import { formatLastSeen, isUserOnline } from '../features/messenger/messengerUtils';
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
    expect(formatLastSeen(at(2026, 4, 14), now)).toBe('Был(а) сегодня в 09:05');
    expect(formatLastSeen(at(2026, 4, 13), now)).toBe('Был(а) вчера в 09:05');
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
