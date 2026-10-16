import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { allowedReactionEmojis, groupPermissions, servesInline, toPublicUser, toPublicUserFor, } from "../domain/models.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { fetchTurnIceServers } from "../lib/turn.js";
import { parseBody, parseParams, parseQuery } from "../lib/validation.js";
import { MUTE_FOREVER } from "../services/group-service.js";
import { uploadLimits } from "../services/upload-service.js";
import { createAuthMiddleware } from "./auth-middleware.js";
import { readMultipartFile } from "./multipart.js";
import { sessionContext } from "./session-context.js";
const usernameSchema = z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .pipe(z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username may contain letters, digits and underscores"));
const registerSchema = z
    .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(72),
    displayName: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    username: usernameSchema.optional(),
})
    .superRefine((input, context) => {
    if (!input.displayName && !input.name) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["displayName"],
            message: "displayName is required",
        });
    }
});
const loginSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(72),
});
/** Код из письма — шесть цифр, как в SMS-подтверждении. */
const emailCodeSchema = z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits");
const emailCodePurposeSchema = z.enum(["register", "login", "reset"]);
const confirmCodeSchema = z.object({
    email: z.string().trim().email().max(254),
    code: emailCodeSchema,
    purpose: emailCodePurposeSchema,
});
const resendCodeSchema = z.object({
    email: z.string().trim().email().max(254),
    purpose: emailCodePurposeSchema,
});
const resetRequestSchema = z.object({
    email: z.string().trim().email().max(254),
});
const resetConfirmSchema = z.object({
    email: z.string().trim().email().max(254),
    code: emailCodeSchema,
    password: z.string().min(8).max(72),
});
/**
 * Ссылка на оформление профиля: абсолютный адрес из интернета или относительный
 * путь до своей же загрузки.
 *
 * 🔥 Относительный путь обязателен: `attachment.url` после загрузки выглядит как
 * `/api/uploads/<id>?t=<подпись>` — без протокола. Требование «обязательно URL»
 * ломало сохранение фона ровно в тот момент, когда файл уже загружен: файл
 * уходил, а профиль отвечал 400 «Request validation failed».
 */
