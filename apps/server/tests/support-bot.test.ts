import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { AtRestCrypto } from "../src/lib/crypto.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { RealtimeEvents } from "../src/realtime/events.js";
import { AdminService } from "../src/services/admin-service.js";
import { AuthService } from "../src/services/auth-service.js";
import { ChatService, type MessageView } from "../src/services/chat-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
import { FriendService } from "../src/services/friend-service.js";
import { GroupService } from "../src/services/group-service.js";
import { ScheduledMessageService } from "../src/services/scheduled-message-service.js";
import { SessionService } from "../src/services/session-service.js";
import {
  SUPPORT_BOT_DISPLAY_NAME,
  SUPPORT_BOT_USERNAME,
} from "../src/services/support-bot-texts.js";
import { SupportBotService } from "../src/services/support-bot-service.js";
import { StickerService } from "../src/services/sticker-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

/**
 * Бот поддержки: меню кнопками, обращение в служебную группу и ответ владельца
 * обратно человеку. Проверяем весь путь целиком — от «Поддержки» в меню до
 * «Ответ от <имя>» в переписке.
 */

const temporaryDirectories: string[] = [];
/** Живые обвязки: бота надо глушить до уборки каталога, иначе он допишет файл. */
const liveHarnesses: { supportBotService: SupportBotService }[] = [];

