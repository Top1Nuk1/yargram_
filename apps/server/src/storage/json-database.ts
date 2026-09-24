import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { allowedReactionEmojis, groupPermissions, type DatabaseState } from "../domain/models.js";

const attachmentKindSchema = z.enum(["image", "file", "avatar"]);
const attachmentSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  kind: attachmentKindSchema,
  mediaKind: z.enum(["voice", "video_circle"]).optional(),
  durationSeconds: z.number().finite().positive().optional(),
  fileName: z.string(),
  storedFileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: z.string(),
});
const attachmentViewSchema = attachmentSchema.omit({ storedFileName: true }).extend({
  url: z.string(),
});

const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    passwordHash: z.string(),
    displayName: z.string(),
    username: z.string().optional(),
    bio: z.string().default(""),
    avatar: attachmentViewSchema.optional(),
    lastSeenAt: z.string().optional(),
    blockedUserIds: z.array(z.string()).default([]),
    favoriteMessageIds: z.array(z.string()).default([]),
    notificationSoundEnabled: z.boolean().default(true),
    showLastSeen: z.boolean().default(true),
    themeColor: z.string().optional(),
    wallpaperUrl: z.string().optional(),
    isVerified: z.boolean().optional(),
    badge: z.enum(["yargram"]).nullable().optional(),
    usernames: z.array(z.string()).optional(),
    adminUserIds: z.array(z.string()).optional(),
    isOwner: z.boolean().optional(),
    isBanned: z.boolean().optional(),
    isFrozen: z.boolean().optional(),
    isDeleted: z.boolean().optional(),
    deletedAt: z.string().optional(),
    birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Birthday must be a YYYY-MM-DD date").optional(),
    createdAt: z.string(),
  })
  .transform((user) => ({
    ...user,
    lastSeenAt: user.lastSeenAt ?? user.createdAt,
    blockedUserIds: [...new Set(user.blockedUserIds.filter((id) => id !== user.id))],
    favoriteMessageIds: [...new Set(user.favoriteMessageIds)],
  }));

/**
 * Ключи прав берём из домена: своя копия списка рано или поздно разъехалась бы
 * с ним, и хранилище молча вырезало бы новые права при чтении.
 */
const groupPermissionsSchema = z
  .object(
    Object.fromEntries(groupPermissions.map((permission) => [permission, z.boolean().optional()])),
  )
  .optional();

const groupEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  actorId: z.string(),
  kind: z.string(),
  targetId: z.string().optional(),
  detail: z.string().optional(),
});

const pollOptionSchema = z.object({ id: z.string(), text: z.string() });
const pollSettingsSchema = z.object({
  showNames: z.boolean().default(true),
  multiple: z.boolean().default(false),
  addOptions: z.boolean().default(true),
  changeVote: z.boolean().default(true),
  shuffle: z.boolean().default(false),
  correctOptionIds: z.array(z.string()).default([]),
  deadline: z.string().nullable().default(null),
});
const pollSchema = z.object({
  question: z.string(),
  description: z.string().default(""),
  options: z.array(pollOptionSchema).default([]),
  settings: pollSettingsSchema,
  votes: z.record(z.string(), z.array(z.string())).default({}),
  closed: z.boolean().default(false),
});

const conversationSchema = z
  .object({
    id: z.string(),
    type: z.enum(["direct", "saved", "group"]),
    memberIds: z.array(z.string()),
    directKey: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastMessageId: z.string().optional(),
    pinnedMessageId: z.string().optional(),
    pinnedMessageIds: z.array(z.string()).optional(),
    archivedBy: z.array(z.string()).default([]),
    mutedUntilBy: z.record(z.string(), z.string().nullable()).default({}),
    title: z.string().optional(),
    description: z.string().optional(),
    avatarUrl: z.string().nullable().optional(),
    ownerId: z.string().optional(),
    adminIds: z.array(z.string()).optional(),
    adminPermissions: z.record(z.string(), groupPermissionsSchema).optional(),
    adminDefaults: groupPermissionsSchema,
    inviteCode: z.string().optional(),
    permissions: groupPermissionsSchema,
    restrictions: z.record(z.string(), groupPermissionsSchema).optional(),
    mutedMembers: z.record(z.string(), z.string().nullable()).optional(),
    memberTags: z.record(z.string(), z.string()).optional(),
    leftIds: z.array(z.string()).optional(),
    history: z.array(groupEventSchema).optional(),
  })
  .transform((conversation) => {
    const pinnedMessageIds = [...new Set(conversation.pinnedMessageIds ?? [])];
    if (conversation.pinnedMessageId && !pinnedMessageIds.includes(conversation.pinnedMessageId)) {
      pinnedMessageIds.push(conversation.pinnedMessageId);
    }
    const pinnedMessageId = pinnedMessageIds.at(-1);
    return {
      ...conversation,
      ...(pinnedMessageId ? { pinnedMessageId } : {}),
      pinnedMessageIds,
      archivedBy: [...new Set(conversation.archivedBy)].filter((id) =>
        conversation.memberIds.includes(id),
      ),
      mutedUntilBy: Object.fromEntries(
        Object.entries(conversation.mutedUntilBy).filter(([id]) =>
          conversation.memberIds.includes(id),
        ),
      ),
    };
  });

