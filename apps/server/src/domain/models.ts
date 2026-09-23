import { mediaUrlFor } from "../lib/media-links.js";

export const allowedReactionEmojis = ["👍", "❤️", "😂", "😎", "🔥", "😢", "😮"] as const;

export type ReactionEmoji = (typeof allowedReactionEmojis)[number];
export type AttachmentKind = "image" | "file" | "avatar";

export type Attachment = {
  id: string;
  ownerId: string;
  kind: AttachmentKind;
  mediaKind?: "voice" | "video_circle";
  durationSeconds?: number;
  fileName: string;
  storedFileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type AttachmentView = Omit<Attachment, "storedFileName"> & {
  url: string;
};

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  username?: string | undefined;
  bio: string;
  avatar?: AttachmentView | undefined;
  lastSeenAt: string;
  showLastSeen: boolean;
  blockedUserIds: string[];
  favoriteMessageIds: string[];
  notificationSoundEnabled: boolean;
  createdAt: string;
  themeColor?: string; // HEX, e.g. "#ff6600"
  wallpaperUrl?: string; // URL to custom wallpaper
  isVerified?: boolean; // checkmark shown right of username
  badge?: "yargram" | null; // Yargram icon shown left of username
  usernames?: string[]; // admin-assignable alternate usernames
  adminUserIds?: string[]; // users this account can administer
  isOwner?: boolean; // Top1Nuk1 level ownership
  isBanned?: boolean; // account banned by admin
  isFrozen?: boolean; // account suspended by admin
  /** Аккаунт удалён владельцем. Запись остаётся: почта и ник не освобождаются,
   *  а владелец может вернуть аккаунт обратно. */
  isDeleted?: boolean;
  deletedAt?: string;
  birthday?: string; // ISO date (YYYY-MM-DD), отображается в профиле
};

export type LastSeenStatus = "recently" | "within_week" | "within_month" | "long_ago";

export type PublicUser = {
  id: string;
  displayName: string;
  username: string | null;
  bio: string;
  avatar: AttachmentView | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  lastSeenStatus: LastSeenStatus | null;
  online: boolean;
  createdAt: string;
  isVerified?: boolean | undefined;
  badge?: "yargram" | null | undefined;
  usernames?: string[] | undefined;
  adminUserIds?: string[] | undefined;
  isOwner?: boolean | undefined;
  isBanned?: boolean | undefined;
  isFrozen?: boolean | undefined;
  isDeleted?: boolean | undefined;
  birthday?: string | undefined;
};

export type CurrentUser = PublicUser & {
  email: string;
  showLastSeen: boolean;
  notificationSoundEnabled: boolean;
  themeColor?: string;
  wallpaperUrl?: string;
};

/**
 * Отдельные права группы. Включаются независимо друг от друга: владелец
 * собирает из них любую комбинацию для администраторов и участников.
 */
export const groupPermissions = [
  "send_messages",
  "send_media",
  "send_links",
  "send_polls",
  "add_members",
  "pin_messages",
  "change_info",
  "delete_messages",
] as const;

export type GroupPermission = (typeof groupPermissions)[number];
/**
 * `| undefined` в значении нужен из-за exactOptionalPropertyTypes: схема запроса
 * присылает объект, где ключ может присутствовать со значением undefined.
 */
export type GroupPermissions = Partial<Record<GroupPermission, boolean | undefined>>;
/** Права после вычисления: у каждого пункта есть конкретный ответ «да» или «нет». */
export type EffectiveGroupPermissions = Record<GroupPermission, boolean>;

/** Роль считается из записи группы, отдельного поля «роль» нет. */
export type GroupRole = "owner" | "admin" | "member" | "restricted";

/** Запись истории изменений группы: кто и что сделал. */
export type GroupEvent = {
  id: string;
  at: string;
  actorId: string;
  kind:
    | "created"
    | "renamed"
    | "description_changed"
    | "avatar_changed"
    | "member_added"
    | "member_removed"
    | "member_left"
    | "admin_added"
    | "admin_removed"
    | "permissions_changed"
    | "member_restricted"
    | "member_muted"
    | "member_unmuted";
  targetId?: string | undefined;
  detail?: string | undefined;
};

