import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import type { ServerConfig } from "./config.js";
import { createCorsOptions } from "./http/cors.js";
import { createApiRouter } from "./http/routes.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
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
  app.set("trust proxy", dependencies.config.trustProxy);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
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
  app.use(cors(createCorsOptions(dependencies.config.corsOrigins)));
  app.use(express.json({ limit: "1mb" }));

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
    if (hasLanding) {
      app.use(express.static(dependencies.config.landingDistPath, { index: false }));
      app.get("/", (_request, response) => {
        response.sendFile(landingIndex);
      });
    }
    if (hasWeb) {
      // 🔥 `/app` без слеша регистрируем **до** `express.static`. Статика на
      // этой точке отвечает перенаправлением 301 на `/app/`, а нам нужен сразу
      // `index.html`: адрес `/app` — то, что человек набирает руками и кладёт в
      // закладки, и лишний редирект здесь только путает. Порядок маршрутов в
      // Express — это порядок их разбора, поэтому «перехватить» раньше статики.
      app.get("/app", (_request, response) => {
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
        const isAppRoute = true;
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
