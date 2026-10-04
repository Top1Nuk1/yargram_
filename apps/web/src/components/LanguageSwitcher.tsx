import { LANGUAGES, LANGUAGE_LABELS, type Language } from '../lib/i18n';

interface LanguageSwitcherProps {
  value: Language;
  onChange: (language: Language) => void;
  /** Компактный режим: только коды языков, без названий — для узких панелей. */
  compact?: boolean;
  className?: string;
}

/**
 * Переключатель языка в виде сегментов: одна строка, сразу видно выбранное.
 * Показываем язык на нём самом — так понятно даже без перевода интерфейса.
 */
export function LanguageSwitcher({ value, onChange, compact = false, className = '' }: LanguageSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Язык интерфейса"
      className={`flex gap-1 rounded-2xl border border-line bg-canvas p-1 ${className}`}
    >
      {LANGUAGES.map((language) => {
        const active = language === value;
        return (
          <button
            key={language}
            type="button"
            role="radio"
            aria-checked={active}
            lang={language}
            onClick={() => onChange(language)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${
              active ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {compact ? LANGUAGE_LABELS[language].slice(0, 2).toUpperCase() : LANGUAGE_LABELS[language]}
          </button>
        );
      })}
    </div>
  );
}