export type Conversation = {
  id: string;
  type: "direct" | "saved" | "group";
  memberIds: string[];
  /** Пара участников личного диалога; у групп и «Избранного» пустая строка. */
  directKey: string;
  createdAt: string;
  updatedAt: string;
  lastMessageId?: string | undefined;
  /** Kept for clients and database files created by Yargram 0.1. */
  pinnedMessageId?: string | undefined;
  pinnedMessageIds: string[];
  archivedBy: string[];
  mutedUntilBy: Record<string, string | null>;
  // ---- Группы ----
  title?: string | undefined;
  description?: string | undefined;
  avatarUrl?: string | null | undefined;
  /** Владелец группы: единственный, кто может удалить группу и сменить владельца. */
  ownerId?: string | undefined;
  adminIds?: string[] | undefined;
  /** Права конкретного администратора; отсутствующие берутся из adminDefaults. */
  adminPermissions?: Record<string, GroupPermissions> | undefined;
  /** Права администраторов по умолчанию. */
  adminDefaults?: GroupPermissions | undefined;
  /** Код из ссылки-приглашения t.me-подобного вида. */
  inviteCode?: string | undefined;
  /** Права обычных участников; отсутствующие считаются разрешёнными. */
  permissions?: GroupPermissions | undefined;
  /** Личные ограничения участника поверх общих прав. */
  restrictions?: Record<string, GroupPermissions> | undefined;
  /** Мьют участника до указанного времени (ISO) или бессрочно при null. */
  mutedMembers?: Record<string, string | null> | undefined;
  /** Кто вышел из группы: чат у него в списке не показывается. */
  leftIds?: string[] | undefined;
  history?: GroupEvent[] | undefined;
};

/** Права администратора по умолчанию: всё, кроме смены владельца. */
export const defaultAdminPermissions = (): GroupPermissions =>
  Object.fromEntries(groupPermissions.map((permission) => [permission, true])) as GroupPermissions;

/**
 * Роль участника считается из записи группы: отдельного поля «роль» нет,
 * чтобы не пришлось синхронизировать два источника правды.
 */
export function groupRoleFor(conversation: Conversation, userId: string): GroupRole | null {
  if (conversation.type !== "group") return null;
  if (!conversation.memberIds.includes(userId)) return null;
  if (conversation.ownerId === userId) return "owner";
  if ((conversation.adminIds ?? []).includes(userId)) return "admin";
  const personal = conversation.restrictions?.[userId];
  if (personal && Object.values(personal).some((allowed) => allowed === false)) return "restricted";
  if (isGroupMemberMuted(conversation, userId)) return "restricted";
  return "member";
}

/** Мьют участника: до времени или бессрочно (null). Прошедший мьют не считается. */
export function isGroupMemberMuted(
  conversation: Conversation,
  userId: string,
  now: number = Date.now(),
): boolean {
  const until = conversation.mutedMembers?.[userId];
  if (until === undefined) return false;
  if (until === null) return true;
  return Date.parse(until) > now;
}

/**
 * Проверка одного права. Порядок: владелец → всё; администратор → свои права;
 * участник → общие права группы, поверх них личные ограничения и мьют.
 */
export function groupCan(
  conversation: Conversation,
  userId: string,
  permission: GroupPermission,
  now: number = Date.now(),
): boolean {
  const role = groupRoleFor(conversation, userId);
  if (!role) return false;
  if (role === "owner") return true;
  if (role === "admin") {
    const own = conversation.adminPermissions?.[userId]?.[permission];
    if (own !== undefined) return own;
    return conversation.adminDefaults?.[permission] ?? true;
  }
  const groupDefault = conversation.permissions?.[permission] ?? true;
  const personal = conversation.restrictions?.[userId]?.[permission];
  if (personal !== undefined) return personal && groupDefault;
  if (permission === "send_messages" && isGroupMemberMuted(conversation, userId, now)) return false;
  return groupDefault;
}