const decorativeUrlSchema = z.union([
    z.literal(""),
    // Только http(s): `z.string().url()` пропускает и `javascript:` — а это
    // ссылка, которую позже подставят в оформление профиля.
    z
        .string()
        .trim()
        .url()
        .refine((value) => /^https?:\/\//i.test(value), { message: "Only http(s) links are allowed" }),
    z.string().trim().regex(/^\/api\/uploads\/[A-Za-z0-9._~-]+(?:\?[^\s]*)?$/),
    // Свои файлы приложения: `/wallpapers/Yargram-wallpaper-blue.png` и прочее
    // оформление, которое лежит рядом с интерфейсом, а не в загрузках. Путь
    // обязательно начинается с одного слэша — `//host` это чужой сайт, а не наш
    // файл, и подставлять его в оформление нельзя.
    z.string().trim().regex(/^\/(?!\/)[A-Za-z0-9._~/-]+$/),
]);
const updateProfileSchema = z
    .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    username: usernameSchema.optional(),
    bio: z.string().trim().max(500).optional(),
    notificationSoundEnabled: z.boolean().optional(),
    showLastSeen: z.boolean().optional(),
    callPrivacy: z.enum(["everyone", "contacts", "nobody"]).optional(),
    callPrivacyAllowedUserIds: z.array(z.string().trim().min(1)).max(1000).optional(),
    callPrivacyDeniedUserIds: z.array(z.string().trim().min(1)).max(1000).optional(),
    // Язык интерфейса. Клиент держит его у себя и сообщает сюда — только для
    // того, чтобы служебный бот поддержки отвечал на том же языке. Список
    // языков один и тот же у клиента и у сервера: `el` бот тоже знает.
    language: z.enum(["ru", "en", "bg", "uk", "be", "el"]).optional(),
    themeColor: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    wallpaperUrl: decorativeUrlSchema.optional(),
    // Тип фона: `image/*` или `video/*`. По самой ссылке не видно, видео это
    // или картинка, — от этого зависит, рисовать `<video>` или фон. Пустая
    // строка — «фон снят»: вместе с пустым `wallpaperUrl` она возвращает чат к
    // стандартному заполнению, и старое «это было видео» не остаётся в профиле.
    wallpaperMimeType: z
        .union([
        z.literal(""),
        z
            .string()
            .trim()
            .regex(/^(?:image|video)\/[a-z0-9][a-z0-9.+-]{0,60}$/),
    ])
        .optional(),
    // Баннер профиля: цвет заливки. Пустая строка и null означают «убрать»,
    // как в Telegram — тогда баннер не рисуется вовсе.
    bannerColor: z
        .union([z.literal(""), z.literal(null), z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)])
        .optional(),
    // Баннер профиля: прямая ссылка на картинку. Пустая строка и null означают
    // «убрать» — как в Telegram, тогда баннер не рисуется вовсе.
    bannerUrl: decorativeUrlSchema.optional(),
    // День рождения как в Telegram: год необязателен, «MM-DD» означает
    // «год скрыт» — тогда возраст в профиле не показывается.
    birthday: z
        .string()
        .regex(/^(?:\d{4}-)?\d{2}-\d{2}$/, "Birthday must be a YYYY-MM-DD or MM-DD date")
        .nullable()
        .optional(),
    // Автозавершение сеансов: через сколько дней бездействия сеанс закрывается
    // сам. `null` — никогда. Без этой строки настройка молча не сохранялась бы.
    sessionAutoTerminateDays: z
        .union([z.literal(null), z.number().int().min(1).max(365)])
        .optional(),
})
    .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one profile field is required",
});
const userListQuerySchema = z.object({
    q: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
});
const userParamsSchema = z.object({ userId: z.string().uuid() });
const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });
const renameSessionSchema = z.object({
    name: z.string().trim().max(100),
});
// Знак приложения: "" и null одинаково снимают значок, как в админке.
const appBadgeSchema = z.object({
    badge: z
        .union([z.enum(["yargram", ""]), z.null()])
        .transform((value) => (value === "yargram" ? "yargram" : null)),
});
const uploadParamsSchema = z.object({ uploadId: z.string().uuid() });
const uploadQuerySchema = z.object({
    kind: z.enum(["image", "file", "wallpaper", "sticker", "gif"]),
    mediaKind: z.enum(["voice", "video_circle", "gif"]).optional(),
    durationSeconds: z.coerce.number().finite().positive().optional(),
}).superRefine((input, context) => {
    // 🔥 Гифка — исключение из правила «вид и длительность вместе»: она бывает
    // видео, но длительности не обещает, поэтому пара для неё не обязательна.
    if (input.mediaKind === "gif") {
        if (input.kind !== "gif") {
            context.addIssue({ code: z.ZodIssueCode.custom, message: "The gif media kind requires kind=gif" });
        }
        if (input.durationSeconds !== undefined) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: "A gif does not carry a duration" });
        }
        return;
    }
    if ((input.mediaKind === undefined) !== (input.durationSeconds === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Recording kind and duration are required together" });
    }
    if (input.mediaKind && input.kind !== "file") {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Recordings must use kind=file" });
    }
    if (input.mediaKind === "video_circle" && (input.durationSeconds ?? 0) > 60) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Video circles may not exceed 60 seconds" });
    }
});
const downloadQuerySchema = z.object({
    download: z.string().optional(),
    t: z.string().min(1).max(4_096).optional(),
});
const stickerPackParamsSchema = z.object({ packId: z.string().min(1).max(200) });
const stickerPackStickerParamsSchema = stickerPackParamsSchema.extend({
    stickerId: z.string().uuid(),
});
const createStickerPackSchema = z.object({
    title: z.string().trim().min(1).max(40),
    emoji: z.string().trim().max(8).optional(),
});
const updateStickerPackSchema = createStickerPackSchema.partial();
const addStickerSchema = z.object({
    attachmentId: z.string().uuid(),
    emoji: z.string().trim().max(8).optional(),
});
const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const directConversationSchema = z.object({ userId: z.string().uuid() });
const conversationParamsSchema = z.object({ conversationId: z.string().uuid() });
const messageParamsSchema = conversationParamsSchema.extend({ messageId: z.string().uuid() });
const messageIdParamsSchema = z.object({ messageId: z.string().uuid() });
const pinParamsSchema = messageParamsSchema;
const messageListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().datetime({ offset: true }).optional(),
    q: z.string().trim().max(4_000).optional(),
});
export const sendMessageSchema = z.object({
    conversationId: z.string().uuid().optional(),
    text: z.string().trim().max(4_000).optional().default(""),
    replyToId: z.string().uuid().optional(),
    forwardedFromId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(10).optional(),
    // Отправляемые стикеры. Сообщение может состоять только из них — тогда
    // текста и файлов нет, а в пузыре рисуются сами картинки. Предел в 10
    // стикеров на сообщение тот же, что у вложений: иначе в один пузырь влезло
    // бы столько картинок, сколько влезет в набор.
    //
    // 🔥 Здесь **не uuid**, в отличие от вложений: встроенные стикеры описаны
    // кодом и носят читаемые имена (`yargram-logo`). Строгий uuid отверг бы их,
    // и отправка встроенного стикера падала бы с VALIDATION_ERROR.
    stickerIds: z.array(z.string().min(1).max(200)).max(10).optional(),
    /**
     * Присланный набор стикеров. Сообщение с ним идёт **без текста и файлов**:
     * в переписке появляется карточка набора, а получателям он добавляется.
     * Проверка на сервисе: иначе можно было бы отправить набор с текстом и он
     * бы выглядел как обычное сообщение, потеряв половину смысла.
     */
    stickerPackId: z.string().min(1).max(200).optional(),
});
const editMessageSchema = z.object({ text: z.string().trim().max(4_000) });
const pinMessageSchema = z.object({ messageId: z.string().uuid() });
const reactionSchema = z.object({ emoji: z.enum(allowedReactionEmojis) });
const forwardSchema = z.object({ targetConversationId: z.string().uuid() });
// ---- Группы ----
// Ключи прав берём из домена: отдельный список рано или поздно разъедется с ним.
const groupPermissionsSchema = z.object(Object.fromEntries(groupPermissions.map((permission) => [permission, z.boolean().optional()])));
const createGroupSchema = z.object({
    title: z.string().trim().min(1).max(128),
    description: z.string().trim().max(2_000).optional(),
    avatarUrl: z.string().trim().max(2_000).nullable().optional(),
    memberIds: z.array(z.string().uuid()).max(200).optional(),
    // Клиент может прислать любое из двух именований.
    userIds: z.array(z.string().uuid()).max(200).optional(),
});
const updateGroupSchema = z.object({
    title: z.string().trim().min(1).max(128).optional(),
    description: z.string().trim().max(2_000).optional(),
    avatarUrl: z.string().trim().max(2_000).nullable().optional(),
});
const groupParamsSchema = z.object({ groupId: z.string().uuid() });
const groupMemberParamsSchema = groupParamsSchema.extend({ userId: z.string().uuid() });
const membersQuerySchema = z.object({ q: z.string().trim().max(100).optional() });
const addMembersSchema = z.object({
    userIds: z.array(z.string().uuid()).min(1).max(50).optional(),
    memberIds: z.array(z.string().uuid()).min(1).max(50).optional(),
});
const joinGroupSchema = z.object({
    code: z.string().trim().min(1).max(64).optional(),
    inviteCode: z.string().trim().min(1).max(64).optional(),
});
const setAdminSchema = z.object({
    userId: z.string().uuid(),
    admin: z.boolean().default(true),
    permissions: groupPermissionsSchema.optional(),
});
const groupPermissionsBodySchema = z.object({ permissions: groupPermissionsSchema });
const memberTagSchema = z.object({
    userId: z.string().uuid(),
    /** Пустая строка снимает тег. */
    tag: z.string().trim().max(24),
});
const createPollSchema = z.object({
    question: z.string().trim().min(1).max(255),
    description: z.string().trim().max(500).optional(),
    // Границы числа вариантов держит сервис: там же понятные коды ошибок.
    options: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    settings: z
        .object({
        showNames: z.boolean().optional(),
        multiple: z.boolean().optional(),
        addOptions: z.boolean().optional(),
        changeVote: z.boolean().optional(),
        shuffle: z.boolean().optional(),
        correctOptionIds: z.array(z.string()).optional(),
        deadline: z.string().datetime({ offset: true }).nullable().optional(),
    })
        .optional(),
});
const pollVoteSchema = z.object({ optionIds: z.array(z.string()).max(12) });
const pollOptionSchema = z.object({ text: z.string().trim().min(1).max(100) });
const restrictMemberSchema = z.object({
    userId: z.string().uuid(),
    permissions: groupPermissionsSchema.optional(),
    /** ISO-время окончания мьюта, «forever» — бессрочно, null — снять мьют. */
    mutedUntil: z
        .union([z.literal(MUTE_FOREVER), z.string().datetime({ offset: true }), z.null()])
        .optional(),
});
const conversationSettingsSchema = z
    .object({
    archived: z.boolean().optional(),
    mutedUntil: z.string().datetime({ offset: true }).nullable().optional(),
})
    .refine((input) => input.archived !== undefined || input.mutedUntil !== undefined, {
    message: "At least one conversation setting is required",
});
const reportSchema = z.object({
    reason: z.enum(["spam", "abuse", "fraud", "other"]),
    details: z.string().trim().max(1_000).optional(),
});
const draftBodySchema = z.object({
    text: z.string().max(4_000).optional().default(""),
    attachmentIds: z.array(z.string().uuid()).max(10).optional(),
    replyToId: z.string().uuid().nullable().optional(),
});
const folderCreateSchema = z.object({
    name: z.string().trim().min(1).max(40),
    conversationIds: z.array(z.string().uuid()).max(100).optional(),
});
const folderUpdateSchema = z
    .object({
    name: z.string().trim().min(1).max(40).optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    conversationIds: z.array(z.string().uuid()).max(100).optional(),
})
    .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one folder field is required",
});
const folderParamsSchema = z.object({ folderId: z.string().uuid() });
const scheduledParamsSchema = z.object({ scheduledId: z.string().uuid() });
const scheduledCreateSchema = z.object({
    text: z.string().max(4_000).optional(),
    attachmentIds: z.array(z.string().uuid()).max(10).optional(),
    replyToId: z.string().uuid().optional(),
    sendAt: z.string().datetime({ offset: true }),
});
const scheduledUpdateSchema = z
    .object({
    text: z.string().max(4_000).optional(),
    attachmentIds: z.array(z.string().uuid()).max(10).optional(),
    sendAt: z.string().datetime({ offset: true }).optional(),
})
    .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one field is required",
});
export function createApiRouter(dependencies) {
    const router = Router();
    const requireAuth = createAuthMiddleware(dependencies.authService, dependencies.repositories.users);
    function clientIp(request) {
        const cfIp = request.headers["cf-connecting-ip"];
        if (typeof cfIp === "string" && cfIp.trim()) {
            return cfIp.trim();
        }
        return request.ip || request.socket?.remoteAddress || "127.0.0.1";
    }
    // The limiter belongs to one app instance: separate servers and tests must not
    // share attempt counters.
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1_000,
        limit: 30,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        keyGenerator: (request) => clientIp(request),
        handler: (_request, response) => {
            response.status(429).json({
                error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts" },
            });
        },
    });
    const loginAccountLimiter = rateLimit({
        windowMs: 15 * 60 * 1_000,
        limit: 15,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        keyGenerator: (request) => {
            const body = request.body;
            const target = typeof body?.email === "string" ? body.email.trim().toLowerCase() : clientIp(request);
            return `login:${target}`;
        },
        handler: (_request, response) => {
            response.status(429).json({
                error: {
                    code: "AUTH_RATE_LIMITED",
                    message: "Слишком много попыток входа для этого аккаунта. Попробуйте через 15 минут.",
                },
            });
        },
    });
    const resetPasswordLimiter = rateLimit({
        windowMs: 5 * 60 * 1_000,
        limit: 5,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        keyGenerator: (request) => {
            const body = request.body;
            const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
            return email ? `reset:${email}` : `reset:ip:${clientIp(request)}`;
        },
        handler: (_request, response) => {
            response.status(429).json({
                error: {
                    code: "RESET_RATE_LIMITED",
                    message: "Слишком много запросов на сброс пароля. Подождите 5 минут.",
                },
            });
        },
    });
    router.post("/auth/register", authLimiter, asyncHandler(async (request, response) => {
        const input = parseBody(registerSchema, request);
        const result = await dependencies.authService.register({
            email: input.email,
            password: input.password,
            displayName: input.displayName ?? input.name,
            ...(input.username === undefined ? {} : { username: input.username }),
        }, sessionContext(request));
        response.status(201).json(result);
    }));
    router.post("/auth/login", authLimiter, loginAccountLimiter, asyncHandler(async (request, response) => {
        const input = parseBody(loginSchema, request);
        response.json(await dependencies.authService.login(input.email, input.password, sessionContext(request)));
    }));
    // Подтверждение почты кодом. Когда EMAIL_CONFIRMATION выключен, ручки просто
    // не находят действующего кода: сценарий без почты остаётся рабочим, а сама
    // смена пароля по коду доступна всегда, если код кто-то выдал.
    router.post("/auth/confirm-code", authLimiter, asyncHandler(async (request, response) => {
        const input = parseBody(confirmCodeSchema, request);
        response.json(await dependencies.authService.confirmCode(input.email, input.code, input.purpose, sessionContext(request)));
    }));
    router.post("/auth/resend-code", authLimiter, asyncHandler(async (request, response) => {
        const input = parseBody(resendCodeSchema, request);
        response.json(await dependencies.authService.resendCode(input.email, input.purpose));
    }));
    router.post("/auth/reset-password/request", authLimiter, resetPasswordLimiter, asyncHandler(async (request, response) => {
        const input = parseBody(resetRequestSchema, request);
        response.json(await dependencies.authService.requestPasswordReset(input.email));
    }));
    router.post("/auth/reset-password/confirm", authLimiter, asyncHandler(async (request, response) => {
        const input = parseBody(resetConfirmSchema, request);
        response.json(await dependencies.authService.resetPassword(input.email, input.code, input.password, sessionContext(request)));
    }));
    router.get("/auth/me", requireAuth, asyncHandler(async (request, response) => {
        response.json({ user: await dependencies.authService.getCurrentUser(request.auth.userId) });
    }));
    // ---- Активные сеансы ----
    //
    // Yargram — сайт, поэтому сеанс описывают парой «сайт + браузер»: человек
    // видит, откуда именно он вошёл, и закрывает только этот вход.
    router.get("/sessions", requireAuth, asyncHandler(async (request, response) => {
        response.json(await dependencies.sessionService.overview(request.auth.userId, bearerToken(request)));
    }));
    // Вход с нового сайта подтверждён: «это был я».
    router.post("/sessions/:sessionId/acknowledge", requireAuth, asyncHandler(async (request, response) => {
        const { sessionId } = parseParams(sessionParamsSchema, request);
        response.json(await dependencies.sessionService.acknowledge(request.auth.userId, sessionId, bearerToken(request)));
    }));
    // Переименовать устройство/сеанс.
    router.patch("/sessions/:sessionId/rename", requireAuth, asyncHandler(async (request, response) => {
        const { sessionId } = parseParams(sessionParamsSchema, request);
        const { name } = parseBody(renameSessionSchema, request);
        response.json(await dependencies.sessionService.rename(request.auth.userId, sessionId, name, bearerToken(request)));
    }));
    router.delete("/sessions/:sessionId", requireAuth, asyncHandler(async (request, response) => {
        const { sessionId } = parseParams(sessionParamsSchema, request);
        response.json(await dependencies.sessionService.terminate(request.auth.userId, bearerToken(request), sessionId));
    }));
    // Все сеансы, кроме текущего.
    router.delete("/sessions", requireAuth, asyncHandler(async (request, response) => {
        response.json(await dependencies.sessionService.terminateAll(request.auth.userId, bearerToken(request)));
    }));
    router.patch("/users/me", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(updateProfileSchema, request);
        const user = await dependencies.authService.updateProfile(request.auth.userId, input);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(request.auth.userId),
        });
        response.json({ user });
    }));
    router.post("/users/me/avatar", requireAuth, asyncHandler(async (request, response) => {
        const file = await readMultipartFile(request, {
            fieldName: "avatar",
            maxBodyBytes: uploadLimits.avatar + 64 * 1024,
        });
        const user = await dependencies.uploadService.setAvatar(request.auth.userId, file);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(request.auth.userId),
        });
        response.status(201).json({ user });
    }));
    router.delete("/users/me/avatar", requireAuth, asyncHandler(async (request, response) => {
        const user = await dependencies.uploadService.removeAvatar(request.auth.userId);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(request.auth.userId),
        });
        response.json({ user });
    }));
    // Баннер профиля — как в Discord: своя картинка или цвет. Картинка отдельным
    // маршрутом, потому что это файл, а цвет уходит обычным PATCH /users/me.
    router.post("/users/me/banner", requireAuth, asyncHandler(async (request, response) => {
        const file = await readMultipartFile(request, {
            fieldName: "banner",
            maxBodyBytes: uploadLimits.banner + 64 * 1024,
        });
        const user = await dependencies.uploadService.setBanner(request.auth.userId, file);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(request.auth.userId),
        });
        response.status(201).json({ user });
    }));
    router.delete("/users/me/banner", requireAuth, asyncHandler(async (request, response) => {
        const user = await dependencies.uploadService.removeBanner(request.auth.userId);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(request.auth.userId),
        });
        response.json({ user });
    }));
    router.get("/users/me/blocked", requireAuth, asyncHandler(async (request, response) => {
        response.json({ users: await dependencies.chatService.listBlocked(request.auth.userId) });
    }));
    // Знак «Yargram» на собственном аккаунте приложения. Доступен только тому,
    // кого владелец пометил приложением: остальным — отказ, и знак они себе не
    // выдадут. Отдельным маршрутом, потому что это самообслуживание, а не
    // администрирование чужого аккаунта.
    router.post("/app/badge", requireAuth, asyncHandler(async (request, response) => {
        const { badge } = parseBody(appBadgeSchema, request);
        const user = await dependencies.adminService.setOwnBadge(request.auth.userId, badge);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(request.auth.userId),
        });
        response.json({ user });
    }));
    const listUsers = asyncHandler(async (request, response) => {
        const query = parseQuery(userListQuerySchema, request);
        const currentUser = await dependencies.repositories.users.findById(request.auth.userId);
        const users = await dependencies.repositories.users.list({
            ...(query.q === undefined ? {} : { query: query.q }),
            limit: query.limit,
            excludeUserId: request.auth.userId,
        });
        response.json({
            // Удалённые аккаунты в поиске не показываем: найти их нельзя, хотя
            // профиль по прямой ссылке всё ещё открывается как «Удалённый аккаунт».
            // Служебных ботов тоже: в поддержку заходят пунктом меню, а не поиском,
            // и «добавить в друзья» боту — бессмыслица.
            users: users
                .filter((user) => !user.isDeleted && !user.isBot)
                .map((user) => ({
                ...toPublicUserFor(user, request.auth.userId),
                blockedByMe: currentUser?.blockedUserIds.includes(user.id) ?? false,
            })),
        });
    });
    router.get("/users", requireAuth, listUsers);
    router.get("/users/search", requireAuth, listUsers);
    // Admin routes
    const adminGrantSchema = z
        .object({
        targetUserId: z.string().uuid().optional(),
        targetUsername: z.string().trim().min(1).max(32).optional(),
        isVerified: z.boolean().optional(),
        isOwner: z.boolean().optional(),
        // The enum is transformed before .optional(), so an omitted badge stays
        // undefined instead of silently turning into null and clearing it.
        // "" and null both mean «снять значок».
        badge: z
            .union([z.enum(["yargram", ""]), z.null()])
            .transform((value) => (value === "yargram" ? "yargram" : null))
            .optional(),
        // Регистр в никах сохраняем, но адрес всё так же латиница/цифры/_.
        usernames: z.array(usernameSchema).optional(),
        adminUserIds: z.array(z.string().uuid()).optional(),
    })
        .refine((data) => data.targetUserId || data.targetUsername, {
        message: "Нужен targetUserId или targetUsername",
        path: ["targetUserId"],
    });
    const adminFreezeSchema = z.object({ frozen: z.boolean() });
    const adminScamSchema = z.object({ scam: z.boolean() });
    const adminFakeSchema = z.object({ fake: z.boolean() });
    const adminAppSchema = z.object({ isApp: z.boolean() });
    const adminBotSchema = z.object({ isBot: z.boolean() });
    const adminLookupSchema = z.object({ handle: z.string().trim().min(1).max(32) });
    /**
     * Точный поиск аккаунта для админ-панели по основному или дополнительному
     * нику. Обычный `GET /users` тут не годится: это поиск по подстроке, который
     * к тому же исключает самого ищущего — владелец не смог бы найти свой же
     * аккаунт, чтобы выдать себе значок.
     */
    router.post("/admin/lookup", requireAuth, asyncHandler(async (request, response) => {
        const { handle } = parseBody(adminLookupSchema, request);
        const grantor = await dependencies.repositories.users.findById(request.auth.userId);
        if (!grantor?.isOwner) {
            throw new AppError(403, "NOT_OWNER", "Only the owner can look up accounts");
        }
        const user = await dependencies.repositories.users.findByHandle(handle);
        response.json({ user: user ? toPublicUser(user) : null });
    }));
    // Приложение Yargram: владелец помечает им аккаунт, и с этого момента
    // приложение может само поставить себе значок «Yargram».
    router.post("/admin/:userId/app", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const { isApp } = parseBody(adminAppSchema, request);
        const updated = await dependencies.adminService.setApp(request.auth.userId, userId, isApp);
        response.json({ user: toPublicUser(updated) });
    }));
    // Метка «BOT»: служебный аккаунт, в который нельзя войти. Ставится и снимается
    // владельцем, поэтому живёт рядом с остальными знаками владельца.
    router.post("/admin/:userId/bot", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const { isBot } = parseBody(adminBotSchema, request);
        const updated = await dependencies.adminService.setBot(request.auth.userId, userId, isBot);
        // Метку видно в чужом списке бесед и в шапке чата: обновляем сразу, а не
        // после перезагрузки у собеседников.
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(userId),
        });
        response.json({ user: toPublicUser(updated) });
    }));
    router.post("/admin/:userId/grant", requireAuth, asyncHandler(async (request, response) => {
        const grantorId = request.auth.userId;
        const input = parseBody(adminGrantSchema, request);
        const updated = await dependencies.adminService.grant(grantorId, {
            ...(input.targetUsername === undefined ? {} : { targetUsername: input.targetUsername }),
            ...(input.targetUserId === undefined ? {} : { targetUserId: input.targetUserId }),
            ...(input.isVerified === undefined ? {} : { isVerified: input.isVerified }),
            ...(input.isOwner === undefined ? {} : { isOwner: input.isOwner }),
            ...(input.badge === undefined ? {} : { badge: input.badge }),
            ...(input.usernames === undefined ? {} : { usernames: input.usernames }),
            ...(input.adminUserIds === undefined ? {} : { adminUserIds: input.adminUserIds }),
        });
        response.json({ user: toPublicUser(updated) });
    }));
    // Заморозка: аккаунт остаётся, но войти им нельзя. Только владелец.
    router.post("/admin/:userId/freeze", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const { frozen } = parseBody(adminFreezeSchema, request);
        const updated = await dependencies.adminService.setFrozen(request.auth.userId, userId, frozen);
        response.json({ user: toPublicUser(updated) });
    }));
    // Отметка SCAM: рядом с именем горит предупреждение, а описание подменяется
    // текстом о мошенничестве. Только владелец.
    router.post("/admin/:userId/scam", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const { scam } = parseBody(adminScamSchema, request);
        const updated = await dependencies.adminService.setScam(request.auth.userId, userId, scam);
        // Собеседники должны увидеть отметку и новое описание сразу, без перезагрузки.
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(userId),
        });
        response.json({ user: toPublicUser(updated) });
    }));
    // Отметка FAKE: рядом с именем горит рамка «FAKE», а описание подменяется
    // предупреждением о подделке под официальный аккаунт. Тоже только владелец.
    router.post("/admin/:userId/fake", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const { fake } = parseBody(adminFakeSchema, request);
        const updated = await dependencies.adminService.setFake(request.auth.userId, userId, fake);
        dependencies.events.publishUpdatedProfile({
            user: await dependencies.chatService.publicUser(userId),
        });
        response.json({ user: toPublicUser(updated) });
    }));
    // Знаки группы: галочка, значок Yargram и отметка SCAM. Владелец помечает
    // саму группу, а не её создателя, поэтому группу сначала ищут — по названию,
    // коду из ссылки-приглашения или по id.
    const adminGroupSearchSchema = z.object({ q: z.string().trim().max(128).default("") });
    const adminGroupMarksSchema = z
        .object({
        isVerified: z.boolean().optional(),
        // "" и null одинаково снимают значок — как в маршруте аккаунтов.
        badge: z
            .union([z.enum(["yargram", ""]), z.null()])
            .transform((value) => (value === "yargram" ? "yargram" : null))
            .optional(),
        scam: z.boolean().optional(),
        fake: z.boolean().optional(),
    })
        .refine((data) => Object.values(data).some((value) => value !== undefined), {
        message: "Нужен хотя бы один знак",
    });
    // Сводка по всей установке: сколько всего аккаунтов и групп. Только владелец.
    // Отдельная ручка, потому что по спискам этого не узнать: `GET /users` — это
    // поиск по подстроке с пределом выдачи, а в нём ещё и каждая беседа считается
    // отдельно; `GET /admin/groups` отдаёт только первые совпадения.
    router.get("/admin/stats", requireAuth, asyncHandler(async (request, response) => {
        const stats = await dependencies.adminService.stats(request.auth.userId);
        response.json({ stats });
    }));
    /**
     * Список аккаунтов для админ-панели: владелец раскрывает счётчик «Аккаунтов»
     * и видит, кто заведён. Отдельная ручка от `GET /users`, потому что тот —
     * поиск по людям: он исключает самого ищущего и не отдаёт удалённых, а
     * владельцу нужны как раз и удалённые, и замороженные.
     */
    const adminAccountsQuerySchema = z.object({
        q: z.string().trim().max(128).default(""),
        // Состояние записи: живой, замороженный или удалённый.
        filter: z.enum(["all", "active", "frozen", "deleted"]).default("all"),
        // Знаки через запятую: «verified,scam» — оба обязательны. Пусто — без отбора.
        marks: z
            .string()
            .trim()
            .max(128)
            .default("")
            .transform((value) => value
            .split(",")
            .map((mark) => mark.trim())
            .filter((mark) => ["verified", "badge", "scam", "fake", "owner", "bot"].includes(mark))),
        // Где искать введённое: ник, @юзернеймы или всё сразу.
        scope: z.enum(["any", "name", "handle"]).default("any"),
    });
    router.get("/admin/accounts", requireAuth, asyncHandler(async (request, response) => {
        const query = parseQuery(adminAccountsQuerySchema, request);
        const accounts = await dependencies.adminService.listAccounts(request.auth.userId, {
            query: query.q,
            filter: query.filter,
            marks: query.marks,
            scope: query.scope,
        });
        response.json({ accounts });
    }));
    /**
     * Служебные боты установки: владелец видит их перечень целиком, не выискивая
     * поиском. Метка ставится и снимается через `POST /admin/:userId/bot`.
     */
    router.get("/admin/bots", requireAuth, asyncHandler(async (request, response) => {
        const accounts = await dependencies.adminService.listBots(request.auth.userId);
        response.json({ accounts });
    }));
    router.get("/admin/groups", requireAuth, asyncHandler(async (request, response) => {
        const query = parseQuery(adminGroupSearchSchema, request);
        const groups = await dependencies.adminService.searchGroups(request.auth.userId, query.q);
        response.json({ groups });
    }));
    router.post("/admin/groups/:groupId/marks", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(adminGroupMarksSchema, request);
        const group = await dependencies.adminService.setGroupMarks(request.auth.userId, groupId, {
            ...(input.isVerified === undefined ? {} : { isVerified: input.isVerified }),
            ...(input.badge === undefined ? {} : { badge: input.badge }),
            ...(input.scam === undefined ? {} : { scam: input.scam }),
            ...(input.fake === undefined ? {} : { fake: input.fake }),
        });
        // Участники должны увидеть новую галочку, значок или рамку сразу, а не
        // после перезагрузки: вид беседы считается на каждого отдельно.
        for (const view of await dependencies.chatService.viewsForMembers(group.id)) {
            dependencies.events.publishConversationSettings(view);
        }
        response.json({ group });
    }));
    // Удаление аккаунта со всем, что ему принадлежало. Только владелец.
    router.delete("/admin/:userId", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        await dependencies.adminService.deleteUser(request.auth.userId, userId);
        response.json({ ok: true, userId });
    }));
    // Возврат удалённого аккаунта («разбан»). Только владелец.
    router.post("/admin/:userId/restore", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const updated = await dependencies.adminService.restoreUser(request.auth.userId, userId);
        response.json({ user: toPublicUser(updated) });
    }));
    router.delete("/admin/:userId/assign", requireAuth, asyncHandler(async (request, response) => {
        const grantorId = request.auth.userId;
        const { userId } = parseParams(userParamsSchema, request);
        const updated = await dependencies.adminService.unassignAdmin(grantorId, userId);
        response.json({ user: toPublicUser(updated) });
    }));
    router.get("/admin/users", requireAuth, asyncHandler(async (request, response) => {
        const grantorId = request.auth.userId;
        const admins = await dependencies.adminService.listAdmins(grantorId);
        response.json({ users: admins.map(toPublicUser) });
    }));
    router.put("/admin/:userId/assign", requireAuth, asyncHandler(async (request, response) => {
        const grantorId = request.auth.userId;
        const { userId } = parseParams(userParamsSchema, request);
        const updated = await dependencies.adminService.assignAdmin(grantorId, userId);
        response.json({ user: toPublicUser(updated) });
    }));
    router.get("/users/:userId", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const [user, currentUser] = await Promise.all([
            dependencies.repositories.users.findById(userId),
            dependencies.repositories.users.findById(request.auth.userId),
        ]);
        if (!user) {
            response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User was not found" } });
            return;
        }
        response.json({
            user: {
                ...toPublicUserFor(user, request.auth.userId),
                blockedByMe: currentUser?.blockedUserIds.includes(user.id) ?? false,
                // Кнопка дружбы в профиле: «добавить», «заявка отправлена»,
                // «принять заявку» или «вы друзья».
                friendship: currentUser
                    ? dependencies.friendService.friendshipState(currentUser, user.id, user)
                    : "none",
            },
        });
    }));
    // Что есть в переписке с этим человеком: профиль показывает только непустые разделы.
    router.get("/users/:userId/media-summary", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const summary = await dependencies.chatService.mediaSummary(request.auth.userId, userId);
        response.json({ summary });
    }));
    router.put("/users/:userId/block", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const result = await dependencies.chatService.setBlocked(request.auth.userId, userId, true);
        const user = await dependencies.chatService.publicUser(userId, request.auth.userId);
        response.json({ ...result, user: { ...user, blockedByMe: true } });
    }));
    router.delete("/users/:userId/block", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const result = await dependencies.chatService.setBlocked(request.auth.userId, userId, false);
        const user = await dependencies.chatService.publicUser(userId, request.auth.userId);
        response.json({ ...result, user: { ...user, blockedByMe: false } });
    }));
    // Друзья: заявка, принятие, отклонение и удаление. Список отдаём одним
    // запросом — экрану нужны и друзья, и обе очереди заявок сразу.
    router.get("/friends", requireAuth, asyncHandler(async (request, response) => {
        response.json(await dependencies.friendService.overview(request.auth.userId));
    }));
    router.post("/friends/:userId", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const state = await dependencies.friendService.request(request.auth.userId, userId);
        response.status(201).json({ state });
    }));
    router.post("/friends/:userId/accept", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        response.json({ state: await dependencies.friendService.accept(request.auth.userId, userId) });
    }));
    router.post("/friends/:userId/decline", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        response.json({ state: await dependencies.friendService.decline(request.auth.userId, userId) });
    }));
    router.delete("/friends/:userId", requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        response.json({ state: await dependencies.friendService.remove(request.auth.userId, userId) });
    }));
    // Personal notes (Favorites) – private per‑user storage
    router.get("/favorites/notes", requireAuth, asyncHandler(async (request, response) => {
        const notes = await dependencies.repositories.favoriteNotes.list(request.auth.userId);
        response.json({ notes });
    }));
    router.post("/favorites/notes", requireAuth, asyncHandler(async (request, response) => {
        const { content } = parseBody(z.object({ content: z.string().min(1).max(5000) }), request);
        const note = await dependencies.repositories.favoriteNotes.create({ userId: request.auth.userId, content });
        response.status(201).json({ note });
    }));
    router.put("/favorites/notes/:noteId", requireAuth, asyncHandler(async (request, response) => {
        const { noteId } = parseParams(z.object({ noteId: z.string().uuid() }), request);
        const { content } = parseBody(z.object({ content: z.string().min(1).max(5000) }), request);
        const note = await dependencies.repositories.favoriteNotes.update(noteId, request.auth.userId, content);
        response.json({ note });
    }));
    router.delete("/favorites/notes/:noteId", requireAuth, asyncHandler(async (request, response) => {
        const { noteId } = parseParams(z.object({ noteId: z.string().uuid() }), request);
        await dependencies.repositories.favoriteNotes.delete(noteId, request.auth.userId);
        response.status(204).end();
    }));
    // Personal drafts: one stored draft per account and conversation.
    router.get("/drafts", requireAuth, asyncHandler(async (request, response) => {
        response.json({ drafts: await dependencies.draftService.list(request.auth.userId) });
    }));
    router.put("/drafts/:conversationId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const input = parseBody(draftBodySchema, request);
        const draft = await dependencies.draftService.save(request.auth.userId, params.conversationId, {
            text: input.text,
            ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
            ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        });
        response.json({ draft });
    }));
    router.delete("/drafts/:conversationId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        await dependencies.draftService.clear(request.auth.userId, params.conversationId);
        response.status(204).end();
    }));
    // Personal chat folders.
    router.get("/folders", requireAuth, asyncHandler(async (request, response) => {
        response.json({ folders: await dependencies.folderService.list(request.auth.userId) });
    }));
    router.post("/folders", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(folderCreateSchema, request);
        const folder = await dependencies.folderService.create(request.auth.userId, {
            name: input.name,
            ...(input.conversationIds === undefined
                ? {}
                : { conversationIds: input.conversationIds }),
        });
        response.status(201).json({ folder });
    }));
    router.patch("/folders/:folderId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(folderParamsSchema, request);
        const input = parseBody(folderUpdateSchema, request);
        const folder = await dependencies.folderService.update(request.auth.userId, params.folderId, {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.position === undefined ? {} : { position: input.position }),
            ...(input.conversationIds === undefined
                ? {}
                : { conversationIds: input.conversationIds }),
        });
        response.json({ folder });
    }));
    router.delete("/folders/:folderId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(folderParamsSchema, request);
        await dependencies.folderService.delete(request.auth.userId, params.folderId);
        response.status(204).end();
    }));
    // Delayed messages: a durable per-account queue with a single server dispatcher.
    router.get("/scheduled", requireAuth, asyncHandler(async (request, response) => {
        response.json({
            scheduled: await dependencies.scheduledMessageService.list(request.auth.userId),
        });
    }));
    router.post("/conversations/:conversationId/scheduled", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const input = parseBody(scheduledCreateSchema, request);
        const scheduled = await dependencies.scheduledMessageService.create(request.auth.userId, params.conversationId, {
            text: input.text,
            sendAt: input.sendAt,
            ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
            ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        });
        response.status(201).json({ scheduled });
    }));
    router.patch("/scheduled/:scheduledId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(scheduledParamsSchema, request);
        const input = parseBody(scheduledUpdateSchema, request);
        const scheduled = await dependencies.scheduledMessageService.update(request.auth.userId, params.scheduledId, {
            ...(input.text === undefined ? {} : { text: input.text }),
            ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
            ...(input.sendAt === undefined ? {} : { sendAt: input.sendAt }),
        });
        response.json({ scheduled });
    }));
    router.delete("/scheduled/:scheduledId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(scheduledParamsSchema, request);
        const scheduled = await dependencies.scheduledMessageService.cancel(request.auth.userId, params.scheduledId);
        response.json({ scheduled });
    }));
    router.post("/uploads", requireAuth, asyncHandler(async (request, response) => {
        const { kind, mediaKind, durationSeconds } = parseQuery(uploadQuerySchema, request);
        const file = await readMultipartFile(request, {
            fieldName: "file",
            maxBodyBytes: uploadLimits[kind] + 64 * 1024,
        });
        const attachment = await dependencies.uploadService.upload(request.auth.userId, kind, {
            ...file,
            ...(mediaKind === undefined ? {} : { mediaKind }),
            ...(durationSeconds === undefined ? {} : { durationSeconds }),
        });
        response.status(201).json({ attachment });
    }));
    // Every link carries an expiring signature; the token owner must still have access.
    router.get("/uploads/:uploadId", asyncHandler(async (request, response) => {
        const { uploadId } = parseParams(uploadParamsSchema, request);
        const { download, t } = parseQuery(downloadQuerySchema, request);
        const { attachment, bytes } = await dependencies.uploadService.readAuthorizedFile(uploadId, t);
        // Оформление профиля отдаём инлайном: фон и баннер — часть интерфейса,
        // и «скачать файл» вместо показа сломало бы их. `image` — фото в переписке,
        // `sticker` и `gif` — то, что рисуется прямо в пузыре.
        const inline = !download && servesInline(attachment.kind);
        const fallbackName = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "download";
        const encodedName = encodeURIComponent(attachment.fileName).replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        response.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`);
        response.type(inline ? attachment.mimeType : "application/octet-stream");
        // Файл на диске зашифрован, поэтому отдаём уже расшифрованные байты.
        // Диапазоны (Range) поддерживаем вручную, чтобы аудио и видео можно было перематывать.
        response.setHeader("Accept-Ranges", "bytes");
        const range = parseByteRange(request.headers.range, bytes.length);
        if (range) {
            response.status(206);
            response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`);
            response.setHeader("Content-Length", String(range.end - range.start + 1));
            response.end(bytes.subarray(range.start, range.end + 1));
            return;
        }
        response.setHeader("Content-Length", String(bytes.length));
        response.end(bytes);
    }));
    // ---- Стикеры и наборы ----
    /** Все наборы человека: встроенные, свои и присланные. */
    router.get("/sticker-packs", requireAuth, asyncHandler(async (request, response) => {
        response.json({ packs: await dependencies.stickerService.listPacks(request.auth.userId) });
    }));
    router.get("/sticker-packs/:packId", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        response.json({ pack: await dependencies.stickerService.getPack(request.auth.userId, packId) });
    }));
    router.post("/sticker-packs", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(createStickerPackSchema, request);
        const pack = await dependencies.stickerService.createPack(request.auth.userId, input);
        response.status(201).json({ pack });
    }));
    router.patch("/sticker-packs/:packId", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        const input = parseBody(updateStickerPackSchema, request);
        response.json({
            pack: await dependencies.stickerService.updatePack(request.auth.userId, packId, input),
        });
    }));
    router.delete("/sticker-packs/:packId", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        await dependencies.stickerService.deletePack(request.auth.userId, packId);
        response.status(204).end();
    }));
    /**
     * Добавить стикер в свой набор. Файл грузится отдельным запросом (`kind=sticker`),
     * а здесь только ссылка на него: так загрузка остаётся общей для картинок,
     * и один файл нельзя случайно забыть приложить к двум наборам.
     */
    router.post("/sticker-packs/:packId/stickers", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        const input = parseBody(addStickerSchema, request);
        // Подпись нужна, чтобы отличить анимированный стикер от статичного: по
        // расширению это не определить (`.webp` бывает и таким, и другим).
        const file = await dependencies.uploadService.readOwnFile(request.auth.userId, input.attachmentId);
        const stored = await dependencies.repositories.attachments.findById(input.attachmentId);
        const pack = await dependencies.stickerService.addSticker(request.auth.userId, packId, input.attachmentId, file, stored?.mimeType ?? "image/png", input.emoji);
        response.status(201).json({ pack });
    }));
    router.delete("/sticker-packs/:packId/stickers/:stickerId", requireAuth, asyncHandler(async (request, response) => {
        const { packId, stickerId } = parseParams(stickerPackStickerParamsSchema, request);
        response.json({
            pack: await dependencies.stickerService.removeSticker(request.auth.userId, packId, stickerId),
        });
    }));
    /** Пригласить человека в набор: сообщение в беседу + набор у получателей. */
    router.post("/sticker-packs/:packId/share", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        const { conversationId } = parseBody(conversationIdSchema, request);
        const result = await dependencies.stickerService.sharePack(request.auth.userId, conversationId, packId, (senderId, targetConversationId, id) => dependencies.chatService.sendMessage(senderId, targetConversationId, "", undefined, {
            stickerPackId: id,
        }));
        // Сообщение уходит всем участникам, как и любое другое: карточку набора
        // в переписке видят все, а добавляется набор только тем, кому он нужен.
        dependencies.events.publishNewMessage(result);
        response.status(201).json({ message: result.message });
    }));
    router.post("/sticker-packs/:packId/install", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        response.json({ pack: await dependencies.stickerService.installPack(request.auth.userId, packId) });
    }));
    router.delete("/sticker-packs/:packId/install", requireAuth, asyncHandler(async (request, response) => {
        const { packId } = parseParams(stickerPackParamsSchema, request);
        await dependencies.stickerService.uninstallPack(request.auth.userId, packId);
        response.status(204).end();
    }));
    /** Библиотека гифок: загруженное можно слать снова и снова. */
    router.get("/gifs", requireAuth, asyncHandler(async (request, response) => {
        response.json({ gifs: await dependencies.stickerService.listGifs(request.auth.userId) });
    }));
    router.post("/conversations/saved", requireAuth, asyncHandler(async (request, response) => {
        const result = await dependencies.chatService.createSavedConversation(request.auth.userId);
        response.status(result.created ? 201 : 200).json(result);
    }));
    router.post("/conversations/direct", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(directConversationSchema, request);
        const result = await dependencies.chatService.createDirectConversation(request.auth.userId, input.userId);
        response.status(result.created ? 201 : 200).json(result);
    }));
    router.get("/conversations", requireAuth, asyncHandler(async (request, response) => {
        response.json({
            conversations: await dependencies.chatService.listConversations(request.auth.userId),
        });
    }));
    router.get("/conversations/:conversationId/messages", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const query = parseQuery(messageListQuerySchema, request);
        const messages = await dependencies.chatService.listMessages(request.auth.userId, params.conversationId, {
            limit: query.limit,
            ...(query.before === undefined ? {} : { before: query.before }),
            ...(query.q === undefined ? {} : { query: query.q }),
        });
        response.json({
            messages,
            nextCursor: messages.length === query.limit ? messages[0]?.createdAt ?? null : null,
        });
    }));
    /** Опрос изменился: рассылаем общий вид сообщения всем участникам. */
    const publishPollUpdate = async (messageId, memberIds) => {
        const broadcast = await dependencies.chatService.broadcastView(messageId);
        if (broadcast)
            dependencies.events.publishUpdatedMessage({ message: broadcast, memberIds });
    };
    router.post("/conversations/:conversationId/polls", requireAuth, asyncHandler(async (request, response) => {
        const { conversationId } = parseParams(conversationParamsSchema, request);
        const input = parseBody(createPollSchema, request);
        const result = await dependencies.chatService.createPoll(request.auth.userId, conversationId, input);
        dependencies.events.publishNewMessage(result);
        response.status(201).json({ message: result.message });
    }));
    // Голос и свой вариант ответа: после каждого меняем сообщение у всех, но
    // рассылаем общий вид — в анонимном опросе чужие голоса не уходят никому.
    router.post("/messages/:messageId/poll/vote", requireAuth, asyncHandler(async (request, response) => {
        const { messageId } = parseParams(messageIdParamsSchema, request);
        const { optionIds } = parseBody(pollVoteSchema, request);
        const result = await dependencies.chatService.votePoll(request.auth.userId, messageId, optionIds);
        await publishPollUpdate(messageId, result.memberIds);
        response.json({ message: result.message });
    }));
    router.post("/messages/:messageId/poll/options", requireAuth, asyncHandler(async (request, response) => {
        const { messageId } = parseParams(messageIdParamsSchema, request);
        const { text } = parseBody(pollOptionSchema, request);
        const result = await dependencies.chatService.addPollOption(request.auth.userId, messageId, text);
        await publishPollUpdate(messageId, result.memberIds);
        response.json({ message: result.message });
    }));
    router.post("/messages/:messageId/poll/close", requireAuth, asyncHandler(async (request, response) => {
        const { messageId } = parseParams(messageIdParamsSchema, request);
        const result = await dependencies.chatService.closePoll(request.auth.userId, messageId);
        await publishPollUpdate(messageId, result.memberIds);
        response.json({ message: result.message });
    }));
    router.post("/conversations/:conversationId/messages", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const input = parseBody(sendMessageSchema.omit({ conversationId: true }), request);
        const result = await dependencies.chatService.sendMessage(request.auth.userId, params.conversationId, input.text, input.replyToId, {
            ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
            // 🔥 Стикеры обязаны дойти до сервиса: без этого сообщение оказывалось
            // пустым, и отправка стикера отвергалась с `MESSAGE_EMPTY`.
            ...(input.stickerIds === undefined ? {} : { stickerIds: input.stickerIds }),
            ...(input.forwardedFromId === undefined ? {} : { forwardedFromId: input.forwardedFromId }),
            ...(input.stickerPackId === undefined ? {} : { stickerPackId: input.stickerPackId }),
        });
        dependencies.events.publishNewMessage(result);
        response.status(201).json({ message: result.message });
    }));
    router.post("/conversations/:conversationId/read", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const result = await dependencies.chatService.markConversationRead(request.auth.userId, params.conversationId);
        dependencies.events.publishReadMessages(result);
        response.json({ receipt: result.receipt });
    }));
    router.patch("/conversations/:conversationId/messages/:messageId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(messageParamsSchema, request);
        const input = parseBody(editMessageSchema, request);
        const result = await dependencies.chatService.updateMessage(request.auth.userId, params.conversationId, params.messageId, input.text);
        dependencies.events.publishUpdatedMessage(result);
        response.json({ message: result.message });
    }));
    router.delete("/conversations/:conversationId/messages/:messageId", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(messageParamsSchema, request);
        const result = await dependencies.chatService.deleteMessage(request.auth.userId, params.conversationId, params.messageId);
        dependencies.events.publishDeletedMessage(result);
        response.json({ messageId: result.messageId, conversation: result.conversation });
    }));
    router.post("/conversations/:conversationId/messages/:messageId/reactions", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(messageParamsSchema, request);
        const { emoji } = parseBody(reactionSchema, request);
        const result = await dependencies.chatService.setReaction(request.auth.userId, params.conversationId, params.messageId, emoji);
        dependencies.events.publishReaction(result);
        response.json({ message: result.message });
    }));
    router.delete("/conversations/:conversationId/messages/:messageId/reactions", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(messageParamsSchema, request);
        const result = await dependencies.chatService.setReaction(request.auth.userId, params.conversationId, params.messageId, null);
        dependencies.events.publishReaction(result);
        response.json({ message: result.message });
    }));
    const setFavorite = (favorite) => asyncHandler(async (request, response) => {
        const params = parseParams(messageParamsSchema, request);
        const result = await dependencies.chatService.setFavorite(request.auth.userId, params.conversationId, params.messageId, favorite);
        response.json({ message: result.message });
    });
    router.put("/conversations/:conversationId/messages/:messageId/favorite", requireAuth, setFavorite(true));
    router.delete("/conversations/:conversationId/messages/:messageId/favorite", requireAuth, setFavorite(false));
    router.get("/favorites", requireAuth, asyncHandler(async (request, response) => {
        response.json({ messages: await dependencies.chatService.listFavorites(request.auth.userId) });
    }));
    router.post("/conversations/:conversationId/messages/:messageId/forward", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(messageParamsSchema, request);
        const { targetConversationId } = parseBody(forwardSchema, request);
        const result = await dependencies.chatService.forwardMessage(request.auth.userId, params.conversationId, params.messageId, targetConversationId);
        dependencies.events.publishNewMessage(result);
        response.status(201).json({ message: result.message });
    }));
    // Yargram 0.1 compatibility: this endpoint keeps one latest pin and clearing it
    // still clears all pins, while the v2 endpoints below manage individual pins.
    router.put("/conversations/:conversationId/pin", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const input = parseBody(pinMessageSchema, request);
        const result = await dependencies.chatService.setPinnedMessage(request.auth.userId, params.conversationId, input.messageId);
        dependencies.events.publishPinnedMessage(result);
        response.json({ pinnedMessage: result.message, pinnedMessages: result.pinnedMessages });
    }));
    router.delete("/conversations/:conversationId/pin", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const result = await dependencies.chatService.setPinnedMessage(request.auth.userId, params.conversationId, null);
        dependencies.events.publishPinnedMessage(result);
        response.json({ pinnedMessage: null, pinnedMessages: [] });
    }));
    const setPin = (pinned) => asyncHandler(async (request, response) => {
        const params = parseParams(pinParamsSchema, request);
        const result = await dependencies.chatService.setMessagePinned(request.auth.userId, params.conversationId, params.messageId, pinned);
        dependencies.events.publishPinnedMessage(result);
        response.json({ pinnedMessage: result.message, pinnedMessages: result.pinnedMessages });
    });
    router.put("/conversations/:conversationId/pins/:messageId", requireAuth, setPin(true));
    router.delete("/conversations/:conversationId/pins/:messageId", requireAuth, setPin(false));
    router.patch("/conversations/:conversationId/settings", requireAuth, asyncHandler(async (request, response) => {
        const params = parseParams(conversationParamsSchema, request);
        const input = parseBody(conversationSettingsSchema, request);
        const result = await dependencies.chatService.updateConversationSettings(request.auth.userId, params.conversationId, {
            ...(input.archived === undefined ? {} : { archived: input.archived }),
            ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }),
        });
        dependencies.events.publishConversationSettings({
            userId: request.auth.userId,
            conversation: result.conversation,
        });
        response.json({ conversation: result.conversation });
    }));
    router.post(["/users/:userId/report", "/users/:userId/reports"], requireAuth, asyncHandler(async (request, response) => {
        const { userId } = parseParams(userParamsSchema, request);
        const input = parseBody(reportSchema, request);
        const report = await dependencies.chatService.reportUser(request.auth.userId, userId, input.reason, input.details);
        response.status(201).json({ ok: true, reportId: report.id });
    }));
    // ---- Группы ----
    router.post("/groups", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(createGroupSchema, request);
        const result = await dependencies.groupService.createGroup(request.auth.userId, {
            title: input.title,
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
            memberIds: input.memberIds ?? input.userIds ?? [],
        });
        response.status(201).json(result);
    }));
    router.post("/groups/join", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(joinGroupSchema, request);
        const result = await dependencies.groupService.joinByInvite(request.auth.userId, input.code ?? input.inviteCode ?? "");
        response.json(result);
    }));
    router.get("/groups/:groupId/members", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const query = parseQuery(membersQuerySchema, request);
        const result = await dependencies.groupService.listMembers(request.auth.userId, groupId, query.q);
        response.json(result);
    }));
    router.get("/groups/:groupId/history", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        response.json(await dependencies.groupService.history(request.auth.userId, groupId));
    }));
    router.patch("/groups/:groupId", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(updateGroupSchema, request);
        response.json(await dependencies.groupService.updateInfo(request.auth.userId, groupId, input));
    }));
    router.post("/groups/:groupId/members", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(addMembersSchema, request);
        response.json(await dependencies.groupService.addMembers(request.auth.userId, groupId, input.userIds ?? input.memberIds ?? []));
    }));
    router.delete("/groups/:groupId/members/:userId", requireAuth, asyncHandler(async (request, response) => {
        const { groupId, userId } = parseParams(groupMemberParamsSchema, request);
        response.json(await dependencies.groupService.removeMember(request.auth.userId, groupId, userId));
    }));
    router.post("/groups/:groupId/leave", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        response.json(await dependencies.groupService.leaveGroup(request.auth.userId, groupId));
    }));
    router.post("/groups/:groupId/admins", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(setAdminSchema, request);
        response.json(await dependencies.groupService.setAdmin(request.auth.userId, groupId, input.userId, input.admin, input.permissions));
    }));
    router.put("/groups/:groupId/permissions", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(groupPermissionsBodySchema, request);
        response.json(await dependencies.groupService.setPermissions(request.auth.userId, groupId, input.permissions));
    }));
    router.post("/groups/:groupId/restrict", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(restrictMemberSchema, request);
        response.json(await dependencies.groupService.restrictMember(request.auth.userId, groupId, input.userId, {
            ...(input.permissions ? { permissions: input.permissions } : {}),
            ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }),
        }));
    }));
    router.put("/groups/:groupId/tag", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        const input = parseBody(memberTagSchema, request);
        response.json(await dependencies.groupService.setMemberTag(request.auth.userId, groupId, input.userId, input.tag));
    }));
    router.post("/groups/:groupId/invite", requireAuth, asyncHandler(async (request, response) => {
        const { groupId } = parseParams(groupParamsSchema, request);
        response.json(await dependencies.groupService.regenerateInvite(request.auth.userId, groupId));
    }));
    // ---- Поддержка ----
    //
    // Бот поддержки: открыть с ним переписку и нажать кнопку. Кнопка уходит
    // кодом действия, а не сообщением, поэтому в истории не остаётся «нажатий»,
    // а сам человек видит только осмысленную переписку с ботом.
    const supportActionSchema = z.object({
        conversationId: z.string().uuid(),
        action: z.string().trim().min(1).max(32),
    });
    router.get("/support", requireAuth, asyncHandler(async (request, response) => {
        response.json(await dependencies.supportBotService.openFor(request.auth.userId));
    }));
    router.post("/support/actions", requireAuth, asyncHandler(async (request, response) => {
        const input = parseBody(supportActionSchema, request);
        await dependencies.supportBotService.handleAction(request.auth.userId, input.conversationId, input.action);
        response.json({ ok: true });
    }));
    // ---- Реле для звонков ----
    //
    // 🔥 Зачем маршрут, если звонки идут по WebSocket. Свой `coturn` требует root
    // и UDP — на хостинге приложений этого нет. Публичные реле вместо него выдают
    // **временные** логин и пароль, и зашить их в сборку нельзя: браузер просит
    // их прямо перед звонком. Ключ сервиса при этом остаётся на сервере и не
    // светится в «Сети» у пользователя.
    //
    // Не настроен — отдаём пустой список, и звонок идёт на одном STUN, как раньше.
    router.get("/calls/ice-servers", requireAuth, asyncHandler(async (_request, response) => {
        const { turnCredentialsUrl, turnCredentialsTtlSeconds } = dependencies.config;
        response.json({
            iceServers: turnCredentialsUrl
                ? await fetchTurnIceServers(turnCredentialsUrl, turnCredentialsTtlSeconds)
                : [],
        });
    }));
    return router;
}
/**
 * Токен доступа из заголовка. Он нужен не только для проверки подписи, но и
 * чтобы узнать, какой именно сеанс открыл список: завершать чужие сеансы можно
 * только с того, который сам вошёл больше суток назад.
 */
function bearerToken(request) {
    const authorization = request.header("Authorization");
    if (!authorization?.startsWith("Bearer "))
        return null;
    return authorization.slice("Bearer ".length).trim() || null;
}
/**
 * Разбирает заголовок Range. Поддерживаем только один диапазон: его достаточно
 * браузерам, чтобы перематывать аудио и видео. Всё непонятное — отдаём целиком.
 */
function parseByteRange(header, size) {
    if (!header)
        return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match)
        return null;
    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd)
        return null;
    let start;
    let end;
    if (!rawStart) {
        const suffix = Number(rawEnd);
        if (!Number.isFinite(suffix) || suffix <= 0)
            return null;
        start = Math.max(0, size - suffix);
        end = size - 1;
    }
    else {
        start = Number(rawStart);
        end = rawEnd ? Number(rawEnd) : size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end))
        return null;
    if (start > end || start >= size)
        return null;
    return { start, end: Math.min(end, size - 1) };
}
//# sourceMappingURL=routes.js.map