import { createServer, type Server as HttpServer } from "node:http";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { RealtimeEvents } from "../src/realtime/events.js";
import { attachSocketServer, releaseSocketServer } from "../src/realtime/socket-server.js";
import { mediaUrlFor } from "../src/lib/media-links.js";
import { errorHandler } from "../src/lib/errors.js";
import { AtRestCrypto } from "../src/lib/crypto.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { AuthService } from "../src/services/auth-service.js";
import { AdminService } from "../src/services/admin-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
import { GroupService } from "../src/services/group-service.js";
import { ScheduledMessageService } from "../src/services/scheduled-message-service.js";
import { ChatService, type MessageView } from "../src/services/chat-service.js";
import { FriendService } from "../src/services/friend-service.js";
import { SessionService } from "../src/services/session-service.js";
import { SupportBotService } from "../src/services/support-bot-service.js";
import { StickerService } from "../src/services/sticker-service.js";
import { uploadLimits } from "../src/services/upload-service.js";
import {
  FAKE_BIO_WARNING,
  FAKE_GROUP_WARNING,
  SCAM_BIO_WARNING,
  SCAM_GROUP_WARNING,
} from "../src/domain/models.js";
import { JsonDatabase } from "../src/storage/json-database.js";

const temporaryDirectories: string[] = [];
const realtimeServers: Array<ReturnType<typeof attachSocketServer>> = [];

/** Stops a test socket server and waits for its tracked work before storage is removed. */
async function closeRealtimeServer(io: ReturnType<typeof attachSocketServer>): Promise<void> {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await releaseSocketServer(io);
}

async function createHarness(seedState?: unknown, extraEnv: NodeJS.ProcessEnv = {}) {
  const directory = await mkdtemp(join(tmpdir(), "yargram-server-"));
  temporaryDirectories.push(directory);
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-that-is-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
    ...extraEnv,
  });
  if (seedState !== undefined) {
    await writeFile(config.dataFile, JSON.stringify(seedState, null, 2) + "\n", "utf8");
  }
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  const crypto = new AtRestCrypto("test-encryption-key-at-least-16");
  const repositories = withEncryption(createJsonRepositories(database), crypto);
  const authService = new AuthService(repositories.users, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: config.bcryptRounds,
    sessions: repositories.sessions,
  });
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
  return {
    app,
    config,
    crypto,
    repositories,
    authService,
    chatService,
    groupService,
    draftService,
    folderService,
    scheduledMessageService,
    friendService,
    sessionService,
    supportBotService,
    stickerService,
    events,
  };
}

type RegisteredUser = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    username: string | null;
    bio: string;
  };
};

async function register(
  app: ReturnType<typeof createApp>,
  email: string,
  displayName: string,
  username = displayName.toLowerCase().replace(/[^a-z0-9_]/g, "_") || "member",
): Promise<RegisteredUser> {
  const response = await request(app).post("/api/auth/register").send({
    email,
    password: "correct horse battery staple",
    displayName,
    username,
  });
  expect(response.status).toBe(201);
  return response.body as RegisteredUser;
}

const TEST_PASSWORD = "correct horse battery staple";

function bearer(token: string): string {
  return "Bearer " + token;
}

