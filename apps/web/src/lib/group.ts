import {
  presenceBucket,
  presenceBucketLabels,
  presenceBucketOrder,
  type PresenceBucket,
} from './presence';
import {
  adminOnlyPermissionKeys,
  groupPermissionKeys,
  type Conversation,
  type EffectiveGroupPermissions,
  type GroupEvent,
  type GroupMember,
  type GroupPermission,
  type GroupPermissions,
  type GroupRole,
  type Participant,
} from '../types';

/** Группа — это третий тип беседы рядом с личным диалогом и «Избранным». */
export function isGroup(conversation: Conversation | null | undefined): boolean {
  return conversation?.type === 'group';
}

export const groupRoleLabels: Record<GroupRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  member: 'Участник',
  restricted: 'Ограниченный',
};

export const groupPermissionLabels: Record<GroupPermission, string> = {
  send_messages: 'Отправка сообщений',
  send_media: 'Отправка медиа',
  send_links: 'Отправка ссылок',
  send_polls: 'Создание опросов',
  add_members: 'Добавление участников',
  pin_messages: 'Закрепление сообщений',
  change_info: 'Изменение информации',
  delete_messages: 'Удаление сообщений',
  remove_members: 'Удаление участников',
  restrict_members: 'Ограничение участников',
  manage_tags: 'Изменение тегов участников',
  add_admins: 'Добавление администраторов',
};

/** Короткие пояснения: что именно закрывает выключенный пункт. */
export const groupPermissionHints: Record<GroupPermission, string> = {
  send_messages: 'Без него участник читает чат, но не пишет',
  send_media: 'Фотографии, видео, файлы и голосовые',
  send_links: 'Тексты со ссылками уходят на проверку',
  send_polls: 'Опросы и викторины',
  add_members: 'Приглашать людей по ссылке и вручную',
  pin_messages: 'Закреплять сообщения в шапке',
  change_info: 'Название, описание и фото группы',
  delete_messages: 'Удалять чужие сообщения',
  remove_members: 'Выгонять людей из группы',
  restrict_members: 'Запреты и мьют для участника',
  manage_tags: 'Подписи рядом с именем у других участников',
  add_admins: 'Назначать новых администраторов',
};

/** Управляющие права обычным участникам не выдаются — их список отдельный. */
export function isAdminOnlyPermission(permission: GroupPermission): boolean {
  return (adminOnlyPermissionKeys as readonly string[]).includes(permission);
}

/** Все пункты включены — состояние «как в обычной группе». */
export function allGroupPermissions(value = true): GroupPermissions {
  return Object.fromEntries(groupPermissionKeys.map((key) => [key, value])) as GroupPermissions;
}

export function groupRoleLabel(role: GroupRole | null | undefined): string {
  return role ? groupRoleLabels[role] : 'Участник';
}

/**
 * Права смотрящего. Сервер присылает их готовыми, но у беседы, загруженной из
 * старого ответа API, поля может не быть — тогда считаем, что можно всё, кроме
 * групп, где роль ограничена.
 */
export function viewerPermissions(
  conversation: Conversation | null | undefined,
): EffectiveGroupPermissions {
  const fallback = allGroupPermissions(true) as EffectiveGroupPermissions;
  if (!isGroup(conversation)) return fallback;
  return { ...fallback, ...(conversation?.myPermissions ?? {}) };
}

export function viewerCan(
  conversation: Conversation | null | undefined,
  permission: GroupPermission,
): boolean {
  if (!isGroup(conversation)) return true;
  return viewerPermissions(conversation)[permission];
}

/**
 * Та же проверка ссылки, что и на сервере: запрет ссылок должен срабатывать
 * до отправки, чтобы человек не получал отказ уже после нажатия.
 */
const linkPattern = /https?:\/\/\S+/i;

export function containsLink(text: string): boolean {
  return linkPattern.test(text);
}

/** Роль владельца и администратора даёт доступ к управлению группой. */
export function viewerManagesGroup(conversation: Conversation | null | undefined): boolean {
  const role = conversation?.role;
  return role === 'owner' || role === 'admin';
}

export function viewerIsOwner(conversation: Conversation | null | undefined): boolean {
  return conversation?.role === 'owner';
}

/** Что можно сделать с участником из контекстного меню. */
export type MemberAction = 'profile' | 'tag' | 'admin' | 'restrict' | 'remove';

/**
 * Одно место, где решается, доступно ли действие над участником. Меню,
 * карточка участника и права на сервере должны отвечать одинаково.
 */
