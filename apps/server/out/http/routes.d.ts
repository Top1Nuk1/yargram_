import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import type { Repositories } from "../repositories/types.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { AuthService } from "../services/auth-service.js";
import type { AdminService } from "../services/admin-service.js";
import type { ChatService } from "../services/chat-service.js";
import { type GroupService } from "../services/group-service.js";
import type { DraftService } from "../services/draft-service.js";
import type { FolderService } from "../services/folder-service.js";
import type { ScheduledMessageService } from "../services/scheduled-message-service.js";
import type { FriendService } from "../services/friend-service.js";
import type { SessionService } from "../services/session-service.js";
import type { StickerService } from "../services/sticker-service.js";
import type { SupportBotService } from "../services/support-bot-service.js";
import { type UploadService } from "../services/upload-service.js";
export declare const sendMessageSchema: z.ZodObject<{
    conversationId: z.ZodOptional<z.ZodString>;
    text: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    replyToId: z.ZodOptional<z.ZodString>;
    forwardedFromId: z.ZodOptional<z.ZodString>;
    attachmentIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    stickerIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * Присланный набор стикеров. Сообщение с ним идёт **без текста и файлов**:
     * в переписке появляется карточка набора, а получателям он добавляется.
     * Проверка на сервисе: иначе можно было бы отправить набор с текстом и он
     * бы выглядел как обычное сообщение, потеряв половину смысла.
     */
    stickerPackId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    conversationId?: string | undefined;
    stickerIds?: string[] | undefined;
    stickerPackId?: string | undefined;
    replyToId?: string | undefined;
    forwardedFromId?: string | undefined;
    attachmentIds?: string[] | undefined;
}, {
    conversationId?: string | undefined;
    text?: string | undefined;
    stickerIds?: string[] | undefined;
    stickerPackId?: string | undefined;
    replyToId?: string | undefined;
    forwardedFromId?: string | undefined;
    attachmentIds?: string[] | undefined;
}>;
export declare function createApiRouter(dependencies: {
    /** Настройки сервера: маршруту реле нужны адрес внешнего TURN и срок кэша. */
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
    uploadService: UploadService;
    repositories: Repositories;
    events: RealtimeEvents;
}): Router;
