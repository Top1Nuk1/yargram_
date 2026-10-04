import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { AtRestCrypto } from "../src/lib/crypto.js";
import { describeUserAgent, siteFrom } from "../src/lib/session-context.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { withEncryption } from "../src/repositories/encrypted-repositories.js";
import { RealtimeEvents } from "../src/realtime/events.js";
import { AdminService } from "../src/services/admin-service.js";
import { AuthService, type AuthResult } from "../src/services/auth-service.js";
import { ChatService } from "../src/services/chat-service.js";
import { DraftService } from "../src/services/draft-service.js";
import { FolderService } from "../src/services/folder-service.js";
import { FriendService } from "../src/services/friend-service.js";
import { GroupService } from "../src/services/group-service.js";
import { ScheduledMessageService } from "../src/services/scheduled-message-service.js";
import { canTerminateOthers, SessionService } from "../src/services/session-service.js";
import { SupportBotService } from "../src/services/support-bot-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const HOME = { site: "https://yargram.test", device: "Chrome, Windows" };
const MIRROR = { site: "https://mirror.test", device: "Firefox, Linux" };

async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "yargram-sessions-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "sessions-test-secret-that-is-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
  });
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  const crypto = new AtRestCrypto("test-encryption-key-at-least-16");
  const repositories = withEncryption(createJsonRepositories(database), crypto);
  const events = new RealtimeEvents();
  const authService = new AuthService(repositories.users, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: config.bcryptRounds,
    sessions: repositories.sessions,
  });
  const chatService = new ChatService(repositories);
  const adminService = new AdminService(repositories, events);
  const groupService = new GroupService(repositories, events, chatService);
  const draftService = new DraftService(repositories, chatService, events);
  const folderService = new FolderService(repositories, chatService, events);
  const scheduledMessageService = new ScheduledMessageService(repositories, chatService, events);
  const friendService = new FriendService(repositories, events);
  const sessionService = new SessionService(repositories.sessions, repositories.users, events);
  const supportBotService = new SupportBotService(repositories, chatService, events);
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
    events,
    crypto,
  });
  return { app, repositories, authService, sessionService, events };
}

async function signUp(
  authService: AuthService,
  email: string,
  context?: typeof HOME,
): Promise<AuthResult> {
  const username = email.split("@")[0] as string;
  const result = await authService.register(
    { email, password: "password123", displayName: "Вася", username },
    context,
  );
  if ("status" in result) throw new Error("Email confirmation unexpectedly required");
  return result;
}

