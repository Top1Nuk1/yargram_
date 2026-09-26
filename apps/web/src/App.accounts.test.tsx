import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api/client';
import type { AuthResult, User } from './types';
import type { StoredAccount } from './lib/accounts';

/**
 * Стенд для проверки списка аккаунтов на устройстве. Настоящие экраны входа и
 * переписки заменены кнопками: нам важны только вызовы `onAuthenticated`,
 * `onAddAccount` и `onSwitchAccount` — то есть то, как App ведёт список.
 */
let authPayload: AuthResult | null = null;

vi.mock('./api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api/client')>();
  return { ...original, api: { ...original.api, me: vi.fn() } };
});
vi.mock('./hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('./features/onboarding/OnboardingScreen', () => ({ OnboardingScreen: () => <div>Onboarding</div> }));
vi.mock('./features/auth/AuthScreen', () => ({
  AuthScreen: ({ onAuthenticated }: { onAuthenticated: (result: AuthResult) => void }) => (
    <button type="button" onClick={() => authPayload && onAuthenticated(authPayload)}>
      Войти
    </button>
  ),
}));
vi.mock('./features/messenger/MessengerScreen', () => ({
  MessengerScreen: ({
    accounts,
    currentUser,
    onAddAccount,
    onSwitchAccount,
  }: {
    accounts: StoredAccount[];
    currentUser: User;
    onAddAccount: () => void;
    onSwitchAccount: (token: string) => void;
  }) => (
    <div>
      <span data-testid="current">{currentUser.displayName}</span>
      <span data-testid="accounts">
        {accounts.map((account) => `${account.user.displayName}:${account.token}`).join('|')}
      </span>
      <button type="button" onClick={onAddAccount}>Добавить аккаунт</button>
      {accounts.map((account) => (
        <button key={account.token} type="button" onClick={() => onSwitchAccount(account.token)}>
          {`Открыть ${account.user.displayName}`}
        </button>
      ))}
    </div>
  ),
}));

const tokenKey = 'yargram.accessToken';
const accountsKey = 'yargram.accounts';

function account(token: string, id: string, displayName: string): StoredAccount {
  return { token, user: { id, displayName, username: displayName.toLowerCase() } };
}

beforeEach(() => {
  localStorage.setItem('yargram.onboardingDone', '1');
  localStorage.setItem(accountsKey, JSON.stringify([account('token-a', 'a', 'Алиса')]));
  localStorage.setItem(tokenKey, 'token-a');
  vi.mocked(api.me).mockImplementation((token) =>
    Promise.resolve(
      token === 'token-a'
        ? ({ id: 'a', displayName: 'Алиса' } as User)
        : ({ id: 'b', displayName: 'Борис' } as User),
    ),
  );
  authPayload = null;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('accounts on this device', () => {
  /** Список аккаунтов, как он лежит в хранилище — в порядке добавления. */
  function storedAccounts(): string[] {
    const raw = localStorage.getItem(accountsKey);
    return raw ? (JSON.parse(raw) as StoredAccount[]).map((item) => item.token) : [];
  }

  it('keeps the newer account when switching back to the older one', async () => {
    render(<App />);
    expect(await screen.findByText('Алиса')).toBeInTheDocument();

    // Добавляем второй аккаунт через экран входа.
    fireEvent.click(screen.getByRole('button', { name: 'Добавить аккаунт' }));
    authPayload = {
      accessToken: 'token-b',
      user: { id: 'b', displayName: 'Борис' } as User,
    };
    fireEvent.click(await screen.findByRole('button', { name: 'Войти' }));
    await waitFor(() =>
      expect(screen.getByTestId('accounts').textContent).toBe('Алиса:token-a|Борис:token-b'),
    );
    expect(storedAccounts()).toEqual(['token-a', 'token-b']);

    // Возвращаемся к прежнему аккаунту: новый должен остаться в списке.
    fireEvent.click(screen.getByRole('button', { name: 'Открыть Алиса' }));
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Алиса'));
    expect(screen.getByTestId('accounts').textContent).toBe('Алиса:token-a|Борис:token-b');
    expect(storedAccounts()).toEqual(['token-a', 'token-b']);
  });

  it('survives a reload after switching back and forth', async () => {
    const view = render(<App />);
    expect(await screen.findByText('Алиса')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить аккаунт' }));
    authPayload = { accessToken: 'token-b', user: { id: 'b', displayName: 'Борис' } as User };
    fireEvent.click(await screen.findByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Борис'));

    fireEvent.click(screen.getByRole('button', { name: 'Открыть Алиса' }));
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('Алиса'));

    // Перезагрузка страницы: список читается заново из хранилища.
    view.unmount();
    render(<App />);
    expect(await screen.findByText('Алиса')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('accounts').textContent).toBe('Алиса:token-a|Борис:token-b'),
    );
  });
});
