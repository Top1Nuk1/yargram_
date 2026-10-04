import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Sparkles } from 'lucide-react';
import {
  LANGUAGE_ENGLISH_LABELS,
  LANGUAGE_LABELS,
  LANGUAGES,
  type Language,
} from '../../lib/i18n';
import { useLanguage } from '../../hooks/useLanguage';

interface LanguageScreenProps {
  /**
   * Стрелка «назад»: вернуться на экран, откуда пришли (список настроек).
   * Не задана — стрелка работает как закрытие, чтобы экран можно было
   * открыть и в одиночку.
   */
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Экран «Язык» — как в Telegram: сверху три переключателя перевода, под ними
 * список языков с поиском и кнопка ОК.
 *
 * Сам перевод сообщений ещё не сделан, поэтому переключатели «Показать кнопку
 * Перевести» и «Переводить чаты целиком» показаны, но не работают: первый
 * выключен наглухо, второй помечен Premium. Так список повторяет макет, но не
 * обещает того, чего приложение не умеет.
 */
export function LanguageScreen({ onBack, onClose }: LanguageScreenProps) {
  const { language, setLanguage, t } = useLanguage();
  /** Что показано сейчас — до нажатия ОК выбор не применяется. */
  const [selected, setSelected] = useState<Language>(language);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && (onBack ?? onClose)();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onBack, onClose]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return LANGUAGES;
    return LANGUAGES.filter(
      (code) =>
        LANGUAGE_LABELS[code].toLocaleLowerCase('ru-RU').includes(normalized) ||
        LANGUAGE_ENGLISH_LABELS[code].toLocaleLowerCase('ru-RU').includes(normalized),
    );
  }, [query]);

  function confirm() {
    setLanguage(selected);
    onClose();
  }

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
        aria-label={t('language.title')}
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
            {t('language.title')}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="border-b border-line/70 py-1">
            <ToggleRow label={t('langScreen.showTranslate')} checked={false} disabled />
            <ToggleRow
              label={t('langScreen.translateChats')}
              checked={false}
              disabled
              badge={t('langScreen.premium')}
            />
            <button
              type="button"
              disabled
              className="flex w-full cursor-default items-center gap-3 px-4 py-3 text-left sm:px-5"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] text-muted/70">
                {t('langScreen.doNotTranslate')}
              </span>
              <span className="shrink-0 text-sm text-muted/70">
                {LANGUAGE_LABELS[language].toLocaleLowerCase('ru-RU')}
              </span>
            </button>
          </div>

          <p className="border-b border-line/70 px-4 py-3 text-xs leading-5 text-muted sm:px-5">
            {t('langScreen.showTranslateHint')}
          </p>

          <div className="border-b border-line/70 px-4 py-3 sm:px-5">
            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 h-4 w-4 text-muted"
                aria-hidden="true"
              />
              <input
                className="h-10 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                value={query}
                placeholder={t('langScreen.searchPlaceholder')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <ul className="py-1" role="radiogroup" aria-label={t('language.title')}>
            {visible.map((code) => (
              <li key={code}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === code}
                  onClick={() => setSelected(code)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-soft/40 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                      selected === code ? 'border-brand' : 'border-muted/45'
                    }`}
                  >
                    {selected === code && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {LANGUAGE_LABELS[code]}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {LANGUAGE_ENGLISH_LABELS[code]}
                    </span>
                  </span>
                  {selected === code && (
                    <span className="sr-only">{t('langScreen.selected')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-end border-t border-line/70 px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={confirm}
            className="rounded-xl px-4 py-2 text-sm font-extrabold text-brand transition hover:bg-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('langScreen.ok')}
          </button>
        </footer>
      </section>
    </div>
  );
}

/**
 * Строка-переключатель. Настоящий `switch` не рисуем: он всё равно выключен,
 * а половина работающего тумблера вводила бы в заблуждение.
 */
function ToggleRow({
  label,
  checked,
  disabled,
  badge,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      className="flex w-full cursor-default items-center gap-3 px-4 py-3 text-left sm:px-5"
    >
      <span className="min-w-0 flex-1 truncate text-[15px] text-muted/70">{label}</span>
      {badge && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-soft/60 px-2 py-0.5 text-[10px] font-bold text-amber-strong">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {badge}
        </span>
      )}
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-brand' : 'bg-muted/35'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? 'left-[1.4rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
