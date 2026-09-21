/**
 * Имя, которое сервер подставляет вместо настоящего для удалённого и
 * замороженного аккаунта. Замороженные дополнительно присылают isFrozen: true.
 */
export const REMOVED_ACCOUNT_NAME = 'Удалённый аккаунт';

/** Минимальный набор полей аккаунта: его хватает, чтобы понять, что профиля нет. */
export type AccountLike = { id?: string; displayName?: string; isFrozen?: boolean } | null | undefined;

/** Удалённый или замороженный аккаунт: настоящего профиля уже нет. */
export function isRemovedAccount(user: AccountLike, fallbackName?: string): boolean {
  return (user?.displayName ?? fallbackName) === REMOVED_ACCOUNT_NAME;
}

/** Замороженный аккаунт: тот же текст, но со снежинкой слева. */
export function isFrozenAccount(user: AccountLike, fallbackName?: string): boolean {
  return Boolean(user?.isFrozen) && isRemovedAccount(user, fallbackName);
}

/**
 * Пропсы для Avatar. `seed` — id аккаунта: цвет фона считается по нему,
 * иначе у всех «Удалённый аккаунт» был бы один и тот же цвет.
 */
export function avatarProps(
  user: AccountLike,
  fallbackName?: string,
): { seed: string | undefined; placeholder: boolean } {
  return { seed: user?.id, placeholder: isRemovedAccount(user, fallbackName) };
}
