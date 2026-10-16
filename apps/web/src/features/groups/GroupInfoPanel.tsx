import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Crown,
  History,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { ScamWarning } from '../../components/ScamWarning';
import { Avatar, Button, IconButton, InlineError, Spinner } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { useTranslation, type TranslateFn } from '../../hooks/useLanguage';
import { avatarProps } from '../../lib/user';
import {
  groupEventText,
  groupHistoryMoment,
  groupInviteLink,
  groupMemberMuted,
  mergeMemberPresence,
  groupPermissionHints,
  groupPermissionLabels,
  groupRoleLabel,
  orderMembersByPresence,
  viewerCan,
  viewerIsOwner,
  viewerManagesGroup,
  type MemberAction,
} from '../../lib/group';
import { formatLastSeen, presenceTextClass } from '../../lib/presence';
import { translateScamWarning } from '../../lib/i18n';
import { HighlightedText } from '../messenger/MessageExtras';
import {
  groupPermissionKeys,
  memberPermissionKeys,
  type Conversation,
  type EffectiveGroupPermissions,
  type GroupEvent,
  type GroupMember,
  type GroupPermission,
  type GroupPermissions,
  type User,
} from '../../types';
import { MemberContextMenu } from './MemberContextMenu';
import { AdminRightsDialog, MemberCardDialog, MemberTagDialog } from './MemberDialogs';
import { MemberSearchList } from './MemberSearchList';
import { MemberTag } from './MemberTag';

interface GroupInfoPanelProps {
  token: string;
  currentUserId: string;
  conversation: Conversation;
  onClose: () => void;
  /** Обновлённая группа пришла с сервера — заменяем её в списке. */
  onUpdated: (conversation: Conversation) => void;
  /** Я вышел из группы: беседу нужно убрать из списка. */
  onLeft: (conversationId: string) => void;
  /** Показать профиль человека — открывает карточку профиля поверх всего. */
  onShowProfile: (user: User) => void;
}

type Tab = 'members' | 'rights' | 'history';

/** Сроки мьюта: от часа до бессрочного — как в Telegram. */
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

function readableError(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : fallback;
}

/** Подпись состава со склонением: «5 участников», «1 участник». */
function memberCountLabel(count: number, t: TranslateFn): string {
  const total = Math.max(0, count ?? 0);
  const mod100 = total % 100;
  const mod10 = total % 10;
  const key =
    mod100 >= 11 && mod100 <= 14 ? 'groups.count5' : mod10 === 1 ? 'groups.count1' : mod10 >= 2 && mod10 <= 4 ? 'groups.count2' : 'groups.count5';
  return t(key, { count: total });
}

/**
 * Карточка группы: состав с ролями, ссылка-приглашение, права участников,
 * мьюты и история изменений. Всё, что недоступно смотрящему, просто не рисуется.
 */
