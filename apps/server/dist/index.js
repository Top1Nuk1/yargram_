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
import { MailService } from "./services/mail-service.js";
import { AdminService } from "./services/admin-service.js";
import { ChatService } from "./services/chat-service.js";
import { GroupService } from "./services/group-service.js";
import { DraftService } from "./services/draft-service.js";
import { FolderService } from "./services/folder-service.js";
import { ScheduledMessageService } from "./services/scheduled-message-service.js";
import { RegistrationCleanupService } from "./services/registration-cleanup-service.js";
import { FriendService } from "./services/friend-service.js";
import { SessionService } from "./services/session-service.js";
import { StickerService } from "./services/sticker-service.js";
import { SupportBotService } from "./services/support-bot-service.js";
function listen(server, port, host) {
    return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(port, host, () => {
            server.off("error", onError);
            resolve();
        });
    });
}
function closeServer(server) {
    if (!server?.listening)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}
async function main() {
    const config = loadConfig();
    configureMediaLinks({ secret: config.jwtSecret, ttlSeconds: config.mediaTokenTtlSeconds });
    const storage = await openStorage(config);
    const { repositories, crypto } = storage;
    console.log(`Yargram storage: ${config.databaseDriver}`);
    try {
        const mailService = new MailService(config.mail);
        const authService = new AuthService(repositories.users, {
            jwtSecret: config.jwtSecret,
            jwtExpiresIn: config.jwtExpiresIn,
            bcryptRounds: config.bcryptRounds,
            mail: mailService,
            emailConfirmation: config.emailConfirmation,
            emailCodeTtlSeconds: config.emailCodeTtlSeconds,
            sessions: repositories.sessions,
        });
        const chatService = new ChatService(repositories);
        const events = new RealtimeEvents();
        const adminService = new AdminService(repositories, events);
        const groupService = new GroupService(repositories, events, chatService);
        const draftService = new DraftService(repositories, chatService, events);
        const folderService = new FolderService(repositories, chatService, events);
        const scheduledMessageService = new ScheduledMessageService(repositories, chatService, events);
        // Брошенные регистрации: код не ввели — аккаунта будто не было. Уборщик
        // освобождает почту и ник, чтобы на них можно было зарегистрироваться заново.
        const registrationCleanupService = new RegistrationCleanupService(repositories.users);
        const friendService = new FriendService(repositories, events);
        const sessionService = new SessionService(repositories.sessions, repositories.users, events);
        // Бот поддержки: слушает поток сообщений — обращения в своей переписке и
        // ответы владельцев в служебной группе.
        const supportBotService = new SupportBotService(repositories, chatService, events);
        // Стикеры, наборы и библиотека гифок. Встроенные наборы описаны в самом
        // сервисе, поэтому база о них ничего не знает и раздавать их не нужно.
        const stickerService = new StickerService(repositories, events);
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
            stickerService,
            supportBotService,
            events,
            crypto,
        });
        const httpServer = createHttpServer(app);
        const io = attachSocketServer(httpServer, { config, authService, chatService, events });
        scheduledMessageService.start();
        registrationCleanupService.start();
        supportBotService.start();
        // Начальная общая группа Yargram
        try {
            const defaultGroup = await repositories.conversations.findDefaultGroup();
            if (!defaultGroup) {
                const allUsers = await repositories.users.listAll();
                const owner = allUsers.find((u) => u.isOwner && !u.isDeleted && !u.isFrozen) ?? allUsers[0];
                if (owner) {
                    await repositories.conversations.createGroup({
                        ownerId: owner.id,
                        title: "Основная группа",
                        description: "Официальная общая группа Yargram для общения и новостей.",
                        memberIds: allUsers.map((u) => u.id),
                        isDefaultGroup: true,
                    });
                }
            }
        }
        catch (error) {
            console.warn("Could not seed default group:", error);
        }
        let httpsServer = null;
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
        }
        catch (error) {
            await Promise.allSettled([closeServer(httpServer), closeServer(httpsServer)]);
            throw error;
        }
        console.log(`Yargram server listening on http://${config.host}:${config.port}`);
        if (httpsServer && config.httpsPort) {
            console.log(`Yargram secure server listening on https://${config.host}:${config.httpsPort}`);
        }
        let shuttingDown = false;
        const shutdown = async (signal) => {
            if (shuttingDown)
                return;
            shuttingDown = true;
            console.log(`${signal} received, shutting down`);
            scheduledMessageService.stop();
            registrationCleanupService.stop();
            supportBotService.stop();
            await new Promise((resolve) => io.close(() => resolve()));
            const results = await Promise.allSettled([
                closeServer(httpServer),
                closeServer(httpsServer),
            ]);
            await storage.close();
            if (results.some((result) => result.status === "rejected")) {
                for (const result of results) {
                    if (result.status === "rejected")
                        console.error(result.reason);
                }
                process.exitCode = 1;
            }
        };
        process.once("SIGINT", () => void shutdown("SIGINT"));
        process.once("SIGTERM", () => void shutdown("SIGTERM"));
    }
    catch (error) {
        await storage.close();
        throw error;
    }
}
main().catch((error) => {
    console.error("Failed to start Yargram server", error);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map