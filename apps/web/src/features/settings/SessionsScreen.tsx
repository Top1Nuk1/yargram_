import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Globe, Pencil, ShieldCheck, X } from 'lucide-react';
import { api, setStoredDeviceName } from '../../api/client';
import { useTranslation } from '../../hooks/useLanguage';
import { formatDayLabel, formatMessageTime } from '../../lib/format';
import type { Session, SessionOverview, User } from '../../types';

/**
 * Сроки автозавершения: через сколько дней бездействия сеанс закрывается сам.
 * `null` — никогда, как и требует Telegram-подобный переключатель.
 */
export const AUTO_TERMINATE_OPTIONS: Array<{ value: string; days: number | null }> = [
  { value: 'never', days: null },
  { value: '7', days: 7 },
  { value: '30', days: 30 },
  { value: '90', days: 90 },
  { value: '180', days: 180 },
];

interface SessionsScreenProps {
  token: string;
  user: User;
  /** Сохранить срок автозавершения. Токен и api экрану не нужны — как и в
   *  «Конфиденциальности», сохранение пробрасывает мессенджер. */
  onAutoTerminateChange: (days: number | null) => Promise<void>;
  /**
   * Стрелка «назад»: вернуться на экран, откуда пришли (список настроек).
   * Не задана — стрелка работает как закрытие.
   */
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Экран «Активные сеансы».
 *
 * Yargram — сайт, поэтому сеанс описывают парой «сайт + браузер»: человек
 * видит, откуда именно он вошёл, и закрывает только этот вход. Чужие сеансы
 * можно завершать не сразу, а через сутки после своего входа: если пароль
 * попал в чужие руки, у владельца есть день, чтобы всё увидеть и закрыть вход.
 */
export function SessionsScreen({ token, user, onAutoTerminateChange, onBack, onClose }: SessionsScreenProps) {
  const t = useTranslation();
  const [overview, setOverview] = useState<SessionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autoTerminateDays, setAutoTerminateDays] = useState<number | null>(
    user.sessionAutoTerminateDays ?? null,
  );
  const [renamingSession, setRenamingSession] = useState<Session | null>(null);
  const [renameName, setRenameName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await api.sessions(token));
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t('sessions.failed'));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (renamingSession) {
          setRenamingSession(null);
        } else {
          (onBack ?? onClose)();
        }
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onBack, onClose, renamingSession]);

  function startRename(session: Session) {
    if (!session.current) return;
    setRenamingSession(session);
    setRenameName(session.customDeviceName || '');
    setError('');
    setNotice('');
  }

  async function handleSaveRename(event?: React.FormEvent) {
    if (event) event.preventDefault();
    if (!renamingSession) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.renameSession(token, renamingSession.id, renameName);
      setOverview(updated);
      if (renamingSession.current) {
        setStoredDeviceName(renameName.trim() || null);
      }
      setNotice(t('sessions.nameUpdated'));
      setRenamingSession(null);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t('sessions.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function terminate(session: Session) {
    if (!session.current && !overview?.canTerminateOthers) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setOverview(await api.terminateSession(token, session.id));
      setNotice(t('sessions.terminatedOne'));
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t('sessions.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function terminateAll() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setOverview(await api.terminateOtherSessions(token));
      setNotice(t('sessions.terminatedAll'));
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t('sessions.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function changeAutoTerminate(value: string) {
    const next = AUTO_TERMINATE_OPTIONS.find((option) => option.value === value)?.days ?? null;
    const previous = autoTerminateDays;
    // Переключатель отзывается сразу, а при ошибке возвращается назад.
    setAutoTerminateDays(next);
    setError('');
    setNotice('');
    try {
      await onAutoTerminateChange(next);
    } catch (reason) {
      setAutoTerminateDays(previous);
      setError(reason instanceof Error && reason.message ? reason.message : t('sessions.failed'));
    }
  }

  const canTerminateOthers = overview?.canTerminateOthers ?? false;
  const gateLeft = overview && !canTerminateOthers ? formatGateLeft(overview.gateUntil, t) : '';
  const currentSession = (overview?.sessions ?? []).find((session) => session.current);
  const others = (overview?.sessions ?? []).filter((session) => !session.current);

  return (
    <div
      className="fixed inset-0 z-[70] grid items-end bg-[#171724]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-w-[460px] sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('sessions.title')}
      >
        <header className="flex items-center gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <button
            type="button"
            aria-label={onBack ? t('common.back') : t('modals.close')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onBack ?? onClose}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-[-0.02em] text-ink">
            {t('sessions.title')}
          </h2>
          <button
            type="button"
            aria-label={t('modals.close')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted">{t('sessions.intro')}</p>
          </div>

          {loading && (
            <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">{t('sessions.loading')}</p>
          )}

          {!loading && overview && (
            <div>
              {currentSession && (
                <div className="border-b border-line/70">
                  <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted sm:px-5">
                    {t('sessions.currentSection')}
                  </div>
                  <div className="px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <Globe className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="block truncate text-[15px] font-semibold text-ink">
                                {currentSession.customDeviceName || siteLabel(currentSession, t)}
                              </span>
                              <button
                                type="button"
                                title={t('sessions.renameDevice')}
                                aria-label={t('sessions.renameDevice')}
                                onClick={() => startRename(currentSession)}
                                className="grid h-6 w-6 place-items-center rounded-lg text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {currentSession.customDeviceName
                                ? `${deviceLabel(currentSession, t)} • ${siteLabel(currentSession, t)}`
                                : deviceLabel(currentSession, t)}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted">
                              {t('sessions.lastSeen', { time: activityAt(currentSession) })}
                            </span>
                            <span className="mt-1 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">
                              {t('sessions.current')}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void terminate(currentSession)}
                            className="shrink-0 rounded-xl border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-50"
                          >
                            {t('sessions.terminate')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {others.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted sm:px-5">
                    {t('sessions.otherSection')}
                  </div>
                  <ul>
                    {others.map((session) => {
                      const locked = !canTerminateOthers;
                      return (
                        <li key={session.id} className="border-b border-line/70 px-4 py-4 sm:px-5">
                          <div className="flex items-start gap-3">
                            <Globe className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-3">
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] font-semibold text-ink">
                                    {session.customDeviceName || siteLabel(session, t)}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-muted">
                                    {session.customDeviceName
                                      ? `${deviceLabel(session, t)} • ${siteLabel(session, t)}`
                                      : deviceLabel(session, t)}
                                  </span>
                                  <span className="mt-1 block text-xs leading-5 text-muted">
                                    {t('sessions.lastSeen', { time: activityAt(session) })}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  disabled={busy || locked}
                                  title={locked ? t('sessions.gateHint') : undefined}
                                  onClick={() => void terminate(session)}
                                  className="shrink-0 rounded-xl border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-50"
                                >
                                  {t('sessions.terminate')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!loading && overview && (
            <div className="border-b border-line/70 px-4 py-4 sm:px-5">
              <button
                type="button"
                disabled={busy || !canTerminateOthers || others.length === 0}
                title={canTerminateOthers ? undefined : t('sessions.gateHint')}
                onClick={() => void terminateAll()}
                className="w-full rounded-xl border border-danger/40 px-3 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-50"
              >
                {t('sessions.terminateAll')}
              </button>
              <p className="mt-2 text-xs leading-5 text-muted">{t('sessions.terminateAllHint')}</p>
              {gateLeft && <p className="mt-1 text-xs font-semibold text-muted">{gateLeft}</p>}
            </div>
          )}

          {/* Автозавершение: сеанс, которым не пользовались, закрывается сам. */}
          <div className="px-4 py-4 sm:px-5">
            <label
              className="block text-[15px] font-semibold text-ink"
              htmlFor="sessions-auto-terminate"
            >
              {t('sessions.autoTerminate')}
            </label>
            <p className="mt-1 text-xs leading-5 text-muted">{t('sessions.autoTerminateHint')}</p>
            <select
              id="sessions-auto-terminate"
              className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
              value={autoTerminateDays === null ? 'never' : String(autoTerminateDays)}
              onChange={(event) => void changeAutoTerminate(event.target.value)}
            >
              {AUTO_TERMINATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.days === null
                    ? t('sessions.never')
                    : `${option.days} ${t('sessions.days')}`}
                </option>
              ))}
            </select>
          </div>

          {notice && (
            <p className="px-4 pb-1 text-xs font-semibold text-brand sm:px-5">{notice}</p>
          )}
          {error && <p className="px-4 pb-4 text-xs font-semibold text-danger sm:px-5">{error}</p>}
        </div>
      </section>

      {renamingSession && (
        <div
          className="fixed inset-0 z-[80] grid items-center justify-center bg-[#171724]/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setRenamingSession(null)}
        >
          <div
            className="w-full max-w-[360px] animate-scale-in rounded-2xl border border-line bg-surface p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={t('sessions.renameDevice')}
          >
            <h3 className="text-base font-bold text-ink">
              {t('sessions.renameDevice')}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {deviceLabel(renamingSession, t)}
            </p>
            <form onSubmit={handleSaveRename} className="mt-4">
              <input
                type="text"
                className="h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                placeholder={t('sessions.renamePlaceholder')}
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                maxLength={100}
                autoFocus
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRenamingSession(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Сайт без протокола: в списке «https://yargram.ru» читается хуже, чем «yargram.ru». */
function siteLabel(session: Session, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!session.site) return t('sessions.unknownSite');
  return session.site.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function deviceLabel(session: Session, t: (key: string, params?: Record<string, string | number>) => string): string {
  return session.device || t('sessions.unknownDevice');
}

function activityAt(session: Session): string {
  return `${formatDayLabel(session.lastSeenAt)}, ${formatMessageTime(session.lastSeenAt)}`;
}

/** Сколько осталось до права завершать чужие сеансы. */
function formatGateLeft(
  gateUntil: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!gateUntil) return '';
  const remaining = Date.parse(gateUntil) - Date.now();
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3_600_000);
  const time = hours >= 1 ? `${hours} ${t('sessions.hours')}` : `${Math.max(1, Math.ceil(remaining / 60_000))} ${t('sessions.minutes')}`;
  return t('sessions.gateLeft', { time });
}
