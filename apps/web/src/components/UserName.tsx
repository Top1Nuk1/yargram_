import type { User } from '../types';

interface UserNameProps {
  name: string;
  user?: Pick<User, 'isVerified' | 'badge'> | null;
  /** "sm" fits chat bubbles and list rows, "md" fits profile headers. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Отображаемое имя (ник) со значком Yargram слева и галочкой справа.
 * Значки привязаны к нику, поэтому видны и в переписке, а не только у @username.
 */
export function UserName({ name, user, size = 'md', className = '' }: UserNameProps) {
  const badgeSize = size === 'sm' ? 'h-3 w-3 text-[8px]' : 'h-4 w-4 text-[10px]';
  const checkSize = size === 'sm' ? 'h-3 w-3 text-[10px]' : 'h-4 w-4';
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      {user?.badge === 'yargram' && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white ${badgeSize}`}
          aria-label="Значок Yargram"
        >
          Y
        </span>
      )}
      <span className="truncate">{name}</span>
      {user?.isVerified && (
        <span className={`inline-flex shrink-0 font-bold text-brand ${checkSize}`} aria-label="Подтверждено">
          ✓
        </span>
      )}
    </span>
  );
}
