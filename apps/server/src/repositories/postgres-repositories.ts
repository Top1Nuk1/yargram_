import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  Attachment,
  CallRecord,
  Conversation,
  ConversationDraft,
  ConversationFolder,
  FavoriteNote,
  Message,
  ScheduledMessage,
  User,
  UserReport,
} from "../domain/models.js";
import { defaultAdminPermissions } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import type { PostgresDatabase } from "../storage/postgres-database.js";
import { RepositoryConflictError, type Repositories } from "./types.js";

type Table =
  | "users"
  | "conversations"
  | "messages"
  | "attachments"
  | "reports"
  | "favorite_notes"
  | "calls"
  | "drafts"
  | "folders"
  | "scheduled_messages";
type Queryable = Pick<PoolClient, "query">;
const now = () => new Date().toISOString();

async function select<T>(db: Queryable, table: Table, where = "TRUE", values: unknown[] = [], suffix = "ORDER BY sequence"): Promise<T[]> {
  const result = await db.query<{ payload: T }>(`SELECT payload FROM ${table} WHERE ${where} ${suffix}`, values);
  return result.rows.map((row) => row.payload);
}
async function find<T>(db: Queryable, table: Table, id: string, lock = false): Promise<T | null> {
  return (await select<T>(db, table, "id = $1", [id], lock ? "FOR UPDATE" : ""))[0] ?? null;
}
async function insert<T extends { id: string }>(db: Queryable, table: Table, entity: T): Promise<T> {
  await db.query(`INSERT INTO ${table} (payload) VALUES ($1::jsonb)`, [JSON.stringify(entity)]);
  return entity;
}
async function save<T extends { id: string }>(db: Queryable, table: Table, entity: T): Promise<T> {
  await db.query(`UPDATE ${table} SET payload = $2::jsonb WHERE id = $1`, [entity.id, JSON.stringify(entity)]);
  return entity;
}
async function orderedIds<T extends { id: string }>(db: Queryable, table: Table, ids: string[]): Promise<T[]> {
  const entities = await select<T>(db, table, "id = ANY($1::text[])", [ids]);
  const map = new Map(entities.map((entity) => [entity.id, entity]));
  return ids.flatMap((id) => { const entity = map.get(id); return entity ? [entity] : []; });
}
function conflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505" && "constraint" in error) {
    if (error.constraint === "users_email_unique") throw new RepositoryConflictError("email");
    if (error.constraint === "users_username_unique") throw new RepositoryConflictError("username");
  }
  throw error;
}
function setMember(ids: string[], id: string, included: boolean): string[] {
  const result = new Set(ids);
  if (included) result.add(id); else result.delete(id);
  return [...result];
}
function latestPin(conversation: Conversation): void {
  const id = conversation.pinnedMessageIds.at(-1);
  if (id) conversation.pinnedMessageId = id; else delete conversation.pinnedMessageId;
}

