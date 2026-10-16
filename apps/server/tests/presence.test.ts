import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterEach, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { lastSeenStatus } from "../src/domain/models.js";
import { AtRestCrypto } from "../src/lib/crypto.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { RealtimeEvents } from "../src/realtime/events.js";
import { attachSocketServer, releaseSocketServer } from "../src/realtime/socket-server.js";
import { AuthService, type AuthResult, type EmailCodeChallenge } from "../src/services/auth-service.js";
import { AdminService } from "../src/services/admin-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
import { FriendService } from "../src/services/friend-service.js";
import { SessionService } from "../src/services/session-service.js";
import { SupportBotService } from "../src/services/support-bot-service.js";
import { StickerService } from "../src/services/sticker-service.js";
import { GroupService } from "../src/services/group-service.js";
import { ScheduledMessageService } from "../src/services/scheduled-message-service.js";
import { ChatService } from "../src/services/chat-service.js";
import { databaseSchema, JsonDatabase } from "../src/storage/json-database.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
/**
 * Подтверждение почты в тестах выключено, поэтому регистрация и вход всегда
 * возвращают токен. Приведение нужно только ради типов: если вдруг вернулся
 * вызов кода, тест должен упасть, а не молча продолжить с пустым токеном.
 */
function tokenResult(result: AuthResult | EmailCodeChallenge): AuthResult {
  if ("status" in result) throw new Error("Expected an access token, got an email code challenge");
  return result;
}

