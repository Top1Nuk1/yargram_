import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { EmailCodePurpose } from "../src/domain/models.js";
import { createJsonRepositories } from "../src/repositories/json-repositories.js";
import { AuthService, type AuthResult, type EmailCodeChallenge } from "../src/services/auth-service.js";
import { RegistrationCleanupService } from "../src/services/registration-cleanup-service.js";
import type { MailService } from "../src/services/mail-service.js";
import { JsonDatabase } from "../src/storage/json-database.js";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

/** Почта, которая ничего не отправляет, а складывает коды в массив. */
function fakeMailbox() {
  const sent: Array<{ to: string; code: string; purpose: EmailCodePurpose; rotate?: boolean }> = [];
  const mail = {
    send: async () => {},
    sendCode: async (input: {
      to: string;
      code: string;
      purpose: EmailCodePurpose;
      rotate?: boolean;
    }) => {
      sent.push(input);
    },
  } as unknown as MailService;
  return { mail, sent };
}

async function harness(options: { confirmation: boolean; ttl?: number }) {
  const directory = await mkdtemp(join(tmpdir(), "yargram-code-"));
  directories.push(directory);
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "code-test-secret-long-enough",
    BCRYPT_ROUNDS: "4",
    DATA_DIR: directory,
  });
  const database = new JsonDatabase(config.dataFile);
  await database.initialize();
  const repositories = createJsonRepositories(database);
  const { mail, sent } = fakeMailbox();
  const authService = new AuthService(repositories.users, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: 4,
    mail,
    emailConfirmation: options.confirmation,
    emailCodeTtlSeconds: options.ttl ?? 600,
    sessions: repositories.sessions,
  });
  return { authService, repositories, sent };
}

function isChallenge(value: AuthResult | EmailCodeChallenge): value is EmailCodeChallenge {
  return "status" in value;
}

/** Регистрация и раскрытие результата: тест пишем коротко, ожидая токен. */
async function registeredToken(
  authService: AuthService,
  email: string,
): Promise<AuthResult> {
  const result = await authService.register({ email, password: "password123", displayName: "Тест" });
  if (isChallenge(result)) throw new Error("Expected a token, got an email code challenge");
  return result;
}

