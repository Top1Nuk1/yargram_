import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Avatar, Button, IconButton } from '../../components/ui';
import { UserName } from '../../components/UserName';
import {
  allGroupPermissions,
  groupPermissionHints,
  groupPermissionLabels,
  normalizeMemberTag,
  viewerPermissions,
} from '../../lib/group';
import { avatarProps } from '../../lib/user';
import { groupPermissionKeys, type Conversation, type GroupMember, type GroupPermissions } from '../../types';
import { MemberTag } from './MemberTag';

/** Общая рамка для окон участника: затемнение, карточка и Esc для закрытия. */
function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
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
        className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-h-[720px] sm:max-w-[520px] sm:rounded-xl"
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
        <footer className="flex items-center justify-end gap-2 border-t border-line/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      </section>
    </div>
  );
}

function Switch({
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

function MemberHead({ member }: { member: GroupMember }) {
  return (
    <div className="flex flex-col items-center px-5 py-4 text-center">
      <Avatar
        name={member.user.displayName}
        src={member.user.avatarUrl}
        size="xl"
        online={member.user.isOnline}
        {...avatarProps(member.user)}
      />
      <p className="mt-3 inline-flex max-w-full items-center gap-2 text-lg font-bold text-ink">
        <UserName name={member.user.displayName} user={member.user} />
        <MemberTag tag={member.tag} role={member.role} className="text-xs" />
      </p>
      <p className="mt-1 text-xs text-muted">
        {member.user.isOnline ? 'в сети' : 'был(а) недавно'}
      </p>
    </div>
  );
}

/**
 * Назначение администратора: список возможностей и подсказка о том, что
 * администратор без права добавления не сможет назначать других.
 */
export function AdminRightsDialog({
  member,
  conversation,
  busy,
  onClose,
  onSubmit,
  onDemote,
}: {
  member: GroupMember;
  conversation: Conversation;
  busy: boolean;
  onClose: () => void;
  onSubmit: (permissions: GroupPermissions) => void;
  /** Снять администратора — доступно, если он им уже является. */
  onDemote?: () => void;
}) {
  const promoting = member.role !== 'admin';
  // Права администратора: его собственные, иначе общие для администраторов.
  const [draft, setDraft] = useState<GroupPermissions>(() => ({
    ...(allGroupPermissions(true) as GroupPermissions),
    add_admins: false,
    ...(conversation.adminDefaults ?? {}),
    ...(conversation.adminPermissions?.[member.user.id] ?? {}),
  }));

  const viewer = viewerPermissions(conversation);
  const amOwner = conversation.role === 'owner';

  return (
    <Dialog
      title={promoting ? 'Добавить администратора' : 'Права администратора'}
      subtitle={
        <p className="mt-1 text-sm text-muted">
          Возможности администратора включаются по отдельности.
        </p>
      }
      onClose={onClose}
      footer={
        <>
          {!promoting && onDemote && (
            <Button
              type="button"
              variant="danger"
              className="mr-auto min-h-10"
              disabled={busy}
              onClick={onDemote}
            >
              Снять администратора
            </Button>
          )}
          <Button type="button" variant="ghost" className="min-h-10" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            className="min-h-10"
            loading={busy}
            onClick={() => onSubmit(draft)}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <MemberHead member={member} />

      <p className="px-1 pb-2 text-sm font-semibold text-brand">Возможности администратора:</p>
      <section className="overflow-hidden rounded-xl bg-canvas">
        {groupPermissionKeys.map((permission) => {
          // Выдать больше, чем есть у себя, нельзя — владелец может всё.
          const grantable = amOwner || viewer[permission];
          return (
            <div
              key={permission}
              className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {groupPermissionLabels[permission]}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  {groupPermissionHints[permission]}
                </span>
              </span>
              <Switch
                label={groupPermissionLabels[permission]}
                checked={draft[permission] ?? false}
                disabled={busy || !grantable}
                onChange={(next) => setDraft((current) => ({ ...current, [permission]: next }))}
              />
            </div>
          );
        })}
      </section>

      <p className="mx-1 mt-3 rounded-xl bg-canvas px-3 py-2 text-xs leading-5 text-muted">
        {draft.add_admins
          ? 'Этот администратор сможет назначать новых администраторов.'
          : 'Этот администратор не сможет добавлять новых администраторов.'}
      </p>
    </Dialog>
  );
}

/**
 * Тег участника: короткая подпись рядом с именем. Цвет подписи зависит от роли
 * и здесь же показывается в превью.
 */
export function MemberTagDialog({
  member,
  busy,
  onClose,
  onSubmit,
}: {
  member: GroupMember;
  busy: boolean;
  onClose: () => void;
  onSubmit: (tag: string) => void;
}) {
  const [value, setValue] = useState(member.tag ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const preview = normalizeMemberTag(value);

  return (
    <Dialog
      title="Изменить тег участника"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" className="min-h-10" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            className="min-h-10"
            loading={busy}
            onClick={() => onSubmit(preview)}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <MemberHead member={member} />

      {/* Превью: так подпись будет выглядеть рядом с именем. */}
      <div className="mx-1 mb-3 rounded-xl bg-canvas px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Как это выглядит</p>
        <p className="mt-1.5 inline-flex max-w-full items-center gap-2 text-sm font-bold text-ink">
          <UserName name={member.user.displayName} user={member.user} size="sm" />
          {preview ? (
            <MemberTag tag={preview} role={member.role} />
          ) : (
            <span className="text-xs font-normal text-muted">без тега</span>
          )}
        </p>
      </div>

      <label className="block px-1">
        <span className="sr-only">Тег участника</span>
        <input
          ref={inputRef}
          value={value}
          maxLength={24}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Например, #смирнёха"
          className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
        />
      </label>
      <p className="mt-2 px-1 text-xs leading-5 text-muted">
        Вы можете указать тег, который будет отображаться рядом с именем. Цвет подписи зависит от
        роли: у владельца фиолетовый, у администратора зелёный, у участника серый. Пустое поле
        снимает тег.
      </p>
    </Dialog>
  );
}
