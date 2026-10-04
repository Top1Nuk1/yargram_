import { useEffect, useRef } from 'react';
import { KeyRound, MinusCircle, ShieldCheck, ShieldMinus, Tag, UserRound } from 'lucide-react';
import { useTranslation } from '../../hooks/useLanguage';
import { memberActionAllowed, type MemberAction } from '../../lib/group';
import type { Conversation, GroupMember } from '../../types';

interface MemberContextMenuProps {
  /** Где открылось меню — координаты курсора или строки. */
  x: number;
  y: number;
  conversation: Conversation;
  currentUserId: string;
  member: GroupMember;
  onClose: () => void;
  onAction: (action: MemberAction) => void;
}

const MENU_WIDTH = 268;

/**
 * Меню участника по правой кнопке мыши: профиль, тег, администратор,
 * ограничение, удаление. Недоступные действия показываем, но гасим —
 * так видно, что они существуют и чего не хватает.
 */
export function MemberContextMenu({
  x,
  y,
  conversation,
  currentUserId,
  member,
  onClose,
  onAction,
}: MemberContextMenuProps) {
  const t = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('contextmenu', close);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  // Меню не должно уезжать за край окна.
  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const estimatedHeight = 260;
  const top = Math.max(8, Math.min(y, window.innerHeight - estimatedHeight - 8));

  const isAdmin = member.role === 'admin';
  const items: Array<{ action: MemberAction; label: string; icon: typeof Tag; danger?: boolean }> = [
    { action: 'profile', label: t('groups.menuProfile'), icon: UserRound },
    { action: 'tag', label: t('groups.changeMemberTag'), icon: Tag },
    {
      action: 'admin',
      label: isAdmin ? t('groups.demoteAdmin') : t('groups.makeAdmin'),
      icon: isAdmin ? ShieldMinus : ShieldCheck,
    },
    { action: 'restrict', label: t('groups.menuRestrict'), icon: KeyRound },
    { action: 'remove', label: t('groups.removeFromGroupLong'), icon: MinusCircle, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('groups.menuLabel', { name: member.user.displayName })}
      className="fixed z-[90] animate-fade-in rounded-2xl border border-line bg-elevated p-1.5 shadow-float"
      style={{ left, top, width: MENU_WIDTH }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <p className="truncate px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        {member.user.displayName}
        {member.tag ? ` · ${member.tag}` : ''}
      </p>
      {items.map((item) => {
        const allowed = memberActionAllowed(conversation, currentUserId, member, item.action);
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            disabled={!allowed}
            onClick={() => {
              onAction(item.action);
              onClose();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
              item.danger
                ? 'text-danger hover:bg-danger/10'
                : 'text-ink hover:bg-brand-soft/55'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${item.danger ? 'text-danger' : 'text-brand'}`} aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
