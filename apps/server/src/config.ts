import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(moduleDirectory, "..");

const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * Флаги из env читаем строкой: `z.coerce.boolean()` превратил бы пустую строку
 * и любое непустое значение в `true`, а нам нужно различать «не задано» и «нет».
 */
const booleanFlag = z
  .preprocess(
    (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).default("false"),
  )
  .transform((value) => value === "true" || value === "1" || value === "yes" || value === "on");

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    // 🔥 Хостинговые панели (Pterodactyl и другие) часто прокидывают приложению
    // переменную SERVER_PORT — она важнее нашего PORT. Без этого в панели
    // приходится руками подставлять номер из Allocations, а с этим — сервер
    // сам слушает тот порт, который панель считает правильным.
    SERVER_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    HTTPS_PORT: z.preprocess(
      emptyStringToUndefined,
      z.coerce.number().int().min(0).max(65_535).optional(),
    ),
    TLS_PFX_PATH: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    TLS_PFX_PASSWORD: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    JWT_SECRET: z.string().min(16).default("yargram-development-secret-change-me"),
    // Ключ шифрования данных в покое: текст сообщений и файлы на диске.
    DB_ENCRYPTION_KEY: z
      .string()
      .min(16)
      .default("yargram-development-encryption-key-change-me"),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(10),
    MEDIA_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(30 * 24 * 60 * 60)
      .default(24 * 60 * 60),
    CORS_ORIGINS: z
      .string()
      .default("http://26.53.76.128:5173,http://localhost:5173,http://127.0.0.1:5173"),
    /**
     * Кому доверять заголовок `X-Forwarded-*` от обратного прокси.
     * `false` — прокси нет (значение по умолчанию, как было раньше).
     * `true` — доверять всем: годится, когда прокси ровно один и настроен вами.
     * Строка — список подсетей через запятую, например `loopback, uniquelocal`.
     * Пустая строка читается как «не задано»: незаполненная переменная в `.env`
     * не должна ронять запуск.
     */
    TRUST_PROXY: z.preprocess(emptyStringToUndefined, z.string().min(1).default("false")),
    /**
     * Перенаправлять ли вход по HTTP на тот же адрес по HTTPS.
     *
     * 🔥 По умолчанию **выключено**, и это не осторожность, а необходимость.
     * Флаг имеет смысл только за прокси, который сообщает схему исходного
     * запроса в `X-Forwarded-Proto`. Если прокси этого не делает (или перед
     * сервером вообще нет прокси), сервер видит «http» в каждом запросе и
     * уводит на HTTPS даже того, кто уже пришёл по HTTPS, — получается
     * бесконечное перенаправление и сайт не открывается вовсе.
     *
     * Отдельная ловушка — Cloudflare в режиме SSL/TLS «Flexible»: он сам
     * ходит к нам по HTTP, поэтому «http» в заголовке — это норма, и редирект
     * зацикливается. Там перенаправление включает Cloudflare («Always Use
     * HTTPS»), а этот флаг оставляют выключенным.
     */
    FORCE_HTTPS: booleanFlag,
    /**
     * Адрес, по которому Yargram открывают извне, например
     * `https://yargram.example.com`. Сейчас только подсказка: его используют
     * скрипты запуска для печати ссылки, а сервер — для журнала.
     */
    PUBLIC_ORIGIN: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    DATA_DIR: z.string().min(1).default(resolve(serverRoot, "data")),
    DATABASE_DRIVER: z.enum(["json", "postgres"]).optional(),
    DATABASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    // Почта: код подтверждения при регистрации, входе и сбросе пароля.
    // `console` печатает письмо в лог — так можно гонять тесты и разработку без
    // настоящего SMTP; `smtp` — любая почта или релей через nodemailer;
    // `none` — не отправлять ничего (письмо считается доставленным).
    MAIL_DRIVER: z.enum(["smtp", "console", "none"]).default("console"),
    MAIL_HOST: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    // SSL сразу (порт 465). Для STARTTLS (587, 2525) оставляем false —
    // nodemailer сам поднимет TLS, если сервер его предлагает.
    MAIL_SECURE: booleanFlag,
    MAIL_USER: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_PASS: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_FROM: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    // Запасные ящики. Если основной заблокируют (Google умеет отзывать пароли
    // приложений и запирать ящики), письмо уйдёт со следующего — иначе код
    // перестанет приходить всем, а без кода в Yargram не войти вообще.
    MAIL_USER_2: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_PASS_2: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_FROM_2: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_USER_3: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_PASS_3: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_FROM_3: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    MAIL_FROM_NAME: z.string().min(1).default("Yargram"),
    // Сколько живёт код из письма (по умолчанию 10 минут).
    EMAIL_CODE_TTL_SECONDS: z.coerce.number().int().min(30).max(24 * 60 * 60).default(600),
    // Обязательное подтверждение почты кодом: без кода регистрация и вход не
    // завершаются. Выключено по умолчанию, чтобы не ломать существующие
    // сценарии и тесты — включается одной переменной.
    EMAIL_CONFIRMATION: booleanFlag,
    /**
     * Адрес внешнего сервиса, который выдаёт **временные** данные TURN, например
     * `https://имя.metered.live/api/v1/turn/credentials?apiKey=…`.
     *
     * 🔥 Зачем он, если есть `VITE_TURN_*`. Те переменные вшиваются в сборку
     * и поэтому годятся только для своего `coturn` с постоянным паролем. На
     * хостинге без root своего `coturn` не поднять, а публичные реле
     * (Open Relay и подобные) выдают логин и пароль на короткое время — их
     * нельзя зашить в сборку, только запросить перед звонком.
     *
     * Не задан — звонки работают на одном STUN, как раньше.
     */
    TURN_CREDENTIALS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    /**
     * Сколько кэшировать полученные данные TURN. Логин и пароль у таких
     * сервисов живут минуты, а не секунды, поэтому кэш и уместен, и нужен:
     * иначе каждый звонок — лишний запрос наружу.
     */
    TURN_CREDENTIALS_TTL_SECONDS: z.coerce.number().int().min(30).max(24 * 60 * 60).default(600),
  })
  .superRefine((environment, context) => {
    if (!environment.HTTPS_PORT) return;
    if (!environment.TLS_PFX_PATH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TLS_PFX_PATH"],
        message: "TLS_PFX_PATH is required when HTTPS_PORT is enabled",
      });
    }
    if (!environment.TLS_PFX_PASSWORD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TLS_PFX_PASSWORD"],
        message: "TLS_PFX_PASSWORD is required when HTTPS_PORT is enabled",
      });
    }
  });

