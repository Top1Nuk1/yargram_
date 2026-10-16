import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ServerConfig } from "../config.js";
import type { AuthService } from "../services/auth-service.js";
import type { ChatService } from "../services/chat-service.js";
import type { RealtimeEvents } from "./events.js";
/**
 * Test and shutdown helper. Cancels scheduled presence work and waits until every
 * tracked socket task finished, so storage is not written after its owner closed it.
 */
export declare function releaseSocketServer(io: Server): Promise<void>;
export declare function attachSocketServer(httpServer: HttpServer, dependencies: {
    config: ServerConfig;
    authService: AuthService;
    chatService: ChatService;
    events: RealtimeEvents;
}): Server;
