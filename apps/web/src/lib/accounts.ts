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

/** Список аккаунтов на устройстве. Битые записи молча отбрасываем. */
export function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAccount);
  } catch {
    return [];
  }
}

export function writeAccounts(accounts: StoredAccount[]): void {
  try {
    if (accounts.length === 0) localStorage.removeItem(ACCOUNTS_KEY);
    else localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Приватный режим браузера — просто не сохраняем список.
  }
}

/**
 * Добавляет аккаунт или обновляет уже сохранённый. Совпадение ищем по токену
 * и по id пользователя: при повторном входе токен новый, а аккаунт тот же.
 */
export function upsertAccount(accounts: StoredAccount[], account: StoredAccount): StoredAccount[] {
  const index = accounts.findIndex(
    (item) => item.token === account.token || item.user.id === account.user.id,
  );
  if (index === -1) return [...accounts, account];
  const next = accounts.slice();
  next[index] = account;
  return next;
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
