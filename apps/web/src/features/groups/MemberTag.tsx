import { useTranslation } from '../../hooks/useLanguage';
import { memberTagClass } from '../../lib/group';
import type { GroupRole } from '../../types';

/**
 * Тег участника рядом с именем. Цвет зависит от роли: у владельца фиолетовый,
 * у администратора зелёный, у обычного участника серый.
 */
export function MemberTag({
  tag,
  role,
  className = '',
}: {
  tag?: string | null | undefined;
  role: GroupRole;
  className?: string;
}) {
  const t = useTranslation();
  if (!tag) return null;
  return (
    <span
      className={`shrink-0 truncate text-[11px] font-semibold ${memberTagClass(role)} ${className}`}
      title={t('groups.tagTooltip', { tag })}
    >
      {tag}
    </span>
  );
}
