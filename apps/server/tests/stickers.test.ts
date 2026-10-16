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
import { STICKER_PACK_LIMIT, StickerService } from "../src/services/sticker-service.js";
import { SupportBotService } from "../src/services/support-bot-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

/**
 * Стикеры, наборы и гифки: предел набора, отправка стикера, отправка набора
 * и то, что получатель видит набор у себя.
 *
 * 🔥 Проверяем через HTTP тем же способом, что и остальные маршруты: сервис
 * стикеров почти весь состоит из проверок прав, а права живут именно в
 * маршрутах (чужой набор, набор без установки, лимит).
 */

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const TEST_PASSWORD = "correct horse battery staple";

async function createHarness() {
  const directory = await mkdtemp(join(tmpdir(), "yargram-stickers-"));
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
  return { app, repositories, chatService };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function register(harness: Harness, email: string, displayName: string, username: string) {
  const response = await request(harness.app).post("/api/auth/register").send({
    email,
    password: TEST_PASSWORD,
    displayName,
    username,
  });
  expect(response.status).toBe(201);
  return response.body as { accessToken: string; user: { id: string } };
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

/** Настоящий PNG размером 1×1 — иначе сервер отверг бы файл по подписи. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Настоящий GIF размером 1×1: сервер смотрит сигнатуру файла, а не расширение,
 * поэтому «переименованный PNG» в гифку не примет — и правильно.
 */
const GIF_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** Загрузить файл и вернуть id вложения. */
async function uploadSticker(harness: Harness, token: string, name = "sticker.png") {
  const response = await request(harness.app)
    .post("/api/uploads?kind=sticker")
    .set("Authorization", bearer(token))
    .attach("file", PNG_BYTES, { filename: name, contentType: "image/png" });
  expect(response.status, response.text).toBe(201);
  return (response.body.attachment as { id: string }).id;
}

async function createPack(harness: Harness, token: string, title: string) {
  const response = await request(harness.app)
    .post("/api/sticker-packs")
    .set("Authorization", bearer(token))
    .send({ title, emoji: "🙂" });
  expect(response.status).toBe(201);
  return response.body.pack as { id: string; stickers: unknown[] };
}

async function addSticker(harness: Harness, token: string, packId: string) {
  const attachmentId = await uploadSticker(harness, token);
  const response = await request(harness.app)
    .post(`/api/sticker-packs/${packId}/stickers`)
    .set("Authorization", bearer(token))
    .send({ attachmentId });
  expect(response.status, response.text).toBe(201);
  return response.body.pack as { id: string; stickers: { id: string; url: string }[] };
}

/** Прямой разговор между двумя людьми: по нему и шлём набор. */
async function directConversation(harness: Harness, token: string, peerId: string) {
  const response = await request(harness.app)
    .post("/api/conversations/direct")
    .set("Authorization", bearer(token))
    .send({ userId: peerId });
  expect(response.status, response.text).toBe(201);
  return (response.body.conversation as { id: string }).id;
}

describe("Стикеры и наборы", () => {
  it("у нового аккаунта сразу есть встроенные наборы, и они не пустые", async () => {
    const harness = await createHarness();
    const user = await register(harness, "one@example.test", "Первый", "one");

    const response = await request(harness.app)
      .get("/api/sticker-packs")
      .set("Authorization", bearer(user.accessToken));
    expect(response.status).toBe(200);

    const packs = response.body.packs as { id: string; builtin: boolean; stickers: { url: string }[] }[];
    expect(packs.length).toBeGreaterThanOrEqual(2);
    expect(packs.every((pack) => pack.builtin)).toBe(true);
    // 🔥 У встроенных картинок нет подписи: они лежат в сборке приложения.
    // Адрес обязан начинаться с `/app/stickers/`, иначе браузер их не найдёт.
    for (const pack of packs) {
      expect(pack.stickers.length).toBeGreaterThan(0);
      for (const sticker of pack.stickers) {
        expect(sticker.url).toMatch(/^\/app\/stickers\//);
      }
    }
  });

  it("встроенным набором нельзя управлять: он не чужой и не свой", async () => {
    const harness = await createHarness();
    const user = await register(harness, "one@example.test", "Первый", "one");
    const packs = await request(harness.app)
      .get("/api/sticker-packs")
      .set("Authorization", bearer(user.accessToken));
    const builtin = (packs.body.packs as { id: string }[])[0];
    expect(builtin).toBeDefined();
    const builtinId = builtin?.id ?? "";

    const renamed = await request(harness.app)
      .patch(`/api/sticker-packs/${builtinId}`)
      .set("Authorization", bearer(user.accessToken))
      .send({ title: "Моё" });
    expect(renamed.status).toBe(403);
    expect(renamed.body).toMatchObject({ error: { code: "STICKER_PACK_READONLY" } });

    const removed = await request(harness.app)
      .delete(`/api/sticker-packs/${builtinId}`)
      .set("Authorization", bearer(user.accessToken));
    expect(removed.status).toBe(403);
    expect(removed.body).toMatchObject({ error: { code: "STICKER_PACK_READONLY" } });
  });

  it("свой набор создаётся, пополняется и удаляется вместе со стикерами", async () => {
    const harness = await createHarness();
    const user = await register(harness, "one@example.test", "Первый", "one");

    const pack = await createPack(harness, user.accessToken, "Мои знаки");
    expect(pack.stickers).toHaveLength(0);

    const filled = await addSticker(harness, user.accessToken, pack.id);
    expect(filled.stickers).toHaveLength(1);
    // Подписанный адрес ведёт к загруженному файлу, а не к сборке.
    expect(filled.stickers[0]?.url).toContain("/api/uploads/");

    const removed = await request(harness.app)
      .delete(`/api/sticker-packs/${pack.id}/stickers/${filled.stickers[0]?.id}`)
      .set("Authorization", bearer(user.accessToken));
    expect(removed.status).toBe(200);
    expect((removed.body.pack as { stickers: unknown[] }).stickers).toHaveLength(0);

    const deleted = await request(harness.app)
      .delete(`/api/sticker-packs/${pack.id}`)
      .set("Authorization", bearer(user.accessToken));
    expect(deleted.status).toBe(204);

    const packs = await request(harness.app)
      .get("/api/sticker-packs")
      .set("Authorization", bearer(user.accessToken));
    expect((packs.body.packs as { id: string }[]).some((item) => item.id === pack.id)).toBe(false);
  });

  it("на чужой набор нельзя ни посмотреть, ни положить в него стикер", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");
    const pack = await createPack(harness, first.accessToken, "Чужой");

    // Чужой набор не виден вовсе: 404, а не 403 — иначе по ответу можно было
    // бы перебором узнать, какие наборы вообще существуют.
    const read = await request(harness.app)
      .get(`/api/sticker-packs/${pack.id}`)
      .set("Authorization", bearer(second.accessToken));
    expect(read.status).toBe(404);

    const attachmentId = await uploadSticker(harness, second.accessToken);
    const write = await request(harness.app)
      .post(`/api/sticker-packs/${pack.id}/stickers`)
      .set("Authorization", bearer(second.accessToken))
      .send({ attachmentId });
    expect(write.status).toBe(404);
  });

  it("стикер уходит в сообщение и приезжает обратно с готовым адресом", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");
    const conversationId = await directConversation(harness, first.accessToken, second.user.id);

    const packs = await request(harness.app)
      .get("/api/sticker-packs")
      .set("Authorization", bearer(first.accessToken));
    const builtinSticker = (packs.body.packs[0] as { stickers: { id: string }[] }).stickers[0];
    expect(builtinSticker).toBeDefined();

    const sent = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(first.accessToken))
      .send({ stickerIds: [builtinSticker?.id] });
    expect(sent.status, sent.text).toBe(201);

    // 🔥 Сообщение хранит id, а не адрес: подпись на файл недолговечна, и в
    // истории она рано или поздно перестала бы работать. Поэтому адрес
    // пересобирается при каждой отдаче.
    const message = sent.body.message as {
      stickers?: { id: string; url: string }[];
      attachments?: unknown[];
    };
    expect(message.stickers).toHaveLength(1);
    expect(message.stickers?.[0]?.url).toMatch(/^\/app\/stickers\//);
    // Стикер не вложение: файла у него нет и быть не должно.
    expect(message.attachments ?? []).toHaveLength(0);

    const history = await request(harness.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(second.accessToken));
    const received = (history.body.messages as MessageView[])[0];
    expect(received?.stickers?.[0]?.url).toMatch(/^\/app\/stickers\//);
  });

  it("свой стикер долетает до другого человека, и адрес у него живой", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");
    const conversationId = await directConversation(harness, first.accessToken, second.user.id);

    const pack = await createPack(harness, first.accessToken, "Мои");
    const filled = await addSticker(harness, first.accessToken, pack.id);
    const stickerId = filled.stickers[0]?.id;

    const sent = await request(harness.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set("Authorization", bearer(first.accessToken))
      .send({ stickerIds: [stickerId] });
    expect(sent.status, sent.text).toBe(201);

    // Адрес у получателя должен открываться: подпись выдана под его сеанс.
    const url = (sent.body.message as { stickers: { url: string }[] }).stickers[0]?.url;
    expect(url).toBeTruthy();
    const file = await request(harness.app)
      .get(url as string)
      .set("Authorization", bearer(second.accessToken));
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("image/png");
  });

  it("присланный набор появляется у получателя и обновляется сам", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");
    const conversationId = await directConversation(harness, first.accessToken, second.user.id);
    const pack = await createPack(harness, first.accessToken, "Мои знаки");
    await addSticker(harness, first.accessToken, pack.id);

    const shared = await request(harness.app)
      .post(`/api/sticker-packs/${pack.id}/share`)
      .set("Authorization", bearer(first.accessToken))
      .send({ conversationId });
    expect(shared.status, shared.text).toBe(201);
    // Сообщение без текста и файлов: только карточка набора.
    const message = shared.body.message as { text: string; stickerPackId?: string; attachments?: unknown[] };
    expect(message.stickerPackId).toBe(pack.id);
    expect(message.text).toBe("");
    expect(message.attachments ?? []).toHaveLength(0);

    const packsOfSecond = await request(harness.app)
      .get("/api/sticker-packs")
      .set("Authorization", bearer(second.accessToken));
    const sharedPack = (packsOfSecond.body.packs as { id: string; mine: boolean }[]).find(
      (item) => item.id === pack.id,
    );
    expect(sharedPack).toBeDefined();
    // Чужой набор не свой: его нельзя править, только убрать.
    expect(sharedPack?.mine).toBe(false);

    // 🔥 Автообновление: автор добавил стикер — у получателя появляется новый,
    // без всяких его действий. Источник истины — установка, а не копия.
    const before = await request(harness.app)
      .get(`/api/sticker-packs/${pack.id}`)
      .set("Authorization", bearer(second.accessToken));
    const versionBefore = (before.body.pack as { version: number }).version;

    await addSticker(harness, first.accessToken, pack.id);

    const after = await request(harness.app)
      .get(`/api/sticker-packs/${pack.id}`)
      .set("Authorization", bearer(second.accessToken));
    const updated = after.body.pack as { version: number; stickers: unknown[] };
    expect(updated.version).toBeGreaterThan(versionBefore);
    expect(updated.stickers).toHaveLength(2);
  });

  it("набор можно убрать и вернуть из переписки", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");
    const conversationId = await directConversation(harness, first.accessToken, second.user.id);
    const pack = await createPack(harness, first.accessToken, "Мои знаки");
    await addSticker(harness, first.accessToken, pack.id);
    await request(harness.app)
      .post(`/api/sticker-packs/${pack.id}/share`)
      .set("Authorization", bearer(first.accessToken))
      .send({ conversationId });

    const uninstall = await request(harness.app)
      .delete(`/api/sticker-packs/${pack.id}/install`)
      .set("Authorization", bearer(second.accessToken));
    expect(uninstall.status).toBe(204);

    // После удаления установки чужой набор не должен быть виден вовсе:
    // иначе человек видел бы его в пикере, но не мог бы отправить.
    const hidden = await request(harness.app)
      .get(`/api/sticker-packs/${pack.id}`)
      .set("Authorization", bearer(second.accessToken));
    expect(hidden.status).toBe(404);

    const reinstall = await request(harness.app)
      .post(`/api/sticker-packs/${pack.id}/install`)
      .set("Authorization", bearer(second.accessToken));
    // 200, а не 201: набор мог остаться в другом чате, и повторная установка
    // ничего не создаёт. Клиенту важен факт «набор снова доступен».
    expect(reinstall.status).toBe(200);
    expect((reinstall.body.pack as { id: string }).id).toBe(pack.id);
  });

  it("в наборе не больше 200 стикеров — и сервер это проверяет", async () => {
    const harness = await createHarness();
    const user = await register(harness, "one@example.test", "Первый", "one");
    const pack = await createPack(harness, user.accessToken, "Большой");

    // 🔥 Предел обещан в интерфейсе, поэтому он же ограничивает приём на
    // сервере. Заполняем набор напрямую: через HTTP это 200 запросов и
    // 200 загрузок, а проверяем тут ровно то правило.
    const { stickers } = harness.repositories;
    await Promise.all(
      Array.from({ length: STICKER_PACK_LIMIT }, async (_value, index) => {
        const attachment = await harness.repositories.attachments.create({
          ownerId: user.user.id,
          kind: "sticker",
          fileName: `s${index}.png`,
          // 🔥 `storedFileName` обязателен: JSON-драйвер проверяет состояние
          // Zod-схемой и без него роняет транзакцию. Имя файла на диске
          // сервер придумывает сам, поэтому тут оно произвольное.
          storedFileName: `s${index}.bin`,
          mimeType: "image/png",
          size: PNG_BYTES.byteLength,
        });
        await stickers.create({
          packId: pack.id,
          attachmentId: attachment.id,
          emoji: "🙂",
          animated: false,
        });
      }),
    );
    expect(await stickers.countForPack(pack.id)).toBe(STICKER_PACK_LIMIT);

    const attachmentId = await uploadSticker(harness, user.accessToken);
    const overflow = await request(harness.app)
      .post(`/api/sticker-packs/${pack.id}/stickers`)
      .set("Authorization", bearer(user.accessToken))
      .send({ attachmentId });
    // 409, а не 400: это не «запрос неправильный», а «сервер не примет» —
    // клиенту нужно отличить одно от другого, чтобы не путать с чужим файлом.
    expect(overflow.status).toBe(409);
    expect(overflow.body).toMatchObject({ error: { code: "STICKER_PACK_FULL" } });
  });

  it("набор без стикеров прислать нельзя: в переписке было бы пустое сообщение", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");
    const conversationId = await directConversation(harness, first.accessToken, second.user.id);
    const pack = await createPack(harness, first.accessToken, "Пустой");

    const shared = await request(harness.app)
      .post(`/api/sticker-packs/${pack.id}/share`)
      .set("Authorization", bearer(first.accessToken))
      .send({ conversationId });
    expect(shared.status).toBe(400);
  });

  it("список гифок отдаёт только то, что человек загрузил сам", async () => {
    const harness = await createHarness();
    const first = await register(harness, "one@example.test", "Первый", "one");
    const second = await register(harness, "two@example.test", "Второй", "two");

    const uploaded = await request(harness.app)
      .post("/api/uploads?kind=gif")
      .set("Authorization", bearer(first.accessToken))
      .attach("file", GIF_BYTES, { filename: "loop.gif", contentType: "image/gif" });
    expect(uploaded.status, uploaded.text).toBe(201);
    expect((uploaded.body.attachment as { kind: string }).kind).toBe("gif");

    const mine = await request(harness.app)
      .get("/api/gifs")
      .set("Authorization", bearer(first.accessToken));
    expect((mine.body.gifs as unknown[]).length).toBe(1);

    const theirs = await request(harness.app)
      .get("/api/gifs")
      .set("Authorization", bearer(second.accessToken));
    expect((theirs.body.gifs as unknown[]).length).toBe(0);
  });

  it("видео-гифка грузится, а mediaKind=gif не принимается для других видов", async () => {
    const harness = await createHarness();
    const user = await register(harness, "one@example.test", "Первый", "one");
    // Мини-контейнер с сигнатурой MP4: сервер проверяет не только заголовок,
    // но и содержимое — переименованный PNG гифкой не примет.
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypmp42"),
      Buffer.alloc(64),
    ]);

    const uploaded = await request(harness.app)
      .post("/api/uploads?kind=gif&mediaKind=gif")
      .set("Authorization", bearer(user.accessToken))
      .attach("file", mp4, { filename: "clip.mp4", contentType: "video/mp4" });
    expect(uploaded.status, uploaded.text).toBe(201);
    const attachment = uploaded.body.attachment as { kind: string; mimeType: string; mediaKind: string };
    // 🔥 Видео-гифка остаётся гифкой (`kind=gif`), но mime — видео: по нему
    // клиент понимает, что показывать её надо через `<video>`, а не `<img>`.
    expect(attachment.kind).toBe("gif");
    expect(attachment.mimeType).toBe("video/mp4");
    expect(attachment.mediaKind).toBe("gif");

    const library = await request(harness.app)
      .get("/api/gifs")
      .set("Authorization", bearer(user.accessToken));
    expect(library.body.gifs as unknown[]).toHaveLength(1);

    // Пометить гифкой обычную картинку нельзя: `mediaKind` описывает способ
    // показа, а не вид файла, иначе фотография играла бы как видео.
    const wrongKind = await request(harness.app)
      .post("/api/uploads?kind=image&mediaKind=gif")
      .set("Authorization", bearer(user.accessToken))
      .attach("file", PNG_BYTES, { filename: "photo.png", contentType: "image/png" });
    expect(wrongKind.status).toBe(400);
  });
});