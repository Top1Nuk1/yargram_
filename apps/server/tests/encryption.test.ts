import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { AtRestCrypto, ENCRYPTION_OVERHEAD, isEncrypted } from "../src/lib/crypto.js";
import { mediaUrlFor } from "../src/lib/media-links.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { UploadService } from "../src/services/upload-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

const KEY = "test-encryption-key-at-least-16";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function harness(seedState?: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "yargram-encryption-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "encryption-test-secret-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
  });
  if (seedState !== undefined) {
    await writeFile(config.dataFile, JSON.stringify(seedState, null, 2) + "\n", "utf8");
  }
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  const crypto = new AtRestCrypto(KEY);
  const plain = createJsonRepositories(database);
  const repositories = withEncryption(plain, crypto);
  const user = await repositories.users.create({
    email: "alice@example.test",
    passwordHash: "not-used",
    displayName: "Alice",
    username: "alice",
  });
  return { config, database, crypto, plain, repositories, user };
}

function mediaToken(url: string): string {
  const token = new URL(url, "http://localhost").searchParams.get("t");
  if (!token) throw new Error("Media link is missing its token");
  return token;
}

async function onDiskText(dataFile: string): Promise<string> {
  const state = JSON.parse(await readFile(dataFile, "utf8")) as {
    messages: Array<{ text: string }>;
  };
  return state.messages[0]?.text ?? "";
}

describe("AtRestCrypto", () => {
  it("возвращает текст после кругового пути и прячет его в шифротексте", () => {
    const crypto = new AtRestCrypto(KEY);
    const stored = crypto.encryptText("Секретное сообщение");
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("Секретное");
    expect(crypto.decryptText(stored)).toBe("Секретное сообщение");
  });

  it("не трогает пустой текст и читает данные, записанные до шифрования", () => {
    const crypto = new AtRestCrypto(KEY);
    expect(crypto.encryptText("")).toBe("");
    expect(crypto.decryptText("Обычный старый текст")).toBe("Обычный старый текст");
  });

  it("не расшифровывает чужим ключом, а отдаёт данные как есть", () => {
    const stored = new AtRestCrypto(KEY).encryptText("Привет");
    const other = new AtRestCrypto("another-encryption-key-16");
    expect(other.decryptText(stored)).toBe(stored);
  });

  it("шифрует буферы с предсказуемым служебным заголовком", () => {
    const crypto = new AtRestCrypto(KEY);
    const bytes = Buffer.from("Yargram attachment");
    const stored = crypto.encryptBuffer(bytes);
    expect(stored.length).toBe(bytes.length + ENCRYPTION_OVERHEAD);
    expect(stored.toString("utf8")).not.toContain("Yargram attachment");
    expect(crypto.decryptBuffer(stored).equals(bytes)).toBe(true);
    // Файл из старой версии без префикса читается как есть
    expect(crypto.decryptBuffer(Buffer.from("legacy")).toString("utf8")).toBe("legacy");
  });
});

