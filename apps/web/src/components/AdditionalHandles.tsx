import type { User } from '../types';

interface AdditionalHandlesProps {
  usernames?: string[] | null;
  /** Основной @username — его выкидываем из списка, чтобы не было дубля. */
  primaryUsername?: string | null;
  /** Класс цвета обёртки. По умолчанию text-muted, в активной строке передают text-white/65. */
  className?: string;
}

/**
 * Дополнительные @usernames под основным именем. Показывается в карточках
 * пользователей, когда администратор задал альтернативные юзернеймы:
 * «основное имя» сверху, «а также @unbrokensociety, @crow» под ним.
 * Если после фильтрации список пуст — ничего не рендерит.
 */
export function AdditionalHandles({ usernames, primaryUsername, className = 'text-muted' }: AdditionalHandlesProps) {
  const filtered = usernames?.filter((handle) => handle !== primaryUsername) ?? [];
  if (filtered.length === 0) return null;
  return (
    <span className={`truncate text-[12px] ${className}`}>
      а также{' '}
      {filtered.map((handle, index) => (
        <span key={handle}>
          @{handle}
          {index < filtered.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  );
}

/**
 * Основной @handle пользователя: «@username» если есть, иначе отображаемое имя.
 * Именно его показываем как идентификатор рядом с дополнительными никами.
 */
export function primaryHandle(user: Pick<User, 'username' | 'displayName'> | null | undefined): string {
  if (!user) return '';
  return user.username ? `@${user.username}` : user.displayName;
}

/** Просто экспорт типа, чтобы импортировать отсюда вместе с компонентом. */
export type Handles = NonNullable<User['usernames']>;