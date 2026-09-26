import { randomUUID } from "node:crypto";
import { defaultAdminPermissions } from "../domain/models.js";
import type {
  Attachment,
  CallRecord,
  Conversation,
  ConversationDraft,
  ConversationFolder,
  Message,
  Poll,
  ReactionEmoji,
  ScheduledMessage,
  User,
  FavoriteNote,
  UserReport,
} from "../domain/models.js";
import type { JsonDatabase } from "../storage/json-database.js";
import type {
  FavoriteNoteRepository,
  AttachmentRepository,
  CallRepository,
  ConversationRepository,
  CreateGroupInput,
  CreateMessageInput,
  CreateUserInput,
  DraftRepository,
  FolderRepository,
  MessageRepository,
  Repositories,
  ReportRepository,
  ScheduledMessageRepository,
  UpdateConversationInput,
  UpdateUserInput,
  UserRepository,
} from "./types.js";
import { RepositoryConflictError } from "./types.js";
import { AppError } from "../lib/errors.js";

class JsonUserRepository implements UserRepository {
  constructor(private readonly database: JsonDatabase) {}

  async create(input: CreateUserInput): Promise<User> {
    return this.database.transaction((state) => {
      if (state.users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
        throw new RepositoryConflictError("email");
      }
      if (
        input.username !== undefined &&
        state.users.some((user) => user.username?.toLowerCase() === input.username?.toLowerCase())
      ) {
        throw new RepositoryConflictError("username");
      }

      const now = new Date().toISOString();
      const user: User = {
        id: randomUUID(),
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        ...(input.username === undefined ? {} : { username: input.username }),
        bio: "",
        lastSeenAt: now,
        blockedUserIds: [],
        favoriteMessageIds: [],
        notificationSoundEnabled: true,
        showLastSeen: true,
        createdAt: now,
      };
      state.users.push(user);
      return user;
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.database.read((state) => state.users.find((user) => user.id === id) ?? null);
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    return this.database.read(
      (state) => state.users.find((user) => user.email.toLowerCase() === normalized) ?? null,
    );
  }

  async findByUsername(username: string): Promise<User | null> {
    const normalized = username.toLowerCase();
    return this.database.read(
      (state) =>
        state.users.find(
          (user) =>
            user.username?.toLowerCase() === normalized ||
            user.usernames?.some((alias) => alias.toLowerCase() === normalized),
        ) ?? null,
    );
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    return this.database.transaction((state) => {
      const user = state.users.find((candidate) => candidate.id === id);
      if (!user) throw new Error("User was not found");
      if (
        input.username !== undefined &&
        state.users.some(
          (candidate) =>
            candidate.id !== id &&
            candidate.username?.toLowerCase() === input.username?.toLowerCase(),
        )
      ) {
        throw new RepositoryConflictError("username");
      }
      if (input.displayName !== undefined) user.displayName = input.displayName;
      if (input.username !== undefined) user.username = input.username;
      if (input.bio !== undefined) user.bio = input.bio;
      if (input.showLastSeen !== undefined) user.showLastSeen = input.showLastSeen;
      if (input.avatar === null) delete user.avatar;
      else if (input.avatar !== undefined) user.avatar = input.avatar;
      if (input.themeColor !== undefined) user.themeColor = input.themeColor;
      if (input.wallpaperUrl !== undefined) user.wallpaperUrl = input.wallpaperUrl;
      if (input.notificationSoundEnabled !== undefined) user.notificationSoundEnabled = input.notificationSoundEnabled;
      if (input.isVerified !== undefined) user.isVerified = input.isVerified;
      if (input.badge !== undefined) user.badge = input.badge;
      if (input.scam !== undefined) user.scam = input.scam;
      if (input.usernames !== undefined) user.usernames = input.usernames;
      if (input.adminUserIds !== undefined) user.adminUserIds = input.adminUserIds;
      if (input.isOwner !== undefined) user.isOwner = input.isOwner;
      if (input.isBanned !== undefined) user.isBanned = input.isBanned;
      if (input.isFrozen !== undefined) user.isFrozen = input.isFrozen;
      if (input.isDeleted !== undefined) user.isDeleted = input.isDeleted;
      if (input.deletedAt !== undefined) user.deletedAt = input.deletedAt;
      if (input.birthday !== undefined) {
        if (input.birthday === null) delete user.birthday;
        else user.birthday = input.birthday;
      }
      return user;
    });
  }

  async updateLastSeen(id: string, lastSeenAt: string): Promise<User> {
    return this.database.transaction((state) => {
      const user = state.users.find((candidate) => candidate.id === id);
      if (!user) throw new Error("User was not found");
      user.lastSeenAt = lastSeenAt;
      return user;
    });
  }

  async setBlocked(userId: string, blockedUserId: string, blocked: boolean): Promise<User> {
    return this.database.transaction((state) => {
      const user = state.users.find((candidate) => candidate.id === userId);
      if (!user) throw new Error("User was not found");
      const ids = new Set(user.blockedUserIds);
      if (blocked) ids.add(blockedUserId);
      else ids.delete(blockedUserId);
      user.blockedUserIds = [...ids];
      return user;
    });
  }

  async setFavorite(userId: string, messageId: string, favorite: boolean): Promise<User> {
    return this.database.transaction((state) => {
      const user = state.users.find((candidate) => candidate.id === userId);
      if (!user) throw new Error("User was not found");
      const ids = new Set(user.favoriteMessageIds);
      if (favorite) ids.add(messageId);
      else ids.delete(messageId);
      user.favoriteMessageIds = [...ids];
      return user;
    });
  }

  async list(options: {
    query?: string;
    limit: number;
    excludeUserId?: string;
  }): Promise<User[]> {
    const query = options.query?.trim().replace(/^@/, "").toLowerCase();
    return this.database.read((state) =>
      state.users
        .filter((user) => user.id !== options.excludeUserId)
        .filter((user) => {
          if (!query) return true;
          const names = [user.username ?? "", ...(user.usernames ?? [])];
          return names.some((name) => name.toLowerCase().includes(query));
        })
        .sort((a, b) =>
          (a.username ?? a.displayName).localeCompare(b.username ?? b.displayName, "ru"),
        )
        .slice(0, options.limit),
    );
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    const idSet = new Set(ids);
    return this.database.read((state) => state.users.filter((user) => idSet.has(user.id)));
  }

  async delete(id: string): Promise<User | null> {
    return this.database.transaction((state) => {
      const index = state.users.findIndex((user) => user.id === id);
      if (index === -1) return null;
      return state.users.splice(index, 1)[0] ?? null;
    });
  }
}

class JsonConversationRepository implements ConversationRepository {
  constructor(private readonly database: JsonDatabase) {}

  async findOrCreateSaved(userId: string) {
    return this.database.transaction((state) => {
      const directKey = `saved:${userId}`;
      const existing = state.conversations.find((conversation) => conversation.directKey === directKey);
      if (existing) return { conversation: existing, created: false };
      const timestamp = new Date().toISOString();
      const conversation: Conversation = {
        id: randomUUID(), type: "saved", memberIds: [userId], directKey,
        createdAt: timestamp, updatedAt: timestamp, pinnedMessageIds: [], archivedBy: [], mutedUntilBy: {},
      };
      state.conversations.push(conversation);
      return { conversation, created: true };
    });
  }

  async findOrCreateDirect(firstUserId: string, secondUserId: string) {
    const memberIds = [firstUserId, secondUserId].sort();
    const directKey = memberIds.join(":");

    return this.database.transaction((state) => {
      const existing = state.conversations.find(
        (conversation) => conversation.directKey === directKey,
      );
      if (existing) return { conversation: existing, created: false };

      const now = new Date().toISOString();
      const conversation: Conversation = {
        id: randomUUID(),
        type: "direct",
        memberIds,
        directKey,
        createdAt: now,
        updatedAt: now,
        pinnedMessageIds: [],
        archivedBy: [],
        mutedUntilBy: {},
      };
      state.conversations.push(conversation);
      return { conversation, created: true };
    });
  }

  async createGroup(input: CreateGroupInput): Promise<Conversation> {
    return this.database.transaction((state) => {
      const now = new Date().toISOString();
      const memberIds = [input.ownerId, ...input.memberIds.filter((id) => id !== input.ownerId)];
      const conversation: Conversation = {
        id: randomUUID(),
        type: "group",
        memberIds,
        // Ключ личного диалога группе не нужен, но поле обязательное.
        directKey: "",
        createdAt: now,
        updatedAt: now,
        pinnedMessageIds: [],
        archivedBy: [],
        mutedUntilBy: {},
        title: input.title,
        description: input.description ?? "",
        avatarUrl: input.avatarUrl ?? null,
        ownerId: input.ownerId,
        adminIds: [],
        adminDefaults: defaultAdminPermissions(),
        inviteCode: input.inviteCode ?? "",
        permissions: {},
        restrictions: {},
        mutedMembers: {},
        leftIds: [],
        history: [
          { id: randomUUID(), at: now, actorId: input.ownerId, kind: "created", detail: input.title },
        ],
      };
      state.conversations.push(conversation);
      return conversation;
    });
  }

  async findByInviteCode(code: string): Promise<Conversation | null> {
    if (!code) return null;
    return this.database.read(
      (state) => state.conversations.find((conversation) => conversation.inviteCode === code) ?? null,
    );
  }

  async searchGroups(query: string, limit: number): Promise<Conversation[]> {
    const wanted = query.trim().toLowerCase();
    return this.database.read((state) =>
      state.conversations
        .filter((conversation) => conversation.type === "group")
        .filter((conversation) => {
          if (!wanted) return true;
          return (
            conversation.id === wanted ||
            (conversation.inviteCode ?? "").toLowerCase() === wanted ||
            (conversation.title ?? "").toLowerCase().includes(wanted)
          );
        })
        .slice(0, limit),
    );
  }

  async update(id: string, input: UpdateConversationInput): Promise<Conversation> {
    return this.database.transaction((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === id);
      if (!conversation) throw new Error("Conversation was not found");
      if (input.title !== undefined) conversation.title = input.title;
      if (input.description !== undefined) conversation.description = input.description;
      if (input.avatarUrl !== undefined) conversation.avatarUrl = input.avatarUrl;
      if (input.memberIds !== undefined) conversation.memberIds = input.memberIds;
      if (input.ownerId !== undefined) conversation.ownerId = input.ownerId;
      if (input.adminIds !== undefined) conversation.adminIds = input.adminIds;
      if (input.adminPermissions !== undefined) conversation.adminPermissions = input.adminPermissions;
      if (input.adminDefaults !== undefined) conversation.adminDefaults = input.adminDefaults;
      if (input.inviteCode !== undefined) conversation.inviteCode = input.inviteCode;
      if (input.permissions !== undefined) conversation.permissions = input.permissions;
      if (input.restrictions !== undefined) conversation.restrictions = input.restrictions;
      if (input.mutedMembers !== undefined) conversation.mutedMembers = input.mutedMembers;
      if (input.memberTags !== undefined) conversation.memberTags = input.memberTags;
      if (input.leftIds !== undefined) conversation.leftIds = input.leftIds;
      if (input.history !== undefined) conversation.history = input.history;
      if (input.isVerified !== undefined) conversation.isVerified = input.isVerified;
      if (input.badge !== undefined) conversation.badge = input.badge;
      if (input.scam !== undefined) conversation.scam = input.scam;
      conversation.updatedAt = new Date().toISOString();
      return conversation;
    });
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.database.read(
      (state) => state.conversations.find((conversation) => conversation.id === id) ?? null,
    );
  }

  async listForUser(userId: string): Promise<Conversation[]> {
    return this.database.read((state) =>
      state.conversations
        .filter((conversation) => conversation.memberIds.includes(userId))
        // Вышедший не видит группу, даже пока остаётся в memberIds.
        .filter((conversation) => !(conversation.leftIds ?? []).includes(userId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  async setPinnedMessage(conversationId: string, messageId: string | null): Promise<Conversation> {
    return this.database.transaction((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      if (!conversation) throw new Error("Conversation was not found");
      if (messageId === null) {
        delete conversation.pinnedMessageId;
        conversation.pinnedMessageIds = [];
      } else {
        conversation.pinnedMessageIds = [
          ...conversation.pinnedMessageIds.filter((id) => id !== messageId),
          messageId,
        ];
        conversation.pinnedMessageId = messageId;
      }
      return conversation;
    });
  }

  async setMessagePinned(
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<Conversation> {
    return this.database.transaction((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      if (!conversation) throw new Error("Conversation was not found");
      const ids = conversation.pinnedMessageIds.filter((id) => id !== messageId);
      if (pinned) ids.push(messageId);
      conversation.pinnedMessageIds = ids;
      const latest = ids.at(-1);
      if (latest) conversation.pinnedMessageId = latest;
      else delete conversation.pinnedMessageId;
      return conversation;
    });
  }

  async updateUserSettings(
    conversationId: string,
    userId: string,
    input: { archived?: boolean; mutedUntil?: string | null },
  ): Promise<Conversation> {
    return this.database.transaction((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      if (!conversation) throw new Error("Conversation was not found");
      if (input.archived !== undefined) {
        const archived = new Set(conversation.archivedBy);
        if (input.archived) archived.add(userId);
        else archived.delete(userId);
        conversation.archivedBy = [...archived];
      }
      if (input.mutedUntil !== undefined) {
        if (input.mutedUntil === null) delete conversation.mutedUntilBy[userId];
        else conversation.mutedUntilBy[userId] = input.mutedUntil;
      }
      return conversation;
    });
  }
}

class JsonMessageRepository implements MessageRepository {
  constructor(private readonly database: JsonDatabase) {}

  async countUnread(conversationIds: string[], userId: string): Promise<Record<string, number>> {
    const wanted = new Set(conversationIds);
    return this.database.transaction((state) => {
      const counts: Record<string, number> = {};
      for (const id of conversationIds) counts[id] = 0;
      for (const message of state.messages) {
        if (!wanted.has(message.conversationId)) continue;
        if (message.senderId === userId || message.readBy.includes(userId)) continue;
        counts[message.conversationId] = (counts[message.conversationId] ?? 0) + 1;
      }
      return counts;
    });
  }

  async updatePoll(id: string, poll: Poll): Promise<Message> {
    return this.database.transaction((state) => {
      const message = state.messages.find((candidate) => candidate.id === id);
      if (!message) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found");
      message.poll = poll;
      return message;
    });
  }

  async create(input: CreateMessageInput): Promise<Message> {
    return this.database.transaction((state) => {
      const message: Message = {
        id: randomUUID(),
        conversationId: input.conversationId,
        senderId: input.senderId,
        text: input.text,
        kind: input.kind ?? "user",
        ...(input.systemEvent === undefined ? {} : { systemEvent: input.systemEvent }),
        ...(input.call === undefined ? {} : { call: input.call }),
        ...(input.poll === undefined ? {} : { poll: input.poll }),
        createdAt: new Date().toISOString(),
        ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        ...(input.forwardedFromId === undefined ? {} : { forwardedFromId: input.forwardedFromId }),
        attachmentIds: [...new Set(input.attachmentIds ?? [])],
        reactions: [],
        readBy: [input.senderId],
      };
      state.messages.push(message);

      const conversation = state.conversations.find(
        (candidate) => candidate.id === input.conversationId,
      );
      if (conversation) {
        conversation.lastMessageId = message.id;
        conversation.updatedAt = message.createdAt;
      }
      return message;
    });
  }

  async listForConversation(
    conversationId: string,
    options: { limit: number; before?: string; query?: string },
  ): Promise<Message[]> {
    const query = options.query?.trim().toLocaleLowerCase("ru-RU");
    return this.database.read((state) => {
      const messages = state.messages
        .filter((message) => message.conversationId === conversationId)
        .filter((message) => options.before === undefined || message.createdAt < options.before)
        .filter((message) => !query || message.text.toLocaleLowerCase("ru-RU").includes(query))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit);
      return messages.reverse();
    });
  }

  async listByIds(ids: string[]): Promise<Message[]> {
    return this.database.read((state) => {
      const messagesById = new Map(state.messages.map((message) => [message.id, message]));
      return ids.flatMap((id) => {
        const message = messagesById.get(id);
        return message ? [message] : [];
      });
    });
  }

  async findById(id: string): Promise<Message | null> {
    return this.database.read(
      (state) => state.messages.find((message) => message.id === id) ?? null,
    );
  }

  async findByAttachmentId(attachmentId: string): Promise<Message[]> {
    return this.database.read((state) =>
      state.messages.filter((message) => message.attachmentIds.includes(attachmentId)),
    );
  }

  async updateText(id: string, text: string): Promise<Message> {
    return this.database.transaction((state) => {
      const message = state.messages.find((candidate) => candidate.id === id);
      if (!message) throw new Error("Message was not found");
      message.text = text;
      message.editedAt = new Date().toISOString();
      return message;
    });
  }

  async setReaction(id: string, userId: string, emoji: ReactionEmoji | null): Promise<Message> {
    return this.database.transaction((state) => {
      const message = state.messages.find((candidate) => candidate.id === id);
      if (!message) throw new Error("Message was not found");
      message.reactions = message.reactions.filter((reaction) => reaction.userId !== userId);
      if (emoji !== null) {
        message.reactions.push({ userId, emoji, createdAt: new Date().toISOString() });
      }
      return message;
    });
  }

  async deleteFromConversation(conversationId: string, id: string): Promise<Message> {
    return this.database.transaction((state) => {
      const index = state.messages.findIndex(
        (candidate) => candidate.id === id && candidate.conversationId === conversationId,
      );
      if (index === -1) throw new Error("Message was not found");
      const [message] = state.messages.splice(index, 1);
      if (!message) throw new Error("Message was not found");

      for (const user of state.users) {
        user.favoriteMessageIds = user.favoriteMessageIds.filter((messageId) => messageId !== id);
      }
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      if (conversation) {
        conversation.pinnedMessageIds = conversation.pinnedMessageIds.filter(
          (messageId) => messageId !== id,
        );
        const latestPin = conversation.pinnedMessageIds.at(-1);
        if (latestPin) conversation.pinnedMessageId = latestPin;
        else delete conversation.pinnedMessageId;
        let latest: Message | undefined;
        for (const candidate of state.messages) {
          if (candidate.conversationId !== conversationId) continue;
          if (!latest || candidate.createdAt >= latest.createdAt) latest = candidate;
        }
        if (latest) {
          conversation.lastMessageId = latest.id;
          conversation.updatedAt = latest.createdAt;
        } else {
          delete conversation.lastMessageId;
          conversation.updatedAt = conversation.createdAt;
        }
      }
      return message;
    });
  }

  async markRead(
    conversationId: string,
    userId: string,
  ): Promise<{ messages: Message[]; messageIds: string[] }> {
    return this.database.transaction((state) => {
      const changed: Message[] = [];
      for (const message of state.messages) {
        if (message.conversationId !== conversationId || message.readBy.includes(userId)) continue;
        message.readBy.push(userId);
        changed.push(message);
      }
      return { messages: changed, messageIds: changed.map((message) => message.id) };
    });
  }
}

class JsonAttachmentRepository implements AttachmentRepository {
  constructor(private readonly database: JsonDatabase) {}

  async create(input: Omit<Attachment, "id" | "createdAt">): Promise<Attachment> {
    return this.database.transaction((state) => {
      const attachment: Attachment = {
        id: randomUUID(),
        ...input,
        createdAt: new Date().toISOString(),
      };
      state.attachments.push(attachment);
      return attachment;
    });
  }

  async findById(id: string): Promise<Attachment | null> {
    return this.database.read(
      (state) => state.attachments.find((attachment) => attachment.id === id) ?? null,
    );
  }

  async findManyByIds(ids: string[]): Promise<Attachment[]> {
    return this.database.read((state) => {
      const attachmentsById = new Map(
        state.attachments.map((attachment) => [attachment.id, attachment]),
      );
      return ids.flatMap((id) => {
        const attachment = attachmentsById.get(id);
        return attachment ? [attachment] : [];
      });
    });
  }

  async listByOwner(ownerId: string): Promise<Attachment[]> {
    return this.database.read((state) =>
      state.attachments.filter((attachment) => attachment.ownerId === ownerId),
    );
  }

  async delete(id: string): Promise<Attachment | null> {
    return this.database.transaction((state) => {
      const index = state.attachments.findIndex((attachment) => attachment.id === id);
      if (index === -1) return null;
      return state.attachments.splice(index, 1)[0] ?? null;
    });
  }
}

class JsonReportRepository implements ReportRepository {
  constructor(private readonly database: JsonDatabase) {}

  async create(input: {
    reporterId: string;
    reportedUserId: string;
    reason: UserReport["reason"];
    details?: string;
  }): Promise<UserReport> {
    return this.database.transaction((state) => {
      const report: UserReport = {
        id: randomUUID(),
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        reason: input.reason,
        ...(input.details === undefined ? {} : { details: input.details }),
        createdAt: new Date().toISOString(),
      };
      state.reports.push(report);
      return report;
    });
  }

  async list(): Promise<UserReport[]> {
    return this.database.read((state) =>
      [...state.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
}

class JsonFavoriteNoteRepository implements FavoriteNoteRepository {
  constructor(private readonly database: JsonDatabase) {}

  async create(input: { userId: string; content: string }): Promise<FavoriteNote> {
    return this.database.transaction((state) => {
      const note: FavoriteNote = {
        id: randomUUID(),
        userId: input.userId,
        content: input.content,
        createdAt: new Date().toISOString(),
      };
      state.favoriteNotes.push(note);
      return note;
    });
  }

  async list(userId: string): Promise<FavoriteNote[]> {
    return this.database.read((state) => {
      const notes = state.favoriteNotes;
      return notes.filter((note: FavoriteNote) => note.userId === userId);
    });
  }

  async update(id: string, userId: string, content: string): Promise<FavoriteNote> {
    return this.database.transaction((state) => {
      const notes = state.favoriteNotes;
      const note = notes.find((n) => n.id === id && n.userId === userId);
      if (!note) throw new AppError(404, "NOTE_NOT_FOUND", "Note not found");
      note.content = content;
      note.updatedAt = new Date().toISOString();
      return note;
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    return this.database.transaction((state) => {
      const notes = state.favoriteNotes;
      const index = notes.findIndex((n) => n.id === id && n.userId === userId);
      if (index === -1) throw new AppError(404, "NOTE_NOT_FOUND", "Note not found");
      notes.splice(index, 1);
    });
  }
}
class JsonCallRepository implements CallRepository {
  constructor(private readonly database: JsonDatabase) {}

  async create(input: Omit<CallRecord, "startedAt">): Promise<CallRecord> {
    return this.database.transaction((state) => {
      const existing = state.calls.find((call) => call.id === input.id);
      if (existing) return existing;
      const call: CallRecord = { ...input, startedAt: new Date().toISOString() };
      state.calls.push(call);
      return call;
    });
  }

  async findById(id: string): Promise<CallRecord | null> {
    return this.database.read((state) => state.calls.find((call) => call.id === id) ?? null);
  }

  async update(
    id: string,
    input: Partial<Omit<CallRecord, "id" | "conversationId" | "initiatorId" | "startedAt">>,
  ): Promise<CallRecord> {
    return this.database.transaction((state) => {
      const call = state.calls.find((candidate) => candidate.id === id);
      if (!call) throw new Error("Call was not found");
      Object.assign(call, input);
      return call;
    });
  }

  async listForConversation(conversationId: string): Promise<CallRecord[]> {
    return this.database.read((state) =>
      state.calls
        .filter((call) => call.conversationId === conversationId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    );
  }
}

class JsonDraftRepository implements DraftRepository {
  constructor(private readonly database: JsonDatabase) {}

  async listForUser(userId: string): Promise<ConversationDraft[]> {
    return this.database.read((state) => state.drafts.filter((draft) => draft.userId === userId));
  }

  async find(userId: string, conversationId: string): Promise<ConversationDraft | null> {
    return this.database.read(
      (state) =>
        state.drafts.find(
          (draft) => draft.userId === userId && draft.conversationId === conversationId,
        ) ?? null,
    );
  }

  async save(input: {
    userId: string;
    conversationId: string;
    text: string;
    attachmentIds: string[];
    replyToId?: string | undefined;
  }): Promise<ConversationDraft> {
    return this.database.transaction((state) => {
      const existing = state.drafts.find(
        (draft) => draft.userId === input.userId && draft.conversationId === input.conversationId,
      );
      const updatedAt = new Date().toISOString();
      if (existing) {
        existing.text = input.text;
        existing.attachmentIds = [...input.attachmentIds];
        if (input.replyToId === undefined) delete existing.replyToId;
        else existing.replyToId = input.replyToId;
        existing.updatedAt = updatedAt;
        return existing;
      }
      const draft: ConversationDraft = {
        id: randomUUID(),
        userId: input.userId,
        conversationId: input.conversationId,
        text: input.text,
        attachmentIds: [...input.attachmentIds],
        ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        updatedAt,
      };
      state.drafts.push(draft);
      return draft;
    });
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    await this.database.transaction((state) => {
      state.drafts = state.drafts.filter(
        (draft) => !(draft.userId === userId && draft.conversationId === conversationId),
      );
    });
  }
}

class JsonFolderRepository implements FolderRepository {
  constructor(private readonly database: JsonDatabase) {}

  async listForUser(userId: string): Promise<ConversationFolder[]> {
    return this.database.read((state) =>
      state.folders
        .filter((folder) => folder.userId === userId)
        .sort(
          (first, second) =>
            first.position - second.position || first.createdAt.localeCompare(second.createdAt),
        ),
    );
  }

  async findById(id: string): Promise<ConversationFolder | null> {
    return this.database.read((state) => state.folders.find((folder) => folder.id === id) ?? null);
  }

  async create(input: {
    userId: string;
    name: string;
    conversationIds?: string[] | undefined;
  }): Promise<ConversationFolder> {
    return this.database.transaction((state) => {
      const timestamp = new Date().toISOString();
      const position = state.folders
        .filter((folder) => folder.userId === input.userId)
        .reduce((next, folder) => Math.max(next, folder.position + 1), 0);
      const folder: ConversationFolder = {
        id: randomUUID(),
        userId: input.userId,
        name: input.name,
        position,
        conversationIds: [...new Set(input.conversationIds ?? [])],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.folders.push(folder);
      return folder;
    });
  }

  async update(
    id: string,
    userId: string,
    input: {
      name?: string | undefined;
      position?: number | undefined;
      conversationIds?: string[] | undefined;
    },
  ): Promise<ConversationFolder> {
    return this.database.transaction((state) => {
      const folder = state.folders.find(
        (candidate) => candidate.id === id && candidate.userId === userId,
      );
      if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found");
      if (input.name !== undefined) folder.name = input.name;
      if (input.position !== undefined) folder.position = input.position;
      if (input.conversationIds !== undefined) {
        folder.conversationIds = [...new Set(input.conversationIds)];
      }
      folder.updatedAt = new Date().toISOString();
      return folder;
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.database.transaction((state) => {
      const index = state.folders.findIndex(
        (folder) => folder.id === id && folder.userId === userId,
      );
      if (index === -1) throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found");
      state.folders.splice(index, 1);
    });
  }
}

class JsonScheduledMessageRepository implements ScheduledMessageRepository {
  constructor(private readonly database: JsonDatabase) {}

  async listForUser(userId: string): Promise<ScheduledMessage[]> {
    return this.database.read((state) =>
      state.scheduledMessages
        .filter((item) => item.userId === userId)
        .sort((first, second) => first.sendAt.localeCompare(second.sendAt)),
    );
  }

  async findById(id: string): Promise<ScheduledMessage | null> {
    return this.database.read(
      (state) => state.scheduledMessages.find((item) => item.id === id) ?? null,
    );
  }

  async create(input: {
    userId: string;
    conversationId: string;
    text: string;
    attachmentIds: string[];
    replyToId?: string | undefined;
    sendAt: string;
  }): Promise<ScheduledMessage> {
    return this.database.transaction((state) => {
      const scheduled: ScheduledMessage = {
        id: randomUUID(),
        userId: input.userId,
        conversationId: input.conversationId,
        text: input.text,
        attachmentIds: [...input.attachmentIds],
        ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        sendAt: input.sendAt,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      state.scheduledMessages.push(scheduled);
      return scheduled;
    });
  }

  async update(
    id: string,
    userId: string,
    input: {
      text?: string | undefined;
      attachmentIds?: string[] | undefined;
      replyToId?: string | null | undefined;
      sendAt?: string | undefined;
    },
  ): Promise<ScheduledMessage> {
    return this.database.transaction((state) => {
      const scheduled = state.scheduledMessages.find(
        (candidate) => candidate.id === id && candidate.userId === userId,
      );
      if (!scheduled) {
        throw new AppError(404, "SCHEDULED_NOT_FOUND", "Scheduled message was not found");
      }
      if (scheduled.status !== "pending") {
        throw new AppError(409, "SCHEDULED_NOT_PENDING", "Only a pending message can be changed");
      }
      if (input.text !== undefined) scheduled.text = input.text;
      if (input.attachmentIds !== undefined) scheduled.attachmentIds = [...input.attachmentIds];
      if (input.replyToId === null) delete scheduled.replyToId;
      else if (input.replyToId !== undefined) scheduled.replyToId = input.replyToId;
      if (input.sendAt !== undefined) scheduled.sendAt = input.sendAt;
      return scheduled;
    });
  }

  async cancel(id: string, userId: string): Promise<ScheduledMessage> {
    return this.database.transaction((state) => {
      const scheduled = state.scheduledMessages.find(
        (candidate) => candidate.id === id && candidate.userId === userId,
      );
      if (!scheduled) {
        throw new AppError(404, "SCHEDULED_NOT_FOUND", "Scheduled message was not found");
      }
      if (scheduled.status !== "pending") {
        throw new AppError(409, "SCHEDULED_NOT_PENDING", "Only a pending message can be cancelled");
      }
      scheduled.status = "cancelled";
      return scheduled;
    });
  }

  async claimDue(id: string): Promise<ScheduledMessage | null> {
    return this.database.transaction((state) => {
      const scheduled = state.scheduledMessages.find((item) => item.id === id);
      if (!scheduled || scheduled.status !== "pending") return null;
      scheduled.status = "sending";
      return scheduled;
    });
  }

  async listDue(nowIso: string, limit: number): Promise<ScheduledMessage[]> {
    return this.database.read((state) =>
      state.scheduledMessages
        .filter((item) => item.status === "pending" && item.sendAt <= nowIso)
        .sort((first, second) => first.sendAt.localeCompare(second.sendAt))
        .slice(0, limit),
    );
  }

  async markSent(id: string, messageId: string, sentAt: string): Promise<ScheduledMessage> {
    return this.database.transaction((state) => {
      const scheduled = state.scheduledMessages.find((item) => item.id === id);
      if (!scheduled) throw new Error("Scheduled message was not found");
      scheduled.status = "sent";
      scheduled.messageId = messageId;
      scheduled.sentAt = sentAt;
      delete scheduled.failureReason;
      return scheduled;
    });
  }

  async markFailed(id: string, reason: string): Promise<ScheduledMessage> {
    return this.database.transaction((state) => {
      const scheduled = state.scheduledMessages.find((item) => item.id === id);
      if (!scheduled) throw new Error("Scheduled message was not found");
      scheduled.status = "failed";
      scheduled.failureReason = reason.slice(0, 300);
      return scheduled;
    });
  }
}

export function createJsonRepositories(database: JsonDatabase): Repositories {
  return {
    users: new JsonUserRepository(database),
    conversations: new JsonConversationRepository(database),
    messages: new JsonMessageRepository(database),
    attachments: new JsonAttachmentRepository(database),
    reports: new JsonReportRepository(database),
    favoriteNotes: new JsonFavoriteNoteRepository(database),
    calls: new JsonCallRepository(database),
    drafts: new JsonDraftRepository(database),
    folders: new JsonFolderRepository(database),
    scheduledMessages: new JsonScheduledMessageRepository(database),
  };
}