afterEach(async () => {
  for (const harness of liveHarnesses.splice(0)) harness.supportBotService.stop();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/**
 * Бот отвечает не в самом запросе, а в подписке на поток сообщений: клиент
 * получает его ответ по сокету. Поэтому в тесте приходится дождаться, пока
 * ответ появится, — так же, как это делает настоящий интерфейс.
 */
async function waitFor<T>(check: () => Promise<T | null | undefined>, what: string): Promise<T> {
  const deadline = Date.now() + 3_000;
  for (;;) {
    const value = await check();
    if (value !== null && value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Не дождались: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const TEST_PASSWORD = "correct horse battery staple";

async function createHarness() {
  const directory = await mkdtemp(join(tmpdir(), "yargram-support-"));
  temporaryDirectories.push(directory);
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-that-is-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
  });
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
  supportBotService.start();
  liveHarnesses.push({ supportBotService });
  return { app, repositories, supportBotService, chatService, events };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function registerUser(harness: Harness, email: string, displayName: string, username: string) {
  const response = await request(harness.app).post("/api/auth/register").send({
    email,
    password: TEST_PASSWORD,
    displayName,
    username,
  });
  expect(response.status).toBe(201);
  return response.body as { accessToken: string; user: { id: string; displayName: string } };
}

/** Служебный аккаунт бота: входа у него нет, поэтому заводим прямо в базе. */
async function createBotAccount(harness: Harness): Promise<string> {
  const created = await harness.repositories.users.create({
    email: "support@yargram.app",
    passwordHash: "bot-has-no-real-password",
    displayName: SUPPORT_BOT_DISPLAY_NAME,
    username: SUPPORT_BOT_USERNAME,
  });
  await harness.repositories.users.update(created.id, {
    isBot: true,
    isApp: true,
    badge: "yargram",
    isVerified: true,
    isOwner: true,
    emailVerified: true,
  });
  return created.id;
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

async function messagesOf(
  harness: Harness,
  token: string,
  conversationId: string,
): Promise<MessageView[]> {
  const response = await request(harness.app)
    .get(`/api/conversations/${conversationId}/messages`)
    .set("Authorization", bearer(token));
  expect(response.status).toBe(200);
  return response.body.messages as MessageView[];
}

describe("Бот поддержки", () => {
  it("открывает пустую переписку: приветствие приходит только на /start", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    expect(opened.status).toBe(200);

    const conversation = opened.body.conversation as { id: string; type: string; members: { id: string; isBot?: boolean }[] };
    expect(conversation.type).toBe("direct");
    // Метка «бот» должна доехать до клиента: по ней рисуется плашка.
    expect(conversation.members.some((member) => member.isBot === true)).toBe(true);

    // Бот не пишет первым: вместо «приветствия, которого не просили» клиент
    // показывает кнопку «СТАРТ», и она отправляет /start обычным сообщением.
    expect(await messagesOf(harness, user.accessToken, conversation.id)).toHaveLength(0);

    const send = (text: string) =>
      request(harness.app)
        .post(`/api/conversations/${conversation.id}/messages`)
        .set("Authorization", bearer(user.accessToken))
        .send({ text });

    expect((await send("/start")).status).toBe(201);

    const greeting = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversation.id);
      return list.find((item) => item.kind === "bot") ?? null;
    }, "бот ответил на /start");
    expect(greeting.sender?.isBot).toBe(true);
    expect(greeting.text).toContain("бот поддержки Yargram");
    // Кнопки: «Ошибка», «Идея», «Другое» — плоским списком рядов.
    expect(greeting.keyboard?.flat().map((button) => button.action)).toEqual([
      "cat:error",
      "cat:idea",
      "cat:other",
    ]);

    // Повторный /start приветствие не дублирует: подсказка заменяется, а не копится.
    await send("/start");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const bots = (await messagesOf(harness, user.accessToken, conversation.id)).filter(
      (item) => item.kind === "bot",
    );
    expect(bots).toHaveLength(1);
  });

  it("говорит на языке человека, а не на языке владельца", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    // Клиент сообщает язык при смене настройки — так сервер узнаёт, на каком
    // языке должен отвечать бот.
    const patched = await request(harness.app)
      .patch("/api/users/me")
      .set("Authorization", bearer(user.accessToken))
      .send({ language: "en" });
    expect(patched.status).toBe(200);

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "/start" });

    const greeting = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.kind === "bot") ?? null;
    }, "бот ответил по-английски");
    expect(greeting.text).toContain("support bot");
    expect(greeting.text).not.toContain("Здравствуйте");
    expect(greeting.keyboard?.flat().map((button) => button.label)).toEqual([
      "🐞 Bug",
      "💡 Idea",
      "❓ Other",
    ]);
  });

  it("отвечает на команды: справка вместо обращения", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    const send = (text: string) =>
      request(harness.app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set("Authorization", bearer(user.accessToken))
        .send({ text });

    await send("/help");
    const help = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("Что я умею")) ?? null;
    }, "бот показал справку");
    expect(help.kind).toBe("bot");

    // Незнакомая команда — тоже просьба о помощи, а не обращение владельцам.
    await send("/frobnicate");
    const unknown = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("Такой команды я не знаю")) ?? null;
    }, "бот не понял команду");
    expect(unknown.text).toContain("Что я умею");
    // Владельцам ничего не ушло: служебной группы так и нет.
    expect(await harness.repositories.conversations.findSupportInbox()).toBeNull();
  });

  it("заменяет прошлую подсказку новой, а не копит их в истории", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "/start" });
    await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.some((item) => item.text.includes("бот поддержки Yargram")) ? list : null;
    }, "приветствие с меню");

    await request(harness.app)
      .post("/api/support/actions")
      .set("Authorization", bearer(user.accessToken))
      .send({ conversationId, action: "cat:error" });

    const after = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.some((item) => item.text.includes("Уточните")) ? list : null;
    }, "уточнение по ошибке");

    // Приветствие заменено подсказкой: в истории одно сообщение бота, а не два.
    const bots = after.filter((item) => item.kind === "bot");
    expect(bots).toHaveLength(1);
    expect(bots[0]?.text).toContain("Уточните");
  });

  it("ведёт по меню: ошибка → уточнение → описание → обращение владельцам", async () => {
    const harness = await createHarness();
    const botId = await createBotAccount(harness);
    const owner = await registerUser(harness, "owner@example.test", "Владелец", "owner");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    const press = (action: string) =>
      request(harness.app)
        .post("/api/support/actions")
        .set("Authorization", bearer(user.accessToken))
        .send({ conversationId, action });

    expect((await press("cat:error")).status).toBe(200);
    let messages = await messagesOf(harness, user.accessToken, conversationId);
    expect(messages.at(-1)?.keyboard?.flat().map((button) => button.action)).toEqual([
      "err:code",
      "err:login",
      "err:messages",
      "err:calls",
      "err:other",
      "menu",
    ]);

    expect((await press("err:code")).status).toBe(200);
    messages = await messagesOf(harness, user.accessToken, conversationId);
    expect(messages.at(-1)?.keyboard?.flat().map((button) => button.action)).toEqual(["cancel"]);

    // Описание от человека превращается в обращение.
    const sent = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "Код из письма не приходит уже дважды" });
    expect(sent.status).toBe(201);

    // Бот отвечает не в самом запросе, а в подписке: ждём, как ждал бы клиент.
    const confirmation = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("Передал обращение")) ?? null;
    }, "бот подтвердил обращение");
    expect(confirmation.sender?.isBot).toBe(true);

    // Обращение лежит в служебной группе и знает, кому его вернуть.
    const inbox = await waitFor(
      () => harness.repositories.conversations.findSupportInbox(),
      "появилась служебная группа поддержки",
    );
    expect(inbox.memberIds).toContain(botId);
    expect(inbox.memberIds).toContain(owner.user.id);

    const ticket = await waitFor(async () => {
      const list = await messagesOf(harness, owner.accessToken, inbox.id);
      return list.at(-1) ?? null;
    }, "обращение появилось в служебной группе");
    expect(ticket.sender?.isBot).toBe(true);
    // Номер обращения человек называет, если пишет снова: по нему находится
    // прежнее обращение, а не заводится новое.
    expect(ticket.supportTicket).toMatchObject({
      userId: user.user.id,
      category: "error",
      topic: "code",
    });
    expect(ticket.supportTicket?.code).toMatch(/^[0-9A-F]{4}$/);
    expect(ticket.text).toContain("Пользователь");
    expect(ticket.text).toContain("Код из письма");
    expect(ticket.text).toContain("Код из письма не приходит уже дважды");
  });

  it("возвращает человеку ответ владельца с его именем", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const owner = await registerUser(harness, "owner@example.test", "Василий", "owner");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    await request(harness.app)
      .post("/api/support/actions")
      .set("Authorization", bearer(user.accessToken))
      .send({ conversationId, action: "cat:idea" });
    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "Добавьте тёмную тему в лендинг" });

    const inbox = await waitFor(
      () => harness.repositories.conversations.findSupportInbox(),
      "появилась служебная группа поддержки",
    );
    const ticket = await waitFor(async () => {
      const list = await messagesOf(harness, owner.accessToken, inbox.id);
      return list.at(-1) ?? null;
    }, "обращение появилось в служебной группе");

    // Владелец отвечает именно на сообщение бота — по нему и находится адресат.
    const reply = await request(harness.app)
      .post(`/api/conversations/${inbox.id}/messages`)
      .set("Authorization", bearer(owner.accessToken))
      .send({ text: "Уже в работе, спасибо!", replyToId: ticket.id });
    expect(reply.status).toBe(201);

    const relayed = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("Ответ от")) ?? null;
    }, "ответ владельца дошёл до человека");
    expect(relayed.sender?.isBot).toBe(true);
    expect(relayed.text).toContain("Ответ от Василий");
    expect(relayed.text).toContain("Уже в работе, спасибо!");
  });

  it("не даёт войти в служебный аккаунт бота", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);

    const response = await request(harness.app).post("/api/auth/login").send({
      email: "support@yargram.app",
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe("BOT_ACCOUNT");
  });

  it("прячет бота из поиска и не даёт его заблокировать или пожаловаться", async () => {
    const harness = await createHarness();
    const botId = await createBotAccount(harness);
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const search = await request(harness.app)
      .get("/api/users?q=support")
      .set("Authorization", bearer(user.accessToken));
    expect(search.status).toBe(200);
    expect((search.body.users as { id: string }[]).some((found) => found.id === botId)).toBe(false);

    const blocked = await request(harness.app)
      .put(`/api/users/${botId}/block`)
      .set("Authorization", bearer(user.accessToken));
    expect(blocked.status).toBe(400);
    expect(blocked.body.error?.code).toBe("BOT_NOT_BLOCKABLE");

    const reported = await request(harness.app)
      .post(`/api/users/${botId}/report`)
      .set("Authorization", bearer(user.accessToken))
      .send({ reason: "spam" });
    expect(reported.status).toBe(400);
    expect(reported.body.error?.code).toBe("BOT_NOT_REPORTABLE");
  });

  it("не пускает чужие нажатия кнопок в чужую переписку", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const first = await registerUser(harness, "first@example.test", "Первый", "first");
    const second = await registerUser(harness, "second@example.test", "Второй", "second");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(first.accessToken));
    const conversationId = opened.body.conversation.id as string;

    const foreign = await request(harness.app)
      .post("/api/support/actions")
      .set("Authorization", bearer(second.accessToken))
      .send({ conversationId, action: "menu" });
    expect(foreign.status).toBe(403);
  });

  it("даёт спросить ещё: продолжение уходит тем же обращением", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const owner = await registerUser(harness, "owner@example.test", "Василий", "owner");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "Не приходит код из письма" });

    const inbox = await waitFor(
      () => harness.repositories.conversations.findSupportInbox(),
      "появилась служебная группа поддержки",
    );
    const ticket = await waitFor(async () => {
      const list = await messagesOf(harness, owner.accessToken, inbox.id);
      return list.at(-1) ?? null;
    }, "обращение появилось в служебной группе");
    const code = ticket.supportTicket?.code as string;
    expect(code).toMatch(/^[0-9A-F]{4}$/);

    await request(harness.app)
      .post(`/api/conversations/${inbox.id}/messages`)
      .set("Authorization", bearer(owner.accessToken))
      .send({ text: "Проверьте папку «Спам»", replyToId: ticket.id });

    const relayed = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("Ответ от")) ?? null;
    }, "ответ владельца дошёл до человека");
    // Номер обращения виден человеку: по нему он и говорит о своём обращении.
    expect(relayed.text).toContain(code);

    // 🔥 Кнопка «Спросить ещё» несёт номер и раздел в себе: состояние сервера
    // тут не нужно, поэтому старая кнопка работает и после перезапуска.
    const ask = relayed.keyboard?.flat().find((button) => button.action.startsWith("ask:"));
    expect(ask?.action).toBe(`ask:${code}:other`);

    await request(harness.app)
      .post("/api/support/actions")
      .set("Authorization", bearer(user.accessToken))
      .send({ conversationId, action: ask?.action });

    const prompt = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("уточнить") && item.text.includes(code)) ?? null;
    }, "бот попросил уточнить");
    expect(prompt.kind).toBe("bot");

    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "Спама тоже нет" });

    const followUp = await waitFor(async () => {
      const list = await messagesOf(harness, owner.accessToken, inbox.id);
      return list.find((item) => item.text.includes("Спама тоже нет")) ?? null;
    }, "дополнение дошло до владельцев");
    // Продолжение — то же обращение: номер и раздел не меняются, история цела.
    expect(followUp.supportTicket?.code).toBe(code);
    expect(followUp.supportTicket?.category).toBe("other");

    // Человек получил подтверждение дополнения, а не новое обращение.
    const confirmed = await waitFor(async () => {
      const list = await messagesOf(harness, user.accessToken, conversationId);
      return list.find((item) => item.text.includes("дополнение")) ?? null;
    }, "бот подтвердил дополнение");
    expect(confirmed.text).toContain(code);
  });

  it("уносит владельцам приложенный файл", async () => {
    const harness = await createHarness();
    await createBotAccount(harness);
    const owner = await registerUser(harness, "owner@example.test", "Владелец", "owner");
    await harness.repositories.users.update(owner.user.id, { isOwner: true });
    const user = await registerUser(harness, "user@example.test", "Пользователь", "user");

    const opened = await request(harness.app)
      .get("/api/support")
      .set("Authorization", bearer(user.accessToken));
    const conversationId = opened.body.conversation.id as string;

    const shot = await harness.repositories.attachments.create({
      ownerId: user.user.id,
      kind: "image",
      fileName: "shot.png",
      storedFileName: "stored-shot.png",
      mimeType: "image/png",
      size: 12,
    });

    await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(user.accessToken))
      .send({ text: "Вот снимок экрана", attachmentIds: [shot.id] });

    const inbox = await waitFor(
      () => harness.repositories.conversations.findSupportInbox(),
      "появилась служебная группа поддержки",
    );
    const ticket = await waitFor(async () => {
      const list = await messagesOf(harness, owner.accessToken, inbox.id);
      return list.at(-1) ?? null;
    }, "обращение появилось в служебной группе");
    // Снимок экрана едет вместе с обращением: без него владельцам нечего смотреть.
    expect(ticket.attachments?.map((attachment) => attachment.fileName)).toEqual(["shot.png"]);
  });
});
