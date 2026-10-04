import { describe, expect, it } from 'vitest';
import {
  accountLimit,
  accountSubtitle,
  canAddAccount,
  removeAccountByToken,
  upsertAccount,
  type StoredAccount,
} from './accounts';
import type { User } from '../types';

const account = (token: string, user: Partial<User> & { id: string }): StoredAccount => ({
  token,
  user: { displayName: 'Алиса', ...user } as User,
});

describe('accountSubtitle', () => {
  it('показывает ник, почту или название приложения', () => {
    expect(accountSubtitle(account('t', { id: 'a', username: 'alice' }))).toBe('@alice');
    expect(accountSubtitle(account('t', { id: 'a', email: 'a@example.test' }))).toBe(
      'a@example.test',
    );
    expect(accountSubtitle(account('t', { id: 'a' }))).toBe('Yargram');
  });

  it('помечает замороженный аккаунт прямо в переключателе', () => {
    expect(accountSubtitle(account('t', { id: 'a', username: 'alice', isFrozen: true }))).toBe(
      '@alice · заморожен',
    );
  });
});

describe('upsertAccount', () => {
  it('не плодит дубли при повторном входе по тому же токену или id', () => {
    const first = account('token-1', { id: 'a', displayName: 'Алиса' });
    const byToken = upsertAccount([first], account('token-1', { id: 'a', displayName: 'Алиса Б.' }));
    expect(byToken).toHaveLength(1);
    expect(byToken[0]!.user.displayName).toBe('Алиса Б.');

    const byId = upsertAccount([first], account('token-2', { id: 'a', displayName: 'Алиса' }));
    expect(byId).toHaveLength(1);
    expect(byId[0]!.token).toBe('token-2');
  });

  it('убирает аккаунт по токену, оставляя остальные', () => {
    const accounts = [account('token-1', { id: 'a' }), account('token-2', { id: 'b' })];
    expect(removeAccountByToken(accounts, 'token-1').map((item) => item.token)).toEqual([
      'token-2',
    ]);
  });
});

describe('accountLimit', () => {
  /** Три обычных аккаунта — предел устройства по умолчанию. */
  const plain = (count: number) =>
    Array.from({ length: count }, (_, index) => account(`token-${index}`, { id: `user-${index}` }));

  it('пускает обычному человеку три аккаунта и не больше', () => {
    expect(accountLimit([])).toBe(3);
    expect(canAddAccount(plain(2))).toBe(true);
    expect(accountLimit(plain(3))).toBe(3);
    expect(canAddAccount(plain(3))).toBe(false);
  });

  it('поднимает предел до четырёх при значке «Yargram» или галочке', () => {
    const badged = plain(3);
    badged[0] = account('token-0', { id: 'user-0', badge: 'yargram' });
    expect(accountLimit(badged)).toBe(4);
    expect(canAddAccount(badged)).toBe(true);
    // Четыре аккаунта — предел и для отмеченного устройства.
    expect(canAddAccount([...badged, account('token-3', { id: 'user-3' })])).toBe(false);

    const verified = plain(3);
    verified[0] = account('token-0', { id: 'user-0', isVerified: true });
    expect(accountLimit(verified)).toBe(4);
  });

  it('владельцу счёт не ведёт', () => {
    const accounts = plain(8);
    accounts[0] = account('token-0', { id: 'user-0', isOwner: true });
    expect(accountLimit(accounts)).toBe(Number.POSITIVE_INFINITY);
    expect(canAddAccount(accounts)).toBe(true);
  });
});