describe("код подтверждения по почте", () => {
  it("без подтверждения регистрация сразу даёт токен и не шлёт письмо", async () => {
    const { authService, sent } = await harness({ confirmation: false });
    const result = await registeredToken(authService, "user@example.test");
    expect(result.accessToken).toBeTruthy();
    // Письмо не должно уходить, когда подтверждение выключено.
    expect(sent).toHaveLength(0);
  });

  it("с подтверждением регистрация выдаёт шестизначный код и не даёт токен", async () => {
    const { authService, sent } = await harness({ confirmation: true });
    const result = await authService.register({
      email: "user@example.test",
      password: "password123",
      displayName: "Тест",
    });
    expect(isChallenge(result)).toBe(true);
    if (!isChallenge(result)) return;
    expect(result).toMatchObject({ status: "code_sent", purpose: "register", email: "user@example.test" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.code).toMatch(/^\d{6}$/);
  });

  it("повторная отправка помечена как повтор, а первая — нет", async () => {
    // Признак `rotate` разбирает MailService: первое письмо уходит с основного
    // ящика, а повтор — со следующего. Первое письмо могло улететь в спам, и
    // повтор по тому же пути попал бы в ту же папку. Здесь проверяем только
    // то, что сервис правильно помечает отправку: первая — не повтор.
    const { authService, sent } = await harness({ confirmation: true });
    await authService.register({ email: "user@example.test", password: "password123", displayName: "Тест" });
    await authService.resendCode("user@example.test", "register");
    await authService.resendCode("user@example.test", "register");

    expect(sent.map((mail) => mail.rotate ?? false)).toEqual([false, true, true]);
  });

  it("верный код подтверждает почту и выдаёт токен", async () => {
    const { authService, sent, repositories } = await harness({ confirmation: true });
    await authService.register({ email: "user@example.test", password: "password123", displayName: "Тест" });
    const code = sent.at(-1)?.code ?? "";
    const result = await authService.confirmCode("user@example.test", code, "register");
    expect(result.accessToken).toBeTruthy();
    expect(result.user.emailVerified).toBe(true);
    // Код одноразовый: принятый код стирается, повторно его не принять.
    const stored = await repositories.users.findByEmail("user@example.test");
    expect(stored?.emailCodeHash).toBeFalsy();
  });

  it("неверный код не пускает, а верный после него всё ещё работает", async () => {
    const { authService, sent } = await harness({ confirmation: true });
    await authService.register({ email: "user@example.test", password: "password123", displayName: "Тест" });
    const code = sent.at(-1)?.code ?? "";
    await expect(authService.confirmCode("user@example.test", "000000", "register")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CODE",
    });
    // Одна ошибка не сжигает код — иначе опечатка означала бы новый круг писем.
    const result = await authService.confirmCode("user@example.test", code, "register");
    expect(result.accessToken).toBeTruthy();
  });

  it("код для входа не подтверждает регистрацию: назначение проверяется", async () => {
    const { authService, sent } = await harness({ confirmation: true });
    await authService.register({ email: "user@example.test", password: "password123", displayName: "Тест" });
    await authService.login("user@example.test", "password123");
    const loginCode = sent.at(-1)?.code ?? "";
    // Пытаемся подтвердить регистрацию кодом, выданным на вход.
    await expect(authService.confirmCode("user@example.test", loginCode, "register")).rejects.toMatchObject({
      status: 400,
    });
    // А по назначению «вход» тот же код принимается.
    const result = await authService.confirmCode("user@example.test", loginCode, "login");
    expect(result.accessToken).toBeTruthy();
  });

  it("просроченный код входа не принимается, а аккаунт остаётся", async () => {
    // Срок вышел у кода, а не у аккаунта: почта подтверждена, аккаунт настоящий,
    // и человеку достаточно запросить новый код. Брошенная регистрация ведёт
    // себя иначе — её стирают начисто (см. «брошенная регистрация»).
    const { authService, sent, repositories } = await harness({ confirmation: true });
    await authService.register({ email: "user@example.test", password: "password123", displayName: "Тест" });
    await authService.confirmCode("user@example.test", sent.at(-1)?.code ?? "", "register");
    await authService.login("user@example.test", "password123");
    const code = sent.at(-1)?.code ?? "";
    const user = await repositories.users.findByEmail("user@example.test");
    // Перематываем срок в прошлое напрямую: ждать настоящего истечения в тесте нельзя.
    await repositories.users.update(user!.id, { emailCodeExpiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(authService.confirmCode("user@example.test", code, "login")).rejects.toMatchObject({
      status: 400,
      code: "CODE_EXPIRED",
    });
    expect(await repositories.users.findByEmail("user@example.test")).not.toBeNull();
  });

  it("сброс пароля по коду меняет пароль, а старый перестаёт подходить", async () => {
    const { authService, sent } = await harness({ confirmation: true });
    await authService.register({ email: "user@example.test", password: "password123", displayName: "Тест" });
    await authService.requestPasswordReset("user@example.test");
    const code = sent.at(-1)?.code ?? "";
    expect(sent.at(-1)?.purpose).toBe("reset");
    const result = await authService.resetPassword("user@example.test", code, "newPassword123");
    expect(result.accessToken).toBeTruthy();
    await expect(authService.login("user@example.test", "password123")).rejects.toMatchObject({ status: 401 });
    // Новый пароль принят: сервис дошёл до выдачи кода, значит пароль верный.
    const login = await authService.login("user@example.test", "newPassword123");
    expect(isChallenge(login)).toBe(true);
  });

  it("сброс на чужую почту отвечает так же, чтобы не выдавать существование аккаунта", async () => {
    const { authService, sent } = await harness({ confirmation: true });
    const result = await authService.requestPasswordReset("nobody@example.test");
    expect(result).toMatchObject({ status: "code_sent", purpose: "reset" });
    expect(sent).toHaveLength(0);
  });
});

describe("брошенная регистрация", () => {
  /**
   * Сдвигает срок кода в прошлое: ждать десять минут в тесте незачем, а правило
   * смотрит именно на срок кода — больше у незавершённой регистрации нет ничего.
   */
  async function expireCode(
    repositories: Awaited<ReturnType<typeof harness>>["repositories"],
    email: string,
  ): Promise<string> {
    const user = await repositories.users.findByEmail(email);
    if (!user) throw new Error("Пользователь не найден");
    await repositories.users.update(user.id, {
      emailCodeExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    return user.id;
  }

  it("уборщик стирает регистрацию, код которой так и не ввели", async () => {
    const { authService, repositories } = await harness({ confirmation: true });
    await authService.register({ email: "gone@example.test", password: "password123", displayName: "Тест" });
    const id = await expireCode(repositories, "gone@example.test");

    const cleanup = new RegistrationCleanupService(repositories.users);
    expect(await cleanup.sweep()).toBe(1);

    expect(await repositories.users.findById(id)).toBeNull();
    expect(await repositories.users.findByEmail("gone@example.test")).toBeNull();
  });

  it("пока код действует, аккаунт ждёт и уборка его не трогает", async () => {
    const { authService, repositories } = await harness({ confirmation: true });
    await authService.register({ email: "waiting@example.test", password: "password123", displayName: "Тест" });

    const cleanup = new RegistrationCleanupService(repositories.users);
    expect(await cleanup.sweep()).toBe(0);
    expect(await repositories.users.findByEmail("waiting@example.test")).not.toBeNull();
  });

  it("освобождает почту и ник: та же регистрация проходит заново", async () => {
    const { authService, repositories } = await harness({ confirmation: true });
    await authService.register({
      email: "again@example.test",
      password: "password123",
      displayName: "Тест",
      username: "again",
    });
    const first = await expireCode(repositories, "again@example.test");

    // Уборщик мог ещё не сработать — регистрация всё равно должна пройти:
    // иначе человек получил бы «почта занята» на собственную же попытку.
    const second = await authService.register({
      email: "again@example.test",
      password: "password123",
      displayName: "Тест Второй",
      username: "again",
    });
    expect(isChallenge(second)).toBe(true);
    expect(await repositories.users.findById(first)).toBeNull();
    const created = await repositories.users.findByEmail("again@example.test");
    expect(created?.displayName).toBe("Тест Второй");
  });

  it("код просроченной регистрации уже не принимается", async () => {
    const { authService, repositories, sent } = await harness({ confirmation: true });
    await authService.register({ email: "late@example.test", password: "password123", displayName: "Тест" });
    const code = sent.at(-1)?.code ?? "";
    await expireCode(repositories, "late@example.test");

    await expect(authService.confirmCode("late@example.test", code, "register")).rejects.toMatchObject({
      status: 400,
      code: "CODE_NOT_FOUND",
    });
    // Аккаунта больше нет: подтверждать было нечего.
    expect(await repositories.users.findByEmail("late@example.test")).toBeNull();
  });

  it("вход не оживляет брошенную регистрацию", async () => {
    const { authService, repositories } = await harness({ confirmation: true });
    await authService.register({ email: "revive@example.test", password: "password123", displayName: "Тест" });
    await expireCode(repositories, "revive@example.test");

    await expect(authService.login("revive@example.test", "password123")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(await repositories.users.findByEmail("revive@example.test")).toBeNull();
  });

  it("подтверждённый аккаунт уборка не трогает", async () => {
    const { authService, repositories, sent } = await harness({ confirmation: true });
    await authService.register({ email: "real@example.test", password: "password123", displayName: "Тест" });
    await authService.confirmCode("real@example.test", sent.at(-1)?.code ?? "", "register");
    const confirmed = await repositories.users.findByEmail("real@example.test");
    // Кода больше нет, срок пуст — но почта подтверждена, и это настоящий аккаунт.
    expect(confirmed?.emailCodeExpiresAt).toBeFalsy();

    const cleanup = new RegistrationCleanupService(repositories.users);
    expect(await cleanup.sweep()).toBe(0);
    expect(await repositories.users.findByEmail("real@example.test")).not.toBeNull();
  });

  it("замороженную регистрацию не стираем: решение владельца важнее", async () => {
    const { authService, repositories } = await harness({ confirmation: true });
    await authService.register({ email: "frozen@example.test", password: "password123", displayName: "Тест" });
    const id = await expireCode(repositories, "frozen@example.test");
    await repositories.users.update(id, { isFrozen: true });

    const cleanup = new RegistrationCleanupService(repositories.users);
    expect(await cleanup.sweep()).toBe(0);
    expect(await repositories.users.findById(id)).not.toBeNull();
  });
});
