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
};

export type CurrentUser = PublicUser & {
  email: string;
  showLastSeen: boolean;
  notificationSoundEnabled: boolean;
  themeColor?: string;
  wallpaperUrl?: string;
};

export type Conversation = {
  id: string;
  type: "direct" | "saved";
  memberIds: string[];
  directKey: string;
  createdAt: string;
  updatedAt: string;
  lastMessageId?: string | undefined;
  /** Kept for clients and database files created by Yargram 0.1. */
  pinnedMessageId?: string | undefined;
  pinnedMessageIds: string[];
  archivedBy: string[];
  mutedUntilBy: Record<string, string | null>;
};

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
  };
}

/**
 * Профиль глазами конкретного смотрящего. Если владелец профиля заблокировал
 * смотрящего, тот видит только имя — как в Telegram: без аватара и без времени
 * визита («был(а) давно»).
 */
export function toPublicUserFor(user: User, viewerId?: string | null): PublicUser {
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
  };
}
