import { describe, expect, it } from 'vitest';
import { accountSubtitle, removeAccountByToken, upsertAccount, type StoredAccount } from './accounts';
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
