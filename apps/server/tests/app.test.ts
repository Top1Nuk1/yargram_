import { createServer, type Server as HttpServer } from "node:http";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { RealtimeEvents } from "../src/realtime/events.js";
import { attachSocketServer, releaseSocketServer } from "../src/realtime/socket-server.js";
import { mediaUrlFor } from "../src/lib/media-links.js";
import { AtRestCrypto } from "../src/lib/crypto.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { AuthService } from "../src/services/auth-service.js";
import { AdminService } from "../src/services/admin-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
import { GroupService } from "../src/services/group-service.js";
import { ScheduledMessageService } from "../src/services/scheduled-message-service.js";
import { ChatService, type MessageView } from "../src/services/chat-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

const temporaryDirectories: string[] = [];
const realtimeServers: Array<ReturnType<typeof attachSocketServer>> = [];

/** Stops a test socket server and waits for its tracked work before storage is removed. */
async function closeRealtimeServer(io: ReturnType<typeof attachSocketServer>): Promise<void> {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await releaseSocketServer(io);
}

async function createHarness(seedState?: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "yargram-server-"));
  temporaryDirectories.push(directory);
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-that-is-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
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
  });
  const chatService = new ChatService(repositories);
  const events = new RealtimeEvents();
  const adminService = new AdminService(repositories, events);
  const groupService = new GroupService(repositories, events, chatService);
  const draftService = new DraftService(repositories, chatService, events);
  const folderService = new FolderService(repositories, chatService, events);
  const scheduledMessageService = new ScheduledMessageService(repositories, chatService, events);
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

    // Тот же адрес в другом регистре занят — и внутри аккаунта, и у соседа.
    const sameAccount = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: targetId, usernames: ["TOP1NUK1"] });
    expect(sameAccount.status).toBe(409);
    const taken = await request(harness.app)
      .post("/api/auth/register")
      .send({ email: "case-clash@example.com", password: "correct horse battery staple", displayName: "Clash", username: "SECOND" });
    expect(taken.status).toBe(409);

    // Кириллица и пробелы в никах не проходят валидацию.
    const invalid = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: targetId, usernames: ["Котик", "has space"] });
    expect(invalid.status).toBe(400);
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

    // Замороженный не проходит даже с действующим токеном и не логинится.
    const me = await request(harness.app)
      .get("/api/users/me")
      .set({ Authorization: bearer(bob.accessToken) });
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe("ACCOUNT_FROZEN");
    const login = await request(harness.app)
      .post("/api/auth/login")
      .send({ email: "freeze-bob@example.com", password: "correct horse battery staple" });
    expect(login.status).toBe(403);

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

  it("shows frozen and deleted accounts as a placeholder instead of breaking the chat", async () => {
    const harness = await createHarness();
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

  it("closes writing to a deleted account but keeps a frozen one reachable", async () => {
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

    // Заморозка — мера временная: сообщение уходит и дождётся разморозки.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: true })
      .expect(200);
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "Боб, ты как?" })
      .expect(201);

    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/freeze`)
      .set(ownerAuth)
      .send({ frozen: false })
      .expect(200);
    await request(harness.app).delete(`/api/admin/${bob.user.id}`).set(ownerAuth).expect(200);

    // Удалённый собеседник не принимает сообщения: история есть, ввода нет.
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

    const history = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages?limit=50`)
      .set(aliceAuth);
    expect(history.status).toBe(200);
    expect(history.body.messages).toHaveLength(1);
    expect(history.body.messages[0].text).toBe("Боб, ты как?");

    // После возврата аккаунта писать снова можно.
    await request(harness.app)
      .post(`/api/admin/${bob.user.id}/restore`)
      .set(ownerAuth)
      .send({})
      .expect(200);
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(aliceAuth)
      .send({ text: "с возвращением" })
      .expect(201);
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