async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "yargram-presence-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const config = loadConfig({ NODE_ENV: "test", JWT_SECRET: "privacy-test-secret-long-enough", BCRYPT_ROUNDS: "4", DATA_DIR: directory });
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  const crypto = new AtRestCrypto("test-encryption-key-at-least-16");
  const repositories = withEncryption(createJsonRepositories(database), crypto);
  const authService = new AuthService(repositories.users, { jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn, bcryptRounds: 4, sessions: repositories.sessions });
  const chatService = new ChatService(repositories);
  const events = new RealtimeEvents();
  const adminService = new AdminService(repositories, events);
  const groupService = new GroupService(repositories, events, chatService);
  const draftService = new DraftService(repositories, chatService, events);
  const folderService = new FolderService(repositories, chatService, events);
  const scheduledMessageService = new ScheduledMessageService(repositories, chatService, events);
  const friendService = new FriendService(repositories, events);
  const sessionService = new SessionService(repositories.sessions, repositories.users, events);
  const supportBotService = new SupportBotService(repositories, chatService, events);
  const stickerService = new StickerService(repositories, events);
  const app = createApp({
    config,
    repositories,
    authService,
    chatService,
    groupService,
    adminService,
    draftService,
    folderService,
    scheduledMessageService,
    friendService,
    sessionService,
    supportBotService,
    stickerService,
    events,
    crypto,
  });
  const alice = tokenResult(await authService.register({ email: "alice@example.test", password: "password123", displayName: "Alice", username: "alice" }));
  const bob = tokenResult(await authService.register({ email: "bob@example.test", password: "password123", displayName: "Bob", username: "bob" }));
  return { config, app, repositories, authService, chatService, draftService, folderService, scheduledMessageService, events, alice, bob };
}
const hidden = { lastSeenAt: null, online: false, lastSeenStatus: "recently" };
function event(socket: Socket, name: string, id: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Missing ${name} for ${id}`)); }, 8000);
    function listener(value: Record<string, unknown>) { if ((value.userId ?? value.id) !== id) return; clearTimeout(timer); socket.off(name, listener); resolve(value); }
    socket.on(name, listener);
  });
}

it("uses inclusive privacy bucket boundaries and defaults legacy records to visible", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  const day = 86400000;
  for (const [age, status] of [[0, "recently"], [3 * day, "recently"], [3 * day + 1, "within_week"], [7 * day, "within_week"], [7 * day + 1, "within_month"], [30 * day, "within_month"], [30 * day + 1, "long_ago"]] as const) {
    expect(lastSeenStatus(new Date(now - age).toISOString(), now)).toBe(status);
  }
  const legacy = { id: "old", email: "old@test", passwordHash: "hash", displayName: "Old", createdAt: "2020-01-01" };
  expect(databaseSchema.parse({ version: 1, users: [legacy], conversations: [], messages: [] }).users[0]?.showLastSeen).toBe(true);
});

it("persists privacy and sanitizes REST users, conversations, replies, forwards and pins", async () => {
  const h = await harness();
  expect(h.alice.user.showLastSeen).toBe(true);
  const auth = { Authorization: `Bearer ${h.alice.accessToken}` };
  const observer = { Authorization: `Bearer ${h.bob.accessToken}` };
  expect((await request(h.app).patch("/api/users/me").set(auth).send({ showLastSeen: "false" })).status).toBe(400);
  const changed = await request(h.app).patch("/api/users/me").set(auth).send({ showLastSeen: false });
  expect(changed.status).toBe(200);
  expect(changed.body.user).toMatchObject({ ...hidden, showLastSeen: false });
  expect((await request(h.app).get("/api/auth/me").set(auth)).body.user.showLastSeen).toBe(false);
  const reopened = new JsonDatabase(h.config.dataFile); await reopened.initialize();
  expect((await createJsonRepositories(reopened).users.findById(h.alice.user.id))?.showLastSeen).toBe(false);
  expect((await request(h.app).get(`/api/users/${h.alice.user.id}`).set(observer)).body.user).toMatchObject(hidden);
  expect((await request(h.app).get("/api/users?q=alice").set(observer)).body.users[0]).toMatchObject(hidden);
  const { conversation } = await h.chatService.createDirectConversation(h.alice.user.id, h.bob.user.id);
  const first = await h.chatService.sendMessage(h.alice.user.id, conversation.id, "first");
  await h.chatService.sendMessage(h.bob.user.id, conversation.id, "reply", first.message.id);
  await h.chatService.forwardMessage(h.bob.user.id, conversation.id, first.message.id, conversation.id);
  await h.chatService.setPinnedMessage(h.bob.user.id, conversation.id, first.message.id);
  const messages = (await request(h.app).get(`/api/conversations/${conversation.id}/messages`).set(observer)).body.messages;
  expect(messages[0].sender).toMatchObject(hidden);
  expect(messages[1].replyTo.sender).toMatchObject(hidden);
  expect(messages[2].forwardedFrom.sender).toMatchObject(hidden);
  const view = (await request(h.app).get("/api/conversations").set(observer)).body.conversations[0];
  expect(view.members.find((user: { id: string }) => user.id === h.alice.user.id)).toMatchObject(hidden);
  expect(view.pinnedMessage.sender).toMatchObject(hidden);
  expect(view.lastMessage.forwardedFrom.sender).toMatchObject(hidden);
  await request(h.app).patch("/api/users/me").set(auth).send({ showLastSeen: true }).expect(200);
  expect((await request(h.app).get(`/api/users/${h.alice.user.id}`).set(observer)).body.user).toMatchObject({ lastSeenAt: expect.any(String), lastSeenStatus: null });
});

it("sanitizes initial, online, offline and profile socket payloads and restores visible presence", async () => {
  const h = await harness();
  await h.authService.updateProfile(h.alice.user.id, { showLastSeen: false });
  const server = createServer(h.app);
  const sockets = attachSocketServer(server, h);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  const clients: Socket[] = [];
  cleanups.push(async () => { clients.forEach((client) => client.disconnect()); await new Promise<void>((resolve) => sockets.close(() => resolve())); await releaseSocketServer(sockets); });
  function client(token: string) { const socket = io(`http://127.0.0.1:${address && typeof address !== "string" ? address.port : 0}`, { transports: ["websocket"], auth: { token }, autoConnect: false }); clients.push(socket); return socket; }
  const bob = client(h.bob.accessToken);
  const bobReady = event(bob, "presence:updated", h.bob.user.id); bob.connect(); await bobReady;
  const alice = client(h.alice.accessToken);
  const online = event(bob, "presence:updated", h.alice.user.id); alice.connect();
  expect(await online).toMatchObject({ ...hidden, isOnline: false });
  const newcomer = client(h.bob.accessToken);
  const snapshot = event(newcomer, "presence:updated", h.alice.user.id); newcomer.connect();
  expect(await snapshot).toMatchObject({ ...hidden, isOnline: false });
  const visibleProfile = event(bob, "profile:updated", h.alice.user.id);
  await request(h.app).patch("/api/users/me").set("Authorization", `Bearer ${h.alice.accessToken}`).send({ showLastSeen: true }).expect(200);
  expect(await visibleProfile).toMatchObject({ online: true, isOnline: true, lastSeenAt: expect.any(String), lastSeenStatus: null });
  const privateProfile = event(bob, "profile:updated", h.alice.user.id);
  await request(h.app).patch("/api/users/me").set("Authorization", `Bearer ${h.alice.accessToken}`).send({ showLastSeen: false }).expect(200);
  expect(await privateProfile).toMatchObject({ ...hidden, isOnline: false });
  const offline = event(bob, "presence:updated", h.alice.user.id); alice.disconnect();
  expect(await offline).toMatchObject({ ...hidden, isOnline: false });
}, 15000);

