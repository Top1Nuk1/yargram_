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
      authService: dependencies.authService,
      adminService: dependencies.adminService,
      chatService: dependencies.chatService,
      groupService: dependencies.groupService,
      draftService: dependencies.draftService,
      folderService: dependencies.folderService,
      scheduledMessageService: dependencies.scheduledMessageService,
      uploadService,
      repositories: dependencies.repositories,
      events: dependencies.events,
    }),
  );
  app.use("/api", notFoundHandler);

  const indexPath = resolve(dependencies.config.webDistPath, "index.html");
  if (dependencies.config.nodeEnv === "production" && existsSync(indexPath)) {
    app.use(express.static(dependencies.config.webDistPath, { index: false }));
    app.get("*", (request, response, next) => {
      if (request.accepts("html")) {
        response.sendFile(indexPath);
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
