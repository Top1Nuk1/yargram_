import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { expect, it } from "vitest";
import { toCurrentUser, toPublicUser } from "../src/domain/models.js";
import { createPostgresRepositories } from "../src/repositories/postgres-repositories.js";
import { PostgresDatabase } from "../src/storage/postgres-database.js";
import { ChatService } from "../src/services/chat-service.js";

it("retains privacy in PostgreSQL through unrelated mutations and reopened connections", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yargram-presence-pg-"));
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("Missing port")); return; }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  const cluster = new EmbeddedPostgres({ databaseDir: join(directory, "data"), port, user: "postgres", password: "test-password", persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
  let database: PostgresDatabase | undefined;
  try {
    await cluster.initialise(); await cluster.start();
    const name = `privacy_${randomUUID().replaceAll("-", "")}`;
    await cluster.createDatabase(name);
    const options = { host: "127.0.0.1", port, user: "postgres", password: "test-password", database: name };
    database = new PostgresDatabase(options); await database.initialize();
    const users = createPostgresRepositories(database).users;
    const user = await users.create({ email: "privacy@example.test", displayName: "Privacy", passwordHash: "hash" });
    expect(user.showLastSeen).toBe(true);
    await users.update(user.id, { showLastSeen: false });
    await users.update(user.id, { bio: "unrelated update" });
    await users.updateLastSeen(user.id, new Date().toISOString());
    await database.close();
    database = new PostgresDatabase(options); await database.initialize();
    const reopened = (await createPostgresRepositories(database).users.findById(user.id))!;
    expect(toCurrentUser(reopened)).toMatchObject({ showLastSeen: false, bio: "unrelated update" });
    expect(toPublicUser(reopened)).toMatchObject({ lastSeenAt: null, lastSeenStatus: "recently", online: false });
    await database.pool.query("UPDATE users SET payload = payload - 'showLastSeen' WHERE id = $1", [user.id]);
    const legacy = (await createPostgresRepositories(database).users.findById(user.id))!;
    expect(toCurrentUser(legacy).showLastSeen).toBe(true);
    expect(toPublicUser(legacy).lastSeenAt).toEqual(expect.any(String));
    const repos = createPostgresRepositories(database);
    const chat = new ChatService(repos);
    const other = await repos.users.create({ email: "other@example.test", displayName: "Other", passwordHash: "hash" });
    const attempts = await Promise.all(Array.from({ length: 6 }, () => repos.conversations.findOrCreateSaved(user.id)));
    expect(attempts.filter((attempt) => attempt.created)).toHaveLength(1);
    expect(new Set(attempts.map((attempt) => attempt.conversation.id)).size).toBe(1);
    const saved = attempts[0]!.conversation;
    expect(saved).toMatchObject({ type: "saved", memberIds: [user.id] });
    const attachment = await repos.attachments.create({ ownerId: user.id, kind: "file", fileName: "memo.webm", storedFileName: "memo.webm", mimeType: "audio/webm", size: 5, mediaKind: "voice", durationSeconds: 90000 });
    const sent = await chat.sendMessage(user.id, saved.id, "private memo", undefined, { attachmentIds: [attachment.id] });
    expect(sent.message.attachments[0]).toMatchObject({ fileName: "memo.webm", mediaKind: "voice", durationSeconds: 90000 });
    await chat.updateMessage(user.id, saved.id, sent.message.id, "edited memo");
    await chat.setMessagePinned(user.id, saved.id, sent.message.id, true);
    expect(await chat.listMessages(user.id, saved.id, { limit: 50, query: "edited" })).toHaveLength(1);
    await expect(chat.listMessages(other.id, saved.id, { limit: 50 })).rejects.toMatchObject({ code: "CONVERSATION_FORBIDDEN" });
    await expect(chat.sendMessage(other.id, saved.id, "intrusion")).rejects.toMatchObject({ code: "CONVERSATION_FORBIDDEN" });
    await expect(chat.deleteMessage(other.id, saved.id, sent.message.id)).rejects.toMatchObject({ code: "CONVERSATION_FORBIDDEN" });
    await expect(chat.beginCall(user.id, saved.id, "saved-call", "audio")).rejects.toMatchObject({ code: "CALL_NOT_SUPPORTED" });
    expect(await chat.listConversations(other.id)).toEqual([]);
    await database.close(); database = new PostgresDatabase(options); await database.initialize();
    expect(await createPostgresRepositories(database).attachments.findById(attachment.id)).toMatchObject({ mediaKind: "voice", durationSeconds: 90000 });
    const afterRestart = new ChatService(createPostgresRepositories(database));
    expect((await afterRestart.createSavedConversation(user.id)).conversation.id).toBe(saved.id);
    await afterRestart.deleteMessage(user.id, saved.id, sent.message.id);
    expect(await afterRestart.listMessages(user.id, saved.id, { limit: 50 })).toEqual([]);
  } finally {
    await database?.close(); await cluster.stop(); await rm(directory, { recursive: true, force: true });
  }
}, 120000);
