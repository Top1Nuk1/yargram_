import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import type { ServerConfig } from "./config.js";
import { createCorsOptions } from "./http/cors.js";
import { createApiRouter } from "./http/routes.js";
import { errorHandler, notFoundHandler, AppError } from "./lib/errors.js";
import type { AtRestCrypto } from "./lib/crypto.js";
import type { Repositories } from "./repositories/types.js";
import type { RealtimeEvents } from "./realtime/events.js";
import type { AuthService } from "./services/auth-service.js";
import type { AdminService } from "./services/admin-service.js";
import type { ChatService } from "./services/chat-service.js";
import type { GroupService } from "./services/group-service.js";
import type { FolderService } from "./services/folder-service.js";
import type { DraftService } from "./services/draft-service.js";
import type { ScheduledMessageService } from "./services/scheduled-message-service.js";
import type { FriendService } from "./services/friend-service.js";
import type { SessionService } from "./services/session-service.js";
import type { StickerService } from "./services/sticker-service.js";
import type { SupportBotService } from "./services/support-bot-service.js";
import { UploadService } from "./services/upload-service.js";

export function createApp(dependencies: {
  config: ServerConfig;
  authService: AuthService;
  adminService: AdminService;
  chatService: ChatService;
  groupService: GroupService;
  draftService: DraftService;
  folderService: FolderService;
  scheduledMessageService: ScheduledMessageService;
  friendService: FriendService;
  sessionService: SessionService;
  stickerService: StickerService;
  supportBotService: SupportBotService;
  repositories: Repositories;
  events: RealtimeEvents;
  crypto: AtRestCrypto;
}): Express {
  const app = express();
  const uploadService = new UploadService(
    dependencies.repositories,
    dependencies.config.uploadDirectory,
    (userId, attachment) => dependencies.chatService.canAccessAttachment(userId, attachment),
    dependencies.crypto,
  );
  // Удаление аккаунта должно стирать и файлы с диска — этим занимается UploadService.
  dependencies.adminService.setAvatarCleanup((userId) => uploadService.deleteUserAvatars(userId));
  app.disable("x-powered-by");
  // 🔥 За обратным прокси (Cloudflare Tunnel, nginx) соединение до сервера идёт
  // по HTTP, и без этой строки `request.protocol` всегда отвечает `http`.
  // По нему `sessionContext` собирает название сеанса, поэтому вход по HTTPS
  // показывался бы в «Активных сеансах» как `http://…`.
  //
  // Значение берётся из `TRUST_PROXY` и по умолчанию выключено: доверять
  // заголовку `X-Forwarded-For` можно только тогда, когда перед сервером
  // действительно стоит ваш прокси. Иначе адрес клиента подделывается, а по
  // нему у нас работает ограничитель попыток входа.
  app.set(
    "trust proxy",
    dependencies.config.trustProxy === true ? 1 : dependencies.config.trustProxy,
  );

  // 🔥 Уводим вход по HTTP на HTTPS — но только если это включено настройкой.
  //
  // По умолчанию выключено, потому что ошибка тут стоит дорого: если перед
  // сервером нет прокси, который сообщает исходную схему в
  // `X-Forwarded-Proto`, то `request.secure` всегда `false`, и каждый запрос
  // уходил бы на HTTPS — включая уже пришедшие по HTTPS. Получался бы
  // бесконечный цикл перенаправлений. Разбираться в этом на боевом сервере
  // неприятно, поэтому включаем осознанно (см. `FORCE_HTTPS` в `config.ts`).
  //
  // Заголовок `Host` используем вместо `request.hostname`: он сохраняет порт,
  // а на нестандартном порту его потерять нельзя.
  if (dependencies.config.forceHttps) {
    app.use((request, response, next) => {
      if (request.secure) {
        next();
        return;
      }
      const host = request.header("Host");
      if (!host) {
        next();
        return;
      }
      // 🔥 Код выбираем по методу. `301` браузеры вправе применить к любому
      // методу как `GET`, то есть запрос к API потерял бы тело и превратился
      // в обычный переход. Поэтому для всего, кроме чтения, отвечаем `308`:
      // он так же постоянен, но метод и тело сохраняет.
      const permanent = request.method === "GET" || request.method === "HEAD";
      response.redirect(permanent ? 301 : 308, `https://${host}${request.originalUrl}`);
    });
  }

  app.use(
    helmet({
      frameguard: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: dependencies.config.forceHttps
        ? { maxAge: 15552000, includeSubDomains: true }
        : false,
      contentSecurityPolicy: {
        directives: {
          // The temporary Radmin endpoint intentionally uses plain HTTP. Helmet's
          // default upgrade directive makes Chrome request the JS bundle over
          // HTTPS, leaving the single-page app as a blank white screen.
          "upgrade-insecure-requests": null,
          "media-src": ["'self'", "blob:"],
          "img-src": ["'self'", "data:", "blob:", "https:"],
        },
      },
    }),
  );
  app.use((_request, response, next) => {
    response.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
    );
    next();
  });
  app.use(cors(createCorsOptions(dependencies.config.corsOrigins)));
  app.use(express.json({ limit: "1mb" }));

  // 🔥 Запрет кэширования для API: прокси и CDN (Gcore, Cloudflare) никогда
  // не должны кэшировать запросы пользователей, иначе чужие профили и чаты
  // попадут другим людям.
  app.use("/api", (_request, response, next) => {
    response.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    );
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("Surrogate-Control", "no-store");
    next();
  });

  const healthHandler: RequestHandler = (_request, response) => {
    response.json({
      status: "ok",
      service: "yargram-server",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.use(
    "/api",
    createApiRouter({
      config: dependencies.config,
      authService: dependencies.authService,
      adminService: dependencies.adminService,
      chatService: dependencies.chatService,
      groupService: dependencies.groupService,
      draftService: dependencies.draftService,
      folderService: dependencies.folderService,
      scheduledMessageService: dependencies.scheduledMessageService,
      friendService: dependencies.friendService,
      sessionService: dependencies.sessionService,
      stickerService: dependencies.stickerService,
      supportBotService: dependencies.supportBotService,
      uploadService,
      repositories: dependencies.repositories,
      events: dependencies.events,
    }),
  );
  app.use("/api", notFoundHandler);

  // 🔥 Два сайта из одного сервера.
  //
  // Корень занимает лендинг: название, описание и кнопка «Открыть Yargram».
  // Само приложение переехало на `/app` — иначе лендинг перекрыл бы его, ведь
  // оба отдают `index.html` и оба должны уметь клиентскую маршрутизацию.
  //
  // Порядок важен: сначала статика обоих сайтов, потом одиночные маршруты
  // («catch-all»), иначе первый же `app.get("*")` съел бы второе приложение.
  const landingIndex = resolve(dependencies.config.landingDistPath, "index.html");
  const webIndex = resolve(dependencies.config.webDistPath, "index.html");
  const hasLanding = existsSync(landingIndex);
  const hasWeb = existsSync(webIndex);

  if (dependencies.config.nodeEnv === "production") {
    // 🔥 Встроенные картинки Yargram — баннеры профиля, обои и фоны — адресуются
    // от корня (`/banners/…`, `/wallpapers/…`, `/backdrops/…`) и хранятся в
    // профиле человека такой же строкой. Само приложение живёт на `/app`, а
    // корень занят лендингом, у которого своих картинок нет. Без этих строк
    // запрос картинки проваливался в одиночный маршрут, который отдавал
    // `index.html` со статусом 200: браузер получал HTML там, где ждал PNG, и
    // баннер не рисовался вовсе — ни выбранный из готовых, ни сохранённый в
    // профиле. Поэтому папки картинок отдаём от корня явно.
    for (const folder of ["banners", "wallpapers", "backdrops"]) {
      const directory = resolve(dependencies.config.webDistPath, folder);
      if (!existsSync(directory)) continue;
      app.use(`/${folder}`, express.static(directory, { index: false }));
      // Файла нет — честный 404, а не страница приложения. Иначе браузер снова
      // получил бы HTML со статусом 200, и такая поломка осталась бы незаметной.
      app.use(`/${folder}`, (_request, _response, next) => {
        next(new AppError(404, "ASSET_NOT_FOUND", "The requested asset was not found"));
      });
    }

    // 🔥 Встроенные наборы стикеров лежат в сборке приложения и раздаются
    // обычной статикой: они одинаковы у всех, не протухают и не занимают
    // место в базе. Папка отдаётся от корня `/app`, потому что само
    // приложение живёт на `/app`, а вложенный адрес (`/app/app/stickers/…`)
    // сломал бы `base` в сборке.
    const stickerDirectory = resolve(dependencies.config.webDistPath, "stickers");
    if (existsSync(stickerDirectory)) {
      app.use("/app/stickers", express.static(stickerDirectory, { index: false }));
      app.use("/app/stickers", (_request, _response, next) => {
        next(new AppError(404, "ASSET_NOT_FOUND", "The requested sticker was not found"));
      });
    }

    if (hasLanding) {
      app.use(express.static(dependencies.config.landingDistPath, { index: false }));
      app.get("/", (_request, response) => {
        response.setHeader("Cache-Control", "no-cache");
        response.sendFile(landingIndex);
      });
      // 🔥 Соглашение живёт на отдельной странице и отдаётся **до**
      // одиночного маршрута внизу. Тот отдал бы на `/terms` файл приложения
      // со статусом 200, и человек увидел бы мессенджер вместо соглашения.
      const termsIndex = resolve(dependencies.config.landingDistPath, "terms.html");
      if (existsSync(termsIndex)) {
        app.get("/terms", (_request, response) => {
          response.setHeader("Cache-Control", "no-cache");
          response.sendFile(termsIndex);
        });
      }
    }
    if (hasWeb) {
      // 🔥 `/app` без слеша регистрируем **до** `express.static`. Статика на
      // этой точке отвечает перенаправлением 301 на `/app/`, а нам нужен сразу
      // `index.html`: адрес `/app` — то, что человек набирает руками и кладёт в
      // закладки, и лишний редирект здесь только путает. Порядок маршрутов в
      // Express — это порядок их разбора, поэтому «перехватить» раньше статики.
      app.get("/app", (_request, response) => {
        response.setHeader("Cache-Control", "no-cache");
        response.sendFile(webIndex);
      });
      app.use("/app", express.static(dependencies.config.webDistPath, { index: false }));

      // Одиночный маршрут на всё остальное. На `/app/…` отдаём приложение, на
      // прочие пути — лендинг; без лендинга приложение, как было раньше (иначе
      // сайт «пропадёт», если лендинг ещё не собран).
      app.get("*", (request, response, next) => {
        if (!request.accepts("html")) {
          next();
          return;
        }
        // 🔥 Проверка обязана быть именно по префиксу `/app/`. Если написать
        // «всегда приложение» (была такая опечатка), то любой путь лендинга —
        // `/terms`, `/about`, неизвестный адрес — отдавал бы `index.html`
        // мессенджера со статусом 200: человек думал бы, что попал в чат.
        const isAppRoute =
          request.path === "/app" ||
          request.path.startsWith("/app/") ||
          request.path === "/join" ||
          request.path.startsWith("/join/");
        response.setHeader("Cache-Control", "no-cache");
        if (isAppRoute || !hasLanding) {
          response.sendFile(webIndex);
          return;
        }
        response.sendFile(landingIndex);
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