export function memberActionAllowed(
  conversation: Conversation | null | undefined,
  actorId: string,
  member: Pick<GroupMember, 'user' | 'role'>,
  action: MemberAction,
): boolean {
  if (!isGroup(conversation)) return false;
  const isSelf = member.user.id === actorId;
  const targetIsOwner = member.role === 'owner';
  const targetIsAdmin = member.role === 'admin';
  const amOwner = viewerIsOwner(conversation);
  switch (action) {
    case 'profile':
      return true;
    case 'tag':
      // Свой тег ставит каждый; тег владельца — только сам владелец.
      if (targetIsOwner) return isSelf;
      return isSelf || viewerCan(conversation, 'manage_tags');
    case 'admin':
      return !targetIsOwner && viewerCan(conversation, 'add_admins');
    case 'restrict':
    case 'remove': {
      if (targetIsOwner) return false;
      // Другого администратора снимает и ограничивает только владелец.
      if (targetIsAdmin && !amOwner) return false;
      return viewerCan(conversation, action === 'remove' ? 'remove_members' : 'restrict_members');
    }
    default:
      return false;
  }
}

/**
 * Роль человека в группе, посчитанная из записи беседы. Повторяет правило
 * сервера: отдельного поля «роль» нет.
 */
export function groupRoleOf(
  conversation: Conversation | null | undefined,
  userId: string,
  now: number = Date.now(),
): GroupRole | null {
  if (!isGroup(conversation)) return null;
  if (!(conversation?.memberIds ?? []).includes(userId)) return null;
  if (conversation?.ownerId === userId) return 'owner';
  if ((conversation?.adminIds ?? []).includes(userId)) return 'admin';
  const personal = conversation?.restrictions?.[userId];
  if (personal && Object.values(personal).some((allowed) => allowed === false)) return 'restricted';
  const muted = conversation?.mutedMembers?.[userId];
  // null — бессрочный мьют, отсутствие ключа — мьюта нет.
  if (muted === null || (muted !== undefined && Date.parse(muted) > now)) return 'restricted';
  return 'member';
}

/** Тег участника из записи беседы: он же показывается рядом с именем в чате. */
export function memberTagOf(
  conversation: Conversation | null | undefined,
  userId: string,
): string | undefined {
  return conversation?.memberTags?.[userId];
}

/**
 * Подставляет живое присутствие в состав группы. Ответ сервера всегда отдаёт
 * «не в сети» — онлайн приходит только событиями сокета и живёт в участниках
 * беседы, поэтому берём его оттуда.
 */
export function mergeMemberPresence(
  members: GroupMember[],
  participants: Participant[] | undefined,
): GroupMember[] {
  if (!participants?.length) return members;
  const live = new Map<string, Participant>();
  for (const participant of participants) {
    const id = participant.user?.id ?? participant.userId ?? participant.id;
    if (id) live.set(id, participant);
  }
  return members.map((member) => {
    const source = live.get(member.user.id);
    if (!source) return member;
    const pick = <T>(next: T | undefined, fallback: T): T => (next === undefined ? fallback : next);
    return {
      ...member,
      user: {
        ...member.user,
        isOnline: pick(source.isOnline ?? source.online, member.user.isOnline),
        online: pick(source.online ?? source.isOnline, member.user.online),
        lastSeenAt: pick(source.lastSeenAt, member.user.lastSeenAt),
        lastSeenStatus: pick(source.lastSeenStatus, member.user.lastSeenStatus),
        showLastSeen: pick(source.showLastSeen, member.user.showLastSeen),
      },
    };
  });
}

export interface MemberPresenceSection {
  bucket: PresenceBucket;
  label: string;
  members: GroupMember[];
}

/**
 * Состав группы по присутствию: сверху те, кто в сети, затем недавние с точным
 * временем, ниже — на прошлой неделе, в прошлом месяце и совсем давно.
 */
