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

/**
 * Замороженный аккаунт помечается снежинкой. Проверяем только флаг, а не имя:
 * у себя в профиле замороженный видит настоящее имя, аватар и описание —
 * снежинка ему нужна как пометка, а собеседникам сервер и так отдаёт заглушку
 * «Удалённый аккаунт» с тем же флагом.
 */
export function isFrozenAccount(user: AccountLike): boolean {
  return Boolean(user?.isFrozen);
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
