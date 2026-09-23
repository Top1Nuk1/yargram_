import {
  groupPermissionKeys,
  type Conversation,
  type EffectiveGroupPermissions,
  type GroupEvent,
  type GroupMember,
  type GroupPermission,
  type GroupPermissions,
  type GroupRole,
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
};

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
    default:
      return `${actor} изменил(а) группу`;
  }
}

/** Точка истории: чем свежее, тем выше — сервер уже отдаёт события в этом порядке. */
export function groupHistoryMoment(at: string): string {
  return shortMoment(at);
}
