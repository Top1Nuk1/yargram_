import { useEffect, useRef, useState } from 'react';
import { Ban, BellOff, Clock, Crown, Shield, ShieldCheck, Tag, Trash2 } from 'lucide-react';
import { Dialog, Switch } from '../../components/Dialog';
import { Avatar, Button } from '../../components/ui';
import { UserName } from '../../components/UserName';
import {
  allGroupPermissions,
  groupMemberMuted,
  groupPermissionHints,
  groupPermissionLabels,
  groupRoleLabel,
  memberActionAllowed,
  mutedUntilLabel,
  normalizeMemberTag,
  viewerPermissions,
} from '../../lib/group';
import { avatarProps } from '../../lib/user';
import {
  groupPermissionKeys,
  memberPermissionKeys,
  type Conversation,
  type GroupMember,
  type GroupPermission,
  type GroupPermissions,
} from '../../types';
import { MemberTag } from './MemberTag';

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

/** Сроки мьюта: null — бессрочно. */
export const muteOptions: Array<{ label: string; hours: number | null }> = [
  { label: '1 час', hours: 1 },
  { label: '8 часов', hours: 8 },
  { label: '1 день', hours: 24 },
  { label: '1 неделя', hours: 24 * 7 },
  { label: 'Навсегда', hours: null },
];

/**
 * Карточка участника — отдельным окном, как профиль или настройки, чтобы
 * не разворачиваться на всю панель группы.
 */
export function MemberCardDialog({
  member,
  conversation,
  currentUserId,
  busy,
  canManage,
  onClose,
  onOpenAdmin,
  onOpenTag,
  onPermission,
  onMute,
  onUnmute,
  onRemove,
}: {
  member: GroupMember;
  conversation: Conversation;
  currentUserId: string;
  busy: boolean;
  canManage: boolean;
  onClose: () => void;
  onOpenAdmin: () => void;
  onOpenTag: () => void;
  onPermission: (permission: GroupPermission, allowed: boolean) => void;
  onMute: (hours: number | null) => void;
  onUnmute: () => void;
  onRemove: () => void;
}) {
  const muted = groupMemberMuted(member);
  const canRemove = memberActionAllowed(conversation, currentUserId, member, 'remove');

  return (
    <Dialog
      title="Участник"
      onClose={onClose}
      footer={
        canRemove ? (
          <Button type="button" variant="danger" className="min-h-10 w-full" disabled={busy} onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> Удалить из группы
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center px-5 pb-5 pt-1 text-center">
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
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted">
          {member.role === 'owner' ? (
            <Crown className="h-4 w-4 text-brand" aria-hidden="true" />
          ) : member.role === 'admin' ? (
            <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
          ) : member.role === 'restricted' ? (
            <Ban className="h-4 w-4 text-danger" aria-hidden="true" />
          ) : null}
          {groupRoleLabel(member.role)}
        </p>
        {muted && (
          <p className="mt-1 text-xs text-danger">Заглушён · {mutedUntilLabel(member.mutedUntil)}</p>
        )}
      </div>

      <div className="space-y-3">
        {memberActionAllowed(conversation, currentUserId, member, 'admin') && (
          <button
            type="button"
            disabled={busy}
            onClick={onOpenAdmin}
            className="flex w-full items-center gap-3 rounded-xl bg-canvas px-4 py-3 text-left transition hover:bg-brand-soft/40 disabled:opacity-60"
          >
            <Shield className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
              {member.role === 'admin' ? 'Права администратора' : 'Назначить администратором'}
            </span>
            <span className="shrink-0 text-xs font-semibold text-brand">Настроить</span>
          </button>
        )}

        {memberActionAllowed(conversation, currentUserId, member, 'tag') && (
          <button
            type="button"
            disabled={busy}
            onClick={onOpenTag}
            className="flex w-full items-center gap-3 rounded-xl bg-canvas px-4 py-3 text-left transition hover:bg-brand-soft/40 disabled:opacity-60"
          >
            <Tag className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
              Изменить тег участника
            </span>
            {member.tag ? (
              <MemberTag tag={member.tag} role={member.role} />
            ) : (
              <span className="shrink-0 text-xs text-muted">без тега</span>
            )}
          </button>
        )}

        {canManage && member.role !== 'owner' && (
          <>
            <section className="overflow-hidden rounded-xl bg-canvas">
              <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wide text-muted">
                Разрешения участника
              </p>
              {/* Участнику управляющие права не выдать — их и не показываем. */}
              {(member.role === 'admin' ? groupPermissionKeys : memberPermissionKeys).map((permission) => (
                <div key={permission} className="flex items-center gap-3 border-t border-line/60 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {groupPermissionLabels[permission]}
                  </span>
                  <Switch
                    label={groupPermissionLabels[permission]}
                    checked={member.permissions[permission]}
                    disabled={busy}
                    onChange={(next) => onPermission(permission, next)}
                  />
                </div>
              ))}
            </section>

            <section className="overflow-hidden rounded-xl bg-canvas">
              <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-bold uppercase tracking-wide text-muted">
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> Мьют
              </p>
              {muted ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onUnmute}
                  className="mt-2 flex w-full items-center gap-2 border-t border-line/60 px-4 py-3 text-left text-sm font-semibold text-brand transition hover:bg-brand-soft/40 disabled:opacity-60"
                >
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Снять мьют
                </button>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/60 p-3">
                  {muteOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      disabled={busy}
                      onClick={() => onMute(option.hours)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand/40 hover:bg-brand-soft/40 disabled:opacity-60"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {!canManage && member.user.id !== currentUserId && (
          <p className="px-1 text-center text-xs leading-5 text-muted">
            Управлять участниками могут владелец и администраторы группы.
          </p>
        )}
      </div>
    </Dialog>
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