it("keeps Saved Messages owner-only through CRUD, pins, search, forwarding and restart", async () => {
  const h = await harness();
  const owner = { Authorization: `Bearer ${h.alice.accessToken}` };
  const stranger = { Authorization: `Bearer ${h.bob.accessToken}` };
  await request(h.app).post("/api/conversations/saved").expect(401);
  const created = await request(h.app).post("/api/conversations/saved").set(owner).expect(201);
  const id = created.body.conversation.id as string;
  expect(created.body.conversation).toMatchObject({ type: "saved", memberIds: [h.alice.user.id] });
  const again = await request(h.app).post("/api/conversations/saved").set(owner).send({ userId: h.bob.user.id }).expect(200);
  expect(again.body.conversation.id).toBe(id);
  await request(h.app).post("/api/conversations/direct").set(owner).send({ userId: h.alice.user.id }).expect(400);
  const attachment = await request(h.app).post("/api/uploads?kind=file").set(owner).attach("file", Buffer.from("private attachment"), "note.txt").expect(201);
  const sent = await request(h.app).post(`/api/conversations/${id}/messages`).set(owner).send({ text: "private memo", attachmentIds: [attachment.body.attachment.id] }).expect(201);
  const messageId = sent.body.message.id as string;
  expect(sent.body.message.attachments[0].fileName).toBe("note.txt");
  const reply = await request(h.app).post(`/api/conversations/${id}/messages`).set(owner).send({ text: "reply", replyToId: messageId }).expect(201);
  expect(reply.body.message.replyTo.id).toBe(messageId);
  await request(h.app).patch(`/api/conversations/${id}/messages/${messageId}`).set(owner).send({ text: "edited memo" }).expect(200);
  await request(h.app).put(`/api/conversations/${id}/pins/${messageId}`).set(owner).expect(200);
  await request(h.app).post(`/api/conversations/${id}/read`).set(owner).expect(200);
  const found = await request(h.app).get(`/api/conversations/${id}/messages?q=edited`).set(owner).expect(200);
  expect(found.body.messages).toHaveLength(1);
  for (const [method, path, body] of [
    ["get", `/api/conversations/${id}/messages`, {}],
    ["post", `/api/conversations/${id}/messages`, { text: "intrusion" }],
    ["patch", `/api/conversations/${id}/messages/${messageId}`, { text: "intrusion" }],
    ["delete", `/api/conversations/${id}/messages/${messageId}`, {}],
    ["put", `/api/conversations/${id}/pins/${messageId}`, {}],
    ["post", `/api/conversations/${id}/read`, {}],
  ] as const) await request(h.app)[method](path).set(stranger).send(body).expect(403);
  expect((await request(h.app).get("/api/conversations").set(stranger)).body.conversations).toEqual([]);
  const bobSaved = await h.chatService.createSavedConversation(h.bob.user.id);
  await expect(h.chatService.forwardMessage(h.bob.user.id, id, messageId, bobSaved.conversation.id)).rejects.toMatchObject({ code: "CONVERSATION_FORBIDDEN" });
  await expect(h.chatService.beginCall(h.alice.user.id, id, "saved-call", "audio")).rejects.toMatchObject({ code: "CALL_NOT_SUPPORTED" });
  const reloaded = new JsonDatabase(h.config.dataFile); await reloaded.initialize();
  expect((await createJsonRepositories(reloaded).conversations.findOrCreateSaved(h.alice.user.id)).conversation.id).toBe(id);
  await request(h.app).delete(`/api/conversations/${id}/messages/${messageId}`).set(owner).expect(200);
  const remaining = await request(h.app).get(`/api/conversations/${id}/messages`).set(owner).expect(200);
  expect(remaining.body.messages).toHaveLength(1);
});