afterEach(async () => {
  for (const io of realtimeServers.splice(0)) await closeRealtimeServer(io);
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Yargram API", () => {
  it("validates optional HTTPS configuration", () => {
    const httpOnly = loadConfig({ NODE_ENV: "test", HTTPS_PORT: "0" });
    expect(httpOnly.httpsPort).toBeUndefined();

    const secure = loadConfig({
      NODE_ENV: "test",
      HTTPS_PORT: "3443",
      TLS_PFX_PATH: "runtime/https/test.pfx",
      TLS_PFX_PASSWORD: "test-password",
    });
    expect(secure).toMatchObject({
      httpsPort: 3443,
      tlsPfxPassword: "test-password",
    });
    expect(secure.tlsPfxPath).toMatch(/runtime[\\/]https[\\/]test\.pfx$/);

    expect(() => loadConfig({ NODE_ENV: "test", HTTPS_PORT: "3443" })).toThrow(
      /TLS_PFX_PATH/,
    );
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        PORT: "3443",
        HTTPS_PORT: "3443",
        TLS_PFX_PATH: "test.pfx",
        TLS_PFX_PASSWORD: "test-password",
      }),
    ).toThrow(/different/);
  });

  // 🔥 По умолчанию доверие прокси выключено намеренно: `X-Forwarded-For`
  // подделывается обычным запросом, а по адресу клиента у нас работает
  // ограничитель попыток входа. Включить его можно только явно.
  it("доверие прокси выключено, пока не задано обратное", () => {
    expect(loadConfig({ NODE_ENV: "test" }).trustProxy).toBe(false);
    expect(loadConfig({ NODE_ENV: "test", TRUST_PROXY: "false" }).trustProxy).toBe(false);
    expect(loadConfig({ NODE_ENV: "test", TRUST_PROXY: "" }).trustProxy).toBe(false);
  });

  it("понимает «да» и список подсетей в TRUST_PROXY", () => {
    expect(loadConfig({ NODE_ENV: "test", TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({ NODE_ENV: "test", TRUST_PROXY: "yes" }).trustProxy).toBe(true);
    // Список подсетей отдаём Express как есть, не пытаясь разобрать сами:
    // понимает его именно Express.
    expect(loadConfig({ NODE_ENV: "test", TRUST_PROXY: "loopback, uniquelocal" }).trustProxy)
      .toBe("loopback, uniquelocal");
  });

  it("сохраняет PUBLIC_ORIGIN без хвостового слеша", () => {
    const config = loadConfig({ NODE_ENV: "test", PUBLIC_ORIGIN: "https://yargram.example.com/" });
    expect(config.publicOrigin).toBe("https://yargram.example.com");
    expect(loadConfig({ NODE_ENV: "test" }).publicOrigin).toBeUndefined();
  });

  // 🔥 Редирект на HTTPS выключен по умолчанию, и это важнее удобства.
  // Если сервер не знает исходную схему (перед ним нет прокси с
  // `X-Forwarded-Proto`), он и уже защищённый запрос считает незащищённым —
  // тогда включённый по умолчанию редирект замкнул бы сайт в бесконечный
  // цикл перенаправлений. Проверяем и сам редирект, и что он молчит.
  it("перенаправление на HTTPS выключено, пока не задано обратное", async () => {
    const { app } = await createHarness();
    const response = await request(app).get("/health").set("Host", "yargram.example.com");

    expect(response.status).toBe(200);
    expect(loadConfig({ NODE_ENV: "test" }).forceHttps).toBe(false);
    expect(loadConfig({ NODE_ENV: "test", FORCE_HTTPS: "false" }).forceHttps).toBe(false);
  });

  it("уводит запрос по HTTP на HTTPS, когда перенаправление включено", async () => {
    const { app } = await createHarness(undefined, { FORCE_HTTPS: "true", TRUST_PROXY: "true" });

    // Обычный запрос без прокси-заголовков — уводим на HTTPS, путь и параметры
    // сохраняем: иначе человек после перенаправления попал бы не туда.
    const insecure = await request(app).get("/health?x=1").set("Host", "yargram.example.com");
    expect(insecure.status).toBe(301);
    expect(insecure.headers.location).toBe("https://yargram.example.com/health?x=1");

    // 🔥 Запрос с телом перенаправлять как `301` нельзя: этот код браузеры
    // вправе применить к любому методу как чтение, и тело бы потерялось —
    // вход или отправка сообщения молча превратились бы в пустой GET.
    const posted = await request(app)
      .post("/api/auth/login")
      .set("Host", "yargram.example.com")
      .send({ email: "a@b.c" });
    expect(posted.status).toBe(308);
    expect(posted.headers.location).toBe("https://yargram.example.com/api/auth/login");

    // Прокси сообщил, что запрос уже пришёл по HTTPS — не трогаем его.
    const secure = await request(app)
      .get("/health")
      .set("Host", "yargram.example.com")
      .set("X-Forwarded-Proto", "https");
    expect(secure.status).toBe(200);
  });

  // 🔥 Кривой percent-код в пути: Express бросает `URIError` с уже проставленным
  // `status: 400`, но обработчик раньше такие ошибки не распознавал — человек
  // читал «An unexpected server error occurred» вместо честного отказа.
  it("отдаёт клиентский код на кривом percent-коде в пути, а не 500", async () => {
    const { app } = await createHarness();
    for (const path of [
      "/api/users/%",
      "/api/users/%ZZ",
      "/api/users/%E0%A4%A",
      "/api/conversations/%/messages",
      "/api/sticker-packs/%",
      "/api/uploads/%",
    ]) {
      const response = await request(app).get(path);
      expect(`${path} → ${response.status}`).toBe(`${path} → 400`);
      expect(response.body.error.code).toBe("INVALID_URL");
      expect(response.body.error.message).not.toMatch(/unexpected/i);
    }
  });

  // Готовые 4xx от статики и парсеров доходят под своим кодом, а настоящие
  // сбои по-прежнему прячутся за общей фразой 500.
  it("пропускает готовые 4xx наружу и оставляет 500 для настоящих сбоев", async () => {
    const app = express();
    app.get("/api/forbidden", () => {
      const error = new Error("нет доступа") as Error & { status: number };
      error.status = 403;
      throw error;
    });
    app.get("/api/boom", () => {
      throw new Error("внутренний сбой");
    });
    app.use(errorHandler);

    const forbidden = await request(app).get("/api/forbidden");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({ code: "FORBIDDEN", message: "Forbidden" });

    const boom = await request(app).get("/api/boom");
    expect(boom.status).toBe(500);
    expect(boom.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("registers, logs in and atomically updates a profile", async () => {
    const { app } = await createHarness();
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");

    const page = await request(app).get("/");
    expect(page.headers["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests",
    );

    const alice = await register(app, "alice@example.com", "Alice");
    expect(alice.user).toMatchObject({ username: "alice", bio: "" });

    const duplicate = await request(app).post("/api/auth/register").send({
      email: "ALICE@example.com",
      password: "another secure password",
      name: "Another Alice",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");

    const login = await request(app).post("/api/auth/login").send({
      email: "alice@example.com",
      password: "correct horse battery staple",
    });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toEqual(expect.any(String));

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", bearer(alice.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      email: "alice@example.com",
      displayName: "Alice",
      bio: "",
    });

    // Аккаунт без ника: юзернейм необязателен, аккаунт всё равно создаётся.
    const anonymous = await request(app).post("/api/auth/register").send({
      email: "no-username@example.com",
      password: "correct horse battery staple",
      displayName: "Без ника",
    });
    expect(anonymous.status).toBe(201);
    expect(anonymous.body.user).toMatchObject({ displayName: "Без ника" });
    expect(anonymous.body.user.username ?? "").toBe("");

    await register(app, "bob@example.com", "Bob");
    const updated = await request(app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ displayName: "Alice A.", username: "@Top1Nuk1", bio: "Available" });
    expect(updated.status).toBe(200);
    expect(updated.body.user).toMatchObject({
      displayName: "Alice A.",
      username: "Top1Nuk1",
      bio: "Available",
    });

    const usernameConflict = await request(app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ username: "@BOB" });
    expect(usernameConflict.status).toBe(409);
    expect(usernameConflict.body.error.code).toBe("USERNAME_TAKEN");

    const emptyUpdate = await request(app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({});
    expect(emptyUpdate.status).toBe(400);

    const carol = await register(app, "carol@example.com", "Carol");
    const dave = await register(app, "dave@example.com", "Dave");
    const competingUpdates = await Promise.all([
      request(app)
        .patch("/api/users/me")
        .set("Authorization", bearer(carol.accessToken))
        .send({ username: "Shared_Name" }),
      request(app)
        .patch("/api/users/me")
        .set("Authorization", bearer(dave.accessToken))
        .send({ username: "shared_name" }),
    ]);
    expect(competingUpdates.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("searches only usernames and completes the message REST flow", async () => {
    const { app, events } = await createHarness();
    const alice = await register(app, "alice@example.com", "Alice");
    const bob = await register(app, "bob@example.com", "Bob");
    await register(
      app,
      "search-email@example.com",
      "DisplayNeedle",
      "hidden_handle",
    );

    const usernameSearch = await request(app)
      .get("/api/users?q=@BOB")
      .set("Authorization", bearer(alice.accessToken));
    expect(usernameSearch.status).toBe(200);
    expect(usernameSearch.body.users).toHaveLength(1);
    expect(usernameSearch.body.users[0]).toMatchObject({ id: bob.user.id, username: "bob" });
    expect(usernameSearch.body.users[0].email).toBeUndefined();

    const displayNameSearch = await request(app)
      .get("/api/users?q=DisplayNeedle")
      .set("Authorization", bearer(bob.accessToken));
    expect(displayNameSearch.body.users).toHaveLength(0);
    const emailSearch = await request(app)
      .get("/api/users?q=search-email%40example.com")
      .set("Authorization", bearer(bob.accessToken));
    expect(emailSearch.body.users).toHaveLength(0);
    const caseInsensitiveSearch = await request(app)
      .get("/api/users?q=@HIDDEN_HANDLE")
      .set("Authorization", bearer(bob.accessToken));
    expect(caseInsensitiveSearch.body.users[0].displayName).toBe("DisplayNeedle");

    const conversationResponse = await request(app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    expect(conversationResponse.status).toBe(201);
    const conversationId = conversationResponse.body.conversation.id as string;

    const realtimeMessage = new Promise<MessageView>((resolve) => {
      const unsubscribe = events.onNewMessage((event) => {
        unsubscribe();
        resolve(event.message);
      });
    });
    const sent = await request(app)
      .post("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "  Hello, Bob!  " });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({
      text: "Hello, Bob!",
      readBy: [alice.user.id],
      replyTo: null,
    });
    await expect(realtimeMessage).resolves.toMatchObject({ id: sent.body.message.id });

    const receiptEvent = new Promise((resolve) => {
      const unsubscribe = events.onReadMessages((event) => {
        unsubscribe();
        resolve(event.receipt);
      });
    });
    const receipt = await request(app)
      .post("/api/conversations/" + conversationId + "/read")
      .set("Authorization", bearer(bob.accessToken));
    expect(receipt.status).toBe(200);
    expect(receipt.body.receipt).toMatchObject({
      conversationId,
      messageIds: [sent.body.message.id],
      userId: bob.user.id,
    });
    await expect(receiptEvent).resolves.toMatchObject({ userId: bob.user.id });

    const messagesAfterReceipt = await request(app)
      .get("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(alice.accessToken));
    expect(messagesAfterReceipt.body.messages[0].readBy).toEqual(
      expect.arrayContaining([alice.user.id, bob.user.id]),
    );

    const reply = await request(app)
      .post("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Hello!", replyToId: sent.body.message.id });
    expect(reply.status).toBe(201);
    expect(reply.body.message.replyTo).toMatchObject({
      id: sent.body.message.id,
      text: "Hello, Bob!",
    });
    expect(reply.body.message.replyTo.replyTo).toBeUndefined();

    const carol = await register(app, "carol@example.com", "Carol");
    const otherConversation = await request(app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: carol.user.id });
    const foreignMessage = await request(app)
      .post("/api/conversations/" + otherConversation.body.conversation.id + "/messages")
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Other chat" });
    const invalidReply = await request(app)
      .post("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Invalid reply", replyToId: foreignMessage.body.message.id });
    expect(invalidReply.status).toBe(400);
    expect(invalidReply.body.error.code).toBe("REPLY_MESSAGE_INVALID");

    const edited = await request(app)
      .patch("/api/conversations/" + conversationId + "/messages/" + sent.body.message.id)
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Hello, Bob!!" });
    expect(edited.status).toBe(200);
    expect(edited.body.message).toMatchObject({
      text: "Hello, Bob!!",
      editedAt: expect.any(String),
    });

    const forbiddenEdit = await request(app)
      .patch("/api/conversations/" + conversationId + "/messages/" + sent.body.message.id)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Not mine" });
    expect(forbiddenEdit.status).toBe(403);

    const pinned = await request(app)
      .put("/api/conversations/" + conversationId + "/pin")
      .set("Authorization", bearer(bob.accessToken))
      .send({ messageId: sent.body.message.id });
    expect(pinned.status).toBe(200);
    expect(pinned.body.pinnedMessage.id).toBe(sent.body.message.id);

    const deletedByOtherMember = await request(app)
      .delete("/api/conversations/" + conversationId + "/messages/" + reply.body.message.id)
      .set("Authorization", bearer(alice.accessToken));
    expect(deletedByOtherMember.status).toBe(200);

    const conversations = await request(app)
      .get("/api/conversations")
      .set("Authorization", bearer(bob.accessToken));
    expect(conversations.body.conversations[0].lastMessage.text).toBe("Hello, Bob!!");
    expect(conversations.body.conversations[0].pinnedMessage.id).toBe(sent.body.message.id);

    const unpinned = await request(app)
      .delete("/api/conversations/" + conversationId + "/pin")
      .set("Authorization", bearer(alice.accessToken));
    expect(unpinned.status).toBe(200);
    expect(unpinned.body.pinnedMessage).toBeNull();
  });

  it("persists profile and complete chat state across a database restart", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "persist-alice@example.com", "Alice");
    const bob = await register(harness.app, "persist-bob@example.com", "Bob");

    const profile = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ displayName: "Alice Saved", username: "Saved_Alice", bio: "Stored in DB" });
    expect(profile.status).toBe(200);

    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;

    const original = await request(harness.app)
      .post("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Persistent original" });
    const reply = await request(harness.app)
      .post("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Persistent reply", replyToId: original.body.message.id });
    const editedReply = await request(harness.app)
      .patch("/api/conversations/" + conversationId + "/messages/" + reply.body.message.id)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Persistent edited reply" });
    expect(editedReply.status).toBe(200);

    const receipt = await request(harness.app)
      .post("/api/conversations/" + conversationId + "/read")
      .set("Authorization", bearer(bob.accessToken));
    expect(receipt.status).toBe(200);

    const pinned = await request(harness.app)
      .put("/api/conversations/" + conversationId + "/pin")
      .set("Authorization", bearer(alice.accessToken))
      .send({ messageId: original.body.message.id });
    expect(pinned.status).toBe(200);

    const disposable = await request(harness.app)
      .post("/api/conversations/" + conversationId + "/messages")
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Must remain deleted" });
    const removed = await request(harness.app)
      .delete("/api/conversations/" + conversationId + "/messages/" + disposable.body.message.id)
      .set("Authorization", bearer(alice.accessToken));
    expect(removed.status).toBe(200);

    // Re-open the exact same on-disk file to simulate stopping and starting Yargram.
    const reloadedDatabase = new JsonDatabase(harness.config.dataFile);
    await reloadedDatabase.initialize();
    // Тот же ключ: после перезапуска зашифрованные сообщения читаются обратно.
    const reloadedRepositories = withEncryption(createJsonRepositories(reloadedDatabase), harness.crypto);
    const reloadedChatService = new ChatService(reloadedRepositories);

    await expect(reloadedRepositories.users.findById(alice.user.id)).resolves.toMatchObject({
      displayName: "Alice Saved",
      username: "Saved_Alice",
      bio: "Stored in DB",
    });
    await expect(
      reloadedRepositories.messages.findById(disposable.body.message.id),
    ).resolves.toBeNull();
    await expect(
      reloadedRepositories.messages.findById(original.body.message.id),
    ).resolves.toMatchObject({
      readBy: expect.arrayContaining([alice.user.id, bob.user.id]),
    });
    await expect(
      reloadedRepositories.messages.findById(reply.body.message.id),
    ).resolves.toMatchObject({
      text: "Persistent edited reply",
      editedAt: expect.any(String),
      replyToId: original.body.message.id,
    });

    const reloadedConversations = await reloadedChatService.listConversations(alice.user.id);
    expect(reloadedConversations).toHaveLength(1);
    expect(reloadedConversations[0]).toMatchObject({
      id: conversationId,
      lastMessage: {
        id: reply.body.message.id,
        text: "Persistent edited reply",
        replyTo: { id: original.body.message.id, text: "Persistent original" },
      },
      pinnedMessage: { id: original.body.message.id, text: "Persistent original" },
    });
  });

  it("loads legacy JSON records with safe defaults", async () => {
    const userId = "legacy-user";
    const messageId = "legacy-message";
    const harness = await createHarness({
      version: 1,
      users: [
        {
          id: userId,
          email: "legacy@example.com",
          passwordHash: "not-used-in-this-test",
          displayName: "Legacy",
          username: "LegacyUser",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      conversations: [],
      messages: [
        {
          id: messageId,
          conversationId: "legacy-conversation",
          senderId: userId,
          text: "Old message",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await expect(harness.repositories.users.findById(userId)).resolves.toMatchObject({ bio: "" });
    await expect(harness.repositories.messages.findById(messageId)).resolves.toMatchObject({
      readBy: [userId],
    });
  });

  it("relays message lifecycle and receipts through user rooms", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "alice@example.com", "Alice");
    const bob = await register(harness.app, "bob@example.com", "Bob");
    const httpServer = createServer(harness.app);
    const socketServer = attachSocketServer(httpServer, harness);
    realtimeServers.push(socketServer);
    await listen(httpServer);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
    const client = createSocketClient("http://127.0.0.1:" + address.port, bob.accessToken);

    try {
      await waitForConnect(client);
      const profileUpdated = waitForSocketEvent<{
        id: string;
        displayName: string;
        username: string | null;
        bio: string;
        email?: string;
      }>(client, "profile:updated");
      const updatedProfileResponse = await request(harness.app)
        .patch("/api/users/me")
        .set("Authorization", bearer(alice.accessToken))
        .send({ displayName: "Alice Realtime", bio: "Updated live" });
      expect(updatedProfileResponse.status).toBe(200);
      const profileEvent = await profileUpdated;
      expect(profileEvent).toMatchObject({
        id: alice.user.id,
        displayName: "Alice Realtime",
        bio: "Updated live",
      });
      expect(profileEvent.email).toBeUndefined();

      const conversationResponse = await request(harness.app)
        .post("/api/conversations/direct")
        .set("Authorization", bearer(alice.accessToken))
        .send({ userId: bob.user.id });
      const conversationId = conversationResponse.body.conversation.id as string;

      const incoming = waitForSocketEvent<MessageView>(client, "message:new");
      const sent = await request(harness.app)
        .post("/api/conversations/" + conversationId + "/messages")
        .set("Authorization", bearer(alice.accessToken))
        .send({ text: "Realtime works" });
      expect(sent.status).toBe(201);
      await expect(incoming).resolves.toMatchObject({
        id: sent.body.message.id,
        conversationId,
        text: "Realtime works",
        readBy: [alice.user.id],
      });

      const readEvent = waitForSocketEvent<{
        conversationId: string;
        messageIds: string[];
        userId: string;
      }>(client, "messages:read");
      const read = await request(harness.app)
        .post("/api/conversations/" + conversationId + "/read")
        .set("Authorization", bearer(bob.accessToken));
      expect(read.status).toBe(200);
      await expect(readEvent).resolves.toMatchObject({
        conversationId,
        messageIds: [sent.body.message.id],
        userId: bob.user.id,
      });

      const repeatedReadEvent = waitForSocketEvent<{ messageIds: string[] }>(
        client,
        "messages:read",
      );
      const repeatedRead = await request(harness.app)
        .post("/api/conversations/" + conversationId + "/read")
        .set("Authorization", bearer(bob.accessToken));
      expect(repeatedRead.body.receipt.messageIds).toEqual([]);
      await expect(repeatedReadEvent).resolves.toMatchObject({ messageIds: [] });

      const updatedEvent = waitForSocketEvent<MessageView>(client, "message:updated");
      const updated = await request(harness.app)
        .patch("/api/conversations/" + conversationId + "/messages/" + sent.body.message.id)
        .set("Authorization", bearer(alice.accessToken))
        .send({ text: "Realtime edit" });
      expect(updated.status).toBe(200);
      await expect(updatedEvent).resolves.toMatchObject({
        id: sent.body.message.id,
        text: "Realtime edit",
        editedAt: expect.any(String),
      });

      const pinnedEvent = waitForSocketEvent<{
        conversationId: string;
        message: MessageView | null;
      }>(client, "message:pinned");
      const pinned = await request(harness.app)
        .put("/api/conversations/" + conversationId + "/pin")
        .set("Authorization", bearer(bob.accessToken))
        .send({ messageId: sent.body.message.id });
      expect(pinned.status).toBe(200);
      await expect(pinnedEvent).resolves.toMatchObject({
        conversationId,
        message: { id: sent.body.message.id },
      });

      const deletedEvent = waitForSocketEvent<{
        conversationId: string;
        messageId: string;
      }>(client, "message:deleted");
      const deleted = await request(harness.app)
        .delete("/api/conversations/" + conversationId + "/messages/" + sent.body.message.id)
        .set("Authorization", bearer(bob.accessToken));
      expect(deleted.status).toBe(200);
      expect(deleted.body.conversation).toMatchObject({
        lastMessage: null,
        pinnedMessage: null,
      });
      await expect(deletedEvent).resolves.toMatchObject({
        conversationId,
        messageId: sent.body.message.id,
      });
    } finally {
      client.close();
      await closeRealtimeServer(socketServer);
    }
  });

  it("relays WebRTC call signaling only to other conversation members", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "alice@example.com", "Alice");
    const bob = await register(harness.app, "bob@example.com", "Bob");
    const eve = await register(harness.app, "eve@example.com", "Eve");
    const conversationResponse = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversationResponse.body.conversation.id as string;

    const httpServer = createServer(harness.app);
    const socketServer = attachSocketServer(httpServer, harness);
    realtimeServers.push(socketServer);
    await listen(httpServer);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
    const url = "http://127.0.0.1:" + address.port;
    const aliceClient = createSocketClient(url, alice.accessToken);
    const bobClient = createSocketClient(url, bob.accessToken);
    const eveClient = createSocketClient(url, eve.accessToken);

    try {
      await Promise.all([
        waitForConnect(aliceClient),
        waitForConnect(bobClient),
        waitForConnect(eveClient),
      ]);

      const callId = "call-1";
      let echoedToCaller = false;
      aliceClient.once("call:incoming", () => {
        echoedToCaller = true;
      });
      const incoming = waitForSocketEvent<{
        conversationId: string;
        callId: string;
        mode: "audio" | "video";
        offer: { type: "offer"; sdp: string };
        fromUser: { id: string; email?: string };
      }>(bobClient, "call:incoming");
      aliceClient.emit("call:offer", {
        conversationId,
        callId,
        mode: "video",
        offer: { type: "offer", sdp: "offer-sdp" },
      });
      const receivedOffer = await incoming;
      expect(receivedOffer).toMatchObject({
        conversationId,
        callId,
        mode: "video",
        offer: { type: "offer", sdp: "offer-sdp" },
        fromUser: { id: alice.user.id },
      });
      expect(receivedOffer.fromUser.email).toBeUndefined();
      expect(echoedToCaller).toBe(false);

      const answered = waitForSocketEvent<{
        conversationId: string;
        callId: string;
        fromUserId: string;
      }>(aliceClient, "call:answered");
      bobClient.emit("call:answer", {
        conversationId,
        callId,
        answer: { type: "answer", sdp: "answer-sdp" },
      });
      await expect(answered).resolves.toMatchObject({
        conversationId,
        callId,
        fromUserId: bob.user.id,
      });

      const typingStarted = waitForSocketEvent<{
        conversationId: string;
        userId: string;
        isTyping: boolean;
      }>(bobClient, "typing:updated");
      aliceClient.emit("typing:start", { conversationId });
      await expect(typingStarted).resolves.toMatchObject({
        conversationId,
        userId: alice.user.id,
        isTyping: true,
      });
      aliceClient.emit("typing:stop", { conversationId });

      const modeChanged = waitForSocketEvent<{ mode: string; fromUserId: string }>(
        bobClient,
        "call:mode",
      );
      aliceClient.emit("call:mode", { conversationId, callId, mode: "video" });
      await expect(modeChanged).resolves.toMatchObject({
        mode: "video",
        fromUserId: alice.user.id,
      });

      const candidate = waitForSocketEvent<{ fromUserId: string; candidate: unknown }>(
        bobClient,
        "call:ice-candidate",
      );
      aliceClient.emit("call:ice-candidate", {
        conversationId,
        callId,
        candidate: { candidate: "candidate-line" },
      });
      await expect(candidate).resolves.toMatchObject({
        fromUserId: alice.user.id,
        candidate: { candidate: "candidate-line" },
      });

      const ended = waitForSocketEvent<{ fromUserId: string }>(aliceClient, "call:ended");
      const callHistory = waitForSocketEvent<MessageView>(bobClient, "message:new");
      bobClient.emit("call:end", { conversationId, callId });
      await expect(ended).resolves.toMatchObject({ fromUserId: bob.user.id });
      await expect(callHistory).resolves.toMatchObject({
        conversationId,
        kind: "system",
        systemEvent: "call",
        call: {
          callId,
          callerId: alice.user.id,
          mode: "video",
          outcome: "completed",
        },
      });

      const outsiderError = waitForSocketEvent<{
        callId: string | null;
        error: { code: string };
      }>(eveClient, "call:error");
      eveClient.emit("call:offer", {
        conversationId,
        callId: "outsider-call",
        mode: "audio",
        offer: { type: "offer", sdp: "offer-sdp" },
      });
      await expect(outsiderError).resolves.toMatchObject({
        callId: "outsider-call",
        error: { code: "CONVERSATION_FORBIDDEN" },
      });

      const invalidCandidateError = waitForSocketEvent<{ error: { code: string } }>(
        aliceClient,
        "call:error",
      );
      aliceClient.emit("call:ice-candidate", { conversationId, callId });
      await expect(invalidCandidateError).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    } finally {
      aliceClient.close();
      bobClient.close();
      eveClient.close();
      await closeRealtimeServer(socketServer);
    }
  });

  it("supports multi-participant calls: invites, joins and directed signaling", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "mp-alice@example.com", "Alice");
    const bob = await register(harness.app, "mp-bob@example.com", "Bob");
    const carol = await register(harness.app, "mp-carol@example.com", "Carol");
    const conversationResponse = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = conversationResponse.body.conversation.id as string;

    const httpServer = createServer(harness.app);
    const socketServer = attachSocketServer(httpServer, harness);
    realtimeServers.push(socketServer);
    await listen(httpServer);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
    const url = "http://127.0.0.1:" + address.port;
    const aliceClient = createSocketClient(url, alice.accessToken);
    const bobClient = createSocketClient(url, bob.accessToken);
    const carolClient = createSocketClient(url, carol.accessToken);

    try {
      await Promise.all([
        waitForConnect(aliceClient),
        waitForConnect(bobClient),
        waitForConnect(carolClient),
      ]);

      const callId = "multi-call-1";
      const incoming = waitForSocketEvent<{ callId: string }>(bobClient, "call:incoming");
      aliceClient.emit("call:offer", {
        conversationId,
        callId,
        mode: "video",
        offer: { type: "offer", sdp: "offer-sdp" },
      });
      await expect(incoming).resolves.toMatchObject({ callId });
      const answered = waitForSocketEvent<{ fromUserId: string }>(aliceClient, "call:answered");
      bobClient.emit("call:answer", {
        conversationId,
        callId,
        answer: { type: "answer", sdp: "answer-sdp" },
      });
      await expect(answered).resolves.toMatchObject({ fromUserId: bob.user.id });

      const inviteIncoming = waitForSocketEvent<{
        callId: string;
        conversationId: string;
        mode: "audio" | "video";
        fromUser: { id: string; email?: string };
        participants: Array<{ id: string; displayName: string }>;
      }>(carolClient, "call:invite-incoming");
      aliceClient.emit("call:invite", { conversationId, callId, userId: carol.user.id });
      const receivedInvite = await inviteIncoming;
      expect(receivedInvite).toMatchObject({
        conversationId,
        callId,
        mode: "video",
        fromUser: { id: alice.user.id },
        participants: [{ id: bob.user.id, displayName: "Bob" }],
      });
      expect(receivedInvite.fromUser.email).toBeUndefined();

      const aliceJoined = waitForSocketEvent<{
        callId: string;
        user: { id: string };
      }>(aliceClient, "call:participant-joined");
      const bobJoined = waitForSocketEvent<{ user: { id: string } }>(
        bobClient,
        "call:participant-joined",
      );
      carolClient.emit("call:join", { conversationId, callId });
      await expect(aliceJoined).resolves.toMatchObject({
        callId,
        user: { id: carol.user.id },
      });
      await expect(bobJoined).resolves.toMatchObject({ user: { id: carol.user.id } });

      const bobJoinOffer = waitForSocketEvent<{
        fromUserId: string;
        offer: { type: string; sdp: string };
      }>(bobClient, "call:join-offer");
      const aliceJoinOffer = waitForSocketEvent<{ fromUserId: string }>(
        aliceClient,
        "call:join-offer",
      );
      carolClient.emit("call:join-offer", {
        conversationId,
        callId,
        toUserId: bob.user.id,
        offer: { type: "offer", sdp: "carol-to-bob-sdp" },
      });
      carolClient.emit("call:join-offer", {
        conversationId,
        callId,
        toUserId: alice.user.id,
        offer: { type: "offer", sdp: "carol-to-alice-sdp" },
      });
      await expect(bobJoinOffer).resolves.toMatchObject({
        fromUserId: carol.user.id,
        offer: { type: "offer", sdp: "carol-to-bob-sdp" },
      });
      await expect(aliceJoinOffer).resolves.toMatchObject({ fromUserId: carol.user.id });

      const carolJoinAnswer = waitForSocketEvent<{
        fromUserId: string;
        answer: { type: string; sdp: string };
      }>(carolClient, "call:join-answer");
      bobClient.emit("call:join-answer", {
        conversationId,
        callId,
        fromUserId: carol.user.id,
        answer: { type: "answer", sdp: "bob-answer-sdp" },
      });
      await expect(carolJoinAnswer).resolves.toMatchObject({
        fromUserId: bob.user.id,
        answer: { type: "answer", sdp: "bob-answer-sdp" },
      });

      const directedIce = waitForSocketEvent<{
        fromUserId: string;
        candidate: { candidate: string };
      }>(bobClient, "call:ice");
      carolClient.emit("call:ice", {
        conversationId,
        callId,
        toUserId: bob.user.id,
        candidate: { candidate: "carol-candidate-line" },
      });
      await expect(directedIce).resolves.toMatchObject({
        fromUserId: carol.user.id,
        candidate: { candidate: "carol-candidate-line" },
      });

      const alreadyJoinedError = waitForSocketEvent<{ error: { code: string } }>(
        carolClient,
        "call:error",
      );
      carolClient.emit("call:invite", { conversationId, callId, userId: bob.user.id });
      await expect(alreadyJoinedError).resolves.toMatchObject({
        error: { code: "CALL_ALREADY_JOINED" },
      });

      const notInvitedError = waitForSocketEvent<{ error: { code: string } }>(
        carolClient,
        "call:error",
      );
      carolClient.emit("call:join", { conversationId, callId: "foreign-call" });
      await expect(notInvitedError).resolves.toMatchObject({
        error: { code: "CALL_NOT_FOUND" },
      });

      const aliceLeft = waitForSocketEvent<{ callId: string; userId: string }>(
        aliceClient,
        "call:participant-left",
      );
      const bobLeft = waitForSocketEvent<{ callId: string; userId: string }>(
        bobClient,
        "call:participant-left",
      );
      carolClient.close();
      await expect(aliceLeft).resolves.toMatchObject({
        callId,
        userId: carol.user.id,
      });
      await expect(bobLeft).resolves.toMatchObject({
        callId,
        userId: carol.user.id,
      });
    } finally {
      aliceClient.close();
      bobClient.close();
      carolClient.close();
      await closeRealtimeServer(socketServer);
    }
  });

  it("uploads validated photos, files and avatars and sends rich messages", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "media-alice@example.com", "MediaAlice");
    const bob = await register(harness.app, "media-bob@example.com", "MediaBob");
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;

    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(32),
    ]);
    const imageUpload = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", png, { filename: "photo.png", contentType: "image/png" });
    expect(imageUpload.status).toBe(201);
    expect(imageUpload.body.attachment).toMatchObject({
      kind: "image",
      fileName: "photo.png",
      mimeType: "image/png",
      size: png.length,
    });

    const displayed = await request(harness.app).get(imageUpload.body.attachment.url);
    expect(displayed.status).toBe(200);
    expect(displayed.headers["content-type"]).toContain("image/png");
    expect(displayed.headers["content-disposition"]).toContain("inline");
    expect(displayed.headers["x-content-type-options"]).toBe("nosniff");

    const richMessage = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "", attachmentIds: [imageUpload.body.attachment.id] });
    expect(richMessage.status).toBe(201);
    expect(richMessage.body.message.attachments[0]).toMatchObject({
      id: imageUpload.body.attachment.id,
    });
    // Links are re-signed per response, so the token itself is not stable.
    expect(richMessage.body.message.attachments[0].url).toContain(
      `/api/uploads/${imageUpload.body.attachment.id}?t=`,
    );

    const fileUpload = await request(harness.app)
      .post("/api/uploads?kind=file")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", Buffer.from("Yargram document"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });
    expect(fileUpload.status).toBe(201);
    const downloaded = await request(harness.app).get(`${fileUpload.body.attachment.url}&download=1`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toContain("application/octet-stream");
    expect(downloaded.headers["content-disposition"]).toContain("attachment");

    const avatar = await request(harness.app)
      .post("/api/users/me/avatar")
      .set("Authorization", bearer(alice.accessToken))
      .attach("avatar", png, { filename: "avatar.png", contentType: "image/png" });
    expect(avatar.status).toBe(201);
    expect(avatar.body.user.avatarUrl).toMatch(/^\/api\/uploads\/[0-9a-f-]+\?t=/);
    const publicProfile = await request(harness.app)
      .get(`/api/users/${alice.user.id}`)
      .set("Authorization", bearer(bob.accessToken));
    const withoutToken = (url: string) => url.split("?")[0];
    expect(withoutToken(publicProfile.body.user.avatarUrl)).toBe(
      withoutToken(avatar.body.user.avatarUrl),
    );

    // Баннер профиля: заливка и фото, видимые другим. Без этого полоса просто
    // не доехала бы до публичного профиля — как было со всеми пропущенными
    // полями при добавлении нового флага.
    const bannerColor = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ bannerColor: "#7a5cff" });
    expect(bannerColor.status).toBe(200);
    expect(bannerColor.body.user.bannerColor).toBe("#7a5cff");
    expect(bannerColor.body.user.bannerUrl).toBeNull();

    const banner = await request(harness.app)
      .post("/api/users/me/banner")
      .set("Authorization", bearer(alice.accessToken))
      .attach("banner", png, { filename: "banner.png", contentType: "image/png" });
    expect(banner.status).toBe(201);
    expect(banner.body.user.bannerUrl).toMatch(/^\/api\/uploads\/[0-9a-f-]+\?t=/);
    const bannerProfile = await request(harness.app)
      .get(`/api/users/${alice.user.id}`)
      .set("Authorization", bearer(bob.accessToken));
    expect(withoutToken(bannerProfile.body.user.bannerUrl)).toBe(
      withoutToken(banner.body.user.bannerUrl),
    );
    expect(bannerProfile.body.user.bannerColor).toBe("#7a5cff");

    // Снятие фото возвращает заливку, а пустая строка убирает и её.
    const bannerRemoved = await request(harness.app)
      .delete("/api/users/me/banner")
      .set("Authorization", bearer(alice.accessToken));
    expect(bannerRemoved.status).toBe(200);
    expect(bannerRemoved.body.user.bannerUrl).toBeNull();
    const bannerCleared = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ bannerColor: "" });
    expect(bannerCleared.body.user.bannerColor).toBeUndefined();

    // GIF разрешён именно баннеру: он анимированный, и живая полоса — то, чего
    // от баннера ждут. Подпись GIF89a — то же, что проверяет detectImageMime.
    const gif = Buffer.concat([
      Buffer.from("GIF89a", "ascii"),
      Buffer.alloc(26),
    ]);
    const animatedBanner = await request(harness.app)
      .post("/api/users/me/banner")
      .set("Authorization", bearer(alice.accessToken))
      .attach("banner", gif, { filename: "banner.gif", contentType: "image/gif" });
    expect(animatedBanner.status).toBe(201);
    expect(animatedBanner.body.user.banner.mimeType).toBe("image/gif");
    // Отдаётся инлайном и именно как GIF — иначе браузер не станет анимировать.
    const servedGif = await request(harness.app).get(animatedBanner.body.user.bannerUrl);
    expect(servedGif.status).toBe(200);
    expect(servedGif.headers["content-type"]).toContain("image/gif");
    expect(servedGif.headers["content-disposition"]).toContain("inline");

    // У аватара GIF по-прежнему запрещён: в кружке 40 px анимация только рябит.
    const gifAvatar = await request(harness.app)
      .post("/api/users/me/avatar")
      .set("Authorization", bearer(alice.accessToken))
      .attach("avatar", gif, { filename: "avatar.gif", contentType: "image/gif" });
    expect(gifAvatar.status).toBe(400);
    expect(gifAvatar.body.error.code).toBe("UPLOAD_EXTENSION_INVALID");

    const fakeImage = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", Buffer.from("not really an image"), {
        filename: "fake.png",
        contentType: "image/png",
      });
    expect(fakeImage.status).toBe(400);
    expect(fakeImage.body.error.code).toBe("UPLOAD_SIGNATURE_INVALID");
  });

  it("serves uploads only through temporary signed links", async () => {
    const harness = await createHarness();
    // Секрет намеренно не переопределяем: приложение подписывает ссылки своим
    // экземпляром модуля, тест — своим, и на Windows vite иногда загружает один
    // файл дважды. С одинаковым секретом по умолчанию подпись сходится в обоих
    // случаях. Само подписывание и срок жизни проверяет tests/media-links.test.ts.
    const alice = await register(harness.app, "link-alice@example.com", "LinkAlice");
    const bob = await register(harness.app, "link-bob@example.com", "LinkBob");
    const carol = await register(harness.app, "link-carol@example.com", "LinkCarol");
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(24),
    ]);
    const upload = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", png, { filename: "signed.png", contentType: "image/png" });
    const attachmentId = upload.body.attachment.id as string;

    // The issued link works, a bare path does not, and an expired link is rejected.
    await request(harness.app).get(upload.body.attachment.url).expect(200);
    await request(harness.app).get(`/api/uploads/${attachmentId}`).expect(401);
    await request(harness.app)
      .get(mediaUrlFor(attachmentId, alice.user.id, { ttlSeconds: -60 }))
      .expect(401);
    await request(harness.app)
      .get(`${mediaUrlFor(attachmentId, alice.user.id, { ttlSeconds: -60 })}&download=1`)
      .expect(401);

    // An unsigned file is readable by its owner only and only while it stays unattached.
    await request(harness.app).get(mediaUrlFor(attachmentId, carol.user.id)).expect(403);
    await request(harness.app).get(mediaUrlFor(attachmentId, alice.user.id)).expect(200);

    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "", attachmentIds: [attachmentId] })
      .expect(201);
    await request(harness.app).get(mediaUrlFor(attachmentId, bob.user.id)).expect(200);
    await request(harness.app).get(mediaUrlFor(attachmentId, carol.user.id)).expect(403);

    // Deleting the message revokes the link for the other participant.
    const deleted = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken));
    const messageId = deleted.body.messages[0].id as string;
    await request(harness.app)
      .delete(`/api/conversations/${conversationId}/messages/${messageId}`)
      .set("Authorization", bearer(alice.accessToken))
      .expect(200);
    await request(harness.app).get(mediaUrlFor(attachmentId, bob.user.id)).expect(403);
  });

  it("persists reactions, favorites, archive, mute, pins, reports and blocks", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "v02-alice@example.com", "V02Alice");
    const bob = await register(harness.app, "v02-bob@example.com", "V02Bob");
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;
    const first = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Persistent 0.2 needle" });
    const second = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Second pinned message" });

    const reaction = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages/${first.body.message.id}/reactions`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ emoji: "🔥" });
    expect(reaction.body.message.reactions).toEqual([
      { emoji: "🔥", userIds: [bob.user.id], count: 1 },
    ]);

    const favorite = await request(harness.app)
      .put(`/api/conversations/${conversationId}/messages/${first.body.message.id}/favorite`)
      .set("Authorization", bearer(alice.accessToken));
    expect(favorite.body.message.isFavorite).toBe(true);
    const favorites = await request(harness.app)
      .get("/api/favorites")
      .set("Authorization", bearer(alice.accessToken));
    expect(favorites.body.messages.map((message: MessageView) => message.id)).toContain(
      first.body.message.id,
    );

    for (const messageId of [first.body.message.id, second.body.message.id]) {
      const pin = await request(harness.app)
        .put(`/api/conversations/${conversationId}/pins/${messageId}`)
        .set("Authorization", bearer(alice.accessToken));
      expect(pin.status).toBe(200);
    }
    const mutedUntil = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const settings = await request(harness.app)
      .patch(`/api/conversations/${conversationId}/settings`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ archived: true, mutedUntil });
    expect(settings.body.conversation).toMatchObject({ archived: true, mutedUntil });
    expect(settings.body.conversation.pinnedMessages).toHaveLength(2);

    const search = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages?q=NEEDLE`)
      .set("Authorization", bearer(bob.accessToken));
    expect(search.body.messages).toHaveLength(1);
    expect(search.body.messages[0].id).toBe(first.body.message.id);

    const report = await request(harness.app)
      .post(`/api/users/${bob.user.id}/reports`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ reason: "spam" });
    expect(report.status).toBe(201);
    const blocked = await request(harness.app)
      .put(`/api/users/${bob.user.id}/block`)
      .set("Authorization", bearer(alice.accessToken));
    expect(blocked.body.blocked).toBe(true);
    // По-телеграмовски: заблокированный отправить может, но блокирующий этого
    // сообщения не видит ни в сокете, ни в истории.
    const fromBlocked = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Blocked message" });
    expect(fromBlocked.status).toBe(201);
    const aliceHistory = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken));
    expect(aliceHistory.body.messages.map((message: { id: string }) => message.id)).not.toContain(
      fromBlocked.body.message.id,
    );

    // А вот сам блокирующий писать не может, пока не снимет блокировку.
    const forbidden = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Blocked message" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("USER_BLOCKED");

    const reloadedDatabase = new JsonDatabase(harness.config.dataFile);
    await reloadedDatabase.initialize();
    const repositories = withEncryption(createJsonRepositories(reloadedDatabase), harness.crypto);
    const chatService = new ChatService(repositories);
    await expect(repositories.reports.list()).resolves.toHaveLength(1);
    await expect(repositories.messages.findById(first.body.message.id)).resolves.toMatchObject({
      reactions: [{ userId: bob.user.id, emoji: "🔥" }],
    });
    await expect(repositories.users.findById(alice.user.id)).resolves.toMatchObject({
      favoriteMessageIds: [first.body.message.id],
      blockedUserIds: [bob.user.id],
    });
    const conversations = await chatService.listConversations(alice.user.id);
    expect(conversations[0]).toMatchObject({
      archived: true,
      mutedUntil,
      blocked: true,
    });
    expect(conversations[0]?.pinnedMessages).toHaveLength(2);
  });

  it("keeps a badge when an admin grant only changes verification", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "grant-owner@example.com", "GrantOwner");
    const target = await register(harness.app, "grant-target@example.com", "GrantTarget");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };
    const grant = (body: Record<string, unknown>) =>
      request(harness.app).post(`/api/admin/${owner.user.id}/grant`).set(authorize).send(body);

    const verified = await grant({ targetUserId: target.user.id, isVerified: true });
    expect(verified.status).toBe(200);
    expect(verified.body.user).toMatchObject({ isVerified: true, badge: null });
    await expect(harness.repositories.users.findById(target.user.id)).resolves.toMatchObject({
      isVerified: true,
    });

    const badged = await grant({ targetUserId: target.user.id, badge: "yargram" });
    expect(badged.body.user).toMatchObject({ isVerified: true, badge: "yargram" });
    await expect(harness.repositories.users.findById(target.user.id)).resolves.toMatchObject({
      isVerified: true,
      badge: "yargram",
    });

    // An omitted badge must not silently clear a badge granted earlier.
    const verifiedAgain = await grant({ targetUserId: target.user.id, isVerified: true });
    expect(verifiedAgain.body.user).toMatchObject({ isVerified: true, badge: "yargram" });
    await expect(harness.repositories.users.findById(target.user.id)).resolves.toMatchObject({
      badge: "yargram",
    });

    // Administrator flags survive a JSON transaction instead of being stripped.
    await expect(harness.repositories.users.findById(owner.user.id)).resolves.toMatchObject({
      isOwner: true,
    });

    const cleared = await grant({ targetUserId: target.user.id, badge: "" });
    expect(cleared.body.user).toMatchObject({ badge: null, isVerified: true });
  });

  it("lets an owner grant several usernames and finds users by any of them", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "alias-owner@example.com", "AliasOwner");
    const target = await register(harness.app, "alias-target@example.com", "AliasTarget");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };
    const targetId = target.user.id;

    const granted = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: targetId, usernames: ["Kotik", "@second_name"] });
    expect(granted.status).toBe(200);
    // Регистр сохраняем так, как ник написал человек: @Kotik остаётся @Kotik.
    expect(granted.body.user.usernames).toEqual(["Kotik", "second_name"]);

    // Every alias is searchable through the regular user search.
    for (const query of ["kotik", "second_name", "aliastarget"]) {
      const search = await request(harness.app)
        .get(`/api/users?q=${query}`)
        .set(authorize);
      expect(search.body.users.map((user: { id: string }) => user.id)).toContain(targetId);
    }
    await expect(harness.repositories.users.findByUsername("kotik")).resolves.toMatchObject({
      id: targetId,
    });

    // Aliases belong to the account: a new registration cannot take one.
    await request(harness.app)
      .post("/api/auth/register")
      .send({
        email: "alias-clash@example.com",
        password: "correct horse battery staple",
        displayName: "Clash",
        username: "kotik",
      })
      .expect(409);
  });

  it("treats usernames as case-insensitive everywhere", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "case-owner@example.com", "CaseOwner");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };

    // Основной ник с большими буквами: регистр сохраняем, ищем в любом.
    const target = await request(harness.app)
      .post("/api/auth/register")
      .send({
        email: "case-target@example.com",
        password: "correct horse battery staple",
        displayName: "CaseTarget",
        username: "Top1Nuk1",
      });
    expect(target.status).toBe(201);
    const targetId = target.body.user.id as string;
    expect(target.body.user.username).toBe("Top1Nuk1");

    const granted = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: targetId, usernames: ["MiXeD_Alias", "@second", "MiXeD_alias"] });
    expect(granted.status).toBe(200);
    // Дубль в одном запросе склеивается, регистр первого написания остаётся.
    expect(granted.body.user.usernames).toEqual(["MiXeD_Alias", "second"]);

    // Поиск находит человека по любому нику и в любом регистре.
    for (const query of ["Top1Nuk1", "top1nuk1", "TOP1NUK1", "ToP1NuK1", "MiXeD_Alias", "mixed_alias", "MIXED_ALIAS", "Second", "SECOND"]) {
      const search = await request(harness.app).get(`/api/users?q=${encodeURIComponent(query)}`).set(authorize);
      expect(search.body.users.map((user: { id: string }) => user.id)).toContain(targetId);
    }

    // Админская панель ищет цель по нику без учёта регистра и с @.
    for (const name of ["Top1Nuk1", "top1nuk1", "TOP1NUK1", "MiXeD_Alias", "mixed_alias"]) {
      await expect(harness.repositories.users.findByUsername(name)).resolves.toMatchObject({ id: targetId });
    }
    // Поиск цели для админки: @ и регистр не мешают.
    for (const name of ["Top1Nuk1", "TOP1NUK1", "MiXeD_Alias", "@MIXED_ALIAS"]) {
      const byUsername = await request(harness.app)
        .post(`/api/admin/${owner.user.id}/grant`)
        .set(authorize)
        .send({ targetUsername: name, isVerified: true });
      expect(byUsername.status).toBe(200);
      expect(byUsername.body.user.id).toBe(targetId);
    }

    // Адрес, занятый соседом, по-прежнему отказ.
    const taken = await request(harness.app)
      .post("/api/auth/register")
      .send({ email: "case-clash@example.com", password: "correct horse battery staple", displayName: "Clash", username: "SECOND" });
    expect(taken.status).toBe(409);

    // Основной ник внутри списка дополнительных — дубль, а не ошибка: адрес и
    // так принадлежит этому аккаунту. Раньше он отменял весь запрос, и новые
    // ники не сохранялись вовсе; теперь дубль молча выкидывается, а остальное
    // записывается.
    const sameAccount = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: targetId, usernames: ["TOP1NUK1", "fresh_alias"] });
    expect(sameAccount.status).toBe(200);
    expect(sameAccount.body.user.usernames).toEqual(["fresh_alias"]);

    // Кириллица и пробелы в никах не проходят валидацию.
    const invalid = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: targetId, usernames: ["Котик", "has space"] });
    expect(invalid.status).toBe(400);
  });

  it("does not let a profile username take an address that is someone else's alias", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "steal-owner@example.com", "StealOwner");
    const target = await register(harness.app, "steal-target@example.com", "StealTarget");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });

    // @zayac — дополнительный ник владельца.
    await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set({ Authorization: bearer(owner.accessToken) })
      .send({ targetUserId: owner.user.id, usernames: ["zayac"] })
      .expect(200);

    // Чужой аккаунт не забирает адрес себе основным ником: иначе поиск по
    // @zayac начал бы находить не того, кому ник выдали.
    const stolen = await request(harness.app)
      .patch("/api/users/me")
      .set({ Authorization: bearer(target.accessToken) })
      .send({ username: "ZAYAC" });
    expect(stolen.status).toBe(409);

    await expect(harness.repositories.users.findByUsername("zayac")).resolves.toMatchObject({
      id: owner.user.id,
    });
  });

  it("drops the duplicate when the primary username becomes one of the account's own aliases", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "dup-owner@example.com", "DupOwner");
    const target = await register(harness.app, "dup-target@example.com", "DupTarget");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };

    await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: target.user.id, usernames: ["kotik", "second_name"] })
      .expect(200);

    // Один из дополнительных ников становится основным — дубль уходит из списка.
    const changed = await request(harness.app)
      .patch("/api/users/me")
      .set({ Authorization: bearer(target.accessToken) })
      .send({ username: "KOTIK" });
    expect(changed.status).toBe(200);
    expect(changed.body.user).toMatchObject({ username: "KOTIK", usernames: ["second_name"] });

    // Список дополнительных снова сохраняется целиком, без отказа.
    const regranted = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: target.user.id, usernames: ["second_name", "third"] });
    expect(regranted.status).toBe(200);
    expect(regranted.body.user.usernames).toEqual(["second_name", "third"]);
  });

  it("lets a user set, change and clear their own birthday", async () => {
    const harness = await createHarness();
    const me = await register(harness.app, "bday-me@example.com", "BdayMe");
    const auth = { Authorization: bearer(me.accessToken) };

    const set1 = await request(harness.app).patch("/api/users/me").set(auth).send({ birthday: "2010-11-01" });
    expect(set1.status).toBe(200);
    expect(set1.body.user.birthday).toBe("2010-11-01");

    const set2 = await request(harness.app).patch("/api/users/me").set(auth).send({ birthday: "2009-05-20" });
    expect(set2.body.user.birthday).toBe("2009-05-20");

    // Другой пользователь видит день рождения в профиле.
    const peer = await register(harness.app, "bday-peer@example.com", "BdayPeer");
    const peerAuth = { Authorization: bearer(peer.accessToken) };
    const peerSees = await request(harness.app).get(`/api/users/${me.user.id}`).set(peerAuth);
    expect(peerSees.body.user.birthday).toBe("2009-05-20");

    // Очистка через null.
    const cleared = await request(harness.app).patch("/api/users/me").set(auth).send({ birthday: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.birthday).toBeUndefined();
    const peerAfterClear = await request(harness.app).get(`/api/users/${me.user.id}`).set(peerAuth);
    expect(peerAfterClear.body.user.birthday).toBeUndefined();

    // Неверный формат — 400.
    const bad = await request(harness.app).patch("/api/users/me").set(auth).send({ birthday: "not-a-date" });
    expect(bad.status).toBe(400);
    const half = await request(harness.app).patch("/api/users/me").set(auth).send({ birthday: "2010-11" });
    expect(half.status).toBe(400);

    // Без года: день и месяц сохраняются, возраст не показывается.
    const noYear = await request(harness.app).patch("/api/users/me").set(auth).send({ birthday: "11-01" });
    expect(noYear.status).toBe(200);
    expect(noYear.body.user.birthday).toBe("11-01");
    const peerSeesNoYear = await request(harness.app).get(`/api/users/${me.user.id}`).set(peerAuth);
    expect(peerSeesNoYear.body.user.birthday).toBe("11-01");
    // Перезапуск хранилища не должен портить такую дату.
    await expect(harness.repositories.users.findById(me.user.id)).resolves.toMatchObject({ birthday: "11-01" });

    // Клиент шлёт полный набор полей сразу — день рождения не должен теряться.
    const full = await request(harness.app)
      .patch("/api/users/me")
      .set(auth)
      .send({ displayName: "BdayMe", username: "bdayme", bio: "привет", wallpaperUrl: "", showLastSeen: true, birthday: "2001-03-04" });
    expect(full.status).toBe(200);
    expect(full.body.user.birthday).toBe("2001-03-04");
    await expect(harness.repositories.users.findById(me.user.id)).resolves.toMatchObject({ birthday: "2001-03-04" });
  });

  it("lets an owner revoke verification, the badge and extra usernames", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "revoke-owner@example.com", "RevokeOwner");
    const target = await register(harness.app, "revoke-target@example.com", "RevokeTarget");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };
    const grant = (body: Record<string, unknown>) =>
      request(harness.app).post(`/api/admin/${owner.user.id}/grant`).set(authorize).send(body);
    const targetId = target.user.id;

    const given = await grant({ targetUserId: targetId, isVerified: true, badge: "yargram", usernames: ["kotik", "second"] });
    expect(given.body.user).toMatchObject({ isVerified: true, badge: "yargram", usernames: ["kotik", "second"] });

    // Каждый атрибут снимается отдельно, остальное не трогаем.
    const noCheck = await grant({ targetUserId: targetId, isVerified: false });
    expect(noCheck.body.user).toMatchObject({ isVerified: false, badge: "yargram", usernames: ["kotik", "second"] });

    const noBadge = await grant({ targetUserId: targetId, badge: null });
    expect(noBadge.body.user).toMatchObject({ isVerified: false, badge: null, usernames: ["kotik", "second"] });

    // Пустой список — это очистка, а не «ничего не передали».
    const cleared = await grant({ targetUserId: targetId, usernames: [] });
    expect(cleared.body.user.usernames).toEqual([]);
    await expect(harness.repositories.users.findById(targetId)).resolves.toMatchObject({
      isVerified: false,
      badge: null,
      usernames: [],
    });

    // Без явного usernames список не сбрасывается.
    await grant({ targetUserId: targetId, usernames: ["again"] });
    const untouched = await grant({ targetUserId: targetId, isVerified: true });
    expect(untouched.body.user.usernames).toEqual(["again"]);
  });

  it("lets an owner assign extra usernames to themselves", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "self-owner@example.com", "SelfOwner");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };
    const grant = (body: Record<string, unknown>) =>
      request(harness.app).post(`/api/admin/${owner.user.id}/grant`).set(authorize).send(body);

    const granted = await grant({ targetUserId: owner.user.id, usernames: ["Kotik", "@second"] });
    expect(granted.status).toBe(200);
    expect(granted.body.user.usernames).toEqual(["Kotik", "second"]);
    await expect(harness.repositories.users.findByUsername("kotik")).resolves.toMatchObject({
      id: owner.user.id,
    });

    // Права себе не выдаёт никто — эту дыру закрываем отдельно.
    const selfAdmin = await grant({ targetUserId: owner.user.id, adminUserIds: [owner.user.id] });
    expect(selfAdmin.status).toBe(400);
    expect(selfAdmin.body.error.code).toBe("SELF_ADMIN");
  });

  it("hides a blocked user's messages and the blocker's profile, like Telegram", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "tg-alice@example.com", "TgAlice");
    const bob = await register(harness.app, "tg-bob@example.com", "TgBob");
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;
    await request(harness.app)
      .put(`/api/users/${bob.user.id}/block`)
      .set("Authorization", bearer(alice.accessToken))
      .expect(200);

    // Заблокированный пишет: сообщение сохраняется и видно ему самому.
    const sent = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "привет из блокировки" });
    expect(sent.status).toBe(201);
    const bobHistory = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken));
    expect(bobHistory.body.messages.map((message: { id: string }) => message.id)).toContain(sent.body.message.id);

    // Блокирующий этого сообщения не видит.
    const aliceHistory = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken));
    expect(aliceHistory.body.messages.map((message: { id: string }) => message.id)).not.toContain(
      sent.body.message.id,
    );

    // Направления блокировки видны каждому по-своему.
    const aliceList = await request(harness.app).get("/api/conversations").set("Authorization", bearer(alice.accessToken));
    expect(aliceList.body.conversations[0]).toMatchObject({ blockedByMe: true, blockedByPeer: false });
    const bobList = await request(harness.app).get("/api/conversations").set("Authorization", bearer(bob.accessToken));
    expect(bobList.body.conversations[0]).toMatchObject({ blockedByMe: false, blockedByPeer: true });

    // Профиль блокирующего для заблокированного: без аватара и без времени визита.
    const profile = await request(harness.app)
      .get(`/api/users/${alice.user.id}`)
      .set("Authorization", bearer(bob.accessToken));
    expect(profile.body.user).toMatchObject({ avatarUrl: null, lastSeenAt: null, lastSeenStatus: "long_ago" });
    expect(profile.body.user.displayName).toBe("TgAlice");
  });

  it("lets an owner assign and revoke administrator rights", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "rights-owner@example.com", "RightsOwner");
    const admin = await register(harness.app, "rights-admin@example.com", "RightsAdmin");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const authorize = { Authorization: bearer(owner.accessToken) };

    const assigned = await request(harness.app).put(`/api/admin/${admin.user.id}/assign`).set(authorize);
    expect(assigned.status).toBe(200);
    await expect(harness.repositories.users.findById(admin.user.id)).resolves.toMatchObject({
      adminUserIds: [owner.user.id],
    });

    const revoked = await request(harness.app).delete(`/api/admin/${admin.user.id}/assign`).set(authorize);
    expect(revoked.status).toBe(200);
    await expect(harness.repositories.users.findById(admin.user.id)).resolves.toMatchObject({
      adminUserIds: [],
    });

    // Без прав снимать права нельзя, даже у самого себя.
    const forbidden = await request(harness.app)
      .delete(`/api/admin/${admin.user.id}/assign`)
      .set({ Authorization: bearer(admin.accessToken) });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_ADMIN");
  });

  it("counts only the media that is really present in the chat", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "summary-alice@example.com", "SummaryAlice");
    const bob = await register(harness.app, "summary-bob@example.com", "SummaryBob");
    const aliceAuth = { Authorization: bearer(alice.accessToken) };
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;

    const empty = await request(harness.app)
      .get(`/api/users/${bob.user.id}/media-summary`)
      .set(aliceAuth);
    expect(empty.status).toBe(200);
    expect(empty.body.summary).toMatchObject({ photos: 0, files: 0, links: 0, videos: 0 });

    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32)]);
    const image = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set(aliceAuth)
      .attach("file", png, { filename: "photo.png", contentType: "image/png" });
    expect(image.status).toBe(201);
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "смотри https://example.com/photo", attachmentIds: [image.body.attachment.id] })
      .expect(201);

    const filled = await request(harness.app)
      .get(`/api/users/${bob.user.id}/media-summary`)
      .set(aliceAuth);
    expect(filled.body.summary).toMatchObject({
      photos: 1,
      links: 1,
      videos: 0,
      voice: 0,
      gifs: 0,
      files: 0,
    });

    // Медиа из чужой переписки в профиль не попадает.
    const carol = await register(harness.app, "summary-carol@example.com", "SummaryCarol");
    const other = await request(harness.app)
      .get(`/api/users/${bob.user.id}/media-summary`)
      .set({ Authorization: bearer(carol.accessToken) });
    expect(other.body.summary).toMatchObject({ photos: 0, links: 0 });
  });

  it("lets the owner freeze and delete an account", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "freeze-owner@example.com", "FreezeOwner");
    const bob = await register(harness.app, "freeze-bob@example.com", "FreezeBob");
    const plain = await register(harness.app, "freeze-plain@example.com", "FreezePlain");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };

    const frozen = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true });
    expect(frozen.status).toBe(200);
    expect(frozen.body.user.isFrozen).toBe(true);

    // Замороженный входит и читает: запрет накладывается только на запись.
    const me = await request(harness.app)
      .get("/api/auth/me")
      .set({ Authorization: bearer(bob.accessToken) });
    expect(me.status).toBe(200);
    expect(me.body.user.isFrozen).toBe(true);
    const login = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "freeze-bob@example.com", password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    // А вот записать он ничего не может — даже собственный профиль.
    const write = await request(harness.app)
      .patch("/api/users/me")
      .set({ Authorization: bearer(bob.accessToken) })
      .send({ displayName: "Frozen Bob" });
    expect(write.status).toBe(403);
    expect(write.body.error.code).toBe("ACCOUNT_FROZEN");

    // Обычный пользователь замораживать не может.
    const forbidden = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set({ Authorization: bearer(plain.accessToken) })
      .send({ frozen: false });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");

    const unfrozen = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: false });
    expect(unfrozen.status).toBe(200);
    expect(unfrozen.body.user.isFrozen).toBe(false);

    // Удаление стирает аккаунт целиком.
    const removed = await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth);
    expect(removed.status).toBe(200);
    // Запись остаётся: почта занята, а владелец может вернуть аккаунт.
    await expect(harness.repositories.users.findById(bob.user.id)).resolves.toMatchObject({
      isDeleted: true,
    });

    // Себя владельцу удалить нельзя.
    const self = await request(harness.app).delete(`/api/admin/${owner.user.id}`).set(ownerAuth);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("SELF_ACTION");
  });

  it("lets the owner hand out and revoke the BOT mark", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "bot-owner@example.com", "BotOwner");
    const target = await register(harness.app, "bot-target@example.com", "BotTarget");
    const plain = await register(harness.app, "bot-plain@example.com", "BotPlain");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };

    // Обычный пользователь отметку выдать не может.
    const forbidden = await request(harness.app)
      .post(`/api/admin/${target.user.id}/bot`)
      .set({ Authorization: bearer(plain.accessToken) })
      .send({ isBot: true });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");

    // Перечень пуст, пока ботов нет, и чужаку его не показывают.
    const empty = await request(harness.app).get("/api/admin/bots").set(ownerAuth);
    expect(empty.status).toBe(200);
    expect(empty.body.accounts).toEqual([]);
    const foreignList = await request(harness.app)
      .get("/api/admin/bots")
      .set({ Authorization: bearer(plain.accessToken) });
    expect(foreignList.status).toBe(403);

    // Выдача: аккаунт остаётся на месте, меняется только метка.
    const granted = await request(harness.app)
      .post(`/api/admin/${target.user.id}/bot`)
      .set(ownerAuth)
      .send({ isBot: true });
    expect(granted.status).toBe(200);
    expect(granted.body.user.isBot).toBe(true);
    expect(granted.body.user.id).toBe(target.user.id);
    const stored = await harness.repositories.users.findById(target.user.id);
    expect(stored).toMatchObject({ isBot: true });
    // Запись жива: метка закрывает вход, но не трогает аккаунт.
    expect(stored?.isDeleted ?? false).toBe(false);

    // Метка входит в перечень — владелец видит, кому она выдана.
    const listed = await request(harness.app).get("/api/admin/bots").set(ownerAuth);
    expect(listed.status).toBe(200);
    expect(listed.body.accounts.map((account: { id: string }) => account.id)).toEqual([
      target.user.id,
    ]);

    // С пометкой вход закрывается — ровно в этом её смысл.
    const login = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "bot-target@example.com", password: TEST_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("BOT_ACCOUNT");

    // Снятие возвращает возможность войти.
    const revoked = await request(harness.app)
      .post(`/api/admin/${target.user.id}/bot`)
      .set(ownerAuth)
      .send({ isBot: false });
    expect(revoked.status).toBe(200);
    expect(revoked.body.user.isBot).toBe(false);
    const loginAgain = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "bot-target@example.com", password: TEST_PASSWORD });
    expect(loginAgain.status).toBe(200);

    // Себе метку поставить нельзя: снять её было бы уже некому.
    const selfMark = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/bot`)
      .set(ownerAuth)
      .send({ isBot: true });
    expect(selfMark.status).toBe(400);
    expect(selfMark.body.error.code).toBe("SELF_ACTION");
  });

  it("replaces the bio of a SCAM-marked account and freezes it against edits", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "scam-owner@example.com", "ScamOwner");
    const bob = await register(harness.app, "scam-bob@example.com", "ScamBob");
    const plain = await register(harness.app, "scam-plain@example.com", "ScamPlain");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const bobAuth = { Authorization: bearer(bob.accessToken) };

    // Человек написал о себе что-то своё — это описание должно пережить отметку.
    const original = "Люблю котиков и горные лыжи";
    await request(harness.app).patch("/api/users/me").set(bobAuth).send({ bio: original }).expect(200);

    // Обычный пользователь отметку выдать не может.
    const forbidden = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/scam`)
      .set({ Authorization: bearer(plain.accessToken) })
      .send({ scam: true });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");

    const marked = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/scam`)
      .set(ownerAuth)
      .send({ scam: true });
    expect(marked.status).toBe(200);
    expect(marked.body.user.scam).toBe(true);
    expect(marked.body.user.bio).toBe(SCAM_BIO_WARNING);

    // Собеседник видит предупреждение вместо описания.
    const publicProfile = await request(harness.app)
      .get(`/api/users/${bob.user.id}`)
      .set(ownerAuth)
      .expect(200);
    expect(publicProfile.body.user).toMatchObject({ scam: true, bio: SCAM_BIO_WARNING });

    // И сам помеченный тоже — у себя в профиле он видит то же предупреждение.
    const me = await request(harness.app).get("/api/auth/me").set(bobAuth).expect(200);
    expect(me.body.user).toMatchObject({ scam: true, bio: SCAM_BIO_WARNING });

    // Описание не меняется, но остальные настройки профиля сохраняются:
    // поле не отклоняем, иначе форма профиля перестала бы работать целиком.
    const write = await request(harness.app)
      .patch("/api/users/me")
      .set(bobAuth)
      .send({ bio: "новое описание", displayName: "Scam Bob Renamed", themeColor: "#123456" })
      .expect(200);
    expect(write.body.user).toMatchObject({
      displayName: "Scam Bob Renamed",
      themeColor: "#123456",
      scam: true,
      bio: SCAM_BIO_WARNING,
    });
    // Прежнее описание живо в записи — его вернёт снятие отметки.
    await expect(harness.repositories.users.findById(bob.user.id)).resolves.toMatchObject({
      bio: original,
    });

    const cleared = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/scam`)
      .set(ownerAuth)
      .send({ scam: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user).toMatchObject({ scam: false, bio: original });
  });

  it("replaces the bio of a FAKE-marked account and restores it when cleared", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "fake-owner@example.com", "FakeOwner");
    const bob = await register(harness.app, "fake-bob@example.com", "FakeBob");
    const plain = await register(harness.app, "fake-plain@example.com", "FakePlain");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const bobAuth = { Authorization: bearer(bob.accessToken) };

    const original = "Официальный аккаунт Yargram";
    await request(harness.app).patch("/api/users/me").set(bobAuth).send({ bio: original }).expect(200);

    // Обычный пользователь отметку FAKE выдать не может.
    const forbidden = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/fake`)
      .set({ Authorization: bearer(plain.accessToken) })
      .send({ fake: true });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");

    const marked = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/fake`)
      .set(ownerAuth)
      .send({ fake: true });
    expect(marked.status).toBe(200);
    expect(marked.body.user.fake).toBe(true);
    // Подмена описания живёт на чтении: в ответе — предупреждение о подделке.
    expect(marked.body.user.bio).toBe(FAKE_BIO_WARNING);

    // Собеседник видит предупреждение вместо описания.
    const publicProfile = await request(harness.app)
      .get(`/api/users/${bob.user.id}`)
      .set(ownerAuth)
      .expect(200);
    expect(publicProfile.body.user).toMatchObject({ fake: true, bio: FAKE_BIO_WARNING });

    // И сам помеченный тоже — у себя в профиле он видит то же предупреждение.
    const me = await request(harness.app).get("/api/auth/me").set(bobAuth).expect(200);
    expect(me.body.user).toMatchObject({ fake: true, bio: FAKE_BIO_WARNING });

    // Описание не меняется, но остальные настройки профиля сохраняются.
    const write = await request(harness.app)
      .patch("/api/users/me")
      .set(bobAuth)
      .send({ bio: "новое описание", displayName: "Fake Bob Renamed" })
      .expect(200);
    expect(write.body.user).toMatchObject({
      displayName: "Fake Bob Renamed",
      fake: true,
      bio: FAKE_BIO_WARNING,
    });
    // Прежнее описание живо в записи — его вернёт снятие отметки.
    await expect(harness.repositories.users.findById(bob.user.id)).resolves.toMatchObject({
      bio: original,
    });

    const cleared = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/fake`)
      .set(ownerAuth)
      .send({ fake: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user).toMatchObject({ fake: false, bio: original });
  });

  it("grants a group the checkmark, the Yargram badge and the SCAM mark", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "group-owner@example.com", "GroupOwner");
    const alice = await register(harness.app, "group-alice@example.com", "GroupAlice");
    const bob = await register(harness.app, "group-bob@example.com", "GroupBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const aliceAuth = { Authorization: bearer(alice.accessToken) };
    const bobAuth = { Authorization: bearer(bob.accessToken) };

    const created = await request(harness.app)
      .post("/api/groups")
      .set(aliceAuth)
      .send({ title: "Поездка на море", description: "Собираем вещи", memberIds: [bob.user.id] });
    expect(created.status).toBe(201);
    const groupId = created.body.conversation.id as string;

    // Обычный участник знаки группе не выдаёт — это дело владельца Yargram.
    const forbidden = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(aliceAuth)
      .send({ isVerified: true });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");

    const marked = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ isVerified: true, badge: "yargram" });
    expect(marked.status).toBe(200);
    expect(marked.body.group).toMatchObject({
      id: groupId,
      isVerified: true,
      badge: "yargram",
      scam: false,
    });

    // Знаки видны участнику в его списке бесед, а не только владельцу.
    const list = await request(harness.app).get("/api/conversations").set(bobAuth).expect(200);
    expect(list.body.conversations[0]).toMatchObject({ isVerified: true, badge: "yargram" });

    // Отметка SCAM подменяет описание предупреждением — и говорит о группе,
    // а не об аккаунте.
    const scam = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ scam: true });
    expect(scam.status).toBe(200);
    expect(scam.body.group.scam).toBe(true);

    const warned = await request(harness.app).get("/api/conversations").set(bobAuth).expect(200);
    expect(warned.body.conversations[0]).toMatchObject({
      scam: true,
      description: SCAM_GROUP_WARNING,
    });

    // Помеченная группа описание не меняет, но название меняет свободно:
    // поле не отклоняем, иначе карточка группы перестала бы работать целиком.
    const renamed = await request(harness.app)
      .patch(`/api/groups/${groupId}`)
      .set(aliceAuth)
      .send({ title: "Поездка на море 2027", description: "новое описание" })
      .expect(200);
    expect(renamed.body.conversation).toMatchObject({
      title: "Поездка на море 2027",
      scam: true,
      description: SCAM_GROUP_WARNING,
    });
    // Прежнее описание живо в записи — его вернёт снятие отметки.
    await expect(harness.repositories.conversations.findById(groupId)).resolves.toMatchObject({
      description: "Собираем вещи",
      scam: true,
    });

    const cleared = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ scam: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.group.scam).toBe(false);

    const restored = await request(harness.app).get("/api/conversations").set(bobAuth).expect(200);
    expect(restored.body.conversations[0]).toMatchObject({
      scam: false,
      description: "Собираем вещи",
    });
  });

  it("marks a group as FAKE and warns about impersonation", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "fake-group-owner@example.com", "FakeGroupOwner");
    const alice = await register(harness.app, "fake-group-alice@example.com", "FakeGroupAlice");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const aliceAuth = { Authorization: bearer(alice.accessToken) };

    const created = await request(harness.app)
      .post("/api/groups")
      .set(aliceAuth)
      .send({ title: "Не официальный Yargram", description: "Настоящее описание" });
    expect(created.status).toBe(201);
    const groupId = created.body.conversation.id as string;

    const fake = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ fake: true });
    expect(fake.status).toBe(200);
    expect(fake.body.group).toMatchObject({ id: groupId, fake: true, scam: false });

    // Участник видит и отметку, и предупреждение о подделке — о группе, а не
    // об аккаунте: перепутать тексты значило бы обвинить создателя группы.
    const warned = await request(harness.app).get("/api/conversations").set(aliceAuth).expect(200);
    expect(warned.body.conversations[0]).toMatchObject({
      fake: true,
      description: FAKE_GROUP_WARNING,
    });
    expect(FAKE_GROUP_WARNING).toContain("эта группа");
    expect(FAKE_GROUP_WARNING).not.toContain("аккаунт");

    // 🔥 SCAM и FAKE могут стоять разом, и тогда в описании побеждает SCAM:
    // он строже, а порядок веток в `groupDescriptionFor` это и задаёт.
    await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ scam: true });
    const both = await request(harness.app).get("/api/conversations").set(aliceAuth).expect(200);
    expect(both.body.conversations[0]).toMatchObject({
      scam: true,
      fake: true,
      description: SCAM_GROUP_WARNING,
    });

    // Снятие SCAM возвращает описание FAKE, а не исходный текст.
    await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ scam: false });
    const fakeOnly = await request(harness.app).get("/api/conversations").set(aliceAuth).expect(200);
    expect(fakeOnly.body.conversations[0]).toMatchObject({
      scam: false,
      fake: true,
      description: FAKE_GROUP_WARNING,
    });

    // Прежнее описание живо в записи — его вернёт снятие последней отметки.
    await expect(harness.repositories.conversations.findById(groupId)).resolves.toMatchObject({
      description: "Настоящее описание",
      fake: true,
    });

    // Отметка живёт только у владельца Yargram: обычный участник её не ставит.
    const forbidden = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(aliceAuth)
      .send({ fake: false });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");

    const cleared = await request(harness.app)
      .post(`/api/admin/groups/${groupId}/marks`)
      .set(ownerAuth)
      .send({ fake: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.group.fake).toBe(false);
    const back = await request(harness.app).get("/api/conversations").set(aliceAuth).expect(200);
    expect(back.body.conversations[0]).toMatchObject({
      fake: false,
      description: "Настоящее описание",
    });
  });

  it("finds groups for the owner panel by title, invite code and id", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "search-owner@example.com", "SearchOwner");
    const alice = await register(harness.app, "search-alice@example.com", "SearchAlice");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const aliceAuth = { Authorization: bearer(alice.accessToken) };

    const created = await request(harness.app)
      .post("/api/groups")
      .set(aliceAuth)
      .send({ title: "Клуб любителей котиков" });
    expect(created.status).toBe(201);
    const groupId = created.body.conversation.id as string;
    const inviteCode = created.body.conversation.inviteCode as string;

    const byTitle = await request(harness.app)
      .get("/api/admin/groups")
      .query({ q: "котиков" })
      .set(ownerAuth)
      .expect(200);
    expect(byTitle.body.groups).toHaveLength(1);
    expect(byTitle.body.groups[0]).toMatchObject({
      id: groupId,
      title: "Клуб любителей котиков",
      memberCount: 1,
      isVerified: false,
      badge: null,
      scam: false,
    });

    const byCode = await request(harness.app)
      .get("/api/admin/groups")
      .query({ q: inviteCode })
      .set(ownerAuth)
      .expect(200);
    expect(byCode.body.groups.map((group: { id: string }) => group.id)).toEqual([groupId]);

    const byId = await request(harness.app)
      .get("/api/admin/groups")
      .query({ q: groupId })
      .set(ownerAuth)
      .expect(200);
    expect(byId.body.groups.map((group: { id: string }) => group.id)).toEqual([groupId]);

    // Личные диалоги в списке групп не показываются: там только группы.
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: owner.user.id });
    const directId = direct.body.conversation.id as string;
    const onlyGroups = await request(harness.app)
      .get("/api/admin/groups")
      .query({ q: directId })
      .set(ownerAuth)
      .expect(200);
    expect(onlyGroups.body.groups).toEqual([]);

    // Постороннему список групп недоступен.
    const forbidden = await request(harness.app).get("/api/admin/groups").set(aliceAuth);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");
  });

  it("counts every account and every group for the owner summary", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "stats-owner@example.com", "StatsOwner");
    const alice = await register(harness.app, "stats-alice@example.com", "StatsAlice");
    const bob = await register(harness.app, "stats-bob@example.com", "StatsBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const aliceAuth = { Authorization: bearer(alice.accessToken) };

    await request(harness.app)
      .post("/api/groups")
      .set(aliceAuth)
      .send({ title: "Первая группа", memberIds: [bob.user.id] })
      .expect(201);
    await request(harness.app).post("/api/groups").set(aliceAuth).send({ title: "Вторая группа" }).expect(201);

    // Личный диалог и «Избранное» — не группы, в счёт не идут.
    await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: owner.user.id })
      .expect(201);
    await request(harness.app).post("/api/conversations/saved").set(aliceAuth).expect(201);

    const stats = await request(harness.app).get("/api/admin/stats").set(ownerAuth).expect(200);
    expect(stats.body.stats).toEqual({ totalUsers: 3, groups: 2 });

    // Удаление мягкое: аккаунт уходит из выдачи, но из базы не исчезает, и
    // в сводке он по-прежнему посчитан — почта и ник ведь остались занятыми.
    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);
    const afterDelete = await request(harness.app).get("/api/admin/stats").set(ownerAuth).expect(200);
    expect(afterDelete.body.stats).toEqual({ totalUsers: 3, groups: 2 });

    // Обычному человеку сводка по всей установке не показывается.
    const forbidden = await request(harness.app).get("/api/admin/stats").set(aliceAuth);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");
  });

  it("lists accounts for the owner with handles and dates", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "accounts-owner@example.com", "AccountsOwner");
    const alice = await register(harness.app, "accounts-alice@example.com", "AliceLongNickname");
    const bob = await register(harness.app, "accounts-bob@example.com", "AccountsBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    // Два дополнительных ника: владелец должен видеть их списком, а не только первый.
    await harness.repositories.users.update(alice.user.id, { usernames: ["alice_two", "alice_three"] });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const aliceAuth = { Authorization: bearer(alice.accessToken) };

    const all = await request(harness.app).get("/api/admin/accounts").set(ownerAuth).expect(200);
    expect(all.body.accounts).toHaveLength(3);
    // Свежие сверху: последним завели Bob, он и идёт первым.
    expect(all.body.accounts.map((account: { displayName: string }) => account.displayName)).toEqual([
      "AccountsBob",
      "AliceLongNickname",
      "AccountsOwner",
    ]);
    expect(all.body.accounts[1]).toMatchObject({
      username: "alicelongnickname",
      usernames: ["alice_two", "alice_three"],
      isOwner: false,
      isFrozen: false,
      isDeleted: false,
      deletedAt: null,
    });
    // Дату создания отдаём как есть — список показывает её рядом с именем.
    expect(typeof all.body.accounts[0].createdAt).toBe("string");
    expect(all.body.accounts[2]).toMatchObject({ isOwner: true });
    // Время последнего входа — тоже строкой, и оно не пусто ни у кого: у старых
    // записей хранилище подставляет дату создания, а не `null`.
    for (const account of all.body.accounts) {
      expect(typeof account.lastSeenAt).toBe("string");
      expect(account.lastSeenAt.length).toBeGreaterThan(0);
    }

    // 🔥 Время входа видно владельцу **даже если аккаунт скрыл его от других**:
    // админке нужен факт входа, а приватность касается посторонних. Иначе
    // владелец не отличил бы брошенный аккаунт от живого.
    await harness.repositories.users.update(alice.user.id, { showLastSeen: false });
    const hiddenAlice = await harness.repositories.users.findById(alice.user.id);
    // Сам факт хранится в записи, а `showLastSeen` управляет только тем, что
    // видят собеседники в `toPublicUser`.
    expect(typeof hiddenAlice?.lastSeenAt).toBe("string");
    const withHidden = await request(harness.app).get("/api/admin/accounts").set(ownerAuth).expect(200);
    const aliceRow = withHidden.body.accounts.find(
      (account: { id: string }) => account.id === alice.user.id,
    );
    expect(aliceRow.lastSeenAt).toBe(hiddenAlice?.lastSeenAt);

    // Удалённый аккаунт остаётся в списке настоящим ником: владелец как раз
    // и ищет, кого удалил, по имени, а не по заглушке «Удалённый аккаунт».
    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);
    const afterDelete = await request(harness.app).get("/api/admin/accounts").set(ownerAuth).expect(200);
    const deleted = afterDelete.body.accounts.find(
      (account: { id: string }) => account.id === bob.user.id,
    );
    expect(deleted).toMatchObject({ displayName: "AccountsBob", isDeleted: true });
    expect(typeof deleted.deletedAt).toBe("string");

    // Фильтры разделяют живые, замороженные и удалённые аккаунты.
    await harness.repositories.users.update(alice.user.id, { isFrozen: true });
    const frozen = await request(harness.app)
      .get("/api/admin/accounts")
      .query({ filter: "frozen" })
      .set(ownerAuth)
      .expect(200);
    expect(frozen.body.accounts.map((account: { id: string }) => account.id)).toEqual([alice.user.id]);
    const deletedOnly = await request(harness.app)
      .get("/api/admin/accounts")
      .query({ filter: "deleted" })
      .set(ownerAuth)
      .expect(200);
    expect(deletedOnly.body.accounts.map((account: { id: string }) => account.id)).toEqual([bob.user.id]);
    const active = await request(harness.app)
      .get("/api/admin/accounts")
      .query({ filter: "active" })
      .set(ownerAuth)
      .expect(200);
    expect(active.body.accounts.map((account: { id: string }) => account.id)).toEqual([owner.user.id]);

    // Поиск идёт по нику, дополнительному нику и почте.
    const byAlias = await request(harness.app)
      .get("/api/admin/accounts")
      .query({ q: "alice_three" })
      .set(ownerAuth)
      .expect(200);
    expect(byAlias.body.accounts.map((account: { id: string }) => account.id)).toEqual([alice.user.id]);
    const byEmail = await request(harness.app)
      .get("/api/admin/accounts")
      .query({ q: "accounts-owner@" })
      .set(ownerAuth)
      .expect(200);
    expect(byEmail.body.accounts.map((account: { id: string }) => account.id)).toEqual([owner.user.id]);

    // Список аккаунтов — только владельцу.
    const forbidden = await request(harness.app).get("/api/admin/accounts").set(aliceAuth);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("NOT_OWNER");
  });

  it("shows frozen and deleted accounts as a placeholder instead of breaking the chat", async () => {    const harness = await createHarness();
    const owner = await register(harness.app, "gone-owner@example.com", "GoneOwner");
    const alice = await register(harness.app, "gone-alice@example.com", "GoneAlice");
    const bob = await register(harness.app, "gone-bob@example.com", "GoneBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const aliceAuth = { Authorization: bearer(alice.accessToken) };
    const ownerAuth = { Authorization: bearer(owner.accessToken) };

    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: bob.user.id })
      .expect(201);
    const conversationId = direct.body.conversation.id as string;
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set({ Authorization: bearer(bob.accessToken) })
      .send({ text: "привет, это Боб" })
      .expect(201);

    // Заморозка: собеседник превращается в «Удалённый аккаунт» со снежинкой.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true })
      .expect(200);

    const frozenList = await request(harness.app).get("/api/conversations").set(aliceAuth);
    expect(frozenList.status).toBe(200);
    const frozenPeer = frozenList.body.conversations[0].members.find(
      (member: { id: string }) => member.id === bob.user.id,
    );
    expect(frozenPeer).toMatchObject({
      displayName: "Удалённый аккаунт",
      isFrozen: true,
      avatarUrl: null,
      username: null,
    });

    // Удаление: диалог и история остаются читаемыми, автор — заглушка.
    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);

    const afterDelete = await request(harness.app).get("/api/conversations").set(aliceAuth);
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.conversations).toHaveLength(1);
    const removedPeer = afterDelete.body.conversations[0].members.find(
      (member: { id: string }) => member.id === bob.user.id,
    );
    expect(removedPeer).toMatchObject({
      displayName: "Удалённый аккаунт",
      isFrozen: false,
      avatarUrl: null,
    });

    // История остаётся (как в Telegram): сообщение на месте, автор — заглушка.
    const history = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages?limit=50`)
      .set(aliceAuth);
    expect(history.status).toBe(200);
    expect(history.body.messages).toHaveLength(1);
    expect(history.body.messages[0]).toMatchObject({ text: 'привет, это Боб' });
    expect(history.body.messages[0].sender).toMatchObject({
      id: bob.user.id,
      displayName: 'Удалённый аккаунт',
      isFrozen: false,
      avatarUrl: null,
      username: null,
    });

    // Профиль не исчезает, а превращается в заглушку без снежинки.
    const profile = await request(harness.app).get(`/api/users/${bob.user.id}`).set(aliceAuth);
    expect(profile.status).toBe(200);
    expect(profile.body.user).toMatchObject({
      id: bob.user.id,
      displayName: 'Удалённый аккаунт',
      isFrozen: false,
      isDeleted: true,
      avatarUrl: null,
      username: null,
    });
  });

  it("closes writing to a frozen and to a deleted account but keeps the history readable", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "composer-owner@example.com", "ComposerOwner");
    const alice = await register(harness.app, "composer-alice@example.com", "ComposerAlice");
    const bob = await register(harness.app, "composer-bob@example.com", "ComposerBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const aliceAuth = { Authorization: bearer(alice.accessToken) };
    const ownerAuth = { Authorization: bearer(owner.accessToken) };

    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: bob.user.id })
      .expect(201);
    const conversationId = direct.body.conversation.id as string;
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "Боб, ты как?" })
      .expect(201);

    // Замороженный аккаунт — только читатель: ему не пишут и он не пишет.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true })
      .expect(200);

    const toFrozen = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "Боб, ты как?" });
    expect(toFrozen.status).toBe(403);
    expect(toFrozen.body.error.code).toBe("ACCOUNT_FROZEN");

    // Сам замороженный входит, видит свой профиль и читает всю историю…
    const bobLogin = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "composer-bob@example.com", password: TEST_PASSWORD })
      .expect(200);
    const bobAuth = { Authorization: bearer(bobLogin.body.accessToken as string) };
    const me = await request(harness.app).get("/api/auth/me").set(bobAuth).expect(200);
    expect(me.body.user.isFrozen).toBe(true);
    expect(me.body.user.displayName).toBe("ComposerBob");
    const history = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages?limit=50`)
      .set(bobAuth);
    expect(history.status).toBe(200);
    expect(history.body.messages).toHaveLength(1);
    expect(history.body.messages[0].text).toBe("Боб, ты как?");

    // …но ни писать, ни менять профиль не может.
    const fromFrozen = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(bobAuth)
      .send({ text: "я тут" });
    expect(fromFrozen.status).toBe(403);
    expect(fromFrozen.body.error.code).toBe("ACCOUNT_FROZEN");

    const profile = await request(harness.app)
      .patch("/api/users/me")
      .set(bobAuth)
      .send({ displayName: "Новый Боб" });
    expect(profile.status).toBe(403);
    expect(profile.body.error.code).toBe("ACCOUNT_FROZEN");

    // Разморозили — переписка снова открыта в обе стороны.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: false })
      .expect(200);
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "с возвращением" })
      .expect(201);

    // Удалённый собеседник сообщения не принимает: история есть, ввода нет.
    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);
    const send = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "привет?" });
    expect(send.status).toBe(403);
    expect(send.body.error.code).toBe("ACCOUNT_DELETED");

    // И новый диалог с удалённым аккаунтом не открыть.
    const reopen = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: bob.user.id });
    expect(reopen.status).toBe(403);
    expect(reopen.body.error.code).toBe("ACCOUNT_DELETED");

    const deletedHistory = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages?limit=50`)
      .set(aliceAuth);
    expect(deletedHistory.status).toBe(200);
    expect(deletedHistory.body.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("silences a frozen author on the socket: no sending and no typing", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "sock-frozen-owner@example.com", "SockFrozenOwner");
    const alice = await register(harness.app, "sock-frozen-alice@example.com", "SockFrozenAlice");
    const bob = await register(harness.app, "sock-frozen-bob@example.com", "SockFrozenBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set({ Authorization: bearer(alice.accessToken) })
      .send({ userId: bob.user.id })
      .expect(201);
    const conversationId = direct.body.conversation.id as string;

    const httpServer = createServer(harness.app);
    const socketServer = attachSocketServer(httpServer, harness);
    realtimeServers.push(socketServer);
    await listen(httpServer);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
    const url = "http://127.0.0.1:" + address.port;
    const bobClient = createSocketClient(url, bob.accessToken);
    const aliceClient = createSocketClient(url, alice.accessToken);
    try {
      await Promise.all([waitForConnect(bobClient), waitForConnect(aliceClient)]);
      // Сокет замороженного не рвём: он остаётся читателем и дальше.
      await request(harness.app)
        .post(`/api/admin/${bob.user.id}/freeze`)
        .set(ownerAuth)
        .send({ frozen: true })
        .expect(200);

      const typingSeen: boolean[] = [];
      aliceClient.on("typing:updated", (payload: { isTyping: boolean }) => {
        typingSeen.push(payload.isTyping);
      });
      const typingError = waitForSocketEvent<{ error: { code: string } }>(bobClient, "typing:error");
      bobClient.emit("typing:start", { conversationId });
      expect((await typingError).error.code).toBe("ACCOUNT_FROZEN");
      // Собеседник не должен увидеть «печатает…» от замороженного.
      expect(typingSeen).toHaveLength(0);

      const ack = await new Promise<{ ok: boolean; error?: { code: string } }>((resolve) => {
        bobClient.emit("message:send", { conversationId, text: "не пройдёт" }, resolve);
      });
      expect(ack.ok).toBe(false);
      expect(ack.error?.code).toBe("ACCOUNT_FROZEN");
    } finally {
      bobClient.disconnect();
      aliceClient.disconnect();
    }
  });

  it("reserves the email of a deleted or frozen account and lets the owner restore it", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "reserve-owner@example.com", "ReserveOwner");
    const bob = await register(harness.app, "reserve-bob@example.com", "ReserveBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };

    // Замороженный: почта занята.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true })
      .expect(200);
    const frozenEmail = await request(harness.app)
      .post("/api/auth/register")
      .send({ email: "reserve-bob@example.com", password: TEST_PASSWORD, displayName: "Клон" });
    expect(frozenEmail.status).toBe(409);
    expect(frozenEmail.body.error.code).toBe("EMAIL_RESERVED");

    // Удалённый: почта тоже остаётся занятой.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: false })
      .expect(200);
    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);
    const deletedEmail = await request(harness.app)
      .post("/api/auth/register")
      .send({ email: "reserve-bob@example.com", password: TEST_PASSWORD, displayName: "Клон" });
    expect(deletedEmail.status).toBe(409);
    expect(deletedEmail.body.error.code).toBe("EMAIL_RESERVED");

    // Удалённый не может войти даже со старым паролем.
    const login = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "reserve-bob@example.com", password: TEST_PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_DELETED");

    // Владелец возвращает аккаунт — профиль снова настоящий.
    const restored = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/restore`)
      .set(ownerAuth)
      .send({});
    expect(restored.status).toBe(200);
    expect(restored.body.user).toMatchObject({ displayName: "ReserveBob", isDeleted: false });

    const relogin = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "reserve-bob@example.com", password: TEST_PASSWORD });
    expect(relogin.status).toBe(200);

    // Повторный возврат не имеет смысла.
    const again = await request(harness.app)
      .post(`/api/admin/${bob.user.id}/restore`)
      .set(ownerAuth)
      .send({});
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("NOT_DELETED");
  });

  it("keeps the files of a deleted account so the history stays readable", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "files-owner@example.com", "FilesOwner");
    const alice = await register(harness.app, "files-alice@example.com", "FilesAlice");
    const bob = await register(harness.app, "files-bob@example.com", "FilesBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };
    const aliceAuth = { Authorization: bearer(alice.accessToken) };
    const bobAuth = { Authorization: bearer(bob.accessToken) };

    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: bob.user.id })
      .expect(201);
    const conversationId = direct.body.conversation.id as string;

    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32)]);
    const image = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set(bobAuth)
      .attach("file", png, { filename: "photo.png", contentType: "image/png" })
      .expect(201);
    const attachmentId = image.body.attachment.id as string;
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(bobAuth)
      .send({ text: "держи фото", attachmentIds: [attachmentId] })
      .expect(201);

    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);

    // Сообщение и вложение остаются: чужую историю удаление не портит.
    const history = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages?limit=50`)
      .set(aliceAuth);
    expect(history.body.messages).toHaveLength(1);
    expect(history.body.messages[0].attachments).toHaveLength(1);
    expect(history.body.messages[0].attachments[0].id).toBe(attachmentId);

    const stored = await harness.repositories.attachments.findById(attachmentId);
    expect(stored).not.toBeNull();
    await expect(stat(join(harness.config.uploadDirectory, stored!.storedFileName))).resolves.toMatchObject({
      size: expect.any(Number),
    });
  });

  it("tells everyone in realtime that an account was frozen or deleted", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "rt-owner@example.com", "RtOwner");
    const bob = await register(harness.app, "rt-bob@example.com", "RtBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const ownerAuth = { Authorization: bearer(owner.accessToken) };

    const seen: { userId: string; frozen: boolean; removed: boolean; displayName: string; isFrozen: boolean | undefined }[] = [];
    const unsubscribe = harness.events.onAccountState((event) => {
      seen.push({
        userId: event.userId,
        frozen: event.frozen,
        removed: event.removed,
        displayName: event.user.displayName,
        isFrozen: event.user.isFrozen,
      });
    });

    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true })
      .expect(200);
    expect(seen.at(-1)).toMatchObject({
      userId: bob.user.id,
      frozen: true,
      removed: false,
      displayName: "Удалённый аккаунт",
      isFrozen: true,
    });

    // Разморозка возвращает настоящий профиль.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: false })
      .expect(200);
    expect(seen.at(-1)).toMatchObject({
      userId: bob.user.id,
      frozen: false,
      removed: false,
      displayName: "RtBob",
    });

    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);
    expect(seen.at(-1)).toMatchObject({
      userId: bob.user.id,
      frozen: false,
      removed: true,
      displayName: "Удалённый аккаунт",
      isFrozen: false,
    });

    unsubscribe();
    // После отписки события не приходят — подписки не течёт.
    await request(harness.app)
      .post(`/api/admin/${owner.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true })
      .expect(400);
    expect(seen).toHaveLength(3);
  });

  it("stores personal drafts, folders and a duplicate-free scheduled queue", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "plan-alice@example.com", "PlanAlice");
    const bob = await register(harness.app, "plan-bob@example.com", "PlanBob");
    const carol = await register(harness.app, "plan-carol@example.com", "PlanCarol");
    const aliceAuth = { Authorization: bearer(alice.accessToken) };
    const bobAuth = { Authorization: bearer(bob.accessToken) };
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;
    const foreign = await request(harness.app)
      .post("/api/conversations/direct")
      .set(aliceAuth)
      .send({ userId: carol.user.id });
    const foreignConversationId = foreign.body.conversation.id as string;

    const httpServer = createServer(harness.app);
    const socketServer = attachSocketServer(httpServer, harness);
    realtimeServers.push(socketServer);
    await listen(httpServer);
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
    const bobClient = createSocketClient("http://127.0.0.1:" + address.port, bob.accessToken);
    try {
      await waitForConnect(bobClient);

      // Drafts are personal, validated and announced over the owner's socket.
      const draftEvent = waitForSocketEvent<{ conversationId: string; draft: { text: string } | null }>(
        bobClient,
        "draft:updated",
      );
      const saved = await request(harness.app)
        .put(`/api/drafts/${conversationId}`)
        .set(bobAuth)
        .send({ text: "черновик ответа", replyToId: null });
      expect(saved.status).toBe(200);
      expect(saved.body.draft).toMatchObject({ conversationId, text: "черновик ответа" });
      expect((await draftEvent).draft).toMatchObject({ text: "черновик ответа" });
      await expect(harness.repositories.drafts.find(alice.user.id, conversationId)).resolves.toBeNull();
      expect((await request(harness.app).get("/api/drafts").set(aliceAuth)).body.drafts).toEqual([]);
      await request(harness.app)
        .put(`/api/drafts/${foreignConversationId}`)
        .set(bobAuth)
        .send({ text: "чужой диалог" })
        .expect(403);

      // Sending a message replaces the draft; an empty draft is removed entirely.
      await request(harness.app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(bobAuth)
        .send({ text: "ответ отправлен" })
        .expect(201);
      await expect(harness.repositories.drafts.find(bob.user.id, conversationId)).resolves.toBeNull();
      const cleared = await request(harness.app)
        .put(`/api/drafts/${conversationId}`)
        .set(bobAuth)
        .send({ text: "   " });
      expect(cleared.body.draft).toBeNull();
      expect((await request(harness.app).get("/api/drafts").set(bobAuth)).body.drafts).toEqual([]);

      // Folders are private, own-chat only, renamable and deletable.
      const folder = await request(harness.app)
        .post("/api/folders")
        .set(bobAuth)
        .send({ name: "Работа", conversationIds: [conversationId] });
      expect(folder.status).toBe(201);
      expect(folder.body.folder).toMatchObject({ name: "Работа", position: 0 });
      await request(harness.app)
        .post("/api/folders")
        .set(bobAuth)
        .send({ name: "Чужое", conversationIds: [foreignConversationId] })
        .expect(403);
      expect((await request(harness.app).get("/api/folders").set(aliceAuth)).body.folders).toEqual([]);
      const renamed = await request(harness.app)
        .patch(`/api/folders/${folder.body.folder.id}`)
        .set(bobAuth)
        .send({ name: "Дела", position: 3 });
      expect(renamed.body.folder).toMatchObject({ name: "Дела", position: 3 });
      await request(harness.app)
        .delete(`/api/folders/${folder.body.folder.id}`)
        .set(aliceAuth)
        .expect(404);
      await request(harness.app)
        .delete(`/api/folders/${folder.body.folder.id}`)
        .set(bobAuth)
        .expect(204);
      expect((await request(harness.app).get("/api/folders").set(bobAuth)).body.folders).toEqual([]);

      // The scheduled queue validates time, cancels and never delivers twice.
      await request(harness.app)
        .post(`/api/conversations/${conversationId}/scheduled`)
        .set(bobAuth)
        .send({ text: "слишком рано", sendAt: new Date(Date.now() - 1_000).toISOString() })
        .expect(400);
      await request(harness.app)
        .post(`/api/conversations/${conversationId}/scheduled`)
        .set(bobAuth)
        .send({ text: "позже", sendAt: new Date(Date.now() + 60_000).toISOString() })
        .expect(201);
      const listed = await request(harness.app).get("/api/scheduled").set(bobAuth);
      expect(listed.body.scheduled).toHaveLength(1);
      const cancelled = await request(harness.app)
        .delete(`/api/scheduled/${listed.body.scheduled[0].id}`)
        .set(bobAuth);
      expect(cancelled.body.scheduled).toMatchObject({ status: "cancelled" });
      expect((await request(harness.app).get("/api/scheduled").set(aliceAuth)).body.scheduled).toEqual([]);

      const clock = Date.parse("2026-06-01T10:00:00.000Z");
      const queue = new ScheduledMessageService(
        harness.repositories,
        harness.chatService,
        harness.events,
        15_000,
        () => new Date(clock),
      );
      const due = await harness.repositories.scheduledMessages.create({
        userId: bob.user.id,
        conversationId,
        text: "по расписанию",
        attachmentIds: [],
        sendAt: new Date(clock - 1_000).toISOString(),
      });
      expect(await queue.dispatchDue()).toBe(1);
      expect(await queue.dispatchDue()).toBe(0);
      expect(await harness.repositories.scheduledMessages.findById(due.id)).toMatchObject({
        status: "sent",
      });
      const history = await request(harness.app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(bobAuth);
      expect(history.body.messages.at(-1)).toMatchObject({ text: "по расписанию" });

      // Меня заблокировали: сообщение по расписанию уходит, но адресату не доставляется.
      await harness.repositories.users.setBlocked(alice.user.id, bob.user.id, true);
      const blocked = await harness.repositories.scheduledMessages.create({
        userId: bob.user.id,
        conversationId,
        text: "не доставится",
        attachmentIds: [],
        sendAt: new Date(clock - 1_000).toISOString(),
      });
      expect(await queue.dispatchDue()).toBe(1);
      expect(await harness.repositories.scheduledMessages.findById(blocked.id)).toMatchObject({
        status: "sent",
      });
    } finally {
      bobClient.close();
      await closeRealtimeServer(socketServer);
    }
  });

  it("creates a group, invites by link and shows it to every member", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "group-alice@example.com", "GroupAlice");
    const bob = await register(harness.app, "group-bob@example.com", "GroupBob");
    const carol = await register(harness.app, "group-carol@example.com", "GroupCarol");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "  Поход в горы  ", description: "Снаряжение и маршрут", memberIds: [bob.user.id] });
    expect(created.status).toBe(201);
    const group = created.body.conversation;
    const groupId = group.id as string;
    expect(group).toMatchObject({
      type: "group",
      title: "Поход в горы",
      description: "Снаряжение и маршрут",
      ownerId: alice.user.id,
      role: "owner",
      memberCount: 2,
    });
    // Владелец всегда первый, название обрезано по краям.
    expect(group.members.map((member: { id: string }) => member.id)).toEqual([
      alice.user.id,
      bob.user.id,
    ]);
    expect(group.myPermissions.send_messages).toBe(true);
    expect(group.inviteCode).toBeTruthy();

    // Группа видна в списке у обоих участников.
    for (const member of [alice, bob]) {
      const list = await request(harness.app)
        .get("/api/conversations")
        .set("Authorization", bearer(member.accessToken));
      expect(list.body.conversations.map((item: { id: string }) => item.id)).toContain(groupId);
    }
    // Посторонний не видит ни группу, ни её состав.
    const outsiderMembers = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(carol.accessToken));
    expect(outsiderMembers.status).toBe(403);

    // Ссылка-приглашение работает и впускает нового участника.
    const joined = await request(harness.app)
      .post("/api/groups/join")
      .set("Authorization", bearer(carol.accessToken))
      .send({ code: group.inviteCode });
    expect(joined.status).toBe(200);
    expect(joined.body.conversation.memberCount).toBe(3);
    expect(joined.body.conversation.role).toBe("member");

    // Системное сообщение о вступлении видно участникам.
    const history = await request(harness.app)
      .get(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(alice.accessToken));
    expect(history.body.messages.at(-1)).toMatchObject({
      kind: "system",
      systemEvent: "user_joined",
    });

    // Повторный вход по той же ссылке ничего не ломает.
    const again = await request(harness.app)
      .post("/api/groups/join")
      .set("Authorization", bearer(carol.accessToken))
      .send({ code: group.inviteCode });
    expect(again.status).toBe(200);
    expect(again.body.conversation.memberCount).toBe(3);

    // Старая ссылка перестаёт работать после перевыпуска.
    const regenerated = await request(harness.app)
      .post(`/api/groups/${groupId}/invite`)
      .set("Authorization", bearer(alice.accessToken));
    expect(regenerated.body.conversation.inviteCode).not.toBe(group.inviteCode);
    const stale = await request(harness.app)
      .post("/api/groups/join")
      .set("Authorization", bearer(bob.accessToken))
      .send({ code: group.inviteCode });
    expect(stale.status).toBe(404);

    // Без названия группу не создать.
    const untitled = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "   " });
    expect(untitled.status).toBe(400);
  });

  it("keeps owner, admin and member rights apart inside a group", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "rights-alice@example.com", "RightsAlice");
    const bob = await register(harness.app, "rights-bob@example.com", "RightsBob");
    const carol = await register(harness.app, "rights-carol@example.com", "RightsCarol");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "Права", memberIds: [bob.user.id, carol.user.id] });
    const groupId = created.body.conversation.id as string;

    // Администратор с урезанными правами не может менять информацию о группе.
    const promoted = await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, admin: true, permissions: { change_info: false } });
    expect(promoted.status).toBe(200);
    const bobRename = await request(harness.app)
      .patch(`/api/groups/${groupId}`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ title: "Захват" });
    expect(bobRename.status).toBe(403);
    // Но право, которое ему оставили по умолчанию, работает.
    const bobAdds = await request(harness.app)
      .post(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ userIds: [carol.user.id] });
    expect(bobAdds.status).toBe(200);

    // Назначать администраторов может только владелец.
    const bobPromotes = await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ userId: carol.user.id, admin: true });
    expect(bobPromotes.status).toBe(403);

    // Владелец может всё и запрещает обычным участникам отправку сообщений.
    const renamed = await request(harness.app)
      .patch(`/api/groups/${groupId}`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "Права и роли" });
    expect(renamed.body.conversation.title).toBe("Права и роли");
    await request(harness.app)
      .put(`/api/groups/${groupId}/permissions`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ permissions: { send_messages: false } });

    const carolWrite = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ text: "Мне запрещено" });
    expect(carolWrite.status).toBe(403);
    expect(carolWrite.body.error.code).toBe("GROUP_SENDING_DENIED");
    // Владелец пишет всегда, даже когда участникам запрещено.
    const ownerWrite = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ text: "Слово владельца" });
    expect(ownerWrite.status).toBe(201);

    // Медиа и ссылки — отдельные запреты, а не один общий.
    await request(harness.app)
      .put(`/api/groups/${groupId}/permissions`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ permissions: { send_messages: true, send_links: false } });
    const link = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ text: "Смотри https://example.com" });
    expect(link.status).toBe(403);
    expect(link.body.error.code).toBe("GROUP_LINKS_DENIED");
    const plain = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ text: "Обычный текст без ссылки" });
    expect(plain.status).toBe(201);

    // Личное ограничение участника перебивает общие права группы.
    const restricted = await request(harness.app)
      .post(`/api/groups/${groupId}/restrict`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: carol.user.id, permissions: { send_messages: false } });
    expect(restricted.status).toBe(200);
    const restrictedWrite = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ text: "Ещё попытка" });
    expect(restrictedWrite.status).toBe(403);
    // Роль участника стала «ограниченный».
    const members = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    const roles = Object.fromEntries(
      members.body.members.map((member: { user: { id: string }; role: string }) => [
        member.user.id,
        member.role,
      ]),
    );
    expect(roles[alice.user.id]).toBe("owner");
    expect(roles[bob.user.id]).toBe("admin");
    expect(roles[carol.user.id]).toBe("restricted");
    // Поиск по составу работает.
    const searched = await request(harness.app)
      .get(`/api/groups/${groupId}/members?q=carol`)
      .set("Authorization", bearer(alice.accessToken));
    expect(searched.body.members).toHaveLength(1);
  });

  it("mutes a member, removes them, and records the group change history", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "history-alice@example.com", "HistoryAlice");
    const bob = await register(harness.app, "history-bob@example.com", "HistoryBob");
    const carol = await register(harness.app, "history-carol@example.com", "HistoryCarol");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "История", memberIds: [bob.user.id] });
    const groupId = created.body.conversation.id as string;
    const code = created.body.conversation.inviteCode as string;

    // Мьют закрывает отправку, даже когда группа в целом писать разрешает.
    const mutedUntil = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const muted = await request(harness.app)
      .post(`/api/groups/${groupId}/restrict`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, mutedUntil });
    expect(muted.status).toBe(200);
    const mutedWrite = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Из-под мьюта" });
    expect(mutedWrite.status).toBe(403);

    // Состав отдаёт мьют отдельно от его отсутствия: у владельца поля нет вовсе.
    const mutedList = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    const byId = new Map(
      mutedList.body.members.map((item: { user: { id: string } }) => [item.user.id, item]),
    );
    expect(byId.get(bob.user.id)).toMatchObject({ mutedUntil });
    expect(byId.get(alice.user.id)).not.toHaveProperty("mutedUntil");

    // Бессрочный мьют приходит словом: null в запросе означает снятие мьюта.
    const forever = await request(harness.app)
      .post(`/api/groups/${groupId}/restrict`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, mutedUntil: "forever" });
    expect(forever.status).toBe(200);
    const foreverList = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    const foreverBob = foreverList.body.members.find(
      (item: { user: { id: string } }) => item.user.id === bob.user.id,
    );
    expect(foreverBob.mutedUntil).toBeNull();
    const foreverWrite = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Из бессрочного мьюта" });
    expect(foreverWrite.status).toBe(403);

    // Снятие мьюта возвращает право писать.
    const unmuted = await request(harness.app)
      .post(`/api/groups/${groupId}/restrict`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, mutedUntil: null });
    expect(unmuted.status).toBe(200);
    const unmutedList = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    const unmutedBob = unmutedList.body.members.find(
      (item: { user: { id: string } }) => item.user.id === bob.user.id,
    );
    expect(unmutedBob).not.toHaveProperty("mutedUntil");

    // Прошедший мьют отправку не закрывает.
    const past = await request(harness.app)
      .post(`/api/groups/${groupId}/restrict`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, mutedUntil: new Date(Date.now() - 1_000).toISOString() });
    expect(past.status).toBe(200);
    const afterMute = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Мьют кончился" });
    expect(afterMute.status).toBe(201);

    // Владельца нельзя ни удалить, ни ограничить.
    const ownerRemoval = await request(harness.app)
      .delete(`/api/groups/${groupId}/members/${alice.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(ownerRemoval.status).toBe(400);
    const ownerRestriction = await request(harness.app)
      .post(`/api/groups/${groupId}/restrict`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: alice.user.id, permissions: { send_messages: false } });
    expect(ownerRestriction.status).toBe(400);

    // Владелец не может выйти, не передав группу.
    const ownerLeave = await request(harness.app)
      .post(`/api/groups/${groupId}/leave`)
      .set("Authorization", bearer(alice.accessToken));
    expect(ownerLeave.status).toBe(400);

    // Удалённый участник теряет группу: её нет в списке и писать нельзя.
    const removed = await request(harness.app)
      .delete(`/api/groups/${groupId}/members/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body.conversation.memberCount).toBe(1);
    const bobList = await request(harness.app)
      .get("/api/conversations")
      .set("Authorization", bearer(bob.accessToken));
    expect(bobList.body.conversations.map((item: { id: string }) => item.id)).not.toContain(groupId);
    const bobWrite = await request(harness.app)
      .post(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Я тут больше не участник" });
    expect(bobWrite.status).toBe(403);

    // Выйти самому можно, а вернуться — по ссылке.
    await request(harness.app)
      .post("/api/groups/join")
      .set("Authorization", bearer(carol.accessToken))
      .send({ code });
    const carolLeave = await request(harness.app)
      .post(`/api/groups/${groupId}/leave`)
      .set("Authorization", bearer(carol.accessToken));
    expect(carolLeave.status).toBe(200);
    const carolBack = await request(harness.app)
      .post("/api/groups/join")
      .set("Authorization", bearer(carol.accessToken))
      .send({ code });
    expect(carolBack.status).toBe(200);
    expect(carolBack.body.conversation.memberCount).toBe(2);

    // История изменений: новые события идут первыми и подписаны автором.
    const history = await request(harness.app)
      .get(`/api/groups/${groupId}/history`)
      .set("Authorization", bearer(alice.accessToken));
    const kinds = history.body.events.map((item: { kind: string }) => item.kind);
    expect(kinds[0]).toBe("member_added");
    for (const expected of [
      "created",
      "member_muted",
      "member_removed",
      "member_left",
      "member_added",
    ]) {
      expect(kinds).toContain(expected);
    }
    expect(history.body.events.at(-1)).toMatchObject({
      kind: "created",
      actorId: alice.user.id,
      detail: "История",
    });
  });

  it("считает непрочитанные по чатам и обнуляет их после прочтения", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "unread-alice@example.com", "UnreadAlice");
    const bob = await register(harness.app, "unread-bob@example.com", "UnreadBob");

    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;

    // Боб пишет три сообщения: Алиса их не открывала.
    for (const index of [1, 2, 3]) {
      const sent = await request(harness.app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", bearer(bob.accessToken))
        .send({ text: `Сообщение ${index}` });
      expect(sent.status).toBe(201);
    }

    const asAlice = await request(harness.app)
      .get("/api/conversations")
      .set("Authorization", bearer(alice.accessToken));
    const mine = asAlice.body.conversations.find(
      (item: { id: string }) => item.id === conversationId,
    );
    expect(mine.unreadCount).toBe(3);

    // Свои сообщения непрочитанными не считаются.
    const asBob = await request(harness.app)
      .get("/api/conversations")
      .set("Authorization", bearer(bob.accessToken));
    const his = asBob.body.conversations.find(
      (item: { id: string }) => item.id === conversationId,
    );
    expect(his.unreadCount).toBe(0);

    // Прочитали историю — счётчик обнулился.
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/read`)
      .set("Authorization", bearer(alice.accessToken));
    const afterRead = await request(harness.app)
      .get("/api/conversations")
      .set("Authorization", bearer(alice.accessToken));
    const read = afterRead.body.conversations.find(
      (item: { id: string }) => item.id === conversationId,
    );
    expect(read.unreadCount).toBe(0);
  });

  it("создаёт опрос, считает голоса и прячет имена в анонимном", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "poll-alice@example.com", "PollAlice");
    const bob = await register(harness.app, "poll-bob@example.com", "PollBob");
    const carol = await register(harness.app, "poll-carol@example.com", "PollCarol");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "Опросы", memberIds: [bob.user.id, carol.user.id] });
    const groupId = created.body.conversation.id as string;

    const poll = await request(harness.app)
      .post(`/api/conversations/${groupId}/polls`)
      .set("Authorization", bearer(alice.accessToken))
      .send({
        question: "Куда идём в субботу?",
        description: "Выбираем маршрут",
        options: ["В горы", "На речку", "В лес"],
      });
    expect(poll.status).toBe(201);
    const message = poll.body.message;
    expect(message).toMatchObject({ kind: "poll", text: "Куда идём в субботу?" });
    expect(message.poll.options).toHaveLength(3);
    expect(message.poll.settings).toMatchObject({
      showNames: true,
      multiple: false,
      addOptions: true,
      changeVote: true,
      shuffle: false,
      correctOptionIds: [],
      deadline: null,
    });
    expect(message.poll).toMatchObject({ counts: {}, totalVoters: 0, closed: false });

    const messageId = message.id as string;
    const firstOption = message.poll.options[0].id as string;
    const secondOption = message.poll.options[1].id as string;

    // Один ответ: второй выбор в одиночном опросе отклоняется.
    const vote = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/vote`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ optionIds: [firstOption] });
    expect(vote.status).toBe(200);
    expect(vote.body.message.poll).toMatchObject({
      counts: { [firstOption]: 1 },
      totalVoters: 1,
    });
    const double = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/vote`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ optionIds: [firstOption, secondOption] });
    expect(double.status).toBe(400);
    expect(double.body.error.code).toBe("POLL_SINGLE_CHOICE");

    // Имена открыты: видно, кто голосовал.
    await request(harness.app)
      .post(`/api/messages/${messageId}/poll/vote`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ optionIds: [secondOption] });
    const withNames = await request(harness.app)
      .get(`/api/conversations/${groupId}/messages`)
      .set("Authorization", bearer(alice.accessToken));
    const seenPoll = withNames.body.messages.find((item: { id: string }) => item.id === messageId);
    expect(seenPoll.poll.totalVoters).toBe(2);
    // Варианты без голосов тоже попадают в итоги — нулями.
    expect(seenPoll.poll.counts).toEqual({
      [firstOption]: 1,
      [secondOption]: 1,
      [message.poll.options[2].id]: 0,
    });
    expect(Object.keys(seenPoll.poll.votes)).toHaveLength(2);

    // Свой вариант ответа добавляется, если это разрешено.
    const extra = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/options`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ text: "На озеро" });
    expect(extra.status).toBe(200);
    expect(extra.body.message.poll.options).toHaveLength(4);

    // Остановить опрос может только автор.
    const strangerClose = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/close`)
      .set("Authorization", bearer(bob.accessToken));
    expect(strangerClose.status).toBe(403);
    const closed = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/close`)
      .set("Authorization", bearer(alice.accessToken));
    expect(closed.status).toBe(200);
    expect(closed.body.message.poll.closed).toBe(true);
    const afterClose = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/vote`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ optionIds: [firstOption] });
    expect(afterClose.status).toBe(403);
    expect(afterClose.body.error.code).toBe("POLL_CLOSED");
  });

  it("прячет чужие голоса в анонимном опросе и слушается настроек", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "anon-alice@example.com", "AnonAlice");
    const bob = await register(harness.app, "anon-bob@example.com", "AnonBob");

    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id });
    const conversationId = direct.body.conversation.id as string;

    const poll = await request(harness.app)
      .post(`/api/conversations/${conversationId}/polls`)
      .set("Authorization", bearer(alice.accessToken))
      .send({
        question: "Тайное голосование",
        options: ["Да", "Нет"],
        settings: { showNames: false, multiple: true, addOptions: false, changeVote: true },
      });
    const messageId = poll.body.message.id as string;
    const options = poll.body.message.poll.options as Array<{ id: string }>;

    await request(harness.app)
      .post(`/api/messages/${messageId}/poll/vote`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ optionIds: [options[0]!.id] });

    // Анонимный опрос: числа видны всем, имена — никому, кроме себя.
    const asAlice = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(alice.accessToken));
    const seen = asAlice.body.messages.find((item: { id: string }) => item.id === messageId);
    expect(seen.poll.counts[options[0]!.id]).toBe(1);
    expect(seen.poll.totalVoters).toBe(1);
    expect(seen.poll.votes).toEqual({});

    const asBob = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken));
    const own = asBob.body.messages.find((item: { id: string }) => item.id === messageId);
    expect(own.poll.votes[bob.user.id]).toEqual([options[0]!.id]);

    // Несколько ответов разрешено, а менять ответ и добавлять варианты — нет.
    const many = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/vote`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ optionIds: [options[0]!.id, options[1]!.id] });
    expect(many.status).toBe(200);
    expect(many.body.message.poll.counts[options[1]!.id]).toBe(1);
    const addOption = await request(harness.app)
      .post(`/api/messages/${messageId}/poll/options`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Свой вариант" });
    expect(addOption.status).toBe(403);
    expect(addOption.body.error.code).toBe("POLL_OPTIONS_LOCKED");

    // Ответ, который нельзя изменить, фиксируется после первого голоса.
    const locked = await request(harness.app)
      .post(`/api/conversations/${conversationId}/polls`)
      .set("Authorization", bearer(alice.accessToken))
      .send({
        question: "Ответ не поменять",
        options: ["Первый", "Второй"],
        settings: { changeVote: false },
      });
    const lockedId = locked.body.message.id as string;
    const lockedOptions = locked.body.message.poll.options as Array<{ id: string }>;
    const firstVote = await request(harness.app)
      .post(`/api/messages/${lockedId}/poll/vote`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ optionIds: [lockedOptions[0]!.id] });
    expect(firstVote.status).toBe(200);
    const secondVote = await request(harness.app)
      .post(`/api/messages/${lockedId}/poll/vote`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ optionIds: [lockedOptions[1]!.id] });
    expect(secondVote.status).toBe(403);
    expect(secondVote.body.error.code).toBe("POLL_VOTE_LOCKED");
  });

  it("закрывает опросы правом группы и проверяет входные данные", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "limit-alice@example.com", "LimitAlice");
    const bob = await register(harness.app, "limit-bob@example.com", "LimitBob");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "Без опросов", memberIds: [bob.user.id] });
    const groupId = created.body.conversation.id as string;
    await request(harness.app)
      .put(`/api/groups/${groupId}/permissions`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ permissions: { send_polls: false } });

    const denied = await request(harness.app)
      .post(`/api/conversations/${groupId}/polls`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ question: "Можно?", options: ["Да", "Нет"] });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("GROUP_POLLS_DENIED");

    for (const [body, code] of [
      [{ question: "Один вариант", options: ["Только один"] }, "POLL_OPTIONS_TOO_FEW"],
      [
        { question: "Слишком много", options: Array.from({ length: 13 }, (_, i) => `Вариант ${i}`) },
        "POLL_OPTIONS_TOO_MANY",
      ],
    ] as const) {
      const bad = await request(harness.app)
        .post(`/api/conversations/${groupId}/polls`)
        .set("Authorization", bearer(alice.accessToken))
        .send(body);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe(code);
    }
  });

  it("ставит теги участникам и убирает их вместе с выходом из группы", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "tag-alice@example.com", "TagAlice");
    const bob = await register(harness.app, "tag-bob@example.com", "TagBob");
    const carol = await register(harness.app, "tag-carol@example.com", "TagCarol");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "Теги", memberIds: [bob.user.id, carol.user.id] });
    const groupId = created.body.conversation.id as string;

    // Владелец ставит тег участнику и себе.
    const forBob = await request(harness.app)
      .put(`/api/groups/${groupId}/tag`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, tag: "  #смирнёха  " });
    expect(forBob.status).toBe(200);
    const forAlice = await request(harness.app)
      .put(`/api/groups/${groupId}/tag`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: alice.user.id, tag: "Организатор" });
    expect(forAlice.status).toBe(200);

    const listed = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    const byId = new Map<string, { user: { id: string }; tag?: string }>(
      listed.body.members.map(
        (item: { user: { id: string }; tag?: string }) => [item.user.id, item] as const,
      ),
    );
    // Тег обрезан по краям, у остальных участников поля нет.
    expect(byId.get(bob.user.id)?.tag).toBe("#смирнёха");
    expect(byId.get(alice.user.id)?.tag).toBe("Организатор");
    expect(byId.get(carol.user.id)).not.toHaveProperty("tag");
    // Тег виден и в самой беседе: клиент рисует его рядом с именем.
    const conversation = await request(harness.app)
      .get("/api/conversations")
      .set("Authorization", bearer(bob.accessToken));
    const group = conversation.body.conversations.find((item: { id: string }) => item.id === groupId);
    expect(group.memberTags[bob.user.id]).toBe("#смирнёха");

    // Обычный участник чужие теги менять не может, а свой — может.
    const carolTagsBob = await request(harness.app)
      .put(`/api/groups/${groupId}/tag`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ userId: bob.user.id, tag: "самозванец" });
    expect(carolTagsBob.status).toBe(403);
    const carolTagsSelf = await request(harness.app)
      .put(`/api/groups/${groupId}/tag`)
      .set("Authorization", bearer(carol.accessToken))
      .send({ userId: carol.user.id, tag: "Новичок" });
    expect(carolTagsSelf.status).toBe(200);

    // Тег владельца не подменяет даже администратор.
    await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, admin: true });
    const bobTagsOwner = await request(harness.app)
      .put(`/api/groups/${groupId}/tag`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ userId: alice.user.id, tag: "Подменённый" });
    expect(bobTagsOwner.status).toBe(403);

    // Пустой тег снимает подпись.
    const cleared = await request(harness.app)
      .put(`/api/groups/${groupId}/tag`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: carol.user.id, tag: "   " });
    expect(cleared.status).toBe(200);
    expect(cleared.body.conversation.memberTags).not.toHaveProperty(carol.user.id);

    // Вместе с выходом участника уходит и его тег.
    await request(harness.app)
      .delete(`/api/groups/${groupId}/members/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    const afterRemoval = await request(harness.app)
      .get(`/api/groups/${groupId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    const remaining = afterRemoval.body.members.map(
      (item: { user: { id: string }; tag?: string }) => [item.user.id, item.tag] as const,
    );
    expect(remaining).not.toContainEqual([bob.user.id, "#смирнёха"]);
    expect(remaining).toContainEqual([alice.user.id, "Организатор"]);

    // История знает про смену тега.
    const history = await request(harness.app)
      .get(`/api/groups/${groupId}/history`)
      .set("Authorization", bearer(alice.accessToken));
    const tagEvents = history.body.events.filter(
      (item: { kind: string }) => item.kind === "member_tag_changed",
    );
    expect(tagEvents).toHaveLength(4);
    expect(tagEvents.at(-1)).toMatchObject({ targetId: bob.user.id, detail: "#смирнёха" });
  });

  it("пускает администратора к управлению, но не выше своих прав", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "power-alice@example.com", "PowerAlice");
    const bob = await register(harness.app, "power-bob@example.com", "PowerBob");
    const carol = await register(harness.app, "power-carol@example.com", "PowerCarol");
    const dave = await register(harness.app, "power-dave@example.com", "PowerDave");

    const created = await request(harness.app)
      .post("/api/groups")
      .set("Authorization", bearer(alice.accessToken))
      .send({ title: "Полномочия", memberIds: [bob.user.id, carol.user.id, dave.user.id] });
    const groupId = created.body.conversation.id as string;

    // Обычный участник не может ни удалять, ни ограничивать, ни тегировать.
    for (const call of [
      request(harness.app)
        .delete(`/api/groups/${groupId}/members/${bob.user.id}`)
        .set("Authorization", bearer(carol.accessToken)),
      request(harness.app)
        .post(`/api/groups/${groupId}/restrict`)
        .set("Authorization", bearer(carol.accessToken))
        .send({ userId: bob.user.id, mutedUntil: "forever" }),
      request(harness.app)
        .put(`/api/groups/${groupId}/tag`)
        .set("Authorization", bearer(carol.accessToken))
        .send({ userId: bob.user.id, tag: "метка" }),
    ]) {
      expect((await call).status).toBe(403);
    }

    // Администратор без права добавления администраторов назначать не может.
    const promoted = await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, admin: true, permissions: { add_admins: true } });
    expect(promoted.status).toBe(200);

    const bobPromotesCarol = await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ userId: carol.user.id, admin: true, permissions: { add_admins: true } });
    expect(bobPromotesCarol.status).toBe(200);

    // Но выдать право, которого нет у него самого, Боб не может.
    const bobLosesInfo = await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: bob.user.id, admin: true, permissions: { change_info: false } });
    expect(bobLosesInfo.status).toBe(200);
    const bobGrantsInfo = await request(harness.app)
      .post(`/api/groups/${groupId}/admins`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ userId: carol.user.id, admin: true, permissions: { change_info: true } });
    expect(bobGrantsInfo.status).toBe(403);
    expect(bobGrantsInfo.body.error.code).toBe("NO_RIGHTS");

    // Администратор не снимает другого администратора — это дело владельца.
    const bobRemovesAdmin = await request(harness.app)
      .delete(`/api/groups/${groupId}/members/${carol.user.id}`)
      .set("Authorization", bearer(bob.accessToken));
    expect(bobRemovesAdmin.status).toBe(403);

    // А обычного участника удаляет свободно: право remove_members у него есть.
    const bobRemovesMember = await request(harness.app)
      .delete(`/api/groups/${groupId}/members/${dave.user.id}`)
      .set("Authorization", bearer(bob.accessToken));
    expect(bobRemovesMember.status).toBe(200);
    expect(bobRemovesMember.body.conversation.memberCount).toBe(3);
  });

  it("refuses deleted accounts and closes groups to strangers", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "closed-alice@example.com", "ClosedAlice");
    const bob = await register(harness.app, "closed-bob@example.com", "ClosedBob");
    await harness.repositories.users.update(alice.user.id, { isOwner: true });
    const aliceAuth = { Authorization: bearer(alice.accessToken) };

    const created = await request(harness.app)
      .post("/api/groups")
      .set(aliceAuth)
      .send({ title: "Закрытая", memberIds: [bob.user.id] });
    const groupId = created.body.conversation.id as string;

    // Сначала убираем Боба из группы, потом удаляем аккаунт: вернуть его нельзя.
    await request(harness.app).delete(`/api/groups/${groupId}/members/${bob.user.id}`).set(aliceAuth);
    const removed = await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(aliceAuth);
    expect(removed.status).toBe(200);
    const addDeleted = await request(harness.app)
      .post(`/api/groups/${groupId}/members`)
      .set(aliceAuth)
      .send({ userIds: [bob.user.id] });
    expect(addDeleted.status).toBe(400);
    expect(addDeleted.body.error.code).toBe("ACCOUNT_DELETED");

    const third = await register(harness.app, "closed-third@example.com", "ClosedThird");
    const addMissing = await request(harness.app)
      .post(`/api/groups/${groupId}/members`)
      .set(aliceAuth)
      .send({ userIds: ["6b1f0a3e-3a4c-4d5e-8f90-1a2b3c4d5e6f"] });
    expect(addMissing.status).toBe(404);
    expect(addMissing.body.error.code).toBe("USER_NOT_FOUND");

    // Личный диалог группой не считается: группы по нему не находится.
    const direct = await request(harness.app)
      .post("/api/conversations/direct")
      .set("Authorization", bearer(alice.accessToken))
      .send({ userId: third.user.id });
    const directId = direct.body.conversation.id as string;
    const members = await request(harness.app)
      .get(`/api/groups/${directId}/members`)
      .set("Authorization", bearer(alice.accessToken));
    expect(members.status).toBe(404);
    // И несуществующая группа тоже.
    const missing = await request(harness.app)
      .get("/api/groups/8f14e45f-ceea-467a-9f5b-1c1e2f3a4b5c/members")
      .set("Authorization", bearer(alice.accessToken));
    expect(missing.status).toBe(404);
  });
});

describe("friends", () => {
  it("заводит дружбу по заявке и убирает обе стороны при удалении", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "friend-alice@example.com", "FriendAlice");
    const bob = await register(harness.app, "friend-bob@example.com", "FriendBob");

    // Заявка: у Алисы она исходящая, у Боба — входящая.
    const requested = await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(requested.status).toBe(201);
    expect(requested.body.state).toBe("outgoing");

    const aliceList = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(alice.accessToken));
    expect(aliceList.body.friends).toHaveLength(0);
    expect(aliceList.body.outgoing).toHaveLength(1);
    expect(aliceList.body.outgoing[0].user.id).toBe(bob.user.id);

    const bobList = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(bob.accessToken));
    expect(bobList.body.incoming).toHaveLength(1);
    expect(bobList.body.incoming[0].user.id).toBe(alice.user.id);

    // Чужой профиль показывает состояние связи — по нему рисуется кнопка.
    const bobSeenByAlice = await request(harness.app)
      .get(`/api/users/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(bobSeenByAlice.body.user.friendship).toBe("outgoing");

    // Принятие: обе стороны видят друг друга в друзьях, заявки закрыты.
    const accepted = await request(harness.app)
      .post(`/api/friends/${alice.user.id}/accept`)
      .set("Authorization", bearer(bob.accessToken));
    expect(accepted.body.state).toBe("friends");

    const aliceAfter = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(alice.accessToken));
    expect(aliceAfter.body.friends).toHaveLength(1);
    expect(aliceAfter.body.friends[0].user.id).toBe(bob.user.id);
    expect(aliceAfter.body.outgoing).toHaveLength(0);

    const bobAfter = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(bob.accessToken));
    expect(bobAfter.body.friends).toHaveLength(1);
    expect(bobAfter.body.incoming).toHaveLength(0);

    // Удаление из друзей чистит обе записи, а не одну.
    const removed = await request(harness.app)
      .delete(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(removed.body.state).toBe("none");
    const bobCleared = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(bob.accessToken));
    expect(bobCleared.body.friends).toHaveLength(0);
  });

  it("встречная заявка сразу делает людей друзьями", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "mutual-alice@example.com", "MutualAlice");
    const bob = await register(harness.app, "mutual-bob@example.com", "MutualBob");

    await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    // Боб не принимает вручную, а тоже жмёт «добавить» — заявка взаимная.
    const answer = await request(harness.app)
      .post(`/api/friends/${alice.user.id}`)
      .set("Authorization", bearer(bob.accessToken));
    expect(answer.body.state).toBe("friends");

    for (const user of [alice, bob]) {
      const list = await request(harness.app)
        .get("/api/friends")
        .set("Authorization", bearer(user.accessToken));
      expect(list.body.friends).toHaveLength(1);
      expect(list.body.incoming).toHaveLength(0);
      expect(list.body.outgoing).toHaveLength(0);
    }
  });

  it("повторная заявка не создаёт дубль, и себя добавить нельзя", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "dup-alice@example.com", "DupAlice");
    const bob = await register(harness.app, "dup-bob@example.com", "DupBob");

    await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    const again = await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(again.body.state).toBe("outgoing");

    const list = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(alice.accessToken));
    expect(list.body.outgoing).toHaveLength(1);

    // Заявка самому себе — ошибка, а не запись в свой же список.
    const self = await request(harness.app)
      .post(`/api/friends/${alice.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("FRIEND_SELF");
  });

  it("заблокированному заявка не уходит", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "block-alice@example.com", "BlockAlice");
    const bob = await register(harness.app, "block-bob@example.com", "BlockBob");

    // Боб заблокировал Алису: заявка от неё не должна пройти.
    await request(harness.app)
      .put(`/api/users/${alice.user.id}/block`)
      .set("Authorization", bearer(bob.accessToken));

    const attempt = await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe("FRIEND_UNAVAILABLE");
    // Автору заявки не сообщаем, что его заблокировали — только «нельзя».
    expect(attempt.body.error.message).not.toContain("block");
  });

  it("отклонение заявки снимает её у обоих", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "decl-alice@example.com", "DeclAlice");
    const bob = await register(harness.app, "decl-bob@example.com", "DeclBob");

    await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    // Отклоняет получатель — тот, кому заявка пришла. В адресе стоит автор
    // заявки, а не собственный id: иначе получатель отклонил бы сам себя.
    const declined = await request(harness.app)
      .post(`/api/friends/${alice.user.id}/decline`)
      .set("Authorization", bearer(bob.accessToken));
    expect(declined.body.state).toBe("none");

    for (const user of [alice, bob]) {
      const list = await request(harness.app)
        .get("/api/friends")
        .set("Authorization", bearer(user.accessToken));
      expect(list.body.friends).toHaveLength(0);
      expect(list.body.incoming).toHaveLength(0);
      expect(list.body.outgoing).toHaveLength(0);
    }
  });

  it("удаление аккаунта вычищает его из чужих друзей", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "owner@example.com", "Owner");
    const alice = await register(harness.app, "gone-alice@example.com", "GoneAlice");
    const bob = await register(harness.app, "gone-bob@example.com", "GoneBob");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });

    await request(harness.app)
      .post(`/api/friends/${bob.user.id}`)
      .set("Authorization", bearer(alice.accessToken));
    await request(harness.app)
      .post(`/api/friends/${alice.user.id}/accept`)
      .set("Authorization", bearer(bob.accessToken));

    const friendsBefore = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(bob.accessToken));
    expect(friendsBefore.body.friends).toHaveLength(1);

    await request(harness.app)
      .delete(`/api/admin/${alice.user.id}`)
      .set("Authorization", bearer(owner.accessToken));

    // Удалённый аккаунт больше не висит в друзьях у Боба.
    const friendsAfter = await request(harness.app)
      .get("/api/friends")
      .set("Authorization", bearer(bob.accessToken));
    expect(friendsAfter.body.friends).toHaveLength(0);
  });
});

describe("знак приложения", () => {
  it("приложение ставит себе значок Yargram само", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "app-owner@example.com", "AppOwner");
    const app = await register(harness.app, "app@example.com", "YargramApp");
    // Владельцем себя назначить через API нельзя — только в базе, как и в жизни.
    await harness.repositories.users.update(owner.user.id, { isOwner: true });

    // Обычный аккаунт значок себе выдать не может.
    const denied = await request(harness.app)
      .post("/api/app/badge")
      .set("Authorization", bearer(app.accessToken))
      .send({ badge: "yargram" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("NOT_APP");

    // Владелец помечает аккаунт приложением.
    const marked = await request(harness.app)
      .post(`/api/admin/${app.user.id}/app`)
      .set("Authorization", bearer(owner.accessToken))
      .send({ isApp: true });
    expect(marked.status).toBe(200);
    expect(marked.body.user.isApp).toBe(true);

    const granted = await request(harness.app)
      .post("/api/app/badge")
      .set("Authorization", bearer(app.accessToken))
      .send({ badge: "yargram" });
    expect(granted.status).toBe(200);
    expect(granted.body.user.badge).toBe("yargram");

    // Значок виден в публичном профиле приложения.
    const publicProfile = await request(harness.app)
      .get(`/api/users/${app.user.id}`)
      .set("Authorization", bearer(owner.accessToken));
    expect(publicProfile.body.user.badge).toBe("yargram");

    // Снять значок приложение тоже может само.
    const cleared = await request(harness.app)
      .post("/api/app/badge")
      .set("Authorization", bearer(app.accessToken))
      .send({ badge: null });
    expect(cleared.body.user.badge).toBeNull();
  });

  it("значок себе выдаёт только приложение, и снятие пометки снимает значок", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "badge-owner@example.com", "BadgeOwner");
    const person = await register(harness.app, "badge-person@example.com", "BadgePerson");
    const app = await register(harness.app, "badge-app@example.com", "BadgeApp");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });

    await request(harness.app)
      .post(`/api/admin/${app.user.id}/app`)
      .set("Authorization", bearer(owner.accessToken))
      .send({ isApp: true });
    await request(harness.app)
      .post("/api/app/badge")
      .set("Authorization", bearer(app.accessToken))
      .send({ badge: "yargram" });

    // Пометку «приложение» может снять только владелец, а не сам человек.
    const notOwner = await request(harness.app)
      .post(`/api/admin/${person.user.id}/app`)
      .set("Authorization", bearer(app.accessToken))
      .send({ isApp: true });
    expect(notOwner.status).toBe(403);
    expect(notOwner.body.error.code).toBe("NOT_OWNER");

    // Снятие пометки заодно снимает значок: приложение перестало быть приложением.
    const unmarked = await request(harness.app)
      .post(`/api/admin/${app.user.id}/app`)
      .set("Authorization", bearer(owner.accessToken))
      .send({ isApp: false });
    expect(unmarked.body.user.isApp).toBe(false);
    expect(unmarked.body.user.badge).toBeNull();
  });
});

describe("точный поиск аккаунта для админки", () => {
  it("находит владельца по своему же нику — обычный поиск его исключает", async () => {
    const harness = await createHarness();
    const owner = await register(harness.app, "self-owner@example.com", "SelfOwner");
    const other = await register(harness.app, "self-other@example.com", "SelfOther");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const auth = { Authorization: bearer(owner.accessToken) };

    // Обычный поиск себя не отдаёт: он исключает ищущего.
    const search = await request(harness.app)
      .get("/api/users")
      .query({ q: "selfowner" })
      .set(auth);
    expect(search.body.users).toHaveLength(0);

    // Точный поиск — отдаёт, иначе владелец не смог бы выдать себе значок.
    const found = await request(harness.app)
      .post("/api/admin/lookup")
      .set(auth)
      .send({ handle: "@SelfOwner" });
    expect(found.status).toBe(200);
    expect(found.body.user).toMatchObject({ id: owner.user.id, username: "selfowner" });

    // Дополнительный ник тоже находится.
    await harness.repositories.users.update(other.user.id, { usernames: ["ДопНік"] });
    const byAlias = await request(harness.app)
      .post("/api/admin/lookup")
      .set(auth)
      .send({ handle: "допнік" });
    expect(byAlias.body.user).toMatchObject({ id: other.user.id });

    // Нет такого — честный null, а не ошибка.
    const missing = await request(harness.app)
      .post("/api/admin/lookup")
      .set(auth)
      .send({ handle: "неттакогоника" });
    expect(missing.status).toBe(200);
    expect(missing.body.user).toBeNull();
  });

  it("не пускает обычного человека", async () => {
    const harness = await createHarness();
    const someone = await register(harness.app, "not-owner@example.com", "NotOwner");
    const response = await request(harness.app)
      .post("/api/admin/lookup")
      .set("Authorization", bearer(someone.accessToken))
      .send({ handle: "someone" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("NOT_OWNER");
  });
});

describe("лимит размера загрузки", () => {
  it("сообщает про конкретный лимит баннера, а не общее «Request body is too large»", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "size-alice@example.com", "SizeAlice");

    // Тело заведомо больше лимита баннера + запас на multipart-обвязку.
    const oversized = Buffer.alloc(uploadLimits.banner + 2 * 1024 * 1024, 0x41);
    const response = await request(harness.app)
      .post("/api/users/me/banner")
      .set("Authorization", bearer(alice.accessToken))
      .attach("banner", oversized, { filename: "big.gif", contentType: "image/gif" });

    expect(response.status).toBe(413);
    // Раньше общая ветка 413 в обработчике ошибок съедала понятный текст
    // загрузчика и подменяла его на «Request body is too large».
    expect(response.body.error.code).toBe("UPLOAD_TOO_LARGE");
    expect(response.body.error.message).not.toBe("Request body is too large");
  });

  it("у фона свой предел, а у фото в переписке — прежние 20 МиБ", async () => {
    // Фон поднимали до 50 МиБ. Просто поднять `image` значило бы молча
    // поднять и предел обычного фото: интерфейс обещает 20 МиБ, поэтому у
    // фона отдельный вид загрузки, а этот предел остался на месте.
    expect(uploadLimits.wallpaper).toBe(50 * 1024 * 1024);
    expect(uploadLimits.image).toBe(20 * 1024 * 1024);
    expect(uploadLimits.banner).toBe(50 * 1024 * 1024);

    const harness = await createHarness();
    const alice = await register(harness.app, "size-wall@example.com", "SizeWall");

    // GIF пущен и фону: его тоже ставят анимированным.
    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(26)]);
    const wallpaper = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", gif, { filename: "wall.gif", contentType: "image/gif" });
    expect(wallpaper.status).toBe(201);
    expect(wallpaper.body.attachment.kind).toBe("wallpaper");
    expect(wallpaper.body.attachment.mimeType).toBe("image/gif");

    // Тело заведомо больше 20 МиБ: фоном прошло бы, обычным фото — нет.
    const overImageLimit = Buffer.concat([
      Buffer.from("GIF89a", "ascii"),
      Buffer.alloc(uploadLimits.image + 1024, 0x41),
    ]);
    const asPhoto = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", overImageLimit, { filename: "big.gif", contentType: "image/gif" });
    expect(asPhoto.status).toBe(413);

    const asWallpaper = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", overImageLimit, { filename: "big.gif", contentType: "image/gif" });
    expect(asWallpaper.status).toBe(201);
    expect(asWallpaper.body.attachment.kind).toBe("wallpaper");
  });

  it("сохраняет загруженный фон, а не отвечает 400 на относительный путь", async () => {
    // Загрузка отдаёт ссылку вида `/api/uploads/<id>?t=<подпись>` — без
    // протокола. Пока схема профиля требовала «обязательно URL», файл уходил,
    // а сохранение падало 400 «Request validation failed»: всё выглядело так,
    // будто сервер не принимает сам файл.
    const harness = await createHarness();
    const alice = await register(harness.app, "wall-save@example.com", "WallSave");

    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(26)]);
    const uploaded = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", gif, { filename: "wall.gif", contentType: "image/gif" });
    expect(uploaded.status).toBe(201);

    const url = uploaded.body.attachment.url as string;
    expect(url.startsWith("/api/uploads/")).toBe(true);

    const saved = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: url });
    expect(saved.status).toBe(200);
    // Ссылку на оформление сервер пересобирает при чтении (подпись в ?t=
    // живёт ограниченное время), поэтому сравниваем путь до файла, а не
    // строку целиком: токен в ответе заведомо свежий.
    expect(saved.body.user.wallpaperUrl.split("?")[0]).toBe(url.split("?")[0]);

    // Пустая строка по-прежнему означает «вернуть стандартный фон».
    const cleared = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.wallpaperUrl ?? "").toBe("");

    // Посторонний мусор ссылкой не считается: схему мы расширили, а не сняли.
    const junk = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: "javascript:alert(1)" });
    expect(junk.status).toBe(400);
    expect(junk.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("принимает встроенные обои приложения и снимает фон вместе с типом", async () => {
    // Встроенные обои — не загрузка, а файл рядом с интерфейсом:
    // `/wallpapers/Yargram-wallpaper-blue.png`. Такой путь обязан проходить
    // схему, иначе кнопка «Обои» в настройках отвечала бы ошибкой.
    const harness = await createHarness();
    const alice = await register(harness.app, "wall-builtin@example.com", "WallBuiltin");

    const applied = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: "/wallpapers/Yargram-wallpaper-blue.png", wallpaperMimeType: "image/png" });
    expect(applied.status).toBe(200);
    expect(applied.body.user.wallpaperUrl).toBe("/wallpapers/Yargram-wallpaper-blue.png");
    expect(applied.body.user.wallpaperMimeType).toBe("image/png");

    // Снятие: пустая ссылка и пустой тип — чат возвращается к стандартному
    // заполнению, а «это было видео» не остаётся в профиле.
    const cleared = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: "", wallpaperMimeType: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.wallpaperUrl ?? "").toBe("");
    expect(cleared.body.user.wallpaperMimeType ?? "").toBe("");

    // Чужой сайт под видом пути — по-прежнему не наш файл.
    const foreign = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: "//evil.example.com/pic.png" });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("переподписывает ссылку на фон при каждом чтении профиля", async () => {
    // Фон хранится строкой, и подпись в ней живёт сутки. Без переподписи фон
    // пропадал бы сам через день: файл цел, а ссылка уже не открывается.
    const harness = await createHarness();
    const alice = await register(harness.app, "wall-resign@example.com", "WallResign");

    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(26)]);
    const uploaded = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", gif, { filename: "wall.gif", contentType: "image/gif" });
    const stored = uploaded.body.attachment.url as string;

    const saved = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: stored });
    // Тот же файл (путь совпадает), подпись уже свежая.
    expect(saved.body.user.wallpaperUrl?.split("?")[0]).toBe(stored.split("?")[0]);

    const readProfile = async () => {
      const response = await request(harness.app)
        .get("/api/auth/me")
        .set("Authorization", bearer(alice.accessToken));
      expect(response.status).toBe(200);
      return response.body.user as { wallpaperUrl?: string };
    };

    // Подпись «протухла»: подсовываем ту же ссылку с заведомо мёртвой
    // подписью и убеждаемся, что профиль всё равно отдаёт рабочую.
    const expired = `${stored.split("?")[0]}?t=expired-signature`;
    await harness.repositories.users.update(alice.user.id, { wallpaperUrl: expired });

    const reloaded = await readProfile();
    expect(reloaded.wallpaperUrl).not.toBe(expired);
    expect(reloaded.wallpaperUrl?.startsWith("/api/uploads/")).toBe(true);
    // И новая ссылка действительно открывается, а не просто выглядит свежей.
    const served = await request(harness.app).get(reloaded.wallpaperUrl!);
    expect(served.status).toBe(200);

    // Внешнюю ссылку не трогаем: подписи у неё нет.
    await harness.repositories.users.update(alice.user.id, {
      wallpaperUrl: "https://example.com/wall.jpg",
    });
    expect((await readProfile()).wallpaperUrl).toBe("https://example.com/wall.jpg");
  });
});

describe("живое оформление: видео в фоне и баннере", () => {
  // mp4 начинается с бокса `ftyp`: четыре байта длины, затем сам `ftyp` и бренд.
  const mp4 = () =>
    Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypisom", "ascii"),
      Buffer.alloc(16),
    ]);
  // webm — заголовок EBML.
  const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]);

  it("принимает mp4 и webm и в фон, и в баннер", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "video-ok@example.com", "VideoOk");

    const wallpaper = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", mp4(), { filename: "wall.mp4", contentType: "video/mp4" });
    expect(wallpaper.status).toBe(201);
    expect(wallpaper.body.attachment.kind).toBe("wallpaper");
    expect(wallpaper.body.attachment.mimeType).toBe("video/mp4");

    const webmWall = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", webm(), { filename: "wall.webm", contentType: "video/webm" });
    expect(webmWall.status).toBe(201);
    expect(webmWall.body.attachment.mimeType).toBe("video/webm");

    const banner = await request(harness.app)
      .post("/api/users/me/banner")
      .set("Authorization", bearer(alice.accessToken))
      .attach("banner", mp4(), { filename: "banner.mp4", contentType: "video/mp4" });
    expect(banner.status).toBe(201);
    expect(banner.body.user.banner.mimeType).toBe("video/mp4");
  });

  it("не верит расширению: переименованная картинка видео не становится", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "video-fake@example.com", "VideoFake");

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    const renamed = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", png, { filename: "wall.mp4", contentType: "video/mp4" });
    expect(renamed.status).toBe(400);
    expect(renamed.body.error.code).toBe("UPLOAD_SIGNATURE_INVALID");

    // Внутри mp4, а расширение webm — тоже несовпадение, и тоже не проходит.
    const swapped = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", mp4(), { filename: "wall.webm", contentType: "video/webm" });
    expect(swapped.status).toBe(400);
    expect(swapped.body.error.code).toBe("UPLOAD_SIGNATURE_INVALID");
  });

  it("MOV не обещаем: браузеры играют его не везде", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "video-mov@example.com", "VideoMov");

    const mov = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x14]),
      Buffer.from("ftypqt  ", "ascii"),
      Buffer.alloc(8),
    ]);
    const response = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", mov, { filename: "wall.mp4", contentType: "video/mp4" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UPLOAD_SIGNATURE_INVALID");
  });

  it("фото в переписке видео не принимает — живое только оформление", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "video-photo@example.com", "VideoPhoto");

    const response = await request(harness.app)
      .post("/api/uploads?kind=image")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", mp4(), { filename: "clip.mp4", contentType: "video/mp4" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UPLOAD_EXTENSION_INVALID");
  });

  it("видео-фон отдаётся инлайном, с типом видео и поддержкой перемотки", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "video-serve@example.com", "VideoServe");

    const uploaded = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", mp4(), { filename: "wall.mp4", contentType: "video/mp4" });
    expect(uploaded.status).toBe(201);

    const saved = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(alice.accessToken))
      .send({ wallpaperUrl: uploaded.body.attachment.url, wallpaperMimeType: "video/mp4" });
    expect(saved.status).toBe(200);
    expect(saved.body.user.wallpaperMimeType).toBe("video/mp4");

    // Профиль помнит, что это видео: без этого клиент нарисовал бы <img>.
    const me = await request(harness.app)
      .get("/api/auth/me")
      .set("Authorization", bearer(alice.accessToken));
    expect(me.body.user.wallpaperMimeType).toBe("video/mp4");

    const url = saved.body.user.wallpaperUrl as string;
    const served = await request(harness.app).get(url);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toContain("video/mp4");
    // «Скачать файл» вместо показа сломало бы фон: браузер обязан играть его сам.
    expect(served.headers["content-disposition"]).toContain("inline");
    // Без диапазонов плеер не сможет даже начать с середины.
    expect(served.headers["accept-ranges"]).toBe("bytes");

    const ranged = await request(harness.app).get(url).set("Range", "bytes=0-3");
    expect(ranged.status).toBe(206);
    expect(ranged.headers["content-range"]).toMatch(/^bytes 0-3\//);
  });

  it("обычная картинка-фон остаётся картинкой", async () => {
    const harness = await createHarness();
    const alice = await register(harness.app, "video-still@example.com", "VideoStill");

    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(26)]);
    const uploaded = await request(harness.app)
      .post("/api/uploads?kind=wallpaper")
      .set("Authorization", bearer(alice.accessToken))
      .attach("file", gif, { filename: "wall.gif", contentType: "image/gif" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.attachment.mimeType).toBe("image/gif");
  });
});

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function createSocketClient(url: string, accessToken: string): ClientSocket {
  return createClient(url, {
    auth: { token: accessToken },
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Socket connection timed out")), 3_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForSocketEvent<T>(socket: ClientSocket, eventName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(eventName + " timed out")), 3_000);
    socket.once(eventName, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

/**
 * 🔥 Два сайта из одного сервера: лендинг по `/`, приложение по `/app`.
 *
 * Проверяем именно разводку по путям, потому что обе страницы — одностраничные
 * приложения: каждая отдаёт свой `index.html` на любой внутренний путь. Если
 * перепутать порядок маршрутов, лендинг перекроет приложение, и заметить это
 * можно только глазами в браузере — здесь это ловит тест.
 */
describe("два сайта: лендинг и приложение", () => {
  async function createStaticHarness(options: { landing: boolean; web: boolean }) {
    const directory = await mkdtemp(join(tmpdir(), "yargram-static-"));
    temporaryDirectories.push(directory);

    const landingDirectory = join(directory, "landing");
    const webDirectory = join(directory, "web");

    if (options.landing) {
      await mkdir(landingDirectory, { recursive: true });
      await writeFile(
        join(landingDirectory, "index.html"),
        "<!doctype html><title>Лендинг Yargram</title><p>Описание возможностей</p>",
        "utf8",
      );
      // Соглашение — отдельный файл лендинга, его отдаёт свой маршрут.
      await writeFile(
        join(landingDirectory, "terms.html"),
        "<!doctype html><title>Соглашение Yargram</title>",
        "utf8",
      );
    }
    if (options.web) {
      await mkdir(join(webDirectory, "assets"), { recursive: true });
      await writeFile(
        join(webDirectory, "index.html"),
        "<!doctype html><title>Yargram</title><div id=\"root\"></div>",
        "utf8",
      );
      await writeFile(join(webDirectory, "assets", "app.js"), "console.log('yargram');", "utf8");
      // Встроенные картинки Yargram: лежат рядом с интерфейсом, но адресуются
      // от корня — `/banners/…`, а не `/app/banners/…`.
      for (const folder of ["banners", "wallpapers"]) {
        await mkdir(join(webDirectory, folder), { recursive: true });
        await writeFile(
          join(webDirectory, folder, `Yargram-${folder.slice(0, -1)}-blue.png`),
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
      }
    }

    const config = {
      ...loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "test-secret-that-is-long-enough",
        DB_ENCRYPTION_KEY: "test-encryption-key-at-least-16",
        BCRYPT_ROUNDS: "4",
        DATA_DIR: directory,
      }),
      landingDistPath: landingDirectory,
      webDistPath: webDirectory,
    };

    const database = new JsonDatabase(config.dataFile);
    await database.initialize();
    const crypto = new AtRestCrypto("test-encryption-key-at-least-16");
    const repositories = withEncryption(createJsonRepositories(database), crypto);
    const authService = new AuthService(repositories.users, {
      jwtSecret: config.jwtSecret,
      jwtExpiresIn: config.jwtExpiresIn,
      bcryptRounds: config.bcryptRounds,
      sessions: repositories.sessions,
    });
    const chatService = new ChatService(repositories);
    const events = new RealtimeEvents();
    const app = createApp({
      config,
      repositories,
      authService,
      chatService,
      groupService: new GroupService(repositories, events, chatService),
      adminService: new AdminService(repositories, events),
      draftService: new DraftService(repositories, chatService, events),
      folderService: new FolderService(repositories, chatService, events),
      scheduledMessageService: new ScheduledMessageService(repositories, chatService, events),
      friendService: new FriendService(repositories, events),
      sessionService: new SessionService(repositories.sessions, repositories.users, events),
      supportBotService: new SupportBotService(repositories, chatService, events),
      stickerService: new StickerService(repositories, events),
      events,
      crypto,
    });
    return app;
  }

  it("корень отдаёт лендинг, а /app — приложение", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    const root = await request(app).get("/").set("Accept", "text/html");
    expect(root.status).toBe(200);
    expect(root.text).toContain("Лендинг Yargram");

    const appRoute = await request(app).get("/app").set("Accept", "text/html");
    expect(appRoute.status).toBe(200);
    expect(appRoute.text).toContain('id="root"');
  });

  it("внутренние пути приложения уходят в приложение, а не в лендинг", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    // Клиентская маршрутизация: любой путь под /app должен отдать тот же
    // index.html, иначе перезагрузка страницы в чате показала бы лендинг.
    for (const path of ["/app/settings", "/app/chat/123", "/join/invite123"]) {
      const response = await request(app).get(path).set("Accept", "text/html");
      expect(response.status, path).toBe(200);
      expect(response.text, path).toContain('id="root"');
    }
  });

  it("статика приложения доступна по своему пути", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    const asset = await request(app).get("/app/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.text).toContain("yargram");
  });

  it("без лендинга корень по-прежнему отдаёт приложение", async () => {
    // Так выглядит обновление без пересборки лендинга: сайт не должен
    // «пропасть» — приложение обязано остаться на месте.
    const app = await createStaticHarness({ landing: false, web: true });

    const root = await request(app).get("/").set("Accept", "text/html");
    expect(root.status).toBe(200);
    expect(root.text).toContain('id="root"');
  });

  it("API не перехватывается статикой ни на одном из сайтов", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    // Неизвестный маршрут API обязан отвечать 404 от API, а не HTML-страницей:
    // иначе клиент получил бы `index.html` вместо ошибки и упал на разборе JSON.
    for (const path of ["/api/unknown", "/app/api/unknown"]) {
      const response = await request(app).get(path).set("Accept", "application/json");
      expect(response.status, path).toBe(404);
      expect(response.body, path).toMatchObject({ error: { code: "NOT_FOUND" } });
    }
  });

  it("не-HTML запрос к корню не отдаёт страницу", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    const response = await request(app).get("/favicon-missing.ico").set("Accept", "image/png");
    expect(response.status).toBe(404);
  });

  it("соглашение отдаётся как документ, а не как файл приложения", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    const terms = await request(app).get("/terms").set("Accept", "text/html");
    expect(terms.status).toBe(200);
    expect(terms.text).toContain("Соглашение Yargram");
    // 🔥 Не приложение: иначе человек вместо документа увидел бы мессенджер
    // со статусом 200, и поломка осталась бы незаметной.
    expect(terms.text).not.toContain('id="root"');
  });

  it("любой путь лендинга ведёт в лендинг, а не в мессенджер", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    // 🔥 Проверка «приложение или лендинг» обязана смотреть на префикс `/app/`.
    // Когда она была всегда истинной, любой адрес сайта отдавал файл
    // приложения со статусом 200: адрес вёл в мессенджер, а ошибки не было.
    for (const path of ["/about", "/privacy", "/some/deep/link"]) {
      const response = await request(app).get(path).set("Accept", "text/html");
      expect(response.status, path).toBe(200);
      expect(response.text, path).toContain("Лендинг Yargram");
      expect(response.text, path).not.toContain('id="root"');
    }
  });

  it("встроенные картинки Yargram отдаются с корня картинкой, а не страницей", async () => {
    const app = await createStaticHarness({ landing: true, web: true });

    // 🔥 Браузер просит картинку с `Accept: image/*,*/*` — и `*/*` делает
    // HTML-страницу «приемлемым» ответом. Именно поэтому поломка была
    // незаметной: запрос `/banners/…` получал `index.html` со статусом 200, и
    // `<img>` молча не рисовал ничего — ни готовый баннер, ни выбранный в
    // профиле. Проверяем заголовком настоящего браузера, а не `image/png`.
    const browserAccepts = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

    for (const path of ["/banners/Yargram-banner-blue.png", "/wallpapers/Yargram-wallpaper-blue.png"]) {
      const response = await request(app).get(path).set("Accept", browserAccepts);
      expect(response.status, path).toBe(200);
      expect(response.headers["content-type"], path).toContain("image/png");
    }

    // А отсутствующей картинке — честный 404: страница приложения здесь была бы
    // подменой ответа и снова спрятала бы ошибку.
    const missing = await request(app)
      .get("/banners/Yargram-banner-none.png")
      .set("Accept", browserAccepts);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: "ASSET_NOT_FOUND" } });
  });
});