/** Все права сразу: клиент показывает по ним доступные кнопки. */
export function effectiveGroupPermissions(
  conversation: Conversation,
  userId: string,
  now: number = Date.now(),
): EffectiveGroupPermissions {
  return Object.fromEntries(
    groupPermissions.map((permission) => [permission, groupCan(conversation, userId, permission, now)]),
  ) as EffectiveGroupPermissions;
}

export type MessageReaction = {
  userId: string;
  emoji: ReactionEmoji;
  createdAt: string;
};

export type CallMessage = {
  callId: string;
  callerId: string;
  mode: "audio" | "video";
  outcome: "completed" | "missed" | "declined" | "unanswered";
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  kind: "user" | "system";
  systemEvent?: "call" | "user_joined" | "user_left" | undefined;
  call?: CallMessage | undefined;
  createdAt: string;
  editedAt?: string | undefined;
  replyToId?: string | undefined;
  forwardedFromId?: string | undefined;
  attachmentIds: string[];
  reactions: MessageReaction[];
  readBy: string[];
};

export type ReportReason = "spam" | "abuse" | "fraud" | "other";

export type UserReport = {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
};

export type FavoriteNote = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt?: string | undefined;
};



export type CallRecord = {
  id: string;
  conversationId: string;
  initiatorId: string;
  mode: "audio" | "video";
  status: "ringing" | "active" | "completed" | "missed" | "rejected" | "not_answered";
  startedAt: string;
  answeredAt?: string | undefined;
  endedAt?: string | undefined;
  endedById?: string | undefined;
  durationSeconds?: number | undefined;
};

export type ConversationDraft = {
  id: string;
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string | undefined;
  updatedAt: string;
};

export type ConversationFolder = {
  id: string;
  userId: string;
  name: string;
  position: number;
  conversationIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduledMessageStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export type ScheduledMessage = {
  id: string;
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string | undefined;
  sendAt: string;
  status: ScheduledMessageStatus;
  createdAt: string;
  sentAt?: string | undefined;
  messageId?: string | undefined;
  failureReason?: string | undefined;
};

export type DatabaseState = {
  version: 1;
  users: User[];
  conversations: Conversation[];
  messages: Message[];
  attachments: Attachment[];
  reports: UserReport[];
  favoriteNotes: FavoriteNote[];
  calls: CallRecord[];
  drafts: ConversationDraft[];
  folders: ConversationFolder[];
  scheduledMessages: ScheduledMessage[];
};

export function toAttachmentView(attachment: Attachment, subject?: string): AttachmentView {
  const { storedFileName: _storedFileName, ...safeAttachment } = attachment;
  return {
    ...safeAttachment,
    url: mediaUrlFor(attachment.id, subject ?? attachment.ownerId, {
      kind: attachment.kind === "avatar" ? "avatar" : "attachment",
    }),
  };
}

export function lastSeenStatus(lastSeenAt: string, now = Date.now()): LastSeenStatus {
  const age = now - Date.parse(lastSeenAt);
  const day = 86_400_000;
  if (age <= 3 * day) return "recently";
  if (age <= 7 * day) return "within_week";
  if (age <= 30 * day) return "within_month";
  return "long_ago";
}

export function toPublicUser(user: User): PublicUser {
  // Stored avatar views keep an old path only; the served URL is always refreshed
  // with a fresh temporary signature.
  const avatar = user.avatar
    ? { ...user.avatar, url: mediaUrlFor(user.avatar.id, user.id, { kind: "avatar" }) }
    : null;
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username ?? null,
    bio: user.bio,
    avatar,
    avatarUrl: avatar?.url ?? null,
    lastSeenAt: user.showLastSeen === false ? null : user.lastSeenAt,
    lastSeenStatus: user.showLastSeen === false ? lastSeenStatus(user.lastSeenAt) : null,
    online: false,
    createdAt: user.createdAt,
    isVerified: user.isVerified ?? false,
    badge: user.badge ?? null,
    usernames: user.usernames ?? undefined,
    adminUserIds: user.adminUserIds ?? undefined,
    isOwner: user.isOwner ?? undefined,
    isBanned: user.isBanned ?? undefined,
    isFrozen: user.isFrozen ?? undefined,
    isDeleted: user.isDeleted ?? undefined,
    birthday: user.birthday ?? undefined,
  };
}

