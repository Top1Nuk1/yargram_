import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { AtRestCrypto } from "../src/lib/crypto.js";
import { createSocketCorsOptions } from "../src/http/cors.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { RealtimeEvents } from "../src/realtime/events.js";
import { attachSocketServer, releaseSocketServer } from "../src/realtime/socket-server.js";
import { AdminService } from "../src/services/admin-service.js";
import { AuthService, type AuthResult, type EmailCodeChallenge } from "../src/services/auth-service.js";
import { ChatService } from "../src/services/chat-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
import { FriendService } from "../src/services/friend-service.js";
import { GroupService } from "../src/services/group-service.js";
import { ScheduledMessageService } from "../src/services/scheduled-message-service.js";
import { SessionService } from "../src/services/session-service.js";
import { StickerService } from "../src/services/sticker-service.js";
import { SupportBotService } from "../src/services/support-bot-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function tokenResult(result: AuthResult | EmailCodeChallenge): AuthResult {
  if ("status" in result) throw new Error("Expected an access token, got an email code challenge");
  return result;
}

/**
 * 🔥 Регрессия: «Нет realtime-связи» на своём же адресе.
 *
 * `socket.io` передаёт `cors`-настройки в библиотеку `cors` и **отклоняет**
 * хендшейк, если источник не разрешён. Раньше `createSocketCorsOptions` звал
 * `isOriginAllowed` без хоста запроса, поэтому правило «Origin совпал с Host —
 * это свой сайт» не работало: по прямому адресу приложения (`:5173` в разработке
 * или по домену в бою) сокет не подключался никогда, а в интерфейсе горело
 * «Нет realtime-связи». HTTP-часть этим не страдала — там хост передавался.
 */
async function corsHarness(extraOrigins: string[] = []) {
  const directory = await mkdtemp(join(tmpdir(), "yargram-cors-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "socket-cors-test-secret-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
    CORS_ORIGINS: ["http://localhost:5173", ...extraOrigins].join(","),
    // Боевой адрес задан всегда — им же пользуется сервер для ссылок.
    PUBLIC_ORIGIN: "http://yargram.site",
  });
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  const repositories = withEncryption(createJsonRepositories(database), new AtRestCrypto("test-encryption-key-at-least-16"));
  const authService = new AuthService(repositories.users, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: 4,
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
    crypto: new AtRestCrypto("test-encryption-key-at-least-16"),
  });
  const alice = tokenResult(
    await authService.register({ email: "cors@example.test", password: "password123", displayName: "Cors", username: "cors" }),
  );
  // `attachSocketServer` ждёт объект с config/authService/chatService/events —
  // отдаём ровно его, а не весь набор сервисов.
  return { app, config, alice, authService, chatService, events };
}

/**
 * Хендшейк на уровне протокола: сами задаём и `Host`, и `Origin`.
 *
 * 🔥 Только так и можно проверить наш случай. Через `socket.io-client` это не
 * выходит: клиент идёт на `127.0.0.1`, а такой хост `isOriginAllowed` считает
 * локальным и разрешает **всегда** — тест «своего» источника проходил бы даже
 * со сломанным правилом. Подменяем Host на боевой домен, и тогда различия
 * видно.
 */
function rawHandshake(
  port: number,
  host: string,
  origin?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = { Host: host };
    if (origin) headers.Origin = origin;
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/socket.io/?EIO=4&transport=polling", headers },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.end();
  });
}

it("allows the handshake when the site's own Origin matches the request host", async () => {
  const h = await corsHarness();
  const server = createServer(h.app);
  const io = attachSocketServer(server, h);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  cleanups.push(async () => {
    await releaseSocketServer(io);
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // Человек открыл приложение по своему домену: `Origin` равен хосту запроса.
  // До правки такой хендшейк отклонялся, и в интерфейсе горело
  // «Нет realtime-связи».
  const own = await rawHandshake(address.port, "yargram.site", "http://yargram.site");
  expect(own.status).toBe(200);
  expect(own.body.startsWith("0{")).toBe(true);

  // Источник из списка CORS обязан работать и дальше.
  const listed = await rawHandshake(address.port, "yargram.site", "http://localhost:5173");
  expect(listed.status).toBe(200);
  expect(listed.body.startsWith("0{")).toBe(true);

  // Приложение за прокси: хост запроса — внутренний, Origin — публичный домен.
  const behindProxy = await rawHandshake(address.port, "127.0.0.1:3000", "http://yargram.site");
  expect(behindProxy.status).toBe(200);
  expect(behindProxy.body.startsWith("0{")).toBe(true);
});

it("rejects a handshake from a foreign origin", async () => {
  const h = await corsHarness();
  const server = createServer(h.app);
  const io = attachSocketServer(server, h);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  cleanups.push(async () => {
    await releaseSocketServer(io);
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const foreign = await rawHandshake(address.port, "yargram.site", "http://evil.example");
  expect(foreign.status).toBe(400);
  expect(foreign.body.startsWith("0{")).toBe(false);
});

it("keeps the HTTP CORS rule that a matching host is allowed", async () => {
  // Тот же разбор, что использует сервер, — проверяем напрямую, без сокетов.
  const delegate = createSocketCorsOptions(["http://localhost:5173"]);
  const call = (headers: Record<string, string>) =>
    new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      delegate({ headers }, (error, options) => resolve({ error, allow: options?.origin === true }));
    });

  expect(await call({ origin: "http://yargram.site", host: "yargram.site" })).toMatchObject({ error: null });
  expect(await call({ origin: "http://localhost:5173", host: "yargram.site" })).toMatchObject({ error: null });
  expect(await call({ host: "yargram.site" })).toMatchObject({ error: null });
  expect((await call({ origin: "http://evil.example", host: "yargram.site" })).error).toBeInstanceOf(Error);
});
