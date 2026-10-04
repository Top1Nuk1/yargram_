import { useTranslation } from '../hooks/useLanguage';

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
 *
 * Список переносится по словам (`break-words`, а не `truncate`): юзернеймов
 * может быть сколько угодно, и те, что не влезли в строку, уходят вниз целиком —
 * разрыв идёт по разделителю «, ». Обрезать хвост многоточием нельзя: человек
 * должен видеть все свои адреса. Разрыв внутри одного ника — только крайний
 * случай, когда одиночный юзернейм длиннее всей строки.
 */
export function AdditionalHandles({ usernames, primaryUsername, className = 'text-muted' }: AdditionalHandlesProps) {
  const t = useTranslation();
  // Сравниваем без регистра: @Kotik и @kotik — один и тот же адрес, дубль не нужен.
  const primary = primaryUsername?.toLowerCase();
  const filtered = usernames?.filter((handle) => handle.toLowerCase() !== primary) ?? [];
  if (filtered.length === 0) return null;
  return (
    <span className={`break-words text-[12px] ${className}`}>
      {t('profile.alsoKnownAs')}{' '}
      {filtered.map((handle, index) => (
        <span key={handle}>
          @{handle}
          {index < filtered.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  );
}
