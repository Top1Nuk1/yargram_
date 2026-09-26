import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseState } from "../src/domain/models.js";
import { PostgresDatabase } from "../src/storage/postgres-database.js";
import { createPostgresRepositories } from "../src/repositories/postgres-repositories.js";
import { RepositoryConflictError } from "../src/repositories/types.js";

let cluster: EmbeddedPostgres;
let directory: string;
let port: number;
const databases: PostgresDatabase[] = [];
async function fresh() {
  const databaseName = `test_${randomUUID().replaceAll("-", "")}`;
  await cluster.createDatabase(databaseName);
  const database = new PostgresDatabase({ host: "127.0.0.1", port, user: "postgres", password: "test-password", database: databaseName });
  databases.push(database);
  await database.initialize();
  return { database, repos: createPostgresRepositories(database), databaseName };
}
const empty = (): DatabaseState => ({ version: 1, users: [], conversations: [], messages: [], attachments: [], reports: [], favoriteNotes: [], calls: [], drafts: [], folders: [], scheduledMessages: [] });
const registration = (username: string) => ({ email: `${username}@example.test`, username, displayName: username, passwordHash: "preserved-hash" });

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "yargram-postgres-test-"));
  port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("No test port")); return; }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
  cluster = new EmbeddedPostgres({ databaseDir: join(directory, "data"), port, user: "postgres", password: "test-password",
    persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
  await cluster.initialise();
  await cluster.start();
}, 180_000);

afterAll(async () => {
  await Promise.all(databases.map((database) => database.close()));
  if (cluster) await cluster.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
}, 180_000);

