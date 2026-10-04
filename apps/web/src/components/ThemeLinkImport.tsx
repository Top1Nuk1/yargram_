import { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useLanguage';
import type { Theme } from '../lib/theme';
import { clearThemeHash, readThemeFromHash } from '../lib/themeShare';

/**
 * Предложение добавить тему, приехавшую по ссылке.
 *
 * Спрашиваем, а не ставим молча: человек мог открыть ссылку просто посмотреть,
 * и менять ему оформление без спроса нельзя. После ответа `#theme=…` из адреса
 * убирается — иначе перезагрузка спрашивала бы снова.
 */
export function ThemeLinkImport({ onImport }: { onImport: (theme: Theme) => Theme }) {
  const t = useTranslation();
  const [incoming, setIncoming] = useState<Theme | null>(null);

  useEffect(() => {
    const theme = readThemeFromHash(window.location.hash);
    if (theme) setIncoming(theme);
  }, []);

  if (!incoming) return null;

  function dismiss() {
    clearThemeHash();
    setIncoming(null);
  }

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-[#171724]/55 p-5 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && dismiss()}
    >
      <section
        className="w-full max-w-sm animate-slide-up rounded-xl border border-line bg-surface p-5"
        role="dialog"
        aria-modal="true"
        aria-label={t('themes.importTitle')}
      >
        <h2 className="text-base font-extrabold tracking-[-0.02em] text-ink">
          {t('themes.importTitle')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {t('themes.importAsk', { name: incoming.name })}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink transition hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('themes.importSkip')}
          </button>
          <button
            type="button"
            onClick={() => {
              onImport(incoming);
              dismiss();
            }}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('common.add')}
          </button>
        </div>
      </section>
    </div>
  );
}
