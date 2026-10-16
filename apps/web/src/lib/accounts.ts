import type { User } from '../types';

/** Аккаунт, сохранённый на этом устройстве: токен доступа и его профиль. */
export interface StoredAccount {
  token: string;
  user: User;
}

const ACCOUNTS_KEY = 'yargram.accounts';
/** Ключ активного токена. Не меняем: на него опирается восстановление сессии. */
export const ACTIVE_TOKEN_KEY = 'yargram.accessToken';
const ONBOARDING_KEY = 'yargram.onboardingDone';

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<StoredAccount>;
  return (
    typeof account.token === 'string' &&
    account.token.length > 0 &&
    Boolean(account.user) &&
    typeof account.user === 'object' &&
    typeof (account.user as User).id === 'string'
  );
}

/**
 * Очищает список аккаунтов от дубликатов.
 * В списке не должно быть двух записей с одним и тем же пользователем (user.id)
 * или одним и тем же токеном.
 */
export function deduplicateAccounts(
  accounts: StoredAccount[],
  preferredToken?: string | null,
): StoredAccount[] {
  const seenUserIds = new Set<string>();
  const seenTokens = new Set<string>();
  const result: StoredAccount[] = [];

  // Если указан preferredToken (например, текущий активный токен),
  // рассматриваем его первым, чтобы при совпадении user.id остался именно он.
  const ordered = preferredToken
    ? [...accounts].sort((a, b) =>
        a.token === preferredToken ? -1 : b.token === preferredToken ? 1 : 0,
      )
    : accounts;

  for (const item of ordered) {
    if (!item?.user?.id || !item?.token) continue;
    if (seenUserIds.has(item.user.id) || seenTokens.has(item.token)) continue;
    seenUserIds.add(item.user.id);
    seenTokens.add(item.token);
    result.push(item);
  }

  return result;
}

/** Список аккаунтов на устройстве. Битые записи и дубликаты молча отбрасываем. */
export function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(isStoredAccount);
    const activeToken = readActiveToken();
    const clean = deduplicateAccounts(valid, activeToken);
    // Если в хранилище были дубли — сразу вычищаем их из localStorage
    if (clean.length !== valid.length) {
      writeAccounts(clean);
    }
    return clean;
  } catch {
    return [];
  }
}

export function writeAccounts(accounts: StoredAccount[]): void {
  try {
    const clean = deduplicateAccounts(accounts);
    if (clean.length === 0) localStorage.removeItem(ACCOUNTS_KEY);
    else localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(clean));
  } catch {
    // Приватный режим браузера — просто не сохраняем список.
  }
}

/**
 * Добавляет аккаунт или обновляет уже сохранённый. Совпадение ищем по токену
 * и по id пользователя: при повторном входе токен новый, а аккаунт тот же.
 * Гарантирует отсутствие дублей в списке.
 */
export function upsertAccount(accounts: StoredAccount[], account: StoredAccount): StoredAccount[] {
  // Убираем любые существующие записи с тем же id пользователя или тем же токеном
  const remaining = accounts.filter(
    (item) => item.token !== account.token && item.user.id !== account.user.id,
  );
  return deduplicateAccounts([...remaining, account], account.token);
}

export function removeAccountByToken(accounts: StoredAccount[], token: string): StoredAccount[] {
  return accounts.filter((item) => item.token !== token);
}

export function readActiveToken(): string | null {
  try {
    const token = localStorage.getItem(ACTIVE_TOKEN_KEY)?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function writeActiveToken(token: string): void {
  try {
    localStorage.setItem(ACTIVE_TOKEN_KEY, token);
  } catch {
    // Игнорируем недоступное хранилище.
  }
}

export function clearActiveToken(): void {
  try {
    localStorage.removeItem(ACTIVE_TOKEN_KEY);
  } catch {
    // Игнорируем недоступное хранилище.
  }
}

/** Показывался ли первый экран-знакомство на этом устройстве. */
export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // Игнорируем недоступное хранилище.
  }
}

/** Подпись аккаунта в переключателе: @ник, если он есть, иначе почта или id. */
export function accountSubtitle(account: StoredAccount): string {
  const base = account.user.username
    ? `@${account.user.username}`
    : (account.user.email ?? 'Yargram');
  // Замороженный аккаунт помечаем прямо в списке: по нему видно, что внутри
  // доступен только просмотр.
  return account.user.isFrozen ? `${base} · заморожен` : base;
}

/** Сколько аккаунтов помещается на устройство обычному человеку. */
export const DEFAULT_ACCOUNT_LIMIT = 3;
/** Предел, когда среди аккаунтов устройства есть значок «Yargram» или галочка. */
export const MARKED_ACCOUNT_LIMIT = 4;

/**
 * Сколько аккаунтов разрешено держать на этом устройстве.
 *
 * Считаем по уже сохранённым аккаунтам: обычному человеку — три, чтобы было
 * что переключать. Значок «Yargram» или галочка хотя бы на одном из них
 * поднимают предел до четырёх, а владельцу счёт не ведём вовсе.
 *
 * Проверка живёт на клиенте: устройство серверу не известно, и предела на
 * число сессий у него нет. Это правило интерфейса, а не защита — токены
 * по-прежнему выдаются всем.
 */
export function accountLimit(accounts: StoredAccount[]): number {
  if (accounts.some((account) => account.user.isOwner)) return Number.POSITIVE_INFINITY;
  if (accounts.some((account) => Boolean(account.user.badge) || account.user.isVerified)) {
    return MARKED_ACCOUNT_LIMIT;
  }
  return DEFAULT_ACCOUNT_LIMIT;
}

/** Поместится ли на устройство ещё один аккаунт. */
export function canAddAccount(accounts: StoredAccount[]): boolean {
  return accounts.length < accountLimit(accounts);
}
