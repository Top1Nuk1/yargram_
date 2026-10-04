import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type ServerConfig } from "../src/config.js";
import { MailService } from "../src/services/mail-service.js";

/**
 * Состояние поддельного nodemailer.
 *
 * `vi.hoisted` нужен потому, что `vi.mock` поднимается к началу файла: обычные
 * переменные в этот момент ещё не объявлены.
 */
const state = vi.hoisted(() => ({
  /** Ящики, которые «не работают» — как заблокированный ящик или отозванный пароль. */
  broken: new Set<string>(),
  /** Ящики, с которых письмо действительно ушло. */
  sent: [] as string[],
  /** Каждый ящик, до которого дошла попытка, — включая неудачные. */
  attempts: [] as string[],
  /** Адреса отправителя ушедших писем. */
  froms: [] as string[],
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: { auth: { user: string } }) => ({
      sendMail: async (mail: { from: string }) => {
        state.attempts.push(options.auth.user);
        if (state.broken.has(options.auth.user)) {
          throw new Error(`535 Authentication failed for ${options.auth.user}`);
        }
        state.sent.push(options.auth.user);
        state.froms.push(mail.from);
        return { accepted: [options.auth.user] };
      },
    }),
  },
}));

/** Настройки с готовыми ящиками: первый — основной, остальные запасные. */
function mailConfig(...users: string[]): ServerConfig["mail"] {
  return {
    driver: "smtp",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    fromName: "Yargram",
    accounts: users.map((user) => ({ user, pass: "app-password", from: user })),
  };
}

const letter = { to: "bob@example.com", subject: "Код", text: "123456" };

describe("MailService: запасные ящики", () => {
  beforeEach(() => {
    state.broken.clear();
    state.sent.length = 0;
    state.attempts.length = 0;
    state.froms.length = 0;
    // Переключение ящиков нарочно пишет в лог — в тестах этот шум не нужен.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("шлёт письмо с основного ящика, пока тот работает", async () => {
    await new MailService(mailConfig("first@gmail.com", "second@gmail.com")).send(letter);

    expect(state.sent).toEqual(["first@gmail.com"]);
    expect(state.attempts).toEqual(["first@gmail.com"]);
  });

  it("переключается на запасной, если основной отказал", async () => {
    // Ровно тот случай, ради которого всё и делается: Google отозвал пароль
    // приложения, и без запасного ящика код перестал бы приходить вовсе.
    state.broken.add("first@gmail.com");

    await new MailService(mailConfig("first@gmail.com", "second@gmail.com")).send(letter);

    expect(state.sent).toEqual(["second@gmail.com"]);
    // Про отказ основного должно быть сказано в окне сервера: иначе непонятно,
    // почему письмо пришло с другого адреса.
    expect(vi.mocked(console.warn).mock.calls.flat().join(" ")).toContain("first@gmail.com");
  });

  it("не бьётся в сломанный ящик на каждом письме", async () => {
    state.broken.add("first@gmail.com");
    const service = new MailService(mailConfig("first@gmail.com", "second@gmail.com"));

    await service.send(letter);
    await service.send(letter);

    // Первое письмо: попытка в основной, затем в запасной. Второе — сразу в
    // запасной, без таймаута на сломанном.
    expect(state.attempts).toEqual([
      "first@gmail.com",
      "second@gmail.com",
      "second@gmail.com",
    ]);
  });

  it("возвращается к основному, когда запасной сломался", async () => {
    state.broken.add("first@gmail.com");
    const service = new MailService(mailConfig("first@gmail.com", "second@gmail.com"));
    await service.send(letter);
    expect(state.sent).toEqual(["second@gmail.com"]);

    // Запасной тоже отказал — перебор должен пойти по кругу и вернуться к
    // основному, а не встать намертво.
    state.broken.delete("first@gmail.com");
    state.broken.add("second@gmail.com");
    await service.send(letter);

    expect(state.sent).toEqual(["second@gmail.com", "first@gmail.com"]);
  });

  it("падает с понятной ошибкой, когда не сработал ни один ящик", async () => {
    state.broken.add("first@gmail.com");
    state.broken.add("second@gmail.com");

    await expect(
      new MailService(mailConfig("first@gmail.com", "second@gmail.com")).send(letter),
    ).rejects.toThrow(/ни один из 2/);

    expect(state.attempts).toEqual(["first@gmail.com", "second@gmail.com"]);
    expect(state.sent).toEqual([]);
  });

  it("берёт отправителя из того ящика, который отправил", async () => {
    // Gmail подставляет адрес по логину и чужого отправителя не принимает:
    // письмо с запасного ящика обязано быть и от запасного.
    state.broken.add("first@gmail.com");

    await new MailService(mailConfig("first@gmail.com", "second@gmail.com")).send(letter);

    expect(state.froms).toEqual(["Yargram <second@gmail.com>"]);
  });
});

/**
 * Поворот ящиков при повторной отправке.
 *
 * Случай, который перебор внутри одного письма не лечит: ящик письмо принял
 * (ошибки нет), а оно не дошло — улетело в спам. Сервер об этом не узнает,
 * узнать может только человек — и жмёт «отправить снова». Ради этого случая
 * повтор идёт с другого ящика.
 */
