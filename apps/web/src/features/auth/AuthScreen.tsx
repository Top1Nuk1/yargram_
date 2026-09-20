import { useMemo, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, Moon, Sun, UserRound } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Logo } from '../../components/Logo';
import { Button, IconButton } from '../../components/ui';
import type { AuthResult, ThemeMode } from '../../types';

interface AuthScreenProps {
  onAuthenticated: (result: AuthResult) => Promise<void> | void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  notice?: string;
}

type AuthMode = 'login' | 'register';

function inputClass(hasError = false) {
  return `h-12 w-full rounded-xl border bg-elevated pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:ring-4 ${
    hasError
      ? 'border-danger/70 focus:border-danger focus:ring-danger/10'
      : 'border-line focus:border-brand/60 focus:ring-brand/10'
  }`;
}

export function AuthScreen({ onAuthenticated, theme, onToggleTheme, notice }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const title = mode === 'login' ? 'С возвращением' : 'Создайте аккаунт';
  const subtitle = mode === 'login' ? 'Войдите, чтобы продолжить общение' : 'Пара минут — и можно писать друзьям';

  const validationError = useMemo(() => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'Введите корректный email';
    if (password.length < 8) return 'Пароль должен содержать не менее 8 символов';
    if (mode === 'register' && displayName.trim().length < 2) return 'Укажите имя длиной не менее 2 символов';
    if (mode === 'register' && username && !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return 'Username: 3–32 символа, латиница, цифры или _';
    }
    return '';
  }, [displayName, email, mode, password, username]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === 'login'
          ? await api.login({ email: email.trim().toLowerCase(), password })
          : await api.register({
              email: email.trim().toLowerCase(),
              password,
              displayName: displayName.trim(),
              ...(username.trim() ? { username: username.trim() } : {}),
            });
      await onAuthenticated(result);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось выполнить вход. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-canvas text-ink">

      <div className="absolute right-4 top-4 z-20 sm:right-7 sm:top-7">
        <IconButton label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </IconButton>
      </div>

      <div className="mx-auto grid min-h-[100dvh] max-w-[460px] items-center px-4 py-20">
        <section className="w-full animate-slide-up rounded-xl border border-line bg-surface p-6 sm:p-8" aria-label="Вход в Yargram">
          <div className="mb-7 flex justify-center">
            <Logo />
          </div>
          <div className="inline-flex rounded-xl bg-canvas/80 p-1" role="tablist" aria-label="Авторизация">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-elevated text-ink shadow-sm' : 'text-muted'}`}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-elevated text-ink shadow-sm' : 'text-muted'}`}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
          </div>

          <h2 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>

          {notice && (
            <div className="mt-5 rounded-xl border border-brand/15 bg-brand-soft/45 px-4 py-3 text-sm text-brand-strong" role="status">
              {notice}
            </div>
          )}

          <form className="mt-7 space-y-4" onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-sm font-semibold text-ink">Имя</label>
                <div className="relative">
                  <UserRound className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                  <input
                    id="displayName"
                    name="displayName"
                    className={inputClass()}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Как вас называть?"
                    autoComplete="name"
                    maxLength={80}
                    required
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-ink">
                  Username <span className="font-normal text-muted">(необязательно)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-base font-bold text-muted" aria-hidden="true">@</span>
                  <input
                    id="username"
                    name="username"
                    className={inputClass()}
                    value={username}
                    onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
                    placeholder="yaroslav"
                    autoComplete="username"
                    maxLength={32}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={inputClass()}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">Пароль</label>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`${inputClass()} pr-12`}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 8 символов"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1.5 grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-danger/20 bg-danger/8 px-4 py-3 text-sm leading-5 text-danger" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" loading={submitting} className="mt-2 w-full">
              {mode === 'login' ? 'Войти в Yargram' : 'Создать аккаунт'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-muted">
            Продолжая, вы соглашаетесь бережно относиться к собеседникам.
          </p>
        </section>
      </div>
    </main>
  );
}