/** Один ящик, с которого можно отправить письмо. */
export type MailAccount = {
  /** Логин на SMTP. Он же — адрес отправителя, если `from` не задан отдельно. */
  user: string;
  pass: string;
  from: string;
};

/**
 * `TRUST_PROXY` читаем строкой, а не флагом: кроме «да/нет» Express понимает
 * список подсетей, и именно он нужен чаще всего — доверять только локальному
 * прокси, а не любому отправителю заголовка.
 */
function parseTrustProxy(value: string): boolean | string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  return value.trim();
}

/**
 * Список источников, которым `socket.io` разрешает подключиться.
 *
 * 🔥 Публичный адрес приложения добавляется сюда **автоматически**, и это не
 * удобство, а необходимость. За обратным прокси (nginx на хостинге, туннель)
 * `Host` у запроса часто внутренний — `127.0.0.1:3000` или имя сервиса в
 * docker-сети, — и тогда правило «источник совпал с хостом» не срабатывает.
 * `Origin` же всегда настоящий: браузер отправляет адрес страницы, то есть
 * `PUBLIC_ORIGIN`. Без этой строки realtime-связь пропадала ровно на боевом
 * адресе: в интерфейсе загоралось «Нет realtime-связи», не приходили живые
 * сообщения и звонки не начинались — при полностью рабочем HTTP.
 *
 * Почему это безопасно: значение берётся из собственной настройки сервера, а
 * не из запроса, поэтому подделать его снаружи нельзя.
 */