export function groupMembersByPresence(
  members: GroupMember[],
  now: number = Date.now(),
): MemberPresenceSection[] {
  const sections = new Map<PresenceBucket, GroupMember[]>();
  for (const member of members) {
    const bucket = presenceBucket(member.user, now);
    const list = sections.get(bucket);
    if (list) list.push(member);
    else sections.set(bucket, [member]);
  }

  // Внутри группы свежие визиты выше: у «недавних» видно точное время.
  const seenAt = (member: GroupMember): number => {
    const parsed = Date.parse(member.user.lastSeenAt ?? '');
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return presenceBucketOrder.filter((bucket) => sections.has(bucket)).map((bucket) => {
    const list = sections.get(bucket) ?? [];
    if (bucket !== 'online') list.sort((left, right) => seenAt(right) - seenAt(left));
    return { bucket, label: presenceBucketLabels[bucket], members: list };
  });
}

/**
 * Тот же порядок по присутствию, но плоским списком: подписи групп в интерфейсе
 * не показываются — присутствие видно в подписи каждой строки.
 */
export function orderMembersByPresence(
  members: GroupMember[],
  now: number = Date.now(),
): GroupMember[] {
  return groupMembersByPresence(members, now).flatMap((section) => section.members);
}

/** Тег участника: обрезаем по краям и ограничиваем длину. */
export function normalizeMemberTag(value: string): string {
  return value.trim().slice(0, 24);
}

/**
 * Цвет тега зависит от роли: у владельца фиолетовый, у администратора зелёный,
 * у обычного участника серый.
 */
export function memberTagClass(role: GroupRole): string {
  if (role === 'owner') return 'text-owner';
  if (role === 'admin') return 'text-success';
  return 'text-muted';
}

/**
 * Мьют участника: поля нет — мьюта нет, null — бессрочный, строка — до времени.
 * Прошедший мьют отправку больше не закрывает.
 */
export function groupMemberMuted(
  member: Pick<GroupMember, 'mutedUntil'>,
  now: number = Date.now(),
): boolean {
  if (member.mutedUntil === undefined) return false;
  if (member.mutedUntil === null) return true;
  if (!member.mutedUntil) return false;
  return Date.parse(member.mutedUntil) > now;
}

/** Ссылка-приглашение: код едет в адресе, чтобы её можно было отправить другу. */
export function groupInviteLink(code: string | null | undefined, origin?: string): string {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return '';
  const base = (origin ?? (typeof window === 'undefined' ? '' : window.location.origin)).replace(/\/$/, '');
  return `${base}/join/${trimmed}`;
}

/** Название группы для списка и шапки: пустым оно быть не должно. */
export function groupTitle(conversation: Conversation | null | undefined): string {
  const title = (conversation?.title ?? '').trim();
  return title || 'Группа';
}

/** Склонение слова «участник» для подписи под названием. */
export function groupMemberCountLabel(count: number | undefined): string {
  const total = Math.max(0, count ?? 0);
  const mod100 = total % 100;
  const mod10 = total % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${total} участников`;
  if (mod10 === 1) return `${total} участник`;
  if (mod10 >= 2 && mod10 <= 4) return `${total} участника`;
  return `${total} участников`;
}

const months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function shortMoment(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getDate()} ${months[date.getMonth()]}`;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day}, ${time}`;
}

/** Мьют «до конца времён» показываем словами, а не пустой датой. */
export function mutedUntilLabel(mutedUntil: string | null | undefined): string {
  if (!mutedUntil) return 'Без ограничения по времени';
  const date = new Date(mutedUntil);
  if (Number.isNaN(date.getTime())) return 'Без ограничения по времени';
  return `До ${shortMoment(mutedUntil)}`;
}

/**
 * Строка истории изменений. Имена подставляются снаружи: у истории нет
 * профилей, только идентификаторы.
 */
export function groupEventText(
  event: GroupEvent,
  nameOf: (userId: string) => string,
): string {
  const actor = nameOf(event.actorId);
  const target = event.targetId ? nameOf(event.targetId) : 'участника';
  switch (event.kind) {
    case 'created':
      return `${actor} создал(а) группу${event.detail ? ` «${event.detail}»` : ''}`;
    case 'renamed':
      return `${actor} изменил(а) название на «${event.detail ?? ''}»`;
    case 'description_changed':
      return `${actor} изменил(а) описание группы`;
    case 'avatar_changed':
      return `${actor} обновил(а) фото группы`;
    case 'member_added':
      return `${actor} добавил(а) ${target}`;
    case 'member_removed':
      return `${actor} удалил(а) ${target}`;
    case 'member_left':
      return `${target} вышел(а) из группы`;
    case 'admin_added':
      return `${actor} назначил(а) ${target} администратором`;
    case 'admin_removed':
      return `${actor} снял(а) ${target} с должности администратора`;
    case 'permissions_changed':
      return `${actor} изменил(а) права участников`;
    case 'member_restricted':
      return `${actor} ограничил(а) ${target}`;
    case 'member_muted':
      return event.detail && event.detail !== 'forever'
        ? `${actor} заглушил(а) ${target} до ${shortMoment(event.detail)}`
        : `${actor} заглушил(а) ${target} бессрочно`;
    case 'member_unmuted':
      return `${actor} снял(а) мьют с ${target}`;
    case 'member_tag_changed':
      return event.detail
        ? `${actor} поставил(а) ${target} тег «${event.detail}»`
        : `${actor} снял(а) тег с ${target}`;
    default:
      return `${actor} изменил(а) группу`;
  }
}

/** Точка истории: чем свежее, тем выше — сервер уже отдаёт события в этом порядке. */
export function groupHistoryMoment(at: string): string {
  return shortMoment(at);
}
