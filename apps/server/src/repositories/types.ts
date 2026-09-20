import type {
  Attachment,
  AttachmentView,
  CallMessage,
  CallRecord,
  Conversation,
  ConversationDraft,
  ConversationFolder,
  Message,
  ReactionEmoji,
  ReportReason,
  ScheduledMessage,
  User,
  FavoriteNote,
  UserReport,
} from "../domain/models.js";

export type CreateUserInput = Pick<User, "email" | "passwordHash" | "displayName" | "username">;
export type UpdateUserInput = {
  displayName?: string | undefined;
  username?: string | undefined;
  bio?: string | undefined;
  avatar?: AttachmentView | null | undefined;
  notificationSoundEnabled?: boolean | undefined;
  showLastSeen?: boolean | undefined;
  themeColor?: string | undefined;
  wallpaperUrl?: string | undefined;
  isVerified?: boolean;
  badge?: "yargram" | null;
  usernames?: string[];
  adminUserIds?: string[];
  isOwner?: boolean;
  isBanned?: boolean;
  isFrozen?: boolean;
};

export class RepositoryConflictError extends Error {
  constructor(public readonly field: "email" | "username") {
    super(`A user with this ${field} already exists`);
    this.name = "RepositoryConflictError";
  }
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  update(id: string, input: UpdateUserInput): Promise<User>;
  updateLastSeen(id: string, lastSeenAt: string): Promise<User>;
  setBlocked(userId: string, blockedUserId: string, blocked: boolean): Promise<User>;
  setFavorite(userId: string, messageId: string, favorite: boolean): Promise<User>;
  list(options: { query?: string; limit: number; excludeUserId?: string }): Promise<User[]>;
  findManyByIds(ids: string[]): Promise<User[]>;
}

export interface ConversationRepository {
  findOrCreateSaved(userId: string): Promise<{ conversation: Conversation; created: boolean }>;
  findOrCreateDirect(firstUserId: string, secondUserId: string): Promise<{
    conversation: Conversation;
    created: boolean;
  }>;
  findById(id: string): Promise<Conversation | null>;
  listForUser(userId: string): Promise<Conversation[]>;
  /** Yargram 0.1 compatibility: null clears every pin. */
  setPinnedMessage(conversationId: string, messageId: string | null): Promise<Conversation>;
  setMessagePinned(conversationId: string, messageId: string, pinned: boolean): Promise<Conversation>;
  updateUserSettings(
    conversationId: string,
    userId: string,
    input: { archived?: boolean; mutedUntil?: string | null },
  ): Promise<Conversation>;
}

export type CreateMessageInput = Pick<Message, "conversationId" | "senderId" | "text"> & {
  replyToId?: string;
  forwardedFromId?: string;
  attachmentIds?: string[];
  kind?: Message["kind"];
  systemEvent?: Message["systemEvent"];
  call?: CallMessage;
};

export interface MessageRepository {
  create(input: CreateMessageInput): Promise<Message>;
  listForConversation(
    conversationId: string,
    options: { limit: number; before?: string; query?: string },
  ): Promise<Message[]>;
  listByIds(ids: string[]): Promise<Message[]>;
  findById(id: string): Promise<Message | null>;
  findByAttachmentId(attachmentId: string): Promise<Message[]>;
  updateText(id: string, text: string): Promise<Message>;
  setReaction(id: string, userId: string, emoji: ReactionEmoji | null): Promise<Message>;
  deleteFromConversation(conversationId: string, id: string): Promise<Message>;
  markRead(conversationId: string, userId: string): Promise<{ messages: Message[]; messageIds: string[] }>;
}

export interface AttachmentRepository {
  create(input: Omit<Attachment, "id" | "createdAt">): Promise<Attachment>;
  findById(id: string): Promise<Attachment | null>;
  findManyByIds(ids: string[]): Promise<Attachment[]>;
  delete(id: string): Promise<Attachment | null>;
}

export interface ReportRepository {
  create(input: {
    reporterId: string;
    reportedUserId: string;
    reason: ReportReason;
    details?: string;
  }): Promise<UserReport>;
  list(): Promise<UserReport[]>;
}

export interface FavoriteNoteRepository {
  create(input: { userId: string; content: string }): Promise<FavoriteNote>;
  list(userId: string): Promise<FavoriteNote[]>;
  update(id: string, userId: string, content: string): Promise<FavoriteNote>;
  delete(id: string, userId: string): Promise<void>;
}
export interface CallRepository {
  create(input: Omit<CallRecord, "startedAt">): Promise<CallRecord>;
  findById(id: string): Promise<CallRecord | null>;
  update(id: string, input: Partial<Omit<CallRecord, "id" | "conversationId" | "initiatorId" | "startedAt">>): Promise<CallRecord>;
  listForConversation(conversationId: string): Promise<CallRecord[]>;
}


export interface DraftRepository {
  listForUser(userId: string): Promise<ConversationDraft[]>;
  find(userId: string, conversationId: string): Promise<ConversationDraft | null>;
  save(input: {
    userId: string;
    conversationId: string;
    text: string;
    attachmentIds: string[];
    replyToId?: string | undefined;
  }): Promise<ConversationDraft>;
  delete(userId: string, conversationId: string): Promise<void>;
}

export interface FolderRepository {
  listForUser(userId: string): Promise<ConversationFolder[]>;
  findById(id: string): Promise<ConversationFolder | null>;
  create(input: {
    userId: string;
    name: string;
    conversationIds?: string[] | undefined;
  }): Promise<ConversationFolder>;
  update(
    id: string,
    userId: string,
    input: {
      name?: string | undefined;
      position?: number | undefined;
      conversationIds?: string[] | undefined;
    },
  ): Promise<ConversationFolder>;
  delete(id: string, userId: string): Promise<void>;
}

export interface ScheduledMessageRepository {
  listForUser(userId: string): Promise<ScheduledMessage[]>;
  findById(id: string): Promise<ScheduledMessage | null>;
  create(input: {
    userId: string;
    conversationId: string;
    text: string;
    attachmentIds: string[];
    replyToId?: string | undefined;
    sendAt: string;
  }): Promise<ScheduledMessage>;
  update(
    id: string,
    userId: string,
    input: {
      text?: string | undefined;
      attachmentIds?: string[] | undefined;
      replyToId?: string | null | undefined;
      sendAt?: string | undefined;
    },
  ): Promise<ScheduledMessage>;
  cancel(id: string, userId: string): Promise<ScheduledMessage>;
  /** Takes ownership of a due message so two workers cannot send it twice. */
  claimDue(id: string): Promise<ScheduledMessage | null>;
  listDue(nowIso: string, limit: number): Promise<ScheduledMessage[]>;
  markSent(id: string, messageId: string, sentAt: string): Promise<ScheduledMessage>;
  markFailed(id: string, reason: string): Promise<ScheduledMessage>;
}

export type Repositories = {
  users: UserRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  attachments: AttachmentRepository;
  reports: ReportRepository;
  favoriteNotes: FavoriteNoteRepository;
  calls: CallRepository;
  drafts: DraftRepository;
  folders: FolderRepository;
  scheduledMessages: ScheduledMessageRepository;
};