describe("активные сеансы", () => {
  it("вход с незнакомого сайта помечается и подтверждается владельцем", async () => {
    const { authService, sessionService } = await harness();
    const home = await signUp(authService, "vasya@example.test", HOME);
    const mirror = await authService.login("vasya@example.test", "password123", MIRROR);
    if ("status" in mirror) throw new Error("Email confirmation unexpectedly required");

    // Первый вход в аккаунт — не «новое устройство»: сравнивать ещё не с чем.
    const first = await sessionService.overview(home.user.id, home.accessToken);
    expect(first.alert).toBeNull();

    const overview = await sessionService.overview(home.user.id, mirror.accessToken);
    expect(overview.sessions).toHaveLength(2);
    expect(overview.alert?.site).toBe(MIRROR.site);
    expect(overview.currentSessionId).toBeTruthy();

    const acknowledged = await sessionService.acknowledge(
      home.user.id,
      overview.currentSessionId as string,
      mirror.accessToken,
    );
    expect(acknowledged.alert).toBeNull();
  });

  it("повторный вход с того же сайта не плодит сеансы", async () => {
    const { authService, sessionService } = await harness();
    const first = await signUp(authService, "vasya@example.test", HOME);
    const second = await authService.login("vasya@example.test", "password123", HOME);
    if ("status" in second) throw new Error("Email confirmation unexpectedly required");

    const overview = await sessionService.overview(first.user.id, second.accessToken);
    expect(overview.sessions).toHaveLength(1);
    expect(overview.alert).toBeNull();
    // Оба токена принадлежат одному сеансу, поэтому оба продолжают работать.
    await expect(authService.authenticateToken(first.accessToken)).resolves.toBe(first.user.id);
    await expect(authService.authenticateToken(second.accessToken)).resolves.toBe(first.user.id);
  });

  it("чужой сеанс нельзя завершить раньше суток после входа", async () => {
    const { authService, sessionService, repositories } = await harness();
    const home = await signUp(authService, "vasya@example.test", HOME);
    const mirror = await authService.login("vasya@example.test", "password123", MIRROR);
    if ("status" in mirror) throw new Error("Email confirmation unexpectedly required");

    const overview = await sessionService.overview(home.user.id, mirror.accessToken);
    const homeSessionId = overview.sessions.find((session) => !session.current)?.id as string;

    await expect(
      sessionService.terminate(home.user.id, mirror.accessToken, homeSessionId),
    ).rejects.toMatchObject({ code: "SESSION_TOO_NEW" });

    // Сутки прошли — право появилось.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 25 * 3_600_000);
    await expect(
      sessionService.terminate(home.user.id, mirror.accessToken, homeSessionId),
    ).resolves.toMatchObject({ sessions: [{ current: true }] });
    vi.useRealTimers();
    expect(await repositories.sessions.findById(homeSessionId)).toMatchObject({
      terminatedAt: expect.any(String),
    });
  });

  it("завершённый сеанс перестаёт пускать, а свой закрыть можно сразу", async () => {
    const { authService, sessionService } = await harness();
    const home = await signUp(authService, "vasya@example.test", HOME);
    const mirror = await authService.login("vasya@example.test", "password123", MIRROR);
    if ("status" in mirror) throw new Error("Email confirmation unexpectedly required");

    const overview = await sessionService.overview(home.user.id, mirror.accessToken);
    await sessionService.terminate(home.user.id, mirror.accessToken, overview.currentSessionId as string);

    await expect(authService.authenticateToken(mirror.accessToken, MIRROR)).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
    // Домашний сеанс жив: посторонний вход закрыт, владелец остался внутри.
    await expect(authService.authenticateToken(home.accessToken, HOME)).resolves.toBe(home.user.id);
  });

  it("автозавершение закрывает сеанс, которым давно не пользовались", async () => {
    const { authService, repositories } = await harness();
    const home = await signUp(authService, "vasya@example.test", HOME);
    await repositories.users.update(home.user.id, { sessionAutoTerminateDays: 1 });

    const stale = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const stored = (await repositories.sessions.listForUser(home.user.id))[0];
    await repositories.sessions.update(stored?.id as string, { lastSeenAt: stale });

    await expect(authService.authenticateToken(home.accessToken, HOME)).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
  });

  it("токен, выданный до появления сеансов, принимается и получает запись", async () => {
    const { authService, sessionService } = await harness();
    // Регистрация без контекста — как было до появления сеансов.
    const home = await signUp(authService, "vasya@example.test");

    await expect(authService.authenticateToken(home.accessToken, HOME)).resolves.toBe(home.user.id);
    const overview = await sessionService.overview(home.user.id, home.accessToken);
    expect(overview.sessions).toHaveLength(1);
    expect(overview.sessions[0]).toMatchObject({ site: HOME.site, device: HOME.device, current: true });
  });

  it("отдаёт список сеансов по HTTP и запрещает закрывать чужие раньше срока", async () => {
    const { app, authService } = await harness();
    const home = await signUp(authService, "vasya@example.test", HOME);
    const mirror = await authService.login("vasya@example.test", "password123", MIRROR);
    if ("status" in mirror) throw new Error("Email confirmation unexpectedly required");

    const list = await request(app)
      .get("/api/sessions")
      .set("Authorization", `Bearer ${mirror.accessToken}`)
      .expect(200);
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.canTerminateOthers).toBe(false);
    expect(list.body.alert.site).toBe(MIRROR.site);

    const homeSessionId = list.body.sessions.find(
      (session: { current: boolean; id: string }) => !session.current,
    ).id as string;
    await request(app)
      .delete(`/api/sessions/${homeSessionId}`)
      .set("Authorization", `Bearer ${mirror.accessToken}`)
      .expect(403);

    // Свой сеанс закрыть можно всегда — этим и спасаются от чужого входа.
    await request(app)
      .delete(`/api/sessions/${list.body.currentSessionId}`)
      .set("Authorization", `Bearer ${mirror.accessToken}`)
      .expect(200);
    await request(app)
      .get("/api/sessions")
      .set("Authorization", `Bearer ${mirror.accessToken}`)
      .expect(401);
    await request(app).get("/api/sessions").set("Authorization", `Bearer ${home.accessToken}`).expect(200);
  });

  it("сохраняет срок автозавершения в профиле", async () => {
    const { app, authService } = await harness();
    const home = await signUp(authService, "vasya@example.test", HOME);

    const updated = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${home.accessToken}`)
      .send({ sessionAutoTerminateDays: 30 })
      .expect(200);
    expect(updated.body.user.sessionAutoTerminateDays).toBe(30);

    const cleared = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${home.accessToken}`)
      .send({ sessionAutoTerminateDays: null })
      .expect(200);
    expect(cleared.body.user.sessionAutoTerminateDays).toBeNull();
  });
});

describe("сайт и браузер запроса", () => {
  it("достаёт сайт из origin, referer или хоста", () => {
    expect(siteFrom("https://yargram.test/", undefined, undefined)).toBe("https://yargram.test");
    expect(siteFrom(undefined, "https://mirror.test/chats", undefined)).toBe("https://mirror.test");
    expect(siteFrom(undefined, undefined, "26.53.76.128:3000", "http")).toBe("http://26.53.76.128:3000");
    expect(siteFrom(undefined, undefined, undefined)).toBe("");
  });

  it("опознаёт браузер и систему, а хrome не путает с Safari", () => {
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
    expect(describeUserAgent(chrome)).toBe("Chrome, Windows");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1")).toBe("Safari, iOS");
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")).toBe("Firefox, Linux");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Edg/126.0 Chrome/126.0 Safari/537.36")).toBe("Edge, Windows");
    expect(describeUserAgent(undefined)).toBe("");
  });

  it("право завершать чужие сеансы появляется через сутки", () => {
    const session = { createdAt: new Date().toISOString() } as never;
    expect(canTerminateOthers(session)).toBe(false);
    expect(canTerminateOthers({ createdAt: new Date(Date.now() - 86_400_000).toISOString() } as never)).toBe(true);
  });
});
