import { describe, expect, it } from 'vitest';
import { REMOVED_ACCOUNT_NAME, avatarProps, isFrozenAccount, isRemovedAccount } from './user';
import { avatarColor } from '../components/ui';

describe('удалённые и замороженные аккаунты', () => {
  it('узнаёт удалённый и замороженный аккаунт по имени', () => {
    expect(isRemovedAccount({ id: 'a', displayName: REMOVED_ACCOUNT_NAME })).toBe(true);
    expect(isRemovedAccount({ id: 'a', displayName: 'Алиса' })).toBe(false);
    expect(isRemovedAccount(null, 'Удалённый аккаунт')).toBe(true);
    expect(isRemovedAccount(undefined)).toBe(false);
  });

  it('снежинку показывает только замороженным', () => {
    expect(isFrozenAccount({ id: 'a', displayName: REMOVED_ACCOUNT_NAME, isFrozen: true })).toBe(true);
    expect(isFrozenAccount({ id: 'a', displayName: REMOVED_ACCOUNT_NAME, isFrozen: false })).toBe(false);
    expect(isFrozenAccount({ id: 'a', displayName: REMOVED_ACCOUNT_NAME })).toBe(false);
  });

  it('помечает снежинкой и самого замороженного, который видит своё имя', () => {
    // Себе сервер отдаёт настоящий профиль, поэтому значок нельзя привязывать
    // к имени заглушки — иначе замороженный не увидел бы пометку у себя.
    expect(isFrozenAccount({ id: 'a', displayName: 'Алиса', isFrozen: true })).toBe(true);
    expect(isFrozenAccount({ id: 'a', displayName: 'Алиса' })).toBe(false);
  });

  it('отдаёт в аватар силуэт и seed из id аккаунта', () => {
    expect(avatarProps({ id: 'a', displayName: REMOVED_ACCOUNT_NAME })).toEqual({
      seed: 'a',
      placeholder: true,
    });
    expect(avatarProps({ id: 'b', displayName: 'Алиса' })).toEqual({ seed: 'b', placeholder: false });
  });
});

describe('avatarColor', () => {
  it('красит одинаковые имена по-разному, если id разные', () => {
    const first = avatarColor('11111111-1111-4111-8111-111111111111');
    const second = avatarColor('22222222-2222-4222-8222-222222222222');
    const third = avatarColor('33333333-3333-4333-8333-333333333333');
    const colors = new Set([first, second, third]);
    expect(colors.size).toBeGreaterThan(1);
  });

  it('одинаковый аккаунт всегда одного цвета', () => {
    const seed = '0f6c9a1e-5b2d-4f88-9a01-77c4e2b5d001';
    expect(avatarColor(seed)).toBe(avatarColor(seed));
    expect(avatarColor(seed)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