it("validates recording metadata and retains voice and circles in messages after restart", async () => {
  const h = await harness();
  const policy = (await request(h.app).get("/api/health")).headers["content-security-policy"] as string;
  expect(policy).toContain("media-src 'self' blob:");
  expect(policy).toContain("img-src 'self' data: blob: https:");
  const auth = { Authorization: `Bearer ${h.alice.accessToken}` };
  const upload = (query: string, mime = "audio/webm") => request(h.app).post(`/api/uploads?${query}`).set(auth)
    .attach("file", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), { filename: "recording.webm", contentType: mime });
  for (const query of ["kind=file&mediaKind=voice", "kind=file&durationSeconds=2", "kind=file&mediaKind=voice&durationSeconds=0", "kind=file&mediaKind=voice&durationSeconds=Infinity", "kind=file&mediaKind=video_circle&durationSeconds=60.01", "kind=image&mediaKind=voice&durationSeconds=2"]) await upload(query).expect(400);
  await upload("kind=file&mediaKind=voice&durationSeconds=2", "video/webm").expect(400);
  await upload("kind=file&mediaKind=video_circle&durationSeconds=2", "audio/webm").expect(400);
  const voice = (await upload("kind=file&mediaKind=voice&durationSeconds=90000").expect(201)).body.attachment;
  const circle = (await upload("kind=file&mediaKind=video_circle&durationSeconds=60", "video/webm").expect(201)).body.attachment;
  expect(voice).toMatchObject({ mediaKind: "voice", durationSeconds: 90000 });
  expect(circle).toMatchObject({ mediaKind: "video_circle", durationSeconds: 60 });
  const saved = await h.chatService.createSavedConversation(h.alice.user.id);
  const sent = await h.chatService.sendMessage(h.alice.user.id, saved.conversation.id, "", undefined, { attachmentIds: [voice.id, circle.id] });
  expect(sent.message.attachments).toMatchObject([{ mediaKind: "voice", durationSeconds: 90000 }, { mediaKind: "video_circle", durationSeconds: 60 }]);
  const reopened = new JsonDatabase(h.config.dataFile); await reopened.initialize();
  const restored = await createJsonRepositories(reopened).attachments.findById(circle.id);
  expect(restored).toMatchObject({ mediaKind: "video_circle", durationSeconds: 60 });
});

it("enforces call privacy rules (nobody, contacts, allowed, denied exceptions)", async () => {
  const h = await harness();
  const { conversation: direct } = await h.chatService.createDirectConversation(h.alice.user.id, h.bob.user.id);

  // Default: everyone can call
  const call1 = await h.chatService.beginCall(h.alice.user.id, direct.id, "call-1", "audio");
  expect(call1.call.id).toBe("call-1");
  await h.chatService.finishCall(h.alice.user.id, direct.id, "call-1", false);

  // Bob sets callPrivacy: "nobody"
  await h.authService.updateProfile(h.bob.user.id, { callPrivacy: "nobody" });
  await expect(h.chatService.beginCall(h.alice.user.id, direct.id, "call-2", "audio"))
    .rejects.toMatchObject({ code: "CALL_FORBIDDEN_BY_PRIVACY" });

  // Bob adds Alice to callPrivacyAllowedUserIds
  await h.authService.updateProfile(h.bob.user.id, {
    callPrivacy: "nobody",
    callPrivacyAllowedUserIds: [h.alice.user.id],
  });
  const call3 = await h.chatService.beginCall(h.alice.user.id, direct.id, "call-3", "audio");
  expect(call3.call.id).toBe("call-3");
  await h.chatService.finishCall(h.alice.user.id, direct.id, "call-3", false);

  // Bob sets callPrivacy: "everyone" but adds Alice to callPrivacyDeniedUserIds
  await h.authService.updateProfile(h.bob.user.id, {
    callPrivacy: "everyone",
    callPrivacyAllowedUserIds: [],
    callPrivacyDeniedUserIds: [h.alice.user.id],
  });
  await expect(h.chatService.beginCall(h.alice.user.id, direct.id, "call-4", "audio"))
    .rejects.toMatchObject({ code: "CALL_FORBIDDEN_BY_PRIVACY" });
});
