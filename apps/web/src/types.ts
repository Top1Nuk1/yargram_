export type ThemeMode = 'light' | 'dark';

export type AttachmentKind = 'image' | 'file' | 'avatar';

export interface Attachment {
  id: string;
  ownerId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  mediaKind?: 'voice' | 'video_circle' | null;
  durationSeconds?: number | null;
  size: number;
  url: string;
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

export type MessageKind = 'user' | 'system' | 'call';

export interface CallMessageDetails {
  callId?: string;
  callerId?: string;
  direction?: 'incoming' | 'outgoing';
  mode?: 'audio' | 'video';
  status?: 'completed' | 'missed' | 'declined' | 'unanswered';
  outcome?: 'completed' | 'missed' | 'declined' | 'unanswered';
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

export type LastSeenStatus = 'recently' | 'within_week' | 'within_month' | 'long_ago';

export interface User {
  id: string;
  email?: string;
  username?: string | null;
  displayName: string;
  bio?: string;
  avatar?: Attachment | null;
  avatarUrl?: string | null;
  isOnline?: boolean;
  online?: boolean;
  lastSeenAt?: string | null;
  lastSeenStatus?: LastSeenStatus | null;
  showLastSeen?: boolean;
  createdAt?: string;
  themeColor?: string;
  wallpaperUrl?: string;
  blockedByMe?: boolean;
  isVerified?: boolean;
  badge?: 'yargram' | null;
  usernames?: string[];
  adminUserIds?: string[];
  isOwner?: boolean;
  isBanned?: boolean;
  isFrozen?: boolean;
  /** Аккаунт удалён владельцем (запись остаётся, почта занята). */
  isDeleted?: boolean;
  birthday?: string | null;
}

/** Счётчики медиа в переписке: профиль показывает только то, что больше нуля. */
export interface MediaSummary {
  photos: number;
  videos: number;
  files: number;
  audio: number;
  voice: number;
  videoCircles: number;
  gifs: number;
  links: number;
}

export interface Participant {
  id?: string;
  userId?: string;
  user?: User;
  displayName?: string;
  username?: string | null;
  bio?: string;
  avatar?: Attachment | null;
  avatarUrl?: string | null;
  isOnline?: boolean;
  online?: boolean;
  lastSeenAt?: string | null;
  lastSeenStatus?: LastSeenStatus | null;
  showLastSeen?: boolean;
  createdAt?: string;
  blockedByMe?: boolean;
  isVerified?: boolean;
  badge?: 'yargram' | null;
  isFrozen?: boolean;
  isDeleted?: boolean;
}

/**
 * Аккаунт заморозили, разморозили или удалили — прилетает по сокету всем,
 * чтобы собеседники увидели «Удалённый аккаунт» без перезагрузки.
 */
export interface AccountStatePayload {
  userId: string;
  frozen: boolean;
  removed: boolean;
  user: User;
}

export interface Message {
  id: string;
  conversationId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  senderId?: string;
  userId?: string;
  sender?: User;
  author?: User;
  pending?: boolean;
  failed?: boolean;
  clientId?: string;
  editedAt?: string;
  replyToId?: string;
  replyTo?: Message | null;
  readBy?: string[];
  attachments?: Attachment[];
  reactions?: MessageReaction[];
  forwardedFromId?: string | null;
  forwardedFrom?: Message | null;
  kind?: MessageKind;
  systemEvent?: string | null;
  call?: CallMessageDetails | null;
  isFavorite?: boolean;
  favoritedByMe?: boolean;
}

/** Права, которые владелец выдаёт обычным участникам. */
export const memberPermissionKeys = [
  'send_messages',
  'send_media',
  'send_links',
  'send_polls',
  'add_members',
  'pin_messages',
  'change_info',
  'delete_messages',
] as const;

/** Управляющие права: только у владельца и администраторов. */
export const adminOnlyPermissionKeys = [
  'remove_members',
  'restrict_members',
  'manage_tags',
  'add_admins',
] as const;

/**
 * Права группы включаются по отдельности: владелец собирает из них любую
 * комбинацию для администраторов и участников.
 */
export const groupPermissionKeys = [
  ...memberPermissionKeys,
  ...adminOnlyPermissionKeys,
] as const;

export type MemberPermissionKey = (typeof memberPermissionKeys)[number];
export type AdminOnlyPermissionKey = (typeof adminOnlyPermissionKeys)[number];

export type GroupPermission = (typeof groupPermissionKeys)[number];
export type GroupPermissions = Partial<Record<GroupPermission, boolean>>;
/** Права после вычисления: у каждого пункта есть конкретный ответ. */
export type EffectiveGroupPermissions = Record<GroupPermission, boolean>;

export type GroupRole = 'owner' | 'admin' | 'member' | 'restricted';

export type GroupEventKind =
  | 'created'
  | 'renamed'
  | 'description_changed'
  | 'avatar_changed'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'admin_added'
  | 'admin_removed'
  | 'permissions_changed'
  | 'member_restricted'
  | 'member_muted'
  | 'member_unmuted'
  | 'member_tag_changed';

/** Запись истории изменений группы: кто и что сделал. */
export interface GroupEvent {
  id: string;
  at: string;
  actorId: string;
  kind: GroupEventKind;
  targetId?: string;
  detail?: string;
}

/** Строка списка участников группы вместе с ролью и правами. */
export interface GroupMember {
  user: User;
  role: GroupRole;
  permissions: EffectiveGroupPermissions;
  /** Поля нет, когда мьюта нет; null — бессрочный мьют. */
  mutedUntil?: string | null;
  /** Подпись рядом с именем; поля нет, если тег не задан. */
  tag?: string;
  addedByOwner: boolean;
}

export interface Conversation {
  id: string;
  type?: string;
  title?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  // ---- Группы ----
  description?: string | null;
  ownerId?: string | null;
  adminIds?: string[];
  adminPermissions?: Record<string, GroupPermissions>;
  adminDefaults?: GroupPermissions;
  inviteCode?: string | null;
  permissions?: GroupPermissions;
  restrictions?: Record<string, GroupPermissions>;
  mutedMembers?: Record<string, string | null>;
  /** Теги участников внутри группы: id участника → подпись рядом с именем. */
  memberTags?: Record<string, string>;
  history?: GroupEvent[];
  /** Роль смотрящего в группе; у личного диалога и «Избранного» — нет. */
  role?: GroupRole | null;
  /** Эффективные права смотрящего: по ним клиент гасит кнопки. */
  myPermissions?: EffectiveGroupPermissions;
  memberCount?: number;
  participants?: Participant[];
  members?: Participant[];
  /** Идентификаторы участников: по ним считается роль в группе. */
  memberIds?: string[];
  users?: User[];
  otherUser?: User;
  lastMessage?: Message | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  unreadCount?: number;
  pinnedMessage?: Message | null;
  pinnedMessages?: Message[];
  archived?: boolean;
  mutedUntil?: string | null;
  blocked?: boolean;
  /** Я заблокировал собеседника: писать и звонить нельзя. */
  blockedByMe?: boolean;
  /** Собеседник заблокировал меня: писать можно, но ему это не доставляется. */
  blockedByPeer?: boolean;
}

export interface AuthResult {
  accessToken: string;
  user?: User;
}

export interface PaginatedItems<T> {
  items: T[];
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  username?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  showLastSeen?: boolean;
  displayName?: string;
  username?: string;
  bio?: string;
  themeColor?: string;
  wallpaperUrl?: string;
  wallpaperAttachmentId?: string | null;
  notificationSoundEnabled?: boolean;
  birthday?: string | null;
}

export interface ReadReceipt {
  conversationId: string;
  messageIds: string[];
  userId: string;
  readAt: string;
}

export interface FavoriteNote {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationDraft {
  id: string;
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string;
  updatedAt: string;
}

export interface ChatFolder {
  id: string;
  userId: string;
  name: string;
  position: number;
  conversationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ScheduledMessageStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface ScheduledMessage {
  id: string;
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string;
  sendAt: string;
  status: ScheduledMessageStatus;
  createdAt: string;
  sentAt?: string;
  messageId?: string;
  failureReason?: string;
}

export type ReportReason = 'spam' | 'abuse' | 'fraud' | 'other';