describe("MailService: поворот ящиков на повторной отправке", () => {
  beforeEach(() => {
    state.broken.clear();
    state.sent.length = 0;
    state.attempts.length = 0;
    state.froms.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const code = (rotate = false) => ({
    to: "bob@example.com",
    code: "123456",
    minutes: 10,
    purpose: "login" as const,
    ...(rotate ? { rotate: true } : {}),
  });

  it("первый код уходит с основного ящика, повтор — со следующего", async () => {
    const service = new MailService(mailConfig("first@gmail.com", "second@gmail.com"));

    await service.sendCode(code());
    await service.sendCode(code(true));

    expect(state.sent).toEqual(["first@gmail.com", "second@gmail.com"]);
  });

  it("каждый повтор берёт следующий ящик и идёт по кругу", async () => {
    const service = new MailService(mailConfig("first@gmail.com", "second@gmail.com"));

    await service.sendCode(code());
    await service.sendCode(code(true));
    await service.sendCode(code(true));

    // Третий раз снова первый: ящиков два, и повтор не должен застревать на
    // последнем — иначе про третий ящик в списке можно забыть.
    expect(state.sent).toEqual(["first@gmail.com", "second@gmail.com", "first@gmail.com"]);
  });

  it("не выбирает отказавший ящик стартовым для повтора", async () => {
    // Основной отказал: первое письмо ушло со запасного. Повтор не должен
    // снова начинать с мёртвого ящика и ждать таймаута — иначе повтор всегда
    // медленный ровно тогда, когда ящик и сломался.
    state.broken.add("first@gmail.com");
    const service = new MailService(mailConfig("first@gmail.com", "second@gmail.com"));

    await service.sendCode(code());
    await service.sendCode(code(true));

    expect(state.sent).toEqual(["second@gmail.com", "second@gmail.com"]);
    expect(state.attempts).toEqual(["first@gmail.com", "second@gmail.com", "second@gmail.com"]);
  });

  it("с одним ящиком повтор никуда не уходит", async () => {
    // Один ящик — поворачивать некуда, но и падать нельзя: повторы обычное дело.
    const service = new MailService(mailConfig("only@gmail.com"));

    await service.sendCode(code());
    await service.sendCode(code(true));

    expect(state.sent).toEqual(["only@gmail.com", "only@gmail.com"]);
  });

  it("повтор с третьего ящика доходит до второго", async () => {
    const service = new MailService(
      mailConfig("first@gmail.com", "second@gmail.com", "third@gmail.com"),
    );

    await service.sendCode(code());
    await service.sendCode(code(true));

    expect(state.sent).toEqual(["first@gmail.com", "second@gmail.com"]);
  });
});

describe("настройки почты: список ящиков", () => {
  const base = {
    NODE_ENV: "test",
    MAIL_DRIVER: "smtp",
    MAIL_HOST: "smtp.gmail.com",
  } as const;

  it("собирает ящики в порядке: основной, потом запасные", () => {
    const { mail } = loadConfig({
      ...base,
      MAIL_USER: "first@gmail.com",
      MAIL_PASS: "aaaaaaaaaaaaaaaa",
      MAIL_USER_2: "second@gmail.com",
      MAIL_PASS_2: "bbbbbbbbbbbbbbbb",
      MAIL_USER_3: "third@gmail.com",
      MAIL_PASS_3: "cccccccccccccccc",
    });

    expect(mail.accounts.map((account) => account.user)).toEqual([
      "first@gmail.com",
      "second@gmail.com",
      "third@gmail.com",
    ]);
  });

  it("пропускает ящик без пароля, а не роняет отправку", () => {
    // Недописанная строка в .env не должна ломать почту целиком: логин без
    // пароля — это ещё не ящик.
    const { mail } = loadConfig({
      ...base,
      MAIL_USER: "first@gmail.com",
      MAIL_PASS: "aaaaaaaaaaaaaaaa",
      MAIL_USER_2: "second@gmail.com",
    });

    expect(mail.accounts.map((account) => account.user)).toEqual(["first@gmail.com"]);
  });

  it("берёт отправителем сам ящик, если адрес не задан отдельно", () => {
    const { mail } = loadConfig({
      ...base,
      MAIL_USER: "first@gmail.com",
      MAIL_PASS: "aaaaaaaaaaaaaaaa",
      MAIL_USER_2: "second@gmail.com",
      MAIL_PASS_2: "bbbbbbbbbbbbbbbb",
      MAIL_FROM_2: "noreply@second.example",
    });

    expect(mail.accounts.map((account) => account.from)).toEqual([
      "first@gmail.com",
      "noreply@second.example",
    ]);
  });

  it("оставляет список пустым, когда почта не настроена", () => {
    const { mail } = loadConfig({ NODE_ENV: "test" });

    expect(mail.accounts).toEqual([]);
    expect(mail.driver).toBe("console");
  });
});