export function GroupInfoPanel({
  token,
  currentUserId,
  conversation,
  onClose,
  onUpdated,
  onLeft,
  onShowProfile,
}: GroupInfoPanelProps) {
  const t = useTranslation();
  const groupId = conversation.id;
  const canManage = viewerManagesGroup(conversation);
  const isOwner = viewerIsOwner(conversation);
  const canChangeInfo = viewerCan(conversation, 'change_info');
  const canAddMembers = viewerCan(conversation, 'add_members');

  const [tab, setTab] = useState<Tab>('members');
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [history, setHistory] = useState<GroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [memberQuery, setMemberQuery] = useState('');
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: GroupMember } | null>(null);
  const [adminTarget, setAdminTarget] = useState<GroupMember | null>(null);
  const [tagTarget, setTagTarget] = useState<GroupMember | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState<User[]>([]);

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversation.title ?? '');
  const [descriptionDraft, setDescriptionDraft] = useState(conversation.description ?? '');
  const [copied, setCopied] = useState(false);
  // Отметки SCAM и FAKE ставит владелец Yargram: описание группы он подменяет
  // предупреждением, поэтому менять его нельзя, пока отметку не снимут. Обе
  // могут стоять разом — тогда блокировка описания одна, а текст берётся из SCAM.
  const scamMarked = Boolean(conversation.scam);
  const fakeMarked = Boolean(conversation.fake);
  const marksLockDescription = scamMarked || fakeMarked;
  // Ведущий ⚠️ убираем (в карточке его место занимает значок), а сам текст
  // предупреждения переводим на язык интерфейса.
  const groupDescription = translateScamWarning(conversation.description ?? '', t);

  const inviteLink = groupInviteLink(conversation.inviteCode);
  // Живое присутствие подмешиваем к составу: сервер отдаёт «не в сети» всем.
  const membersWithPresence = useMemo(
    () => mergeMemberPresence(members, conversation.members),
    [conversation.members, members],
  );
  // Порядок по присутствию: в сети, затем недавние с точным временем, ниже давние.
  const orderedMembers = useMemo(
    () => orderMembersByPresence(membersWithPresence),
    [membersWithPresence],
  );
  const openMember = membersWithPresence.find((member) => member.user.id === openMemberId) ?? null;

  const nameOf = useCallback(
    (userId: string) =>
      members.find((member) => member.user.id === userId)?.user.displayName ?? t('groups.memberFallback'),
    [members, t],
  );

  const loadMembers = useCallback(
    async (query?: string) => {
      const list = await api.groupMembers(token, groupId, query);
      setMembers(list);
      return list;
    },
    [groupId, token],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([api.groupMembers(token, groupId), api.groupHistory(token, groupId)])
      .then(([memberList, events]) => {
        if (cancelled) return;
        setMembers(memberList);
        setHistory(events);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(readableError(reason, t('groups.loadFailed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, t, token]);

  /** Общая обёртка: одно действие, один перезапрос состава, одна ошибка. */
  async function run(action: () => Promise<Conversation>, message: string) {
    setBusy(true);
    setError('');
    try {
      const updated = await action();
      onUpdated(updated);
      await Promise.all([loadMembers(memberQuery), api.groupHistory(token, groupId).then(setHistory)]);
      setNotice(message);
    } catch (reason) {
      setError(readableError(reason, t('groups.actionFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function saveInfo() {
    const title = titleDraft.trim();
    if (!title) {
      setError(t('groups.titleRequired'));
      return;
    }
    await run(
      () => api.updateGroup(token, groupId, { title, description: descriptionDraft.trim() }),
      t('groups.infoSaved'),
    );
    setEditing(false);
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(t('groups.copyFailed'));
    }
  }

  async function saveAdminRights(member: GroupMember, permissions: GroupPermissions) {
    const promoting = member.role !== 'admin';
    await run(
      () => api.setGroupAdmin(token, groupId, member.user.id, true, permissions),
      promoting
        ? t('groups.nowAdmin', { name: member.user.displayName })
        : t('groups.rightsUpdated', { name: member.user.displayName }),
    );
    setAdminTarget(null);
    setOpenMemberId(null);
  }

  async function demoteAdmin(member: GroupMember) {
    await run(
      () => api.setGroupAdmin(token, groupId, member.user.id, false),
      t('groups.noLongerAdmin', { name: member.user.displayName }),
    );
    setAdminTarget(null);
    setOpenMemberId(null);
  }

  async function saveTag(member: GroupMember, tag: string) {
    await run(
      () => api.setGroupMemberTag(token, groupId, member.user.id, tag),
      tag ? t('groups.tagSaved', { tag }) : t('groups.tagCleared'),
    );
    setTagTarget(null);
  }

  /** Действия из меню участника: одно меню — один обработчик. */
  function handleMemberAction(member: GroupMember, action: MemberAction) {
    switch (action) {
      case 'profile':
        onShowProfile(member.user);
        return;
      case 'tag':
        setTagTarget(member);
        return;
      case 'admin':
        setAdminTarget(member);
        return;
      case 'restrict':
        // Ограничения и мьют живут в карточке участника.
        setOpenMemberId(member.user.id);
        return;
      case 'remove':
        void removeMember(member);
        return;
    }
  }

  /** Права администратора живут отдельно от личных ограничений участника. */
  async function setMemberPermission(member: GroupMember, permission: GroupPermission, next: boolean) {
    if (member.role === 'admin') {
      await run(
        () => api.setGroupAdmin(token, groupId, member.user.id, true, { [permission]: next }),
        next
          ? t('groups.allowOne', { permission: groupPermissionLabels[permission] })
          : t('groups.denyOne', { permission: groupPermissionLabels[permission] }),
      );
      return;
    }
    await run(
      () => api.restrictGroupMember(token, groupId, member.user.id, { permissions: { [permission]: next } }),
      next
        ? t('groups.allowOne', { permission: groupPermissionLabels[permission] })
        : t('groups.denyOne', { permission: groupPermissionLabels[permission] }),
    );
  }

  async function muteMember(member: GroupMember, hours: number | null) {
    // «Навсегда» отправляем словом: null в запросе означает снятие мьюта.
    const mutedUntil = hours === null ? 'forever' : new Date(Date.now() + hours * 3_600_000).toISOString();
    await run(
      () => api.restrictGroupMember(token, groupId, member.user.id, { mutedUntil }),
      hours === null
        ? t('groups.mutedForever', { name: member.user.displayName })
        : t('groups.mutedFor', { name: member.user.displayName, count: hours }),
    );
  }

  async function unmuteMember(member: GroupMember) {
    await run(
      () => api.restrictGroupMember(token, groupId, member.user.id, { mutedUntil: null }),
      t('groups.unmuted', { name: member.user.displayName }),
    );
  }

  async function removeMember(member: GroupMember) {
    await run(
      () => api.removeGroupMember(token, groupId, member.user.id),
      t('groups.memberRemoved', { name: member.user.displayName }),
    );
    setOpenMemberId(null);
  }

  async function leaveGroup() {
    setBusy(true);
    setError('');
    try {
      await api.leaveGroup(token, groupId);
      onLeft(groupId);
    } catch (reason) {
      setError(readableError(reason, t('groups.leaveFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function addSelected() {
    if (adding.length === 0) return;
    await run(
      () => api.addGroupMembers(token, groupId, adding.map((user) => user.id)),
      t('groups.membersAdded'),
    );
    setAdding([]);
    setAddOpen(false);
  }

  /** Права группы с ответом на каждый пункт: у отсутствующего пункта — «можно». */
  const groupRights = useMemo(
    () =>
      Object.fromEntries(
        groupPermissionKeys.map((key) => [key, conversation.permissions?.[key] ?? true]),
      ) as EffectiveGroupPermissions,
    [conversation.permissions],
  );
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-[#0c1218]/45 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('groups.panelLabel', { title: conversation.title ?? '' })}
        className="flex h-full w-full max-w-[460px] animate-fade-in flex-col bg-surface shadow-float"
      >
        <header className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <IconButton label={t('common.close')} onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{t('groups.about')}</h2>
          {canChangeInfo && !editing && (
            <IconButton label={t('groups.editInfo')} onClick={() => setEditing(true)}>
              <Pencil className="h-5 w-5" />
            </IconButton>
          )}
          {editing && (
            <Button type="button" className="min-h-9 px-3 text-xs" loading={busy} onClick={() => void saveInfo()}>
              {t('common.save')}
            </Button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="flex flex-col items-center px-5 py-5 text-center">
            <Avatar
              name={conversation.title ?? t('groups.tabMembers')}
              src={conversation.avatarUrl}
              size="xl"
              seed={groupId}
            />
            {editing ? (
              <div className="mt-4 w-full space-y-2">
                <input
                  value={titleDraft}
                  maxLength={128}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  placeholder={t('groups.titlePlaceholder')}
                  className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-center text-[15px] font-semibold text-ink outline-none focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                />
                <input
                  value={descriptionDraft}
                  maxLength={2_000}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  placeholder={t('groups.descriptionPlaceholder')}
                  disabled={marksLockDescription}
                  className="h-10 w-full rounded-xl border border-line bg-canvas px-3.5 text-center text-sm text-ink outline-none focus:border-brand/60 focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-70"
                />
                {scamMarked ? (
                  <p className="text-xs font-semibold text-danger" role="status">
                    {t('groups.scamNotice')}
                  </p>
                ) : fakeMarked ? (
                  <p className="text-xs font-semibold text-warning" role="status">
                    {t('groups.fakeNotice')}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <h3 className="mt-3 text-xl font-extrabold tracking-[-0.025em] text-ink">
                  <UserName
                    name={conversation.title || t('groups.tabMembers')}
                    user={conversation}
                    subject="group"
                  />
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {memberCountLabel(conversation.memberCount ?? members.length, t)}
                  {conversation.role ? ` · ${groupRoleLabel(conversation.role)}` : ''}
                </p>
                {conversation.description &&
                  (scamMarked ? (
                    // Текст выдан владельцем Yargram: выделить и скопировать нельзя.
                    <div className="mt-3 flex gap-2 text-left">
                      <AlertTriangle className="mt-[3px] h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      <ScamWarning
                        text={groupDescription}
                        className="whitespace-pre-wrap text-sm leading-6 text-ink"
                      />
                    </div>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/85">
                      <HighlightedText text={conversation.description} />
                    </p>
                  ))}
              </>
            )}
          </section>

          {(notice || error) && (
            <p
              className={`mx-5 mb-3 rounded-xl px-3 py-2 text-sm ${error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}
              role={error ? 'alert' : 'status'}
            >
              {error || notice}
            </p>
          )}

          {(canAddMembers || canChangeInfo) && (
            <section className="mx-5 mb-4 overflow-hidden rounded-xl bg-canvas">
              {canAddMembers && (
                <div className="border-b border-line/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                      <UserPlus className="h-4 w-4 text-brand" aria-hidden="true" />
                      {t('groups.inviteLink')}
                    </span>
                    <div className="flex items-center gap-1">
                      <IconButton label={copied ? t('groups.copied') : t('groups.copyLink')} onClick={() => void copyInvite()} disabled={!inviteLink}>
                        {copied ? <Check className="h-5 w-5 text-success" /> : <Copy className="h-5 w-5" />}
                      </IconButton>
                      <IconButton
                        label={t('groups.regenerateLink')}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => api.regenerateGroupInvite(token, groupId),
                            t('groups.linkRegenerated'),
                          )
                        }
                      >
                        <RefreshCw className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </div>
                  <p className="mt-1 break-all rounded-lg bg-surface px-2.5 py-1.5 text-xs text-muted">
                    {inviteLink || t('groups.linkUnavailable')}
                  </p>
                </div>
              )}
              {canAddMembers && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-ink transition hover:bg-brand-soft/40"
                >
                  <UserPlus className="h-4 w-4 text-brand" aria-hidden="true" />
                  {t('groups.addMembers')}
                </button>
              )}
            </section>
          )}

          <nav className="flex gap-1 px-5" aria-label={t('groups.sectionsLabel')}>
            {([
              ['members', t('groups.tabMembers'), <UsersRound key="m" className="h-4 w-4" />],
              ['rights', t('groups.tabRights'), <Shield key="r" className="h-4 w-4" />],
              ['history', t('groups.tabHistory'), <History key="h" className="h-4 w-4" />],
            ] as Array<[Tab, string, ReactNode]>).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={tab === value ? 'true' : undefined}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition ${
                  tab === value ? 'bg-brand text-white' : 'text-muted hover:bg-canvas'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>

          <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {loading && (
              <div className="grid place-items-center py-10 text-brand" role="status">
                <Spinner className="h-6 w-6" />
              </div>
            )}
            {!loading && error && members.length === 0 && <InlineError message={error} />}

            {!loading && tab === 'members' && (
              <>
                <div className="relative px-2">
                  <Search className="pointer-events-none absolute left-6 top-3 h-5 w-5 text-muted" aria-hidden="true" />
                  <input
                    type="search"
                    value={memberQuery}
                    onChange={(event) => {
                      setMemberQuery(event.target.value);
                      void loadMembers(event.target.value).catch(() => undefined);
                    }}
                    placeholder={t('groups.searchMembers')}
                    className="h-11 w-full rounded-xl border border-line bg-canvas pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                  />
                </div>

                {membersWithPresence.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted">{t('groups.nobodyFound')}</p>
                ) : (
                  // Заголовков групп нет: присутствие видно в подписи каждой строки.
                  <div className="mt-2">
                    <ul className="space-y-0.5">
                      {orderedMembers.map((member) => {
                              const muted = groupMemberMuted(member);
                              return (
                        <li key={member.user.id}>
                          <button
                            type="button"
                            onClick={(event) => {
                              // Действия с участником живут в меню: карточка с правами
                              // открывается оттуда, а не сразу по клику. Клик по строке
                              // меню тоже открывает — иначе на телефоне без правой
                              // кнопки до него не добраться.
                              const rect = event.currentTarget.getBoundingClientRect();
                              setContextMenu({ x: rect.left + 32, y: rect.bottom, member });
                            }}
                            onContextMenu={(event) => {
                              // Правая кнопка открывает то же меню у курсора.
                              event.preventDefault();
                              setContextMenu({ x: event.clientX, y: event.clientY, member });
                            }}
                            className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-canvas"
                          >
                            <Avatar
                              name={member.user.displayName}
                              src={member.user.avatarUrl}
                              size="md"
                              online={member.user.isOnline}
                              {...avatarProps(member.user)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                                <span className="truncate">
                                  <UserName name={member.user.displayName} user={member.user} size="sm" />
                                </span>
                                <MemberTag tag={member.tag} role={member.role} />
                                {member.user.id === currentUserId && (
                                  <span className="shrink-0 text-xs font-normal text-muted">{t('groups.youSuffix')}</span>
                                )}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                                {member.role === 'owner' && <Crown className="h-3 w-3 text-brand" aria-hidden="true" />}
                                {member.role === 'admin' && <ShieldCheck className="h-3 w-3 text-brand" aria-hidden="true" />}
                                {member.role === 'restricted' && <Ban className="h-3 w-3 text-danger" aria-hidden="true" />}
                                <span className="truncate">
                                  {groupRoleLabel(member.role)}
                                  {muted ? t('groups.mutedSuffix') : ''}
                                  {' · '}
                                  {/* В сети — голубым, иначе серым. */}
                                  <span className={presenceTextClass(member.user)}>
                                    {formatLastSeen(member.user, t)}
                                  </span>
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                )}
              </>
            )}

            {!loading && tab === 'rights' && (
              <section className="mx-2 overflow-hidden rounded-xl bg-canvas">
                <p className="px-4 pt-3 text-xs leading-5 text-muted">
                  {canChangeInfo
                    ? t('groups.rightsHintManage')
                    : t('groups.rightsHintRead')}
                </p>
                {/* Управляющие права участникам не выдаются: их здесь нет. */}
                {memberPermissionKeys.map((permission) => (
                  <div key={permission} className="flex items-start gap-3 border-t border-line/60 px-4 py-3">
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
                      checked={groupRights[permission]}
                      disabled={!canChangeInfo || busy}
                      onChange={(next) =>
                        void run(
                          () => api.setGroupPermissions(token, groupId, { [permission]: next }),
                          next
                            ? t('groups.allowMembers', { permission: groupPermissionLabels[permission] })
                            : t('groups.denyMembers', { permission: groupPermissionLabels[permission] }),
                        )
                      }
                    />
                  </div>
                ))}
              </section>
            )}

            {!loading && tab === 'history' && (
              <ul className="mx-2 space-y-1">
                {history.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted">{t('groups.noChangesYet')}</li>
                )}
                {history.map((event) => (
                  <li key={event.id} className="rounded-xl px-3 py-2.5">
                    <p className="text-sm leading-6 text-ink">{groupEventText(event, nameOf)}</p>
                    <p className="mt-0.5 text-xs text-muted">{groupHistoryMoment(event.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="border-t border-line/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {isOwner ? (
            <p className="text-center text-xs text-muted">
              {t('groups.ownerCannotLeave')}
            </p>
          ) : (
            <Button
              type="button"
              variant="danger"
              className="w-full"
              loading={busy}
              onClick={() => void leaveGroup()}
            >
              <LogOut className="h-4 w-4" /> {t('groups.leave')}
            </Button>
          )}
        </footer>

        {addOpen && (
          <div
            className="absolute inset-0 z-10 flex flex-col bg-surface"
            role="dialog"
            aria-modal="true"
            aria-label={t('groups.addMembers')}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
              <IconButton label={t('common.back')} onClick={() => setAddOpen(false)}>
                <X className="h-5 w-5" />
              </IconButton>
              <h3 className="flex-1 text-sm font-bold text-ink">{t('groups.addMembers')}</h3>
              <Button
                type="button"
                className="min-h-9 px-3 text-xs"
                loading={busy}
                disabled={adding.length === 0}
                onClick={() => void addSelected()}
              >
                {t('common.add')}
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
              <MemberSearchList
                token={token}
                currentUserId={currentUserId}
                selectedIds={adding.map((user) => user.id)}
                onToggle={(user) =>
                  setAdding((current) =>
                    current.some((item) => item.id === user.id)
                      ? current.filter((item) => item.id !== user.id)
                      : [...current, user],
                  )
                }
                excludeIds={members.map((member) => member.user.id)}
                placeholder={t('groups.whoToAdd')}
                listClassName="min-h-[200px] flex-1"
                autoFocus
              />
            </div>
          </div>
        )}

        {openMember && (
          <MemberCardDialog
            member={openMember}
            conversation={conversation}
            currentUserId={currentUserId}
            busy={busy}
            canManage={canManage}
            onClose={() => setOpenMemberId(null)}
            onOpenAdmin={() => setAdminTarget(openMember)}
            onOpenTag={() => setTagTarget(openMember)}
            onPermission={(permission, allowed) => void setMemberPermission(openMember, permission, allowed)}
            onMute={(hours) => void muteMember(openMember, hours)}
            onUnmute={() => void unmuteMember(openMember)}
            onRemove={() => void removeMember(openMember)}
          />
        )}
      </aside>

      {contextMenu && (
        <MemberContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          conversation={conversation}
          currentUserId={currentUserId}
          member={contextMenu.member}
          onClose={() => setContextMenu(null)}
          onAction={(action) => handleMemberAction(contextMenu.member, action)}
        />
      )}

      {adminTarget && (
        <AdminRightsDialog
          member={adminTarget}
          conversation={conversation}
          busy={busy}
          onClose={() => setAdminTarget(null)}
          onSubmit={(permissions) => void saveAdminRights(adminTarget, permissions)}
          onDemote={() => void demoteAdmin(adminTarget)}
        />
      )}

      {tagTarget && (
        <MemberTagDialog
          member={tagTarget}
          busy={busy}
          onClose={() => setTagTarget(null)}
          onSubmit={(tag) => void saveTag(tagTarget, tag)}
        />
      )}
    </div>
  );
}
