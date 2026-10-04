import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api/client';
import { Logo } from './components/Logo';
import { Button, Spinner } from './components/ui';
import { AuthScreen } from './features/auth/AuthScreen';
import { MessengerScreen } from './features/messenger/MessengerScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { useTheme } from './hooks/useTheme';
import { useLanguage } from './hooks/useLanguage';
import {
  clearActiveToken,
  isOnboardingDone,
  markOnboardingDone,
  readAccounts,
  readActiveToken,
  removeAccountByToken,
  upsertAccount,
  writeAccounts,
  writeActiveToken,
  type StoredAccount,
} from './lib/accounts';
import type { AuthResult, User } from './types';

export default function App() {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<StoredAccount[]>(readAccounts);
  const [token, setToken] = useState<string | null>(readActiveToken);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(Boolean(token));
  const [notice, setNotice] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [onboardingDone, setOnboardingDone] = useState(isOnboardingDone);
  // Режим добавления второго аккаунта: показываем вход, не теряя текущую сессию.
  const [addingAccount, setAddingAccount] = useState(false);

  // Тема зависит от акцента в профиле, поэтому объявлена после user: до входа
  // акцент неизвестен, и тема работает на встроенных цветах. Набор тем — свой
  // на каждый аккаунт устройства, поэтому передаём и владельца: переключение
  // аккаунта перечитывает хранилище.
  const themeControls = useTheme(user?.themeColor, user?.id);
  const { theme, toggleTheme } = themeControls;

  // Список аккаунтов нужен внутри асинхронных обработчиков — держим актуальную копию.
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  function persistAccounts(next: StoredAccount[]) {
    writeAccounts(next);
    setAccounts(next);
  }

  /** Делает аккаунт активным и просит профиль заново. */
  function activateAccount(nextToken: string | null, message = '') {
    setNotice(message);
    setUser(null);
    if (nextToken) {
      writeActiveToken(nextToken);
      setToken(nextToken);
      setBooting(true);
    } else {
      clearActiveToken();
      setToken(null);
      setBooting(false);
    }
  }

  useEffect(() => {
    if (!token || user) {
      setBooting(false);
      return undefined;
    }

    const controller = new AbortController();
    setBooting(true);
    api
      .me(token, controller.signal)
      .then((currentUser) => {
        if (controller.signal.aborted) return;
        setUser(currentUser);
        setNotice('');
        persistAccounts(upsertAccount(accountsRef.current, { token, user: currentUser }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          const remaining = removeAccountByToken(accountsRef.current, token);
          persistAccounts(remaining);
          // Если на устройстве есть другой аккаунт — переключаемся на него,
          // иначе возвращаемся ко входу.
          activateAccount(
            remaining[0]?.token ?? null,
            remaining.length > 0
              ? t('app.accountUnavailable')
              : t('app.sessionExpired'),
          );
          return;
        }
        setNotice(t('app.serverUnreachable'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBooting(false);
      });

    return () => controller.abort();
  }, [token, user, connectionAttempt, t]);

  async function handleAuthenticated(result: AuthResult) {
    const nextToken = result.accessToken;
    writeActiveToken(nextToken);
    setToken(nextToken);
    setNotice('');
    setAddingAccount(false);
    if (result.user) {
      setUser(result.user);
      setBooting(false);
      persistAccounts(upsertAccount(accountsRef.current, { token: nextToken, user: result.user }));
      return;
    }
    setUser(null);
    setBooting(true);
    setConnectionAttempt((attempt) => attempt + 1);
  }

  /** Выход: аккаунт убираем с устройства и переходим к следующему, если он есть. */
  function handleLogout(sessionExpired = false) {
    const current = token;
    const remaining = current ? removeAccountByToken(accountsRef.current, current) : accountsRef.current;
    persistAccounts(remaining);
    setAddingAccount(false);
    if (remaining.length > 0) {
      activateAccount(remaining[0]!.token, t('app.loggedOut'));
      return;
    }
    activateAccount(null, sessionExpired ? t('app.sessionExpired') : t('app.loggedOut'));
  }

  function handleSwitchAccount(nextToken: string) {
    if (nextToken === token) return;
    activateAccount(nextToken);
  }

  function handleOnboardingDone() {
    markOnboardingDone();
    setOnboardingDone(true);
  }

  /**
   * Профиль обновился (в том числе пришла пометка о заморозке) — держим его и
   * в списке аккаунтов на устройстве, иначе переключатель покажет старое.
   * Мемоизирован: на этой функции висит подписка на сокет.
   */
  const handleUserUpdated = useCallback(
    (next: User) => {
      setUser(next);
      if (!token) return;
      const merged = upsertAccount(accountsRef.current, { token, user: next });
      writeAccounts(merged);
      setAccounts(merged);
    },
    [token],
  );

  if (booting) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas text-ink">
        <div className="animate-fade-in text-center" role="status" aria-live="polite">
          <Logo />
          <Spinner className="mx-auto mt-7 h-7 w-7 text-brand" />
          <p className="mt-3 text-sm text-muted">{t('app.connecting')}</p>
        </div>
      </main>
    );
  }

  if (token && !user) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas p-6 text-ink">
        <div className="max-w-md text-center">
          <Logo />
          <p className="my-6 text-sm text-muted" role="alert">{notice}</p>
          <Button onClick={() => {
            setBooting(true);
            setConnectionAttempt((attempt) => attempt + 1);
          }}>
            {t('app.retryConnection')}
          </Button>
          <Button variant="ghost" className="mt-3" onClick={() => handleLogout()}>
            {t('app.logout')}
          </Button>
        </div>
      </main>
    );
  }

  if (addingAccount) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        theme={theme}
        onToggleTheme={toggleTheme}
        accent={themeControls.activeTheme.colors.brand}
        notice={t('app.addAccountNotice')}
        onCancel={() => setAddingAccount(false)}
      />
    );
  }

  if (!token || !user) {
    if (!onboardingDone && accounts.length === 0) {
      return <OnboardingScreen theme={theme} onToggleTheme={toggleTheme} onDone={handleOnboardingDone} />;
    }
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        theme={theme}
        onToggleTheme={toggleTheme}
        accent={themeControls.activeTheme.colors.brand}
        notice={notice}
      />
    );
  }

  return (
    <MessengerScreen
      key={token}
      token={token}
      currentUser={user}
      theme={theme}
      onToggleTheme={toggleTheme}
      themeControls={themeControls}
      onLogout={handleLogout}
      onUserUpdated={handleUserUpdated}
      accounts={accounts}
      onSwitchAccount={handleSwitchAccount}
      onAddAccount={() => setAddingAccount(true)}
      onRemoveAccount={(accountToken) => {
        const remaining = removeAccountByToken(accountsRef.current, accountToken);
        persistAccounts(remaining);
        if (accountToken === token) {
          activateAccount(remaining[0]?.token ?? null, t('app.loggedOut'));
        }
      }}
    />
  );
}
