import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Globe, ShieldCheck, X } from 'lucide-react';
import { api } from '../../api/client';
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
    const close = (event: KeyboardEvent) => event.key === 'Escape' && (onBack ?? onClose)();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onBack, onClose]);

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
            <ul>
              {overview.sessions.map((session) => {
                // Чужой сеанс закрывают только «взрослым» сеансом: свежий вход
                // не должен выкидывать владельца раньше, чем через сутки.
                const locked = !session.current && !canTerminateOthers;
                return (
                  <li key={session.id} className="border-b border-line/70 px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <Globe className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-ink">
                              {siteLabel(session, t)}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {deviceLabel(session, t)}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted">
                              {t('sessions.lastSeen', { time: activityAt(session) })}
                            </span>
                            {session.current && (
                              <span className="mt-1 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">
                                {t('sessions.current')}
                              </span>
                            )}
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
