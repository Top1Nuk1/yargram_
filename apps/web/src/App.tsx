import { useEffect, useState } from 'react';
import { api, ApiError } from './api/client';
import { Logo } from './components/Logo';
import { Button, Spinner } from './components/ui';
import { AuthScreen } from './features/auth/AuthScreen';
import { MessengerScreen } from './features/messenger/MessengerScreen';
import { useTheme } from './hooks/useTheme';
import type { AuthResult, User } from './types';

const TOKEN_KEY = 'yargram.accessToken';

function readStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)?.trim();
  return token || null;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(Boolean(token));
  const [notice, setNotice] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);

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
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
          setNotice('Сессия завершилась. Войдите снова.');
          return;
        }
        setNotice('Не удалось подключиться к серверу. Проверьте Radmin VPN и повторите попытку.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBooting(false);
      });

    return () => controller.abort();
  }, [token, user, connectionAttempt]);

  async function handleAuthenticated(result: AuthResult) {
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    setToken(result.accessToken);
    setNotice('');
    if (result.user) {
      setUser(result.user);
      setBooting(false);
      return;
    }
    setUser(null);
    setBooting(true);
    setConnectionAttempt((attempt) => attempt + 1);
  }

  function handleLogout(sessionExpired = false) {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setNotice(sessionExpired ? 'Сессия завершилась. Войдите снова.' : 'Вы вышли из аккаунта.');
  }

  if (booting) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas text-ink">
        <div className="animate-fade-in text-center" role="status" aria-live="polite">
          <Logo />
          <Spinner className="mx-auto mt-7 h-7 w-7 text-brand" />
          <p className="mt-3 text-sm text-muted">Подключаемся к Yargram…</p>
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
            Повторить подключение
          </Button>
          <Button variant="ghost" className="mt-3" onClick={() => handleLogout()}>
            Выйти из аккаунта
          </Button>
        </div>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        theme={theme}
        onToggleTheme={toggleTheme}
        notice={notice}
      />
    );
  }

  return (
    <MessengerScreen
      token={token}
      currentUser={user}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
      onUserUpdated={setUser}
    />
  );
}