const callMessageSchema = z.object({
  callId: z.string(),
  callerId: z.string(),
  mode: z.enum(["audio", "video"]),
  outcome: z.enum(["completed", "missed", "declined", "unanswered"]),
  startedAt: z.string(),
  endedAt: z.string(),
  durationSeconds: z.number().int().nonnegative(),
});
const messageSchema = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    senderId: z.string(),
    text: z.string(),
    kind: z.enum(["user", "system", "poll"]).default("user"),
    systemEvent: z.enum(["call", "user_joined", "user_left"]).optional(),
    call: callMessageSchema.optional(),
    poll: pollSchema.optional(),
    createdAt: z.string(),
    editedAt: z.string().optional(),
    replyToId: z.string().optional(),
    forwardedFromId: z.string().optional(),
    attachmentIds: z.array(z.string()).default([]),
    reactions: z
      .array(
        z.object({
          userId: z.string(),
          emoji: z.enum(allowedReactionEmojis),
          createdAt: z.string(),
        }),
      )
      .default([]),
    readBy: z.array(z.string()).optional(),
  })
  .transform((message) => {
    const reactionsByUser = new Map(message.reactions.map((reaction) => [reaction.userId, reaction]));
    return {
      ...message,
      attachmentIds: [...new Set(message.attachmentIds)],
      reactions: [...reactionsByUser.values()],
      readBy: [...new Set([message.senderId, ...(message.readBy ?? [])])],
    };
  });

const reportSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  reportedUserId: z.string(),
  reason: z.enum(["spam", "abuse", "fraud", "other"]),
  details: z.string().optional(),
  createdAt: z.string(),
});

const callSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  initiatorId: z.string(),
  mode: z.enum(["audio", "video"]),
  status: z.enum(["ringing", "active", "completed", "missed", "rejected", "not_answered"]),
  startedAt: z.string(),
  answeredAt: z.string().optional(),
  endedAt: z.string().optional(),
  endedById: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

const favoriteNoteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

const draftSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conversationId: z.string(),
  text: z.string(),
  attachmentIds: z.array(z.string()),
  replyToId: z.string().optional(),
  updatedAt: z.string(),
});

const folderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  position: z.number().int(),
  conversationIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const scheduledMessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conversationId: z.string(),
  text: z.string(),
  attachmentIds: z.array(z.string()),
  replyToId: z.string().optional(),
  sendAt: z.string(),
  status: z.enum(["pending", "sending", "sent", "failed", "cancelled"]),
  createdAt: z.string(),
  sentAt: z.string().optional(),
  messageId: z.string().optional(),
  failureReason: z.string().optional(),
});

export const databaseSchema = z.object({
  version: z.literal(1),
  users: z.array(userSchema),
  conversations: z.array(conversationSchema),
  messages: z.array(messageSchema),
  attachments: z.array(attachmentSchema).default([]),
  reports: z.array(reportSchema).default([]),
  calls: z.array(callSchema).default([]),
  favoriteNotes: z.array(favoriteNoteSchema).default([]),
  drafts: z.array(draftSchema).default([]),
  folders: z.array(folderSchema).default([]),
  scheduledMessages: z.array(scheduledMessageSchema).default([]),
});

const emptyState = (): DatabaseState => ({
  version: 1,
  users: [],
  conversations: [],
  messages: [],
  attachments: [],
  reports: [],
  calls: [],
  favoriteNotes: [],
  drafts: [],
  folders: [],
  scheduledMessages: [],
});

export class JsonDatabase {
  private state: DatabaseState = emptyState();
  private mutationQueue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      this.state = databaseSchema.parse(JSON.parse(raw)) as DatabaseState;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw new Error(`Cannot load JSON database at ${this.filePath}`, { cause: error });
      }
      this.state = emptyState();
      await this.persist(this.state);
    }

    this.initialized = true;
  }

  read<T>(reader: (state: Readonly<DatabaseState>) => T): T {
    this.ensureInitialized();
    return reader(structuredClone(this.state));
  }

  async transaction<T>(mutator: (draft: DatabaseState) => T | Promise<T>): Promise<T> {
    this.ensureInitialized();

    let result!: T;
    const operation = this.mutationQueue.then(async () => {
      const draft = structuredClone(this.state);
      result = await mutator(draft);
      const validatedState = databaseSchema.parse(draft) as DatabaseState;
      await this.persist(validatedState);
      this.state = validatedState;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
    return result;
  }

  private async persist(state: DatabaseState): Promise<void> {
    const directory = dirname(this.filePath);
    const temporaryPath = resolve(directory, `.${randomUUID()}.tmp`);
    const payload = `${JSON.stringify(state, null, 2)}\n`;
    const handle = await open(temporaryPath, "wx");

    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("JSON database must be initialized before use");
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