describe("PostgreSQL repositories against a real isolated cluster", () => {
  it("enforces case-insensitive uniqueness during concurrent registration and direct creation", async () => {
    const { repos } = await fresh();
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => repos.users.create({ ...registration(`person${index}`), email: index % 2 ? "SAME@example.test" : "same@example.test" })));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    // Сверяем по имени, а не через instanceof: на Windows vite иногда загружает
    // один и тот же файл двумя модулями (C:/… и c:/…), и тогда класс в тесте и
    // класс в репозиториях — разные объекты.
    for (const result of attempts) {
      if (result.status !== "rejected") continue;
      expect(result.reason).toMatchObject({
        name: RepositoryConflictError.name,
        field: expect.stringMatching(/^(email|username)$/),
      });
    }
    const user = await repos.users.create(registration("UniqueName"));
    await expect(repos.users.create({ ...registration("uniquename"), email: "different@example.test" })).rejects.toMatchObject({ field: "username" });
    expect(await repos.users.findByEmail("UNIQUENAME@EXAMPLE.TEST")).toEqual(user);
    expect(await repos.users.findByUsername("UNIQUENAME")).toEqual(user);
    const directs = await Promise.all(Array.from({ length: 8 }, (_, index) => repos.conversations.findOrCreateDirect(index % 2 ? "a" : "b", index % 2 ? "b" : "a")));
    expect(directs.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(directs.map((result) => result.conversation.id)).size).toBe(1);
  });

  it("finds a user by any username spelling, including mixed-case aliases", async () => {
    const { repos } = await fresh();
    const user = await repos.users.create({ ...registration("Top1Nuk1"), email: "mixed@example.test" });
    await repos.users.update(user.id, { usernames: ["MiXeD_Alias", "second_name"] });
    // Регистр в никах сохраняем, ищем без него — и по основному, и по доп.
    for (const query of ["Top1Nuk1", "top1nuk1", "TOP1NUK1", "MiXeD_Alias", "mixed_alias", "Second_Name"]) {
      expect(await repos.users.findByUsername(query)).toMatchObject({ id: user.id });
      expect((await repos.users.list({ query, limit: 20 })).map((candidate) => candidate.id)).toContain(user.id);
    }
    expect(await repos.users.findByUsername("nobody_here")).toBeNull();
  });

  it("preserves concurrent reactions/read state, message order, pins and deletion cleanup", async () => {
    const { repos } = await fresh();
    const alice = await repos.users.create(registration("alice"));
    const bob = await repos.users.create(registration("bob"));
    const { conversation } = await repos.conversations.findOrCreateDirect(alice.id, bob.id);
    const created = await Promise.all(Array.from({ length: 12 }, (_, index) => repos.messages.create({ conversationId: conversation.id, senderId: alice.id, text: `Привет ${index}` })));
    const latest = (await repos.conversations.findById(conversation.id))!.lastMessageId!;
    await Promise.all(created.map((_, index) => repos.messages.setReaction(latest, `reactor-${index}`, "👍")));
    expect((await repos.messages.findById(latest))!.reactions).toHaveLength(12);
    await Promise.all([repos.messages.markRead(conversation.id, bob.id), repos.messages.markRead(conversation.id, "third")]);
    expect((await repos.messages.findById(latest))!.readBy).toEqual(expect.arrayContaining([alice.id, bob.id, "third"]));
    expect((await repos.messages.markRead(conversation.id, bob.id)).messageIds).toEqual([]);
    expect(await repos.messages.listForConversation(conversation.id, { limit: 5, query: "ПРИВЕТ" })).toHaveLength(5);
    expect(await repos.messages.listByIds([latest, "missing", latest])).toHaveLength(2);
    const survivor = created.find((message) => message.id !== latest)!;
    await repos.conversations.setPinnedMessage(conversation.id, survivor.id);
    await repos.conversations.setMessagePinned(conversation.id, latest, true);
    await repos.users.setFavorite(alice.id, latest, true);
    await repos.messages.deleteFromConversation(conversation.id, latest);
    expect((await repos.users.findById(alice.id))!.favoriteMessageIds).toEqual([]);
    const after = (await repos.conversations.findById(conversation.id))!;
    expect(after.pinnedMessageId).toBe(survivor.id);
    expect(after.lastMessageId).not.toBe(latest);
    for (const message of created) if (message.id !== latest) await repos.messages.deleteFromConversation(conversation.id, message.id);
    expect(await repos.conversations.findById(conversation.id)).toMatchObject({ updatedAt: conversation.createdAt, pinnedMessageIds: [] });
    expect((await repos.conversations.findById(conversation.id))!.lastMessageId).toBeUndefined();
  });

  it("handles profile/settings, attachments, reports, calls and owner-scoped notes", async () => {
    const { repos } = await fresh();
    const user = await repos.users.create(registration("owner"));
    await repos.users.update(user.id, { bio: "bio", themeColor: "#ff6600", notificationSoundEnabled: false });
    await Promise.all([repos.users.setBlocked(user.id, "a", true), repos.users.setBlocked(user.id, "b", true)]);
    expect((await repos.users.findById(user.id))!.blockedUserIds).toEqual(expect.arrayContaining(["a", "b"]));
    const { conversation } = await repos.conversations.findOrCreateDirect(user.id, "other");
    await repos.conversations.updateUserSettings(conversation.id, user.id, { archived: true, mutedUntil: "2030-01-01" });
    expect((await repos.conversations.listForUser(user.id))[0]!.archivedBy).toEqual([user.id]);
    const attachment = await repos.attachments.create({ ownerId: user.id, kind: "file", fileName: "a.txt", storedFileName: "hash.txt", mimeType: "text/plain", size: 1 });
    const message = await repos.messages.create({ conversationId: conversation.id, senderId: user.id, text: "text", attachmentIds: [attachment.id, attachment.id] });
    expect(await repos.messages.findByAttachmentId(attachment.id)).toEqual([message]);
    expect(await repos.attachments.findManyByIds([attachment.id, "missing", attachment.id])).toEqual([attachment, attachment]);
    expect((await repos.messages.updateText(message.id, "edited")).editedAt).toBeDefined();
    await repos.messages.setReaction(message.id, user.id, "❤️");
    expect((await repos.messages.setReaction(message.id, user.id, null)).reactions).toEqual([]);
    const report = await repos.reports.create({ reporterId: user.id, reportedUserId: "other", reason: "spam" });
    expect(await repos.reports.list()).toEqual([report]);
    const call = await repos.calls.create({ id: "call", conversationId: conversation.id, initiatorId: user.id, mode: "audio", status: "ringing" });
    expect(await repos.calls.create({ ...call, status: "completed" })).toEqual(call);
    await repos.calls.update(call.id, { status: "completed", durationSeconds: 42 });
    expect((await repos.calls.listForConversation(conversation.id))[0]!.durationSeconds).toBe(42);
    const note = await repos.favoriteNotes.create({ userId: user.id, content: "private" });
    await expect(repos.favoriteNotes.update(note.id, "intruder", "changed")).rejects.toMatchObject({ status: 404 });
    await expect(repos.favoriteNotes.delete(note.id, "intruder")).rejects.toMatchObject({ status: 404 });
    expect(await repos.favoriteNotes.list("intruder")).toEqual([]);
    expect((await repos.favoriteNotes.update(note.id, user.id, "updated")).content).toBe("updated");
    await repos.favoriteNotes.delete(note.id, user.id);
    expect(await repos.favoriteNotes.list(user.id)).toEqual([]);
    expect(await repos.attachments.delete(attachment.id)).toEqual(attachment);
    expect(await repos.attachments.delete(attachment.id)).toBeNull();
  });

  it("keeps drafts, folders and the scheduled queue owner-scoped and duplicate-free", async () => {
    const { repos, database, databaseName } = await fresh();
    const alice = await repos.users.create(registration("owner"));
    const bob = await repos.users.create(registration("stranger"));
    const { conversation } = await repos.conversations.findOrCreateDirect(alice.id, bob.id);

    const draft = await repos.drafts.save({
      userId: alice.id,
      conversationId: conversation.id,
      text: "первый черновик",
      attachmentIds: ["attachment-1"],
      replyToId: "reply-1",
    });
    const updatedDraft = await repos.drafts.save({
      userId: alice.id,
      conversationId: conversation.id,
      text: "основной черновик",
      attachmentIds: [],
    });
    expect(updatedDraft).toMatchObject({ id: draft.id, text: "основной черновик" });
    expect(updatedDraft.replyToId).toBeUndefined();
    expect(await repos.drafts.listForUser(alice.id)).toEqual([updatedDraft]);
    expect(await repos.drafts.listForUser(bob.id)).toEqual([]);
    await repos.drafts.delete(alice.id, conversation.id);
    expect(await repos.drafts.find(alice.id, conversation.id)).toBeNull();

    const work = await repos.folders.create({
      userId: alice.id,
      name: "Работа",
      conversationIds: [conversation.id, conversation.id],
    });
    const personal = await repos.folders.create({ userId: alice.id, name: "Личное" });
    expect([work.position, personal.position]).toEqual([0, 1]);
    expect(work.conversationIds).toEqual([conversation.id]);
    expect(await repos.folders.listForUser(bob.id)).toEqual([]);
    await expect(repos.folders.update(personal.id, bob.id, { name: "Чужое" })).rejects.toMatchObject({ status: 404 });
    await expect(repos.folders.delete(personal.id, bob.id)).rejects.toMatchObject({ status: 404 });
    expect(
      await repos.folders.update(personal.id, alice.id, {
        position: 5,
        conversationIds: [conversation.id],
      }),
    ).toMatchObject({ position: 5, conversationIds: [conversation.id] });
    expect((await repos.folders.listForUser(alice.id)).map((folder) => folder.name)).toEqual([
      "Работа",
      "Личное",
    ]);

    const due = await repos.scheduledMessages.create({
      userId: alice.id,
      conversationId: conversation.id,
      text: "в срок",
      attachmentIds: [],
      sendAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.scheduledMessages.create({
      userId: alice.id,
      conversationId: conversation.id,
      text: "позже",
      attachmentIds: [],
      sendAt: "2099-01-01T00:00:00.000Z",
    });
    expect(
      (await repos.scheduledMessages.listDue("2026-06-01T00:00:00.000Z", 10)).map((item) => item.text),
    ).toEqual(["в срок"]);
    expect(await repos.scheduledMessages.listForUser(bob.id)).toEqual([]);

    // Two workers race for the same due message, only one of them may claim it.
    const claims = await Promise.all([
      repos.scheduledMessages.claimDue(due.id),
      repos.scheduledMessages.claimDue(due.id),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    await expect(repos.scheduledMessages.update(due.id, alice.id, { text: "поздно" })).rejects.toMatchObject({ status: 409 });
    await expect(repos.scheduledMessages.cancel(due.id, alice.id)).rejects.toMatchObject({ status: 409 });
    await expect(repos.scheduledMessages.cancel("missing", alice.id)).rejects.toMatchObject({ status: 404 });
    await expect(repos.scheduledMessages.markFailed("missing", "gone")).rejects.toThrow("was not found");
    expect(
      await repos.scheduledMessages.markSent(due.id, "message-1", "2026-06-01T00:00:05.000Z"),
    ).toMatchObject({ status: "sent", messageId: "message-1" });

    await database.close();
    databases.splice(databases.indexOf(database), 1);
    const reopened = new PostgresDatabase({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "test-password",
      database: databaseName,
    });
    databases.push(reopened);
    await reopened.initialize();
    const restored = createPostgresRepositories(reopened);
    expect((await restored.folders.listForUser(alice.id)).map((folder) => folder.name)).toEqual([
      "Работа",
      "Личное",
    ]);
    expect((await restored.scheduledMessages.listForUser(alice.id))[0]).toMatchObject({
      status: "sent",
      messageId: "message-1",
    });
  });

  it("imports only into empty storage, rolls back conflicts, and survives pool restart", async () => {
    const source = await fresh();
    const user = await source.repos.users.create(registration("imported"));
    const state = empty();
    state.users = [user];
    state.favoriteNotes = [{ id: "note-preserved", userId: user.id, content: "saved", createdAt: "2020-01-01T00:00:00.000Z" }];
    const target = await fresh();
    const duplicate = structuredClone(state);
    duplicate.users.push({ ...user, id: "different", email: user.email.toUpperCase() });
    await expect(target.database.importState(duplicate)).rejects.toMatchObject({ code: "23505" });
    expect(await target.repos.users.findById(user.id)).toBeNull();
    await expect(target.database.importState({ ...state, version: 2 } as unknown as DatabaseState)).rejects.toBeDefined();
    await target.database.importState(state);
    await expect(target.database.importState(state)).rejects.toThrow("empty database");
    await target.database.close();
    databases.splice(databases.indexOf(target.database), 1);
    const reopened = new PostgresDatabase({ host: "127.0.0.1", port, user: "postgres", password: "test-password", database: target.databaseName });
    databases.push(reopened);
    await reopened.initialize();
    const repos = createPostgresRepositories(reopened);
    expect(await repos.users.findById(user.id)).toEqual(user);
    expect(await repos.favoriteNotes.list(user.id)).toEqual(state.favoriteNotes);
  });
});
