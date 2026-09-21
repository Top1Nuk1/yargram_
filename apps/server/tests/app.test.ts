import { createServer, type Server as HttpServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { AuthService } from "../src/services/auth-service.js";
import { AdminService } from "../src/services/admin-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
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
  const repositories = createJsonRepositories(database);
  const authService = new AuthService(repositories.users, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: config.bcryptRounds,
  });
  const chatService = new ChatService(repositories);
  const adminService = new AdminService(repositories.users);
  const events = new RealtimeEvents();
  const draftService = new DraftService(repositories, chatService, events);
  const folderService = new FolderService(repositories, chatService, events);
  const scheduledMessageService = new ScheduledMessageService(repositories, chatService, events);
  const app = createApp({
    config,
    repositories,
    authService,
    chatService,
    adminService,
    draftService,
    folderService,
    scheduledMessageService,
    events,
  });
  return {
    app,
    config,
    repositories,
    authService,
    chatService,
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
    const reloadedRepositories = createJsonRepositories(reloadedDatabase);
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
    const forbidden = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(bob.accessToken))
      .send({ text: "Blocked message" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("USER_BLOCKED");

    const reloadedDatabase = new JsonDatabase(harness.config.dataFile);
    await reloadedDatabase.initialize();
    const repositories = createJsonRepositories(reloadedDatabase);
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

    const granted = await request(harness.app)
      .post(`/api/admin/${owner.user.id}/grant`)
      .set(authorize)
      .send({ targetUserId: target.user.id, usernames: ["Kotik", "@second_name"] });
    expect(granted.status).toBe(200);
    expect(granted.body.user.usernames).toEqual(["kotik", "second_name"]);

    // Every alias is searchable through the regular user search.
    for (const query of ["kotik", "second_name", "aliastarget"]) {
      const search = await request(harness.app)
        .get(`/api/users?q=${query}`)
        .set(authorize);
      expect(search.body.users.map((user: { id: string }) => user.id)).toContain(target.user.id);
    }
    await expect(harness.repositories.users.findByUsername("kotik")).resolves.toMatchObject({
      id: target.user.id,
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

      // A blocked conversation fails the delivery instead of retrying forever.
      await harness.repositories.users.setBlocked(alice.user.id, bob.user.id, true);
      const blocked = await harness.repositories.scheduledMessages.create({
        userId: bob.user.id,
        conversationId,
        text: "не доставится",
        attachmentIds: [],
        sendAt: new Date(clock - 1_000).toISOString(),
      });
      expect(await queue.dispatchDue()).toBe(0);
      expect(await harness.repositories.scheduledMessages.findById(blocked.id)).toMatchObject({
        status: "failed",
      });
    } finally {
      bobClient.close();
      await closeRealtimeServer(socketServer);
    }
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
