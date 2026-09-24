import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui';

/**
 * Общая рамка модального окна: затемнение, карточка по центру, Esc и клик
 * по фону закрывают. Одна на все окна — профиль, участник, опрос.
 */
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Кнопок внизу может не быть — тогда подвал не рисуем. */
  footer?: ReactNode;
  /** Широкое окно: для длинных списков вроде настроек опроса. */
  wide?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[95] grid items-end bg-[#171724]/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-h-[720px] sm:rounded-xl ${wide ? 'sm:max-w-[560px]' : 'sm:max-w-[520px]'}`}
      >
        <header className="flex items-start justify-between gap-2 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
            {subtitle}
          </div>
          <IconButton label="Закрыть" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}

/** Переключатель «включено/выключено» для окон с настройками. */
export function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-brand' : 'bg-line'}`}
    >
      <span
        className={`absolute h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`}
        aria-hidden="true"
      />
    </button>
  );
}