export function createPostgresRepositories(database: PostgresDatabase): Repositories {
  const pool = database.pool;
  const mutate = <T extends { id: string }>(table: Table, id: string, label: string, update: (entity: T) => void) =>
    database.transaction(async (client) => {
      const entity = await find<T>(client, table, id, true);
      if (!entity) throw new Error(`${label} was not found`);
      update(entity);
      return save(client, table, entity);
    });

  return {
    users: {
      async create(input) {
        const timestamp = now();
        const user: User = { id: randomUUID(), ...input, bio: "", lastSeenAt: timestamp,
          blockedUserIds: [], favoriteMessageIds: [], notificationSoundEnabled: true, showLastSeen: true, createdAt: timestamp };
        try { return await insert(pool, "users", user); } catch (error) { return conflict(error); }
      },
      findById: (id) => find<User>(pool, "users", id),
      async findByEmail(email) { return (await select<User>(pool, "users", "email_key = lower($1)", [email]))[0] ?? null; },
      async findByUsername(username) {
        // Основной ник сравниваем по сгенерированной колонке lower(username),
        // дополнительные — по lower(alias): регистр в никах сохраняем, ищем без него.
        return (
          (
            await select<User>(
              pool,
              "users",
              "username_key = lower($1) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload->'usernames', '[]'::jsonb)) AS alias WHERE lower(alias) = lower($1))",
              [username],
            )
          )[0] ?? null
        );
      },
      async update(id, input) {
        try {
          return await mutate<User>("users", id, "User", (user) => {
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
          });
        } catch (error) { return conflict(error); }
      },
      updateLastSeen: (id, timestamp) => mutate<User>("users", id, "User", (user) => { user.lastSeenAt = timestamp; }),
      setBlocked: (id, blockedId, blocked) => mutate<User>("users", id, "User", (user) => {
        user.blockedUserIds = setMember(user.blockedUserIds, blockedId, blocked);
      }),
      async setFavorite(id, messageId, favorite) {
        return database.transaction(async (client) => {
          // Use the same message-before-user lock order as deletion. As in the JSON
          // repository, callers may supply missing IDs; service validation owns that check.
          await find<Message>(client, "messages", messageId, true);
          const user = await find<User>(client, "users", id, true);
          if (!user) throw new Error("User was not found");
          user.favoriteMessageIds = setMember(user.favoriteMessageIds, messageId, favorite);
          return save(client, "users", user);
        });
      },
      async list(options) {
        const query = options.query?.trim().replace(/^@/, "").toLowerCase();
        const users = await select<User>(
          pool,
          "users",
          "($1::text IS NULL OR id <> $1) AND ($2::text IS NULL OR strpos(username_key, $2) > 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload->'usernames', '[]'::jsonb)) AS alias WHERE strpos(lower(alias), $2) > 0))",
          [options.excludeUserId ?? null, query || null],
        );
        return users.sort((a, b) => (a.username ?? a.displayName).localeCompare(b.username ?? b.displayName, "ru")).slice(0, options.limit);
      },
      findManyByIds: (ids) => select<User>(pool, "users", "id = ANY($1::text[])", [ids]),
      async delete(id) {
        const result = await pool.query<{ payload: User }>("DELETE FROM users WHERE id = $1 RETURNING payload", [id]);
        return result.rows[0]?.payload ?? null;
      },
    },
    conversations: {
      async findOrCreateSaved(userId) {
        const timestamp = now();
        const conversation: Conversation = { id: randomUUID(), type: "saved", memberIds: [userId], directKey: `saved:${userId}`,
          createdAt: timestamp, updatedAt: timestamp, pinnedMessageIds: [], archivedBy: [], mutedUntilBy: {} };
        return database.transaction(async (client) => {
          const inserted = await client.query("INSERT INTO conversations (payload) VALUES ($1::jsonb) ON CONFLICT (direct_key) DO NOTHING RETURNING id", [JSON.stringify(conversation)]);
          if (inserted.rowCount) return { conversation, created: true };
          const existing = (await select<Conversation>(client, "conversations", "direct_key = $1", [conversation.directKey]))[0];
          if (!existing) throw new Error("Saved conversation was not found");
          return { conversation: existing, created: false };
        });
      },
      async findOrCreateDirect(first, second) {
        const memberIds = [first, second].sort();
        const timestamp = now();
        const conversation: Conversation = { id: randomUUID(), type: "direct", memberIds, directKey: memberIds.join(":"),
          createdAt: timestamp, updatedAt: timestamp, pinnedMessageIds: [], archivedBy: [], mutedUntilBy: {} };
        return database.transaction(async (client) => {
          const inserted = await client.query("INSERT INTO conversations (payload) VALUES ($1::jsonb) ON CONFLICT (direct_key) DO NOTHING RETURNING id", [JSON.stringify(conversation)]);
          if (inserted.rowCount) return { conversation, created: true };
          const existing = (await select<Conversation>(client, "conversations", "direct_key = $1", [conversation.directKey]))[0];
          if (!existing) throw new Error("Conversation was not found");
          return { conversation: existing, created: false };
        });
      },
      async createGroup(input) {
        const timestamp = now();
        const memberIds = [input.ownerId, ...input.memberIds.filter((id) => id !== input.ownerId)];
        const conversation: Conversation = {
          id: randomUUID(), type: "group", memberIds, directKey: "",
          createdAt: timestamp, updatedAt: timestamp, pinnedMessageIds: [], archivedBy: [], mutedUntilBy: {},
          title: input.title, description: input.description ?? "", avatarUrl: input.avatarUrl ?? null,
          ownerId: input.ownerId, adminIds: [], adminDefaults: defaultAdminPermissions(),
          inviteCode: input.inviteCode ?? "", permissions: {}, restrictions: {}, mutedMembers: {}, leftIds: [],
          history: [{ id: randomUUID(), at: timestamp, actorId: input.ownerId, kind: "created", detail: input.title }],
        };
        return database.transaction(async (client) => {
          await insert(client, "conversations", conversation);
          return conversation;
        });
      },
      findByInviteCode: async (code) => {
        if (!code) return null;
        return (await select<Conversation>(pool, "conversations", "payload->>'inviteCode' = $1", [code]))[0] ?? null;
      },
      update: (id, input) => mutate<Conversation>("conversations", id, "Conversation", (conversation) => {
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
        conversation.updatedAt = now();
      }),
      findById: (id) => find<Conversation>(pool, "conversations", id),
      // Вышедший участник остаётся в memberIds, но не видит группу в своём списке.
      listForUser: (id) => select<Conversation>(pool, "conversations",
        "member_ids ? $1 AND NOT COALESCE(payload->'leftIds' ? $1, false)", [id], "ORDER BY updated_at DESC, sequence"),
      setPinnedMessage: (id, messageId) => mutate<Conversation>("conversations", id, "Conversation", (conversation) => {
        conversation.pinnedMessageIds = messageId === null ? [] : [...conversation.pinnedMessageIds.filter((item) => item !== messageId), messageId];
        latestPin(conversation);
      }),
      setMessagePinned: (id, messageId, pinned) => mutate<Conversation>("conversations", id, "Conversation", (conversation) => {
        conversation.pinnedMessageIds = conversation.pinnedMessageIds.filter((item) => item !== messageId);
        if (pinned) conversation.pinnedMessageIds.push(messageId);
        latestPin(conversation);
      }),
      updateUserSettings: (id, userId, input) => mutate<Conversation>("conversations", id, "Conversation", (conversation) => {
        if (input.archived !== undefined) conversation.archivedBy = setMember(conversation.archivedBy, userId, input.archived);
        if (input.mutedUntil === null) delete conversation.mutedUntilBy[userId];
        else if (input.mutedUntil !== undefined) conversation.mutedUntilBy[userId] = input.mutedUntil;
      }),
    },
    messages: {
      async countUnread(conversationIds, userId) {
        const counts: Record<string, number> = {};
        for (const id of conversationIds) counts[id] = 0;
        if (conversationIds.length === 0) return counts;
        // Сообщение прочитано, когда read_by содержит id пользователя.
        const { rows } = await pool.query<{ conversation_id: string; unread: string }>(
          `SELECT conversation_id, count(*)::text AS unread FROM messages
           WHERE conversation_id = ANY($1::text[])
             AND payload->>'senderId' <> $2
             AND NOT (payload->'readBy' @> to_jsonb($2::text))
           GROUP BY conversation_id`,
          [conversationIds, userId],
        );
        for (const row of rows) counts[row.conversation_id] = Number(row.unread);
        return counts;
      },
      async updatePoll(id, poll) {
        return database.transaction(async (client) => {
          const message = await find<Message>(client, "messages", id, true);
          if (!message) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found");
          message.poll = poll;
          await save(client, "messages", message);
          return message;
        });
      },
      async create(input) {
        return database.transaction(async (client) => {
          const conversation = await find<Conversation>(client, "conversations", input.conversationId, true);
          const message: Message = { id: randomUUID(), ...input, kind: input.kind ?? "user", createdAt: now(),
            attachmentIds: [...new Set(input.attachmentIds ?? [])], reactions: [], readBy: [input.senderId] };
          await insert(client, "messages", message);
          if (conversation) {
            conversation.lastMessageId = message.id;
            conversation.updatedAt = message.createdAt;
            await save(client, "conversations", conversation);
          }
          return message;
        });
      },
      async listForConversation(id, options) {
        const query = options.query?.trim().toLocaleLowerCase("ru-RU");
        // The normal history path limits rows in PostgreSQL. Search uses bounded pages
        // to preserve the JSON adapter's exact Russian case-folding semantics.
        const messages: Message[] = [];
        let offset = 0;
        const pageSize = query ? Math.max(100, options.limit) : options.limit;
        if (options.limit <= 0) return [];
        while (messages.length < options.limit) {
          const page = await select<Message>(pool, "messages", "conversation_id = $1 AND ($2::text IS NULL OR created_at < $2)",
            [id, options.before ?? null, pageSize, offset], "ORDER BY created_at DESC, sequence LIMIT $3 OFFSET $4");
          messages.push(...page.filter((message) => !query || message.text.toLocaleLowerCase("ru-RU").includes(query)));
          if (page.length < pageSize || !query) break;
          offset += page.length;
        }
        return messages.slice(0, options.limit).reverse();
      },
      listByIds: (ids) => orderedIds<Message>(pool, "messages", ids),
      findById: (id) => find<Message>(pool, "messages", id),
      findByAttachmentId: (id) => select<Message>(pool, "messages", "attachment_ids ? $1", [id]),
      updateText: (id, text) => mutate<Message>("messages", id, "Message", (message) => { message.text = text; message.editedAt = now(); }),
      setReaction: (id, userId, emoji) => mutate<Message>("messages", id, "Message", (message) => {
        message.reactions = message.reactions.filter((reaction) => reaction.userId !== userId);
        if (emoji !== null) message.reactions.push({ userId, emoji, createdAt: now() });
      }),
      async deleteFromConversation(conversationId, id) {
        return database.transaction(async (client) => {
          const conversation = await find<Conversation>(client, "conversations", conversationId, true);
          const message = await find<Message>(client, "messages", id, true);
          if (!message || message.conversationId !== conversationId) throw new Error("Message was not found");
          await client.query("DELETE FROM messages WHERE id = $1", [id]);
          const users = await select<User>(client, "users", "favorite_ids ? $1", [id], "ORDER BY id FOR UPDATE");
          for (const user of users) {
            user.favoriteMessageIds = user.favoriteMessageIds.filter((item) => item !== id);
            await save(client, "users", user);
          }
          if (conversation) {
            conversation.pinnedMessageIds = conversation.pinnedMessageIds.filter((item) => item !== id);
            latestPin(conversation);
            const latest = (await select<Message>(client, "messages", "conversation_id = $1", [conversationId], "ORDER BY created_at DESC, sequence DESC LIMIT 1"))[0];
            if (latest) { conversation.lastMessageId = latest.id; conversation.updatedAt = latest.createdAt; }
            else { delete conversation.lastMessageId; conversation.updatedAt = conversation.createdAt; }
            await save(client, "conversations", conversation);
          }
          return message;
        });
      },
      async markRead(conversationId, userId) {
        return database.transaction(async (client) => {
          const messages = await select<Message>(client, "messages", "conversation_id = $1 AND NOT (payload->'readBy' ? $2)", [conversationId, userId], "ORDER BY sequence FOR UPDATE");
          for (const message of messages) { message.readBy.push(userId); await save(client, "messages", message); }
          return { messages, messageIds: messages.map((message) => message.id) };
        });
      },
    },
    attachments: {
      create: (input) => insert<Attachment>(pool, "attachments", { id: randomUUID(), ...input, createdAt: now() }),
      findById: (id) => find<Attachment>(pool, "attachments", id),
      findManyByIds: (ids) => orderedIds<Attachment>(pool, "attachments", ids),
      listByOwner: (ownerId) =>
        select<Attachment>(pool, "attachments", "owner_id = $1", [ownerId]),
      async delete(id) {
        const result = await pool.query<{ payload: Attachment }>("DELETE FROM attachments WHERE id = $1 RETURNING payload", [id]);
        return result.rows[0]?.payload ?? null;
      },
    },
    reports: {
      create: (input) => insert<UserReport>(pool, "reports", { id: randomUUID(), ...input, createdAt: now() }),
      list: () => select<UserReport>(pool, "reports", "TRUE", [], "ORDER BY created_at DESC, sequence"),
    },
    favoriteNotes: {
      create: (input) => insert<FavoriteNote>(pool, "favorite_notes", { id: randomUUID(), ...input, createdAt: now() }),
      list: (id) => select<FavoriteNote>(pool, "favorite_notes", "user_id = $1", [id]),
      async update(id, userId, content) {
        return database.transaction(async (client) => {
          const note = await find<FavoriteNote>(client, "favorite_notes", id, true);
          if (!note || note.userId !== userId) throw new AppError(404, "NOT_FOUND", "Note not found");
          note.content = content;
          note.updatedAt = now();
          return save(client, "favorite_notes", note);
        });
      },
      async delete(id, userId) {
        const result = await pool.query("DELETE FROM favorite_notes WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
        if (!result.rowCount) throw new AppError(404, "NOT_FOUND", "Note not found");
      },
    },
    calls: {
      async create(input) {
        return database.transaction(async (client) => {
          const call: CallRecord = { ...input, startedAt: now() };
          const result = await client.query("INSERT INTO calls (payload) VALUES ($1::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id", [JSON.stringify(call)]);
          if (result.rowCount) return call;
          const existing = await find<CallRecord>(client, "calls", input.id);
          if (!existing) throw new Error("Call was not found");
          return existing;
        });
      },
      findById: (id) => find<CallRecord>(pool, "calls", id),
      update: (id, input) => mutate<CallRecord>("calls", id, "Call", (call) => { Object.assign(call, input); }),
      listForConversation: (id) => select<CallRecord>(pool, "calls", "conversation_id = $1", [id], "ORDER BY started_at DESC, sequence"),
    },
    drafts: {
      listForUser: (userId) => select<ConversationDraft>(pool, "drafts", "user_id = $1", [userId]),
      find: async (userId, conversationId) =>
        (
          await select<ConversationDraft>(
            pool,
            "drafts",
            "user_id = $1 AND conversation_id = $2",
            [userId, conversationId],
          )
        )[0] ?? null,
      async save(input) {
        return database.transaction(async (client) => {
          const existing = (
            await select<ConversationDraft>(
              client,
              "drafts",
              "user_id = $1 AND conversation_id = $2",
              [input.userId, input.conversationId],
              "FOR UPDATE",
            )
          )[0];
          const updatedAt = now();
          if (existing) {
            const updated: ConversationDraft = {
              ...existing,
              text: input.text,
              attachmentIds: [...input.attachmentIds],
              updatedAt,
            };
            if (input.replyToId === undefined) delete updated.replyToId;
            else updated.replyToId = input.replyToId;
            return save(client, "drafts", updated);
          }
          return insert<ConversationDraft>(client, "drafts", {
            id: randomUUID(),
            userId: input.userId,
            conversationId: input.conversationId,
            text: input.text,
            attachmentIds: [...input.attachmentIds],
            ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
            updatedAt,
          });
        });
      },
      async delete(userId, conversationId) {
        await pool.query("DELETE FROM drafts WHERE user_id = $1 AND conversation_id = $2", [
          userId,
          conversationId,
        ]);
      },
    },
    folders: {
      listForUser: (userId) =>
        select<ConversationFolder>(
          pool,
          "folders",
          "user_id = $1",
          [userId],
          "ORDER BY (payload->>'position')::int, sequence",
        ),
      findById: (id) => find<ConversationFolder>(pool, "folders", id),
      async create(input) {
        return database.transaction(async (client) => {
          const existing = await select<ConversationFolder>(client, "folders", "user_id = $1", [
            input.userId,
          ]);
          const position = existing.reduce(
            (next, folder) => Math.max(next, folder.position + 1),
            0,
          );
          const timestamp = now();
          return insert<ConversationFolder>(client, "folders", {
            id: randomUUID(),
            userId: input.userId,
            name: input.name,
            position,
            conversationIds: [...new Set(input.conversationIds ?? [])],
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        });
      },
      update: (id, userId, input) =>
        database.transaction(async (client) => {
          const folder = await find<ConversationFolder>(client, "folders", id, true);
          if (!folder || folder.userId !== userId) {
            throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found");
          }
          if (input.name !== undefined) folder.name = input.name;
          if (input.position !== undefined) folder.position = input.position;
          if (input.conversationIds !== undefined) {
            folder.conversationIds = [...new Set(input.conversationIds)];
          }
          folder.updatedAt = now();
          return save(client, "folders", folder);
        }),
      async delete(id, userId) {
        const result = await pool.query(
          "DELETE FROM folders WHERE id = $1 AND user_id = $2 RETURNING id",
          [id, userId],
        );
        if (!result.rowCount) throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found");
      },
    },
    scheduledMessages: {
      listForUser: (userId) =>
        select<ScheduledMessage>(
          pool,
          "scheduled_messages",
          "user_id = $1",
          [userId],
          "ORDER BY send_at, sequence",
        ),
      findById: (id) => find<ScheduledMessage>(pool, "scheduled_messages", id),
      create: (input) =>
        insert<ScheduledMessage>(pool, "scheduled_messages", {
          id: randomUUID(),
          userId: input.userId,
          conversationId: input.conversationId,
          text: input.text,
          attachmentIds: [...input.attachmentIds],
          ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
          sendAt: input.sendAt,
          status: "pending",
          createdAt: now(),
        }),
      update: (id, userId, input) =>
        database.transaction(async (client) => {
          const scheduled = await find<ScheduledMessage>(
            client,
            "scheduled_messages",
            id,
            true,
          );
          if (!scheduled || scheduled.userId !== userId) {
            throw new AppError(404, "SCHEDULED_NOT_FOUND", "Scheduled message was not found");
          }
          if (scheduled.status !== "pending") {
            throw new AppError(
              409,
              "SCHEDULED_NOT_PENDING",
              "Only a pending message can be changed",
            );
          }
          if (input.text !== undefined) scheduled.text = input.text;
          if (input.attachmentIds !== undefined) scheduled.attachmentIds = [...input.attachmentIds];
          if (input.replyToId === null) delete scheduled.replyToId;
          else if (input.replyToId !== undefined) scheduled.replyToId = input.replyToId;
          if (input.sendAt !== undefined) scheduled.sendAt = input.sendAt;
          return save(client, "scheduled_messages", scheduled);
        }),
      cancel: (id, userId) =>
        database.transaction(async (client) => {
          const scheduled = await find<ScheduledMessage>(
            client,
            "scheduled_messages",
            id,
            true,
          );
          if (!scheduled || scheduled.userId !== userId) {
            throw new AppError(404, "SCHEDULED_NOT_FOUND", "Scheduled message was not found");
          }
          if (scheduled.status !== "pending") {
            throw new AppError(
              409,
              "SCHEDULED_NOT_PENDING",
              "Only a pending message can be cancelled",
            );
          }
          scheduled.status = "cancelled";
          return save(client, "scheduled_messages", scheduled);
        }),
      claimDue: (id) =>
        database.transaction(async (client) => {
          const scheduled = await find<ScheduledMessage>(
            client,
            "scheduled_messages",
            id,
            true,
          );
          if (!scheduled || scheduled.status !== "pending") return null;
          scheduled.status = "sending";
          return save(client, "scheduled_messages", scheduled);
        }),
      listDue: (nowIso, limit) =>
        select<ScheduledMessage>(
          pool,
          "scheduled_messages",
          "status = 'pending' AND send_at <= $1",
          [nowIso, limit],
          "ORDER BY send_at, sequence LIMIT $2",
        ),
      markSent: (id, messageId, sentAt) =>
        database.transaction(async (client) => {
          const scheduled = await find<ScheduledMessage>(
            client,
            "scheduled_messages",
            id,
            true,
          );
          if (!scheduled) throw new Error("Scheduled message was not found");
          scheduled.status = "sent";
          scheduled.messageId = messageId;
          scheduled.sentAt = sentAt;
          delete scheduled.failureReason;
          return save(client, "scheduled_messages", scheduled);
        }),
      markFailed: (id, reason) =>
        database.transaction(async (client) => {
          const scheduled = await find<ScheduledMessage>(
            client,
            "scheduled_messages",
            id,
            true,
          );
          if (!scheduled) throw new Error("Scheduled message was not found");
          scheduled.status = "failed";
          scheduled.failureReason = reason.slice(0, 300);
          return save(client, "scheduled_messages", scheduled);
        }),
    },
  };
}
