import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, Moon, Sun, UserRound } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Logo } from '../../components/Logo';
import { Button, IconButton } from '../../components/ui';
import { useTranslation } from '../../hooks/useLanguage';
import { nearestImageFamily, variantForMode, yargramImageUrl } from '../../lib/yargramImages';
import type { AuthResult, EmailCodeChallenge, ThemeMode } from '../../types';

interface AuthScreenProps {
  onAuthenticated: (result: AuthResult) => Promise<void> | void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  /**
   * Акцент текущего оформления. По нему выбирается фоновый рисунок: до входа
   * аккаунта ещё нет, но выбранный на устройстве цвет уже известен, и экран
   * входа не выбивается из оформления.
   */
  accent?: string;
  notice?: string;
  /** Показать «вернуться»: экран открыт для добавления второго аккаунта. */
  onCancel?: () => void;
}

type AuthMode = 'login' | 'register' | 'reset';

const CODE_LENGTH = 6;

function inputClass(hasError = false) {
  return `h-12 w-full rounded-xl border bg-elevated pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:ring-4 ${
    hasError
      ? 'border-danger/70 focus:border-danger focus:ring-danger/10'
      : 'border-line focus:border-brand/60 focus:ring-brand/10'
  }`;
}

export function AuthScreen({ onAuthenticated, theme, onToggleTheme, accent, notice, onCancel }: AuthScreenProps) {
  const t = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Второй шаг: сервер прислал код на почту и ждёт его вместо пароля.
  const [challenge, setChallenge] = useState<EmailCodeChallenge | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resent, setResent] = useState(false);

  const codeStep = challenge !== null;

  /**
   * Фоновый рисунок экрана входа. Ближайший из восьми готовых цветов к акценту
   * оформления: рисунок уже нарисован в этих цветах, поэтому «подбор» — это
   * выбор файла, а не перекраска. Палитру берём по режиму темы: у каждой есть
   * светлый и тёмный вариант, и светлый на тёмном экране выглядит серой пеленой.
   */
  const backdrop = useMemo(() => {
    const family = nearestImageFamily(accent ?? '');
    const variant = variantForMode(theme);
    return { id: family.id, variant, url: yargramImageUrl('backdrop', family.id, variant) };
  }, [accent, theme]);

  const title = mode === 'login' ? t('auth.welcomeBack') : mode === 'register' ? t('auth.createAccountTitle') : t('auth.resetTitle');
  const subtitle = mode === 'login' ? t('auth.loginSubtitle') : mode === 'register' ? t('auth.registerSubtitle') : t('auth.resetSubtitle');

  const validationError = useMemo(() => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return t('auth.invalidEmail');
    // Сброс пароля начинается с одной почты: пароль вводим уже по коду.
    if (mode === 'reset') return '';
    if (password.length < 8) return t('auth.shortPassword');
    if (mode === 'register' && displayName.trim().length < 2) return t('auth.shortName');
    if (mode === 'register' && username && !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return t('auth.usernameRule');
    }
    return '';
  }, [displayName, email, mode, password, username, t]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
  }

  /** Возврат с шага кода обратно к форме: прежний код при этом сгорает. */
  function leaveCodeStep() {
    setChallenge(null);
    setCode('');
    setNewPassword('');
    setResent(false);
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
      const normalizedEmail = email.trim().toLowerCase();
      const result =
        mode === 'login'
          ? await api.login({ email: normalizedEmail, password })
          : mode === 'register'
            ? await api.register({
                email: normalizedEmail,
                password,
                displayName: displayName.trim(),
                ...(username.trim() ? { username: username.trim() } : {}),
              })
            : await api.requestPasswordReset(normalizedEmail);
      // Сервер может ответить не токеном, а требованием кода из письма —
      // тогда показываем второй шаг вместо входа.
      if ('status' in result) {
        setChallenge(result);
        setCode('');
        setResent(false);
        return;
      }
      await onAuthenticated(result);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('auth.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmCode(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError('');
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim())) {
      setError(t('auth.codeSixDigits'));
      return;
    }
    if (challenge.purpose === 'reset' && newPassword.length < 8) {
      setError(t('auth.shortPassword'));
      return;
    }

    setSubmitting(true);
    try {
      const result =
        challenge.purpose === 'reset'
          ? await api.resetPassword({ email: challenge.email, code: code.trim(), password: newPassword })
          : await api.confirmCode({ email: challenge.email, code: code.trim(), purpose: challenge.purpose });
      await onAuthenticated(result);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('auth.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!challenge) return;
    setError('');
    setSubmitting(true);
    try {
      const next = await api.resendCode({ email: challenge.email, purpose: challenge.purpose });
      setChallenge(next);
      setCode('');
      setResent(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('auth.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-canvas text-ink">
      {/* Фон-рисунок и мягкая завеса поверх него. Карточка входа непрозрачная,
          поэтому рисунок виден только по краям — там он и должен жить. Палитра
          уже подобрана по теме, так что приглушать её нужно меньше. */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <img
          src={backdrop.url}
          alt=""
          data-auth-backdrop={backdrop.id}
          data-auth-backdrop-variant={backdrop.variant}
          className="h-full w-full object-cover opacity-70 dark:opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/25 via-canvas/55 to-canvas/85" />
      </div>

      <div className="absolute right-4 top-4 z-20 sm:right-7 sm:top-7">
        <IconButton label={theme === 'dark' ? t('auth.toggleLight') : t('auth.toggleDark')} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </IconButton>
      </div>

      <div className="mx-auto grid min-h-[100dvh] max-w-[460px] items-center px-4 py-20">
        <section className="w-full animate-slide-up rounded-xl border border-line bg-surface p-6 sm:p-8" aria-label={t('auth.screenLabel')}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('auth.backToApp')}
            </button>
          )}
          <div className="mb-7 flex justify-center">
            <Logo />
          </div>

          {codeStep && challenge ? (
            <>
              <button
                type="button"
                onClick={leaveCodeStep}
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('auth.codeBack')}
              </button>
              <h2 className="text-2xl font-semibold tracking-tight">
                {challenge.purpose === 'reset' ? t('auth.resetTitle') : t('auth.codeTitle')}
              </h2>
              <p className="mt-2 text-sm text-muted">{t('auth.codeSentHint', { email: challenge.email })}</p>
              <p className="mt-1 text-xs text-muted">
                {t('auth.codeExpires', { minutes: Math.max(1, Math.round(challenge.expiresInSeconds / 60)) })}
              </p>
              {/* Письмо с кодом часто попадает в «Спам», поэтому говорим об этом
                  сразу: иначе человек ждёт и считает, что регистрация сломалась. */}
              <p className="mt-1 text-xs text-muted">{t('auth.codeSpamHint')}</p>
              {/* Незавершённая регистрация живёт ровно столько, сколько действует
                  код: не ввели — аккаунта не будет, и почту с ником можно занять
                  заново. Про это честнее сказать заранее, чем показывать отказ. */}
              {challenge.purpose === 'register' && (
                <p className="mt-1 text-xs text-muted">{t('auth.codeDeadlineHint')}</p>
              )}

              {resent && (
                <div className="mt-5 rounded-xl border border-brand/15 bg-brand-soft/45 px-4 py-3 text-sm text-brand-strong" role="status">
                  {t('auth.codeResent')}
                </div>
              )}

              <form className="mt-7 space-y-4" onSubmit={handleConfirmCode} noValidate>
                <div>
                  <label htmlFor="code" className="mb-1.5 block text-sm font-semibold text-ink">{t('auth.codeLabel')}</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                    <input
                      id="code"
                      name="code"
                      className={`${inputClass()} tracking-[0.4em]`}
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                      placeholder={t('auth.codePlaceholder')}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={CODE_LENGTH}
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {challenge.purpose === 'reset' && (
                  <div>
                    <label htmlFor="newPassword" className="mb-1.5 block text-sm font-semibold text-ink">
                      {t('auth.newPasswordLabel')}
                    </label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                      <input
                        id="newPassword"
                        name="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        className={`${inputClass()} pr-12`}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder={t('auth.passwordPlaceholder')}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1.5 grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-danger/20 bg-danger/8 px-4 py-3 text-sm leading-5 text-danger" role="alert">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={submitting} className="mt-2 w-full">
                  {challenge.purpose === 'reset' ? t('auth.resetConfirm') : t('auth.codeSubmit')}
                </Button>
              </form>

              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={submitting}
                  className="text-sm font-semibold text-brand transition hover:text-brand-strong disabled:opacity-60"
                >
                  {t('auth.codeResend')}
                </button>
              </div>
            </>
          ) : (
            <>
              {mode === 'reset' ? (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-ink"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t('auth.backToLogin')}
                </button>
              ) : (
                <div className="inline-flex rounded-xl bg-canvas/80 p-1" role="tablist" aria-label={t('auth.tablistLabel')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-elevated text-ink shadow-sm' : 'text-muted'}`}
                    onClick={() => switchMode('login')}
                  >
                    {t('auth.loginTab')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'register'}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-elevated text-ink shadow-sm' : 'text-muted'}`}
                    onClick={() => switchMode('register')}
                  >
                    {t('auth.registerTab')}
                  </button>
                </div>
              )}

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
                    <label htmlFor="displayName" className="mb-1.5 block text-sm font-semibold text-ink">{t('auth.nameLabel')}</label>
                    <div className="relative">
                      <UserRound className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                      <input
                        id="displayName"
                        name="displayName"
                        className={inputClass()}
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder={t('auth.namePlaceholder')}
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
                      Username <span className="font-normal text-muted">{t('auth.usernameOptional')}</span>
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

                {mode !== 'reset' && (
                  <div>
                    <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">{t('auth.passwordLabel')}</label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        className={`${inputClass()} pr-12`}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={t('auth.passwordPlaceholder')}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1.5 grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-danger/20 bg-danger/8 px-4 py-3 text-sm leading-5 text-danger" role="alert">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={submitting} className="mt-2 w-full">
                  {mode === 'login' ? t('auth.loginButton') : mode === 'register' ? t('auth.registerButton') : t('auth.resetSubmit')}
                </Button>
              </form>

              {mode === 'login' && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-sm font-semibold text-brand transition hover:text-brand-strong"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              )}

              <p className="mt-6 text-center text-xs leading-5 text-muted">
                {t('auth.terms')}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
