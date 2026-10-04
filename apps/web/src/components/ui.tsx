import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, LoaderCircle, RotateCcw, UserRound } from 'lucide-react';
import { initials } from '../lib/format';
import { useTranslation } from '../hooks/useLanguage';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <LoaderCircle className={`${className} animate-spin`} aria-hidden="true" />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-strong',
    secondary: 'border border-line bg-elevated text-ink hover:border-brand/35 hover:bg-brand-soft/40',
    ghost: 'bg-transparent text-muted hover:bg-brand-soft/55 hover:text-ink',
    danger: 'bg-danger/10 text-danger hover:bg-danger/15',
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
  /**
   * Цвет фона берётся не из имени (иначе у всех «Удалённый аккаунт» будет один цвет),
   * а из `seed` — например, из id пользователя.
   */
  seed?: string | null;
  /** Заглушка для удалённого/замороженного аккаунта: вместо инициалов — силуэт. */
  placeholder?: boolean;
}

const avatarSizes = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

const avatarColors = ['#3988b9', '#528f80', '#c08059', '#647fa5', '#b66d7b', '#8a6f9a', '#5f8e6d'];

export function avatarColor(seed: string): string {
  // Хеш, а не сумма кодов: у UUID вида xxxxxxxx-xxxx-… простая сумма даёт
  // почти один и тот же остаток, и все аккаунты красились бы в один цвет.
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1_000_003;
  }
  return avatarColors[hash % avatarColors.length];
}

export function Avatar({ name, src, size = 'md', online, className = '', seed, placeholder = false }: AvatarProps) {
  const t = useTranslation();
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className={`grid place-items-center overflow-hidden rounded-full font-semibold text-white ${avatarSizes[size]}`}
        style={{ backgroundColor: avatarColor(seed || name) }}
        aria-hidden="true"
      >
        {placeholder ? (
          <UserRound className="h-1/2 w-1/2 text-white/85" />
        ) : src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </span>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-surface ${online ? 'bg-success' : 'bg-muted/45'}`}
          title={online ? t('presence.online') : t('presence.offline')}
        />
      )}
    </span>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/70 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTranslation();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-10 text-center" role="alert">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-danger/10 text-danger">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">{t('error.somethingWrong')}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
      {onRetry && (
        <Button type="button" variant="secondary" className="mt-4 min-h-10" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function ConversationSkeleton() {
  const t = useTranslation();
  return (
    <div className="space-y-1 px-3" aria-label={t('loading.dialogs')}>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex animate-pulse-soft items-center gap-3 rounded-xl px-2 py-3">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-line/65" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/2 rounded bg-line/70" />
            <div className="h-3 w-4/5 rounded bg-line/45" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageSkeleton() {
  const t = useTranslation();
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-5 py-6" aria-label={t('loading.messages')}>
      {[44, 65, 36, 58, 48].map((width, index) => (
        <div
          key={index}
          className={`h-14 animate-pulse-soft rounded-[1.25rem] bg-line/45 ${index % 2 ? 'ml-auto' : ''}`}
          style={{ width: `${width}%`, animationDelay: `${index * 100}ms` }}
        />
      ))}
    </div>
  );
}
