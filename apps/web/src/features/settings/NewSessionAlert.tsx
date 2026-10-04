import { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from '../../hooks/useLanguage';
import type { Session } from '../../types';

interface NewSessionAlertProps {
  /** Сеанс, с которого только что вошли. */
  session: Session;
  busy?: boolean;
  /** «Это был я»: вход подтверждён, окно больше не нужно. */
  onAcknowledge: () => void;
  /** «Это не я»: завершить этот самый сеанс. */
  onTerminate: () => void;
}

/**
 * Окно «Новый вход».
 *
 * Показывается сразу после входа с незнакомого сайта: человек должен узнать,
 * что в аккаунт зашли откуда-то ещё. Закрытие окна равносильно «это был я» —
 * иначе окно появлялось бы при каждом перезапуске, пока вход не подтверждён.
 */
export function NewSessionAlert({ session, busy = false, onAcknowledge, onTerminate }: NewSessionAlertProps) {
  const t = useTranslation();

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onAcknowledge();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onAcknowledge]);

  const site = session.site ? session.site.replace(/^https?:\/\//i, '').replace(/\/+$/, '') : t('sessions.unknownSite');

  return (
    <div
      className="fixed inset-0 z-[80] grid items-end bg-[#171724]/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onAcknowledge()}
    >
      <section
        className="w-full animate-slide-up rounded-t-xl border border-line bg-surface p-5 sm:max-w-[420px] sm:rounded-xl"
        role="alertdialog"
        aria-modal="true"
        aria-label={t('sessions.alert.title')}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">
              {t('sessions.alert.title')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t('sessions.alert.body', { site })}
            </p>
            {session.device && (
              <p className="mt-1 text-xs leading-5 text-muted">
                {t('sessions.alert.device', { device: session.device })}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            disabled={busy}
            onClick={onAcknowledge}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          >
            {t('sessions.alert.wasMe')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onTerminate}
            className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          >
            {t('sessions.alert.notMe')}
          </button>
        </div>
      </section>
    </div>
  );
}
