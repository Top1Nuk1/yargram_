import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { configureMediaLinks } from "./lib/media-links.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openStorage } from "./storage/open-storage.js";
import { RealtimeEvents } from "./realtime/events.js";
import { attachSocketServer } from "./realtime/socket-server.js";
import { AuthService } from "./services/auth-service.js";
import { AdminService } from "./services/admin-service.js";
import { ChatService } from "./services/chat-service.js";
import { DraftService } from "./services/draft-service.js";
import { FolderService } from "./services/folder-service.js";
import { ScheduledMessageService } from "./services/scheduled-message-service.js";

type ApplicationServer =
  | ReturnType<typeof createHttpServer>
  | ReturnType<typeof createHttpsServer>;

function listen(server: ApplicationServer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server: ApplicationServer | null): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureMediaLinks({ secret: config.jwtSecret, ttlSeconds: config.mediaTokenTtlSeconds });
  const storage = await openStorage(config);
  const { repositories, crypto } = storage;
  console.log(`Yargram storage: ${config.databaseDriver}`);
  try {
  const authService = new AuthService(repositories.users, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: config.bcryptRounds,
  });
  const chatService = new ChatService(repositories);
  const events = new RealtimeEvents();
  const adminService = new AdminService(repositories, events);
  const draftService = new DraftService(repositories, chatService, events);
  const folderService = new FolderService(repositories, chatService, events);
  const scheduledMessageService = new ScheduledMessageService(repositories, chatService, events);
  const app = createApp({
    config,
    repositories,
    authService,
    chatService,
    adminService,
    draftService,
    folderService,
    scheduledMessageService,
    events,
    crypto,
  });
  const httpServer = createHttpServer(app);
  const io = attachSocketServer(httpServer, { config, authService, chatService, events });
  scheduledMessageService.start();

  let httpsServer: ReturnType<typeof createHttpsServer> | null = null;
  if (config.httpsPort && config.tlsPfxPath && config.tlsPfxPassword) {
    const pfx = await readFile(config.tlsPfxPath);
    httpsServer = createHttpsServer({ pfx, passphrase: config.tlsPfxPassword }, app);
    // A single Socket.IO instance serves both listeners, so users connected
    // through HTTP and HTTPS remain in the same realtime rooms.
    io.attach(httpsServer);
  }

  try {
    await Promise.all([
      listen(httpServer, config.port, config.host),
      ...(httpsServer && config.httpsPort
        ? [listen(httpsServer, config.httpsPort, config.host)]
        : []),
    ]);
  } catch (error) {
    await Promise.allSettled([closeServer(httpServer), closeServer(httpsServer)]);
    throw error;
  }

  console.log(`Yargram server listening on http://${config.host}:${config.port}`);
  if (httpsServer && config.httpsPort) {
    console.log(`Yargram secure server listening on https://${config.host}:${config.httpsPort}`);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    scheduledMessageService.stop();

    await new Promise<void>((resolve) => io.close(() => resolve()));
    const results = await Promise.allSettled([
      closeServer(httpServer),
      closeServer(httpsServer),
    ]);
    await storage.close();
    if (results.some((result) => result.status === "rejected")) {
      for (const result of results) {
        if (result.status === "rejected") console.error(result.reason);
      }
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    await storage.close();
    throw error;
  }
}

main().catch((error) => {
  console.error("Failed to start Yargram server", error);
  process.exitCode = 1;
});