function buildCorsOrigins(corsOrigins: string, publicOrigin?: string): string[] {
  const origins = corsOrigins
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const own = publicOrigin?.trim().replace(/\/$/, "");
  if (own && !origins.includes(own)) origins.push(own);
  return origins;
}

export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseDriver: "json" | "postgres";
  databaseUrl?: string;
  host: string;
  port: number;
  httpsPort?: number;
  tlsPfxPath?: string;
  tlsPfxPassword?: string;
  jwtSecret: string;
  /** Ключ шифрования данных в покое (текст сообщений и файлы). */
  dbEncryptionKey: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  mediaTokenTtlSeconds: number;
  corsOrigins: string[];
  /** Настройка `trust proxy` для Express: `false`, `true` или список подсетей. */
  trustProxy: boolean | string;
  /** Уводить ли вход по HTTP на HTTPS. По умолчанию выключено. */
  forceHttps: boolean;
  /** Публичный адрес Yargram, если задан: `https://yargram.example.com`. */
  publicOrigin?: string;
  dataDirectory: string;
  dataFile: string;
  uploadDirectory: string;
  /** Собранная веб-версия Yargram: её отдаём по `/app`. */
  webDistPath: string;
  /** Собранный лендинг: название, описание и кнопка входа. Отдаётся по `/`. */
  landingDistPath: string;
  /** Настройки отправки писем с кодом подтверждения. */
  mail: {
    driver: "smtp" | "console" | "none";
    host?: string;
    port: number;
    secure: boolean;
    fromName: string;
    /**
     * Ящики для отправки: основной первым, запасные следом. Пустой список —
     * писем не будет, письмо уйдёт в лог (драйвер `console`).
     *
     * `from` у каждого свой: Gmail подставляет адрес по логину, и чужой
     * отправитель ему не понравится.
     */
    accounts: MailAccount[];
  };
  /** Требовать код из письма при регистрации и входе. */
  emailConfirmation: boolean;
  /** Срок жизни кода из письма. */
  emailCodeTtlSeconds: number;
  /** Внешний сервис временных данных TURN. Не задан — реле нет. */
  turnCredentialsUrl?: string;
  /** Сколько кэшировать ответ сервиса TURN. */
  turnCredentialsTtlSeconds: number;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = environmentSchema.parse(environment);

  // 🔥 Effective порт: приоритет у прокинутого панелью SERVER_PORT, затем у
  // нашего PORT. Хостинговые панели (Pterodactyl и подобные) сами сообщают
  // приложению, на каком порту его ждёт прокси, — с этим SERVER_PORT не нужно
  // руками переносить номер из раздела Allocations в .env.
  const effectivePort = parsed.SERVER_PORT !== undefined ? parsed.SERVER_PORT : parsed.PORT;

  if (
    parsed.NODE_ENV === "production" &&
    parsed.JWT_SECRET === "yargram-development-secret-change-me"
  ) {
    throw new Error("JWT_SECRET must be changed before starting in production");
  }
  if (
    parsed.NODE_ENV === "production" &&
    parsed.DB_ENCRYPTION_KEY === "yargram-development-encryption-key-change-me"
  ) {
    throw new Error("DB_ENCRYPTION_KEY must be changed before starting in production");
  }
  if (parsed.HTTPS_PORT && parsed.HTTPS_PORT === effectivePort) {
    throw new Error("HTTPS_PORT must be different from PORT");
  }

  const databaseDriver = parsed.DATABASE_DRIVER ?? (parsed.DATABASE_URL ? "postgres" : "json");
  if (databaseDriver === "postgres" && !parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL");
  }
  if (parsed.DATABASE_URL && !/^postgres(?:ql)?:\/\//.test(parsed.DATABASE_URL)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  if (parsed.MAIL_DRIVER === "smtp" && !parsed.MAIL_HOST) {
    throw new Error("MAIL_HOST is required when MAIL_DRIVER=smtp");
  }

  return {
    databaseDriver,
    ...(parsed.DATABASE_URL ? { databaseUrl: parsed.DATABASE_URL } : {}),
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: effectivePort,
    ...(parsed.HTTPS_PORT
      ? {
          httpsPort: parsed.HTTPS_PORT,
          tlsPfxPath: resolve(parsed.TLS_PFX_PATH as string),
          tlsPfxPassword: parsed.TLS_PFX_PASSWORD as string,
        }
      : {}),
    jwtSecret: parsed.JWT_SECRET,
    dbEncryptionKey: parsed.DB_ENCRYPTION_KEY,
    jwtExpiresIn: parsed.JWT_EXPIRES_IN,
    bcryptRounds: parsed.BCRYPT_ROUNDS,
    mediaTokenTtlSeconds: parsed.MEDIA_TOKEN_TTL_SECONDS,
    corsOrigins: buildCorsOrigins(parsed.CORS_ORIGINS, parsed.PUBLIC_ORIGIN),
    trustProxy: parseTrustProxy(parsed.TRUST_PROXY),
    forceHttps: parsed.FORCE_HTTPS,
    ...(parsed.PUBLIC_ORIGIN ? { publicOrigin: parsed.PUBLIC_ORIGIN.replace(/\/$/, "") } : {}),
    dataDirectory: resolve(parsed.DATA_DIR),
    dataFile: resolve(parsed.DATA_DIR, "yargram.json"),
    uploadDirectory: resolve(parsed.DATA_DIR, "uploads"),
    webDistPath: existsSync(resolve(serverRoot, "..", "web", "client_out"))
      ? resolve(serverRoot, "..", "web", "client_out")
      : resolve(serverRoot, "..", "web", "dist"),
    landingDistPath: existsSync(resolve(serverRoot, "..", "landing", "landing_out"))
      ? resolve(serverRoot, "..", "landing", "landing_out")
      : resolve(serverRoot, "..", "landing", "dist"),
    mail: {
      driver: parsed.MAIL_DRIVER,
      ...(parsed.MAIL_HOST ? { host: parsed.MAIL_HOST } : {}),
      port: parsed.MAIL_PORT,
      secure: parsed.MAIL_SECURE,
      fromName: parsed.MAIL_FROM_NAME,
      // Ящик попадает в список, только если у него есть и логин, и пароль:
      // один логин без пароля — это недописанная настройка, и молча ронять
      // из-за неё отправку нельзя. Отправитель по умолчанию — тот же адрес,
      // чем логинимся на SMTP: релей всё равно подставит свой, а без адреса
      // письмо бы не ушло вовсе.
      accounts: (
        [
          [parsed.MAIL_USER, parsed.MAIL_PASS, parsed.MAIL_FROM],
          [parsed.MAIL_USER_2, parsed.MAIL_PASS_2, parsed.MAIL_FROM_2],
          [parsed.MAIL_USER_3, parsed.MAIL_PASS_3, parsed.MAIL_FROM_3],
        ] as const
      ).flatMap(([user, pass, from]) =>
        user && pass ? [{ user, pass, from: from ?? user }] : [],
      ),
    },
    emailConfirmation: parsed.EMAIL_CONFIRMATION,
    emailCodeTtlSeconds: parsed.EMAIL_CODE_TTL_SECONDS,
    ...(parsed.TURN_CREDENTIALS_URL ? { turnCredentialsUrl: parsed.TURN_CREDENTIALS_URL } : {}),
    turnCredentialsTtlSeconds: parsed.TURN_CREDENTIALS_TTL_SECONDS,
  };
}
