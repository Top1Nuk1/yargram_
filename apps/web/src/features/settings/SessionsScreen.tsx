import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Hand, Laptop, Smartphone, X } from 'lucide-react';
import { api, setStoredDeviceName } from '../../api/client';
import { useTranslation } from '../../hooks/useLanguage';
import { formatDayLabel, formatMessageTime } from '../../lib/format';
import type { Session, SessionOverview, User } from '../../types';

export const CURRENT_CLIENT_VERSION = 'Yargram Web 0.0.2 CBT';
export const LEGACY_CLIENT_VERSION = 'Yargram Web 0.0.1 CBT';

/**
 * Сроки автозавершения: через сколько дней бездействия сеанс закрывается сам.
 * `null` — никогда, как и требует Telegram-подобный переключатель.
 */
export const AUTO_TERMINATE_OPTIONS: Array<{ value: string; days: number | null; labelKey: string }> = [
  { value: 'never', days: null, labelKey: 'sessions.never' },
  { value: '7', days: 7, labelKey: 'sessions.duration.1week' },
  { value: '30', days: 30, labelKey: 'sessions.duration.1month' },
  { value: '90', days: 90, labelKey: 'sessions.duration.3months' },
  { value: '180', days: 180, labelKey: 'sessions.duration.6months' },
  { value: '365', days: 365, labelKey: 'sessions.duration.12months' },
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
 * Выполнен в Telegram-стиле:
 * 1. Блок «Это устройство» с действием «Переименовать», версией клиента (CBT) и
 *    кнопкой «Завершить все другие сеансы».
 * 2. Блок «Активные сеансы» с чужими входами (кнопка ✕ для завершения, без переименования).
 * 3. Блок «Автозавершение» со сроком бездействия («Если сеанс неактивен»).
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

  const currentVisuals = currentSession ? getDeviceVisuals(currentSession.device) : null;
  const CurrentIcon = currentVisuals ? currentVisuals.icon : Laptop;

  return (
    <div
      className="fixed inset-0 z-[70] grid items-end bg-[#171724]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-w-[460px] sm:rounded-2xl"
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
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-[-0.02em] text-ink">
            {t('sessions.title')}
          </h2>
          <button
            type="button"
            aria-label={t('modals.close')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {notice && (
            <div className="border-b border-brand/20 bg-brand-soft/30 px-4 py-2 text-xs font-semibold text-brand sm:px-5">
              {notice}
            </div>
          )}
          {error && (
            <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger sm:px-5">
              {error}
            </div>
          )}

          {loading && (
            <p className="px-4 py-10 text-center text-sm text-muted sm:px-5">{t('sessions.loading')}</p>
          )}

          {!loading && overview && (
            <div>
              {/* Секция 1: Это устройство */}
              {currentSession && (
                <div>
                  <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-5">
                    <span className="text-[13px] font-semibold text-brand">
                      {t('sessions.currentSection')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('sessions.renameDevice')}
                      onClick={() => startRename(currentSession)}
                      className="text-[13px] font-medium text-brand transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                    >
                      {t('sessions.renameAction')}
                    </button>
                  </div>

                  <div className="px-4 py-2 sm:px-5">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-sm ${currentVisuals?.badgeBg ?? 'bg-[#2481cc]'}`}
                      >
                        <CurrentIcon className="h-5 w-5 text-white" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold leading-tight text-ink">
                          {currentSession.customDeviceName || deviceLabel(currentSession, t)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] leading-tight text-ink/75">
                          <span>{CURRENT_CLIENT_VERSION}</span>
                          <span className="inline-block rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">
                            {t('sessions.current')}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs leading-tight text-muted">
                          {currentSession.customDeviceName ? (
                            <span>{`${deviceLabel(currentSession, t)} • ${siteLabel(currentSession, t)}`}</span>
                          ) : (
                            <span>{siteLabel(currentSession, t)}</span>
                          )}
                          <span className="sr-only">
                            {t('sessions.lastSeen', { time: formatSessionTime(currentSession.lastSeenAt) })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pt-2 pb-3 sm:px-5">
                    <button
                      type="button"
                      disabled={busy || !canTerminateOthers || others.length === 0}
                      title={canTerminateOthers ? undefined : t('sessions.gateHint')}
                      onClick={() => void terminateAll()}
                      className="flex w-full items-center gap-3 rounded-lg py-1 text-left text-danger transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-40"
                    >
                      <Hand className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                      <span className="text-[14px] font-medium leading-tight">
                        {t('sessions.terminateAllOthers')}
                      </span>
                    </button>
                  </div>

                  <div className="border-t border-b border-line/60 bg-canvas/50 px-4 py-2.5 sm:px-5">
                    <p className="text-xs leading-relaxed text-muted">
                      {t('sessions.terminateAllOthersHint')}
                    </p>
                    {gateLeft && (
                      <p className="mt-1 text-xs font-semibold text-muted">{gateLeft}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Секция 2: Активные сеансы */}
              {others.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-2 sm:px-5">
                    <span className="text-[13px] font-semibold text-brand">
                      {t('sessions.otherSessionsTitle')}
                    </span>
                  </div>
                  <ul>
                    {others.map((session) => {
                      const locked = !canTerminateOthers;
                      const visuals = getDeviceVisuals(session.device);
                      const Icon = visuals.icon;
                      return (
                        <li
                          key={session.id}
                          className="flex items-center gap-3.5 border-b border-line/40 px-4 py-3 sm:px-5"
                        >
                          <div
                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-sm ${visuals.badgeBg}`}
                          >
                            <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-semibold leading-tight text-ink">
                              {session.customDeviceName || deviceLabel(session, t)}
                            </div>
                            <div className="mt-0.5 truncate text-[13px] leading-tight text-ink/75">
                              {LEGACY_CLIENT_VERSION}
                            </div>
                            <div className="mt-0.5 truncate text-xs leading-tight text-muted">
                              <span>{siteLabel(session, t)}</span>
                              <span> • {formatSessionTime(session.lastSeenAt)}</span>
                              <span className="sr-only">
                                {t('sessions.lastSeen', { time: formatSessionTime(session.lastSeenAt) })}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={t('sessions.terminate')}
                            title={locked ? t('sessions.gateHint') : t('sessions.terminate')}
                            disabled={busy || locked}
                            onClick={() => void terminate(session)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:opacity-40"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="border-t border-b border-line/60 bg-canvas/50 px-4 py-2.5 sm:px-5">
                    <p className="text-xs leading-relaxed text-muted">
                      {t('sessions.officialAppsHint')}
                    </p>
                  </div>
                </div>
              )}

              {/* Секция 3: Автозавершение */}
              <div className="px-4 pt-4 pb-5 sm:px-5">
                <span className="mb-2 block text-[13px] font-semibold text-brand">
                  {t('sessions.autoTerminateTitle')}
                </span>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="sessions-auto-terminate"
                    className="cursor-pointer text-[14px] text-ink"
                  >
                    {t('sessions.ifSessionInactive')}
                  </label>
                  <select
                    id="sessions-auto-terminate"
                    aria-label={t('sessions.autoTerminate')}
                    className="cursor-pointer bg-transparent text-[14px] font-medium text-brand outline-none hover:underline focus:ring-0"
                    value={autoTerminateDays === null ? 'never' : String(autoTerminateDays)}
                    onChange={(event) => void changeAutoTerminate(event.target.value)}
                  >
                    {AUTO_TERMINATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-surface text-ink">
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Диалог переименования устройства (только для текущего устройства) */}
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

function getDeviceVisuals(device: string) {
  const lower = device.toLowerCase();
  const isMobile =
    lower.includes('android') ||
    lower.includes('iphone') ||
    lower.includes('ipad') ||
    lower.includes('mobile');
  return {
    isMobile,
    badgeBg: isMobile ? 'bg-[#4caf50]' : 'bg-[#2481cc]',
    icon: isMobile ? Smartphone : Laptop,
  };
}

/** Сайт без протокола: в списке «https://yargram.ru» читается хуже, чем «yargram.ru». */
function siteLabel(session: Session, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!session.site) return t('sessions.unknownSite');
  return session.site.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function deviceLabel(session: Session, t: (key: string, params?: Record<string, string | number>) => string): string {
  return session.device || t('sessions.unknownDevice');
}

function formatSessionTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return formatMessageTime(isoString);
  }
  return `${formatDayLabel(isoString)}, ${formatMessageTime(isoString)}`;
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
