import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../src/config.js";
import type { EmailCodePurpose } from "../src/domain/models.js";
import { MailService } from "../src/services/mail-service.js";

/** Корень репозитория: от него проверяем путь к собранным ассетам. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const base: ServerConfig["mail"] = {
  driver: "console",
  port: 587,
  secure: false,
  fromName: "Yargram",
  accounts: [],
};

/** Письмо в лог — единственный путь, доступный без SMTP-провайдера. */
describe("MailService", () => {
  it("печатает письмо в лог при драйвере console", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await new MailService(base).sendCode({
      to: "bob@example.com",
      code: "123456",
      minutes: 10,
      purpose: "login",
    });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain("bob@example.com");
    expect(line).toContain("123456");
    info.mockRestore();
  });

  it("молчит при драйвере none", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await new MailService({ ...base, driver: "none" }).sendCode({
      to: "bob@example.com",
      code: "123456",
      minutes: 10,
      purpose: "login",
    });

    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("выбирает заголовок письма по назначению кода", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await new MailService(base).sendCode({
      to: "bob@example.com",
      code: "999999",
      minutes: 10,
      purpose: "reset",
    });

    expect(String(info.mock.calls[0]?.[0])).toContain("Сброс пароля");
    info.mockRestore();
  });
});

/**
 * HTML-версия письма — то, что видит человек. Отдельная проверка нужна потому,
 * что требование к ней неочевидное: код должен выглядеть плашкой-картинкой,
 * но оставаться текстом, который можно выделить и скопировать.
 */
describe("MailService: HTML письма с кодом", () => {
  /** Перехватывает письмо, не отправляя его: подменяем транспорт у сервиса. */
  async function capture(purpose: EmailCodePurpose = "login") {
    const service = new MailService(base);
    let mail: { html?: string; attachments?: unknown[] } = {};
    service.send = async (message) => {
      mail = message;
    };
    await service.sendCode({ to: "bob@example.com", code: "123456", minutes: 10, purpose });
    return { html: mail.html ?? "", attachments: mail.attachments ?? [] };
  }

  it("держит код обычным текстом, чтобы его можно было скопировать", async () => {
    const { html } = await capture();
    // Между цифрами не должно быть разделителей: они попали бы в буфер обмена.
    expect(html).toContain(">123456<");
    expect(html).not.toContain("1 2 3 4 5 6");
  });

  it("не разбивает код тегами по одной цифре", async () => {
    // Обёртка каждой цифры в <span> сломала бы копирование: в буфер уехали бы
    // переводы строк вместо кода.
    const { html } = await capture();
    expect(html).not.toMatch(/<span[^>]*>\d<\/span>/);
  });

  it("оформляет плашку вёрсткой, а не картинкой", async () => {
    const { html } = await capture();
    expect(html).toContain("border-radius:16px");
    expect(html).toContain("letter-spacing:8px");
    // Фоновых изображений и SVG быть не должно: их вырезает Outlook.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("background-image");
  });

  it("вкладывает значок в письмо, а не тянет его по ссылке", async () => {
    const { html, attachments } = await capture();
    // Своего публичного адреса у проекта нет, поэтому внешняя ссылка на
    // картинку не сработала бы — значок обязан ехать внутри письма.
    expect(html).toContain("cid:yargram-logo");
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
    expect(attachments).toHaveLength(1);
    const logo = attachments[0] as { cid: string; contentType: string; content: Buffer };
    expect(logo.cid).toBe("yargram-logo");
    expect(logo.contentType).toBe("image/png");
    // Настоящий PNG, а не пустышка: у файла есть сигнатура.
    expect(logo.content.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("берёт значок из своих же ассетов, а не только из корня репозитория", async () => {
    // Собранный сервер лежит в dist, и картинка едет рядом с ним в dist/assets.
    // Раньше путь вёл только в `apps/server/assets`, поэтому копирование в
    // `dist/assets` было бесполезным: сервер его никогда не читал.
    const compiled = resolve(root, "apps", "server", "dist", "services", "mail-service.js");
    if (!existsSync(compiled)) return; // без сборки проверять нечего
    const logo = resolve(root, "apps", "server", "dist", "assets", "logo-plate.png");
    expect(existsSync(logo)).toBe(true);
  });

  it("показывает срок жизни кода", async () => {
    const { html } = await capture();
    expect(html).toContain("Код действует 10 мин.");
  });

  it("подставляет назначение кода", async () => {
    const { html } = await capture("reset");
    expect(html).toContain("Сброс пароля в Yargram");
    expect(html).toContain("Вы сбрасываете пароль");
  });

  it("предупреждает, что код не спрашивают сотрудники", async () => {
    // Это не украшение: приём соц. инженерии — позвонить и «попросить код».
    const { html } = await capture();
    expect(html).toContain("сотрудники Yargram код не спрашивают");
  });
});