/**
 * Публичный вид для рассылки «что стало с аккаунтом»: удалённый и замороженный
 * выглядят как заглушка, живой — своим профилем.
 */
export function publicAccountStateFor(user: User): PublicUser {
  if (user.isDeleted) return deletedPlaceholderFor(user.id);
  if (user.isFrozen) return frozenPlaceholderFor(user.id);
  return toPublicUser(user);
}

/**
 * Профиль глазами конкретного смотрящего. Если владелец профиля заблокировал
 * смотрящего, тот видит только имя — как в Telegram: без аватара и без времени
 * визита («был(а) давно»).
 *
 * Замороженный аккаунт прячется так же, как удалённый, но с пометкой
 * `isFrozen: true`, чтобы клиент поставил рядом снежинку.
 */
export function toPublicUserFor(user: User, viewerId?: string | null): PublicUser {
  // Удалённый аккаунт остаётся в базе (почта занята), но наружу выглядит
  // заглушкой — без снежинки: её получают только замороженные.
  if (user.isDeleted) return deletedPlaceholderFor(user.id);
  if (user.isFrozen) return frozenPlaceholderFor(user.id);
  const base = toPublicUser(user);
  if (!viewerId || !user.blockedUserIds?.includes(viewerId)) return base;
  return {
    ...base,
    avatar: null,
    avatarUrl: null,
    lastSeenAt: null,
    lastSeenStatus: "long_ago",
    online: false,
  };
}

/** Заглушка для удалённого аккаунта: имени/аватара нет, биография пустая. */
export function removedUserPlaceholder(id: string): PublicUser {
  return {
    id,
    displayName: "Удалённый аккаунт",
    username: null,
    bio: "",
    avatar: null,
    avatarUrl: null,
    lastSeenAt: null,
    lastSeenStatus: null,
    online: false,
    createdAt: new Date(0).toISOString(),
    isFrozen: false,
  };
}

/** Заглушка для замороженного аккаунта — клиент показывает на ней снежинку. */
function frozenPlaceholderFor(id: string): PublicUser {
  return {
    ...removedUserPlaceholder(id),
    isFrozen: true,
  };
}

/**
 * Заглушка для удалённого аккаунта, запись которого ещё жива: владельцу нужен
 * флаг, чтобы показать кнопку возврата.
 */
export function deletedPlaceholderFor(id: string): PublicUser {
  return {
    ...removedUserPlaceholder(id),
    isDeleted: true,
  };
}

/**
 * Превращает отсутствующего пользователя в заглушку, чтобы диалог не развалился
 * после удаления. Если пользователь заморожен — заменяем на снежинковую версию.
 */
export function ensurePublicUser(
  user: User | null | undefined,
  fallbackId: string,
  viewerId?: string | null,
): PublicUser {
  if (!user) return removedUserPlaceholder(fallbackId);
  return toPublicUserFor(user, viewerId);
}

export function toCurrentUser(user: User): CurrentUser {
  return {
    ...toPublicUser(user),
    email: user.email,
    showLastSeen: user.showLastSeen ?? true,
    notificationSoundEnabled: user.notificationSoundEnabled,
    ...(user.themeColor === undefined ? {} : { themeColor: user.themeColor }),
    ...(user.wallpaperUrl === undefined ? {} : { wallpaperUrl: user.wallpaperUrl }),
    ...(user.isVerified === undefined ? {} : { isVerified: user.isVerified }),
    ...(user.badge === undefined ? {} : { badge: user.badge }),
    ...(user.usernames === undefined ? {} : { usernames: user.usernames }),
    ...(user.adminUserIds === undefined ? {} : { adminUserIds: user.adminUserIds }),
    ...(user.isOwner === undefined ? {} : { isOwner: user.isOwner }),
    ...(user.isBanned === undefined ? {} : { isBanned: user.isBanned }),
    ...(user.isFrozen === undefined ? {} : { isFrozen: user.isFrozen }),
    ...(user.birthday === undefined ? {} : { birthday: user.birthday }),
  };
}
