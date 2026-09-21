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