describe("withEncryption", () => {
  it("кладёт сообщения в базу зашифрованными, но отдаёт открытый текст", async () => {
    const { config, repositories } = await harness();
    const created = await repositories.messages.create({
      conversationId: "11111111-1111-4111-8111-111111111111",
      senderId: "22222222-2222-4222-8222-222222222222",
      text: "Секретное сообщение",
    });
    const stored = await onDiskText(config.dataFile);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("Секретное");

    await expect(repositories.messages.findById(created.id)).resolves.toMatchObject({
      text: "Секретное сообщение",
    });
  });

  it("продолжает искать по сообщениям после шифрования", async () => {
    const { repositories } = await harness();
    const conversationId = "11111111-1111-4111-8111-111111111111";
    for (const text of ["Привет", "Секретное слово", "Ещё одно"]) {
      await repositories.messages.create({ conversationId, senderId: "s", text });
    }
    const found = await repositories.messages.listForConversation(conversationId, {
      limit: 50,
      query: "секретное",
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toBe("Секретное слово");
  });

  it("сохраняет правки зашифрованными", async () => {
    const { config, repositories } = await harness();
    const created = await repositories.messages.create({
      conversationId: "c",
      senderId: "s",
      text: "Черновик",
    });
    const updated = await repositories.messages.updateText(created.id, "Отредактировано");
    expect(updated.text).toBe("Отредактировано");
    expect(await onDiskText(config.dataFile)).not.toContain("Отредактировано");
  });

  it("читает сообщения, записанные до включения шифрования", async () => {
    const { repositories, plain, user } = await harness();
    const legacy = await plain.messages.create({
      conversationId: "c",
      senderId: user.id,
      text: "Старый открытый текст",
    });
    await expect(repositories.messages.findById(legacy.id)).resolves.toMatchObject({
      text: "Старый открытый текст",
    });
  });

  it("шифрует черновики и отложенные сообщения", async () => {
    const { repositories, plain, user } = await harness();
    await repositories.drafts.save({
      userId: user.id,
      conversationId: "11111111-1111-4111-8111-111111111111",
      text: "Черновик ответа",
      attachmentIds: [],
    });
    await expect(
      repositories.drafts.find(user.id, "11111111-1111-4111-8111-111111111111"),
    ).resolves.toMatchObject({ text: "Черновик ответа" });
    // А в базе лежит шифротекст
    const rawDraft = await plain.drafts.find(user.id, "11111111-1111-4111-8111-111111111111");
    expect(isEncrypted(rawDraft?.text)).toBe(true);

    const scheduled = await repositories.scheduledMessages.create({
      userId: user.id,
      conversationId: "11111111-1111-4111-8111-111111111111",
      text: "Отправлю позже",
      attachmentIds: [],
      sendAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(repositories.scheduledMessages.findById(scheduled.id)).resolves.toMatchObject({
      text: "Отправлю позже",
    });
    const rawScheduled = await plain.scheduledMessages.findById(scheduled.id);
    expect(isEncrypted(rawScheduled?.text)).toBe(true);
  });
});

describe("UploadService", () => {
  async function uploadHarness() {
    const context = await harness();
    const uploadService = new UploadService(
      context.repositories,
      context.config.uploadDirectory,
      async () => true,
      context.crypto,
    );
    return { ...context, uploadService };
  }

  it("кладёт файл на диск зашифрованным и отдаёт исходные байты по ссылке", async () => {
    const { uploadService, user } = await uploadHarness();
    const data = Buffer.from("YARGRAM-SECRET-FILE-CONTENT");
    const attachment = await uploadService.upload(user.id, "file", {
      fileName: "secret.txt",
      mimeType: "text/plain",
      data,
    });
    const { filePath } = await uploadService.getStoredFile(attachment.id);
    const stored = await readFile(filePath);
    expect(stored.length).toBe(data.length + ENCRYPTION_OVERHEAD);
    expect(stored.toString("utf8")).not.toContain("YARGRAM-SECRET-FILE-CONTENT");

    const link = mediaUrlFor(attachment.id, user.id);
    const { bytes } = await uploadService.readAuthorizedFile(
      attachment.id,
      mediaToken(link),
    );
    expect(bytes.equals(data)).toBe(true);
  });

  it("отдаёт файлы, загруженные до включения шифрования", async () => {
    const { uploadService, user } = await uploadHarness();
    const data = Buffer.from("LEGACY-PLAINTEXT-FILE");
    const attachment = await uploadService.upload(user.id, "file", {
      fileName: "legacy.txt",
      mimeType: "text/plain",
      data,
    });
    const { filePath } = await uploadService.getStoredFile(attachment.id);
    await writeFile(filePath, data);

    const { bytes } = await uploadService.readAuthorizedFile(
      attachment.id,
      mediaToken(mediaUrlFor(attachment.id, user.id)),
    );
    expect(bytes.equals(data)).toBe(true);
  });
});
