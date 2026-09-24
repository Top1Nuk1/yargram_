import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  allowedReactionEmojis,
  groupPermissions,
  toPublicUser,
  toPublicUserFor,
} from "../domain/models.js";
import { asyncHandler } from "../lib/errors.js";
import { parseBody, parseParams, parseQuery } from "../lib/validation.js";
import type { Repositories } from "../repositories/types.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { AuthService } from "../services/auth-service.js";
import type { AdminService } from "../services/admin-service.js";
import type { ChatService } from "../services/chat-service.js";
import { MUTE_FOREVER, type GroupService } from "../services/group-service.js";
import type { DraftService } from "../services/draft-service.js";
import type { FolderService } from "../services/folder-service.js";
import type { ScheduledMessageService } from "../services/scheduled-message-service.js";
import { uploadLimits, type UploadService } from "../services/upload-service.js";
import { createAuthMiddleware } from "./auth-middleware.js";
import { readMultipartFile } from "./multipart.js";

const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/, "Username may contain letters, digits and underscores"),
  );

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

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    username: usernameSchema.optional(),
    bio: z.string().trim().max(500).optional(),
    notificationSoundEnabled: z.boolean().optional(),
    showLastSeen: z.boolean().optional(),
    themeColor: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    wallpaperUrl: z.union([z.literal(""), z.string().trim().url()]).optional(),
    // День рождения в профиле как в Telegram: просто дата без года обязателен.
    birthday: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Birthday must be a YYYY-MM-DD date")
      .nullable()
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
const uploadParamsSchema = z.object({ uploadId: z.string().uuid() });
const uploadQuerySchema = z.object({
  kind: z.enum(["image", "file"]),
  mediaKind: z.enum(["voice", "video_circle"]).optional(),
  durationSeconds: z.coerce.number().finite().positive().optional(),
}).superRefine((input, context) => {
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
});

const editMessageSchema = z.object({ text: z.string().trim().max(4_000) });
const pinMessageSchema = z.object({ messageId: z.string().uuid() });
const reactionSchema = z.object({ emoji: z.enum(allowedReactionEmojis) });
const forwardSchema = z.object({ targetConversationId: z.string().uuid() });

// ---- Группы ----
// Ключи прав берём из домена: отдельный список рано или поздно разъедется с ним.
const groupPermissionsSchema = z.object(
  Object.fromEntries(groupPermissions.map((permission) => [permission, z.boolean().optional()])),
);
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

export function createApiRouter(dependencies: {
  authService: AuthService;
  adminService: AdminService;
  chatService: ChatService;
  groupService: GroupService;
  draftService: DraftService;
  folderService: FolderService;
  scheduledMessageService: ScheduledMessageService;
  uploadService: UploadService;
  repositories: Repositories;
  events: RealtimeEvents;
}): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(dependencies.authService);
  // The limiter belongs to one app instance: separate servers and tests must not
  // share attempt counters.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: { code: "AUTH_RATE_LIMITED", message: "Too many authentication attempts" },
      });
    },
  });

  router.post(
    "/auth/register",
    authLimiter,
    asyncHandler(async (request, response) => {
      const input = parseBody(registerSchema, request);
      const result = await dependencies.authService.register({
        email: input.email,
        password: input.password,
        displayName: input.displayName ?? (input.name as string),
        ...(input.username === undefined ? {} : { username: input.username }),
      });
      response.status(201).json(result);
    }),
  );

  router.post(
    "/auth/login",
    authLimiter,
    asyncHandler(async (request, response) => {
      const input = parseBody(loginSchema, request);
      response.json(await dependencies.authService.login(input.email, input.password));
    }),
  );

  router.get(
    "/auth/me",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({ user: await dependencies.authService.getCurrentUser(request.auth.userId) });
    }),
  );

  router.patch(
    "/users/me",
    requireAuth,
    asyncHandler(async (request, response) => {
      const input = parseBody(updateProfileSchema, request);
      const user = await dependencies.authService.updateProfile(request.auth.userId, input);
      dependencies.events.publishUpdatedProfile({
        user: await dependencies.chatService.publicUser(request.auth.userId),
      });
      response.json({ user });
    }),
  );

  router.post(
    "/users/me/avatar",
    requireAuth,
    asyncHandler(async (request, response) => {
      const file = await readMultipartFile(request, {
        fieldName: "avatar",
        maxBodyBytes: uploadLimits.avatar + 64 * 1024,
      });
      const user = await dependencies.uploadService.setAvatar(request.auth.userId, file);
      dependencies.events.publishUpdatedProfile({
        user: await dependencies.chatService.publicUser(request.auth.userId),
      });
      response.status(201).json({ user });
    }),
  );

  router.delete(
    "/users/me/avatar",
    requireAuth,
    asyncHandler(async (request, response) => {
      const user = await dependencies.uploadService.removeAvatar(request.auth.userId);
      dependencies.events.publishUpdatedProfile({
        user: await dependencies.chatService.publicUser(request.auth.userId),
      });
      response.json({ user });
    }),
  );

  router.get(
    "/users/me/blocked",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({ users: await dependencies.chatService.listBlocked(request.auth.userId) });
    }),
  );

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
      users: users
        .filter((user) => !user.isDeleted)
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

  router.post(
    "/admin/:userId/grant",
    requireAuth,
    asyncHandler(async (request, response) => {
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
    }),
  );

  // Заморозка: аккаунт остаётся, но войти им нельзя. Только владелец.
  router.post(
    "/admin/:userId/freeze",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { userId } = parseParams(userParamsSchema, request);
      const { frozen } = parseBody(adminFreezeSchema, request);
      const updated = await dependencies.adminService.setFrozen(request.auth.userId, userId, frozen);
      response.json({ user: toPublicUser(updated) });
    }),
  );

  // Удаление аккаунта со всем, что ему принадлежало. Только владелец.
  router.delete(
    "/admin/:userId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { userId } = parseParams(userParamsSchema, request);
      await dependencies.adminService.deleteUser(request.auth.userId, userId);
      response.json({ ok: true, userId });
    }),
  );

  // Возврат удалённого аккаунта («разбан»). Только владелец.
  router.post(
    "/admin/:userId/restore",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { userId } = parseParams(userParamsSchema, request);
      const updated = await dependencies.adminService.restoreUser(request.auth.userId, userId);
      response.json({ user: toPublicUser(updated) });
    }),
  );

  router.delete(
    "/admin/:userId/assign",
    requireAuth,
    asyncHandler(async (request, response) => {
      const grantorId = request.auth.userId;
      const { userId } = parseParams(userParamsSchema, request);
      const updated = await dependencies.adminService.unassignAdmin(grantorId, userId);
      response.json({ user: toPublicUser(updated) });
    }),
  );

  router.get(
    "/admin/users",
    requireAuth,
    asyncHandler(async (request, response) => {
      const grantorId = request.auth.userId;
      const admins = await dependencies.adminService.listAdmins(grantorId);
      response.json({ users: admins.map(toPublicUser) });
    }),
  );

  router.put(
    "/admin/:userId/assign",
    requireAuth,
    asyncHandler(async (request, response) => {
      const grantorId = request.auth.userId;
      const { userId } = parseParams(userParamsSchema, request);
      const updated = await dependencies.adminService.assignAdmin(grantorId, userId);
      response.json({ user: toPublicUser(updated) });
    }),
  );

  router.get(
    "/users/:userId",
    requireAuth,
    asyncHandler(async (request, response) => {
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
        },
      });
    }),
  );

  // Что есть в переписке с этим человеком: профиль показывает только непустые разделы.
  router.get(
    "/users/:userId/media-summary",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { userId } = parseParams(userParamsSchema, request);
      const summary = await dependencies.chatService.mediaSummary(request.auth.userId, userId);
      response.json({ summary });
    }),
  );

  router.put(
    "/users/:userId/block",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { userId } = parseParams(userParamsSchema, request);
      const result = await dependencies.chatService.setBlocked(request.auth.userId, userId, true);
      const user = await dependencies.chatService.publicUser(userId, request.auth.userId);
      response.json({ ...result, user: { ...user, blockedByMe: true } });
    }),
  );

  router.delete(
    "/users/:userId/block",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { userId } = parseParams(userParamsSchema, request);
      const result = await dependencies.chatService.setBlocked(request.auth.userId, userId, false);
      const user = await dependencies.chatService.publicUser(userId, request.auth.userId);
      response.json({ ...result, user: { ...user, blockedByMe: false } });
    }),
  );

  // Personal notes (Favorites) – private per‑user storage
  router.get(
    "/favorites/notes",
    requireAuth,
    asyncHandler(async (request, response) => {
      const notes = await dependencies.repositories.favoriteNotes.list(request.auth.userId);
      response.json({ notes });
    }),
  );

  router.post(
    "/favorites/notes",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { content } = parseBody(z.object({ content: z.string().min(1).max(5000) }), request);
      const note = await dependencies.repositories.favoriteNotes.create({ userId: request.auth.userId, content });
      response.status(201).json({ note });
    }),
  );

  router.put(
    "/favorites/notes/:noteId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { noteId } = parseParams(z.object({ noteId: z.string().uuid() }), request);
      const { content } = parseBody(z.object({ content: z.string().min(1).max(5000) }), request);
      const note = await dependencies.repositories.favoriteNotes.update(noteId, request.auth.userId, content);
      response.json({ note });
    }),
  );

  router.delete(
    "/favorites/notes/:noteId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { noteId } = parseParams(z.object({ noteId: z.string().uuid() }), request);
      await dependencies.repositories.favoriteNotes.delete(noteId, request.auth.userId);
      response.status(204).end();
    }),
  );




  // Personal drafts: one stored draft per account and conversation.
  router.get(
    "/drafts",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({ drafts: await dependencies.draftService.list(request.auth.userId) });
    }),
  );

  router.put(
    "/drafts/:conversationId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const input = parseBody(draftBodySchema, request);
      const draft = await dependencies.draftService.save(
        request.auth.userId,
        params.conversationId,
        {
          text: input.text,
          ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
          ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        },
      );
      response.json({ draft });
    }),
  );

  router.delete(
    "/drafts/:conversationId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      await dependencies.draftService.clear(request.auth.userId, params.conversationId);
      response.status(204).end();
    }),
  );

  // Personal chat folders.
  router.get(
    "/folders",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({ folders: await dependencies.folderService.list(request.auth.userId) });
    }),
  );

  router.post(
    "/folders",
    requireAuth,
    asyncHandler(async (request, response) => {
      const input = parseBody(folderCreateSchema, request);
      const folder = await dependencies.folderService.create(request.auth.userId, {
        name: input.name,
        ...(input.conversationIds === undefined
          ? {}
          : { conversationIds: input.conversationIds }),
      });
      response.status(201).json({ folder });
    }),
  );

  router.patch(
    "/folders/:folderId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(folderParamsSchema, request);
      const input = parseBody(folderUpdateSchema, request);
      const folder = await dependencies.folderService.update(
        request.auth.userId,
        params.folderId,
        {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.position === undefined ? {} : { position: input.position }),
          ...(input.conversationIds === undefined
            ? {}
            : { conversationIds: input.conversationIds }),
        },
      );
      response.json({ folder });
    }),
  );

  router.delete(
    "/folders/:folderId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(folderParamsSchema, request);
      await dependencies.folderService.delete(request.auth.userId, params.folderId);
      response.status(204).end();
    }),
  );

  // Delayed messages: a durable per-account queue with a single server dispatcher.
  router.get(
    "/scheduled",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({
        scheduled: await dependencies.scheduledMessageService.list(request.auth.userId),
      });
    }),
  );

  router.post(
    "/conversations/:conversationId/scheduled",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const input = parseBody(scheduledCreateSchema, request);
      const scheduled = await dependencies.scheduledMessageService.create(
        request.auth.userId,
        params.conversationId,
        {
          text: input.text,
          sendAt: input.sendAt,
          ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
          ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
        },
      );
      response.status(201).json({ scheduled });
    }),
  );

  router.patch(
    "/scheduled/:scheduledId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(scheduledParamsSchema, request);
      const input = parseBody(scheduledUpdateSchema, request);
      const scheduled = await dependencies.scheduledMessageService.update(
        request.auth.userId,
        params.scheduledId,
        {
          ...(input.text === undefined ? {} : { text: input.text }),
          ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
          ...(input.sendAt === undefined ? {} : { sendAt: input.sendAt }),
        },
      );
      response.json({ scheduled });
    }),
  );

  router.delete(
    "/scheduled/:scheduledId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(scheduledParamsSchema, request);
      const scheduled = await dependencies.scheduledMessageService.cancel(
        request.auth.userId,
        params.scheduledId,
      );
      response.json({ scheduled });
    }),
  );

  router.post(
    "/uploads",
    requireAuth,
    asyncHandler(async (request, response) => {
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
    }),
  );

  // Every link carries an expiring signature; the token owner must still have access.
  router.get(
    "/uploads/:uploadId",
    asyncHandler(async (request, response) => {
      const { uploadId } = parseParams(uploadParamsSchema, request);
      const { download, t } = parseQuery(downloadQuerySchema, request);
      const { attachment, bytes } = await dependencies.uploadService.readAuthorizedFile(
        uploadId,
        t,
      );
      const inline = !download && (attachment.kind === "image" || attachment.kind === "avatar");
      const fallbackName = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "download";
      const encodedName = encodeURIComponent(attachment.fileName).replace(
        /['()]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      response.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      );
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
    }),
  );

  router.post(
    "/conversations/saved",
    requireAuth,
    asyncHandler(async (request, response) => {
      const result = await dependencies.chatService.createSavedConversation(request.auth.userId);
      response.status(result.created ? 201 : 200).json(result);
    }),
  );

  router.post(
    "/conversations/direct",
    requireAuth,
    asyncHandler(async (request, response) => {
      const input = parseBody(directConversationSchema, request);
      const result = await dependencies.chatService.createDirectConversation(
        request.auth.userId,
        input.userId,
      );
      response.status(result.created ? 201 : 200).json(result);
    }),
  );

  router.get(
    "/conversations",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({
        conversations: await dependencies.chatService.listConversations(request.auth.userId),
      });
    }),
  );

  router.get(
    "/conversations/:conversationId/messages",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const query = parseQuery(messageListQuerySchema, request);
      const messages = await dependencies.chatService.listMessages(
        request.auth.userId,
        params.conversationId,
        {
          limit: query.limit,
          ...(query.before === undefined ? {} : { before: query.before }),
          ...(query.q === undefined ? {} : { query: query.q }),
        },
      );
      response.json({
        messages,
        nextCursor: messages.length === query.limit ? messages[0]?.createdAt ?? null : null,
      });
    }),
  );

  /** Опрос изменился: рассылаем общий вид сообщения всем участникам. */
  const publishPollUpdate = async (messageId: string, memberIds: string[]) => {
    const broadcast = await dependencies.chatService.broadcastView(messageId);
    if (broadcast) dependencies.events.publishUpdatedMessage({ message: broadcast, memberIds });
  };

  router.post(
    "/conversations/:conversationId/polls",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { conversationId } = parseParams(conversationParamsSchema, request);
      const input = parseBody(createPollSchema, request);
      const result = await dependencies.chatService.createPoll(
        request.auth.userId,
        conversationId,
        input,
      );
      dependencies.events.publishNewMessage(result);
      response.status(201).json({ message: result.message });
    }),
  );

  // Голос и свой вариант ответа: после каждого меняем сообщение у всех, но
  // рассылаем общий вид — в анонимном опросе чужие голоса не уходят никому.
  router.post(
    "/messages/:messageId/poll/vote",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { messageId } = parseParams(messageIdParamsSchema, request);
      const { optionIds } = parseBody(pollVoteSchema, request);
      const result = await dependencies.chatService.votePoll(
        request.auth.userId,
        messageId,
        optionIds,
      );
      await publishPollUpdate(messageId, result.memberIds);
      response.json({ message: result.message });
    }),
  );

  router.post(
    "/messages/:messageId/poll/options",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { messageId } = parseParams(messageIdParamsSchema, request);
      const { text } = parseBody(pollOptionSchema, request);
      const result = await dependencies.chatService.addPollOption(
        request.auth.userId,
        messageId,
        text,
      );
      await publishPollUpdate(messageId, result.memberIds);
      response.json({ message: result.message });
    }),
  );

  router.post(
    "/messages/:messageId/poll/close",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { messageId } = parseParams(messageIdParamsSchema, request);
      const result = await dependencies.chatService.closePoll(request.auth.userId, messageId);
      await publishPollUpdate(messageId, result.memberIds);
      response.json({ message: result.message });
    }),
  );

  router.post(
    "/conversations/:conversationId/messages",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const input = parseBody(sendMessageSchema.omit({ conversationId: true }), request);
      const result = await dependencies.chatService.sendMessage(
        request.auth.userId,
        params.conversationId,
        input.text,
        input.replyToId,
        {
          ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
          ...(input.forwardedFromId === undefined ? {} : { forwardedFromId: input.forwardedFromId }),
        },
      );
      dependencies.events.publishNewMessage(result);
      response.status(201).json({ message: result.message });
    }),
  );

  router.post(
    "/conversations/:conversationId/read",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const result = await dependencies.chatService.markConversationRead(
        request.auth.userId,
        params.conversationId,
      );
      dependencies.events.publishReadMessages(result);
      response.json({ receipt: result.receipt });
    }),
  );

  router.patch(
    "/conversations/:conversationId/messages/:messageId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(messageParamsSchema, request);
      const input = parseBody(editMessageSchema, request);
      const result = await dependencies.chatService.updateMessage(
        request.auth.userId,
        params.conversationId,
        params.messageId,
        input.text,
      );
      dependencies.events.publishUpdatedMessage(result);
      response.json({ message: result.message });
    }),
  );

  router.delete(
    "/conversations/:conversationId/messages/:messageId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(messageParamsSchema, request);
      const result = await dependencies.chatService.deleteMessage(
        request.auth.userId,
        params.conversationId,
        params.messageId,
      );
      dependencies.events.publishDeletedMessage(result);
      response.json({ messageId: result.messageId, conversation: result.conversation });
    }),
  );

  router.post(
    "/conversations/:conversationId/messages/:messageId/reactions",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(messageParamsSchema, request);
      const { emoji } = parseBody(reactionSchema, request);
      const result = await dependencies.chatService.setReaction(
        request.auth.userId,
        params.conversationId,
        params.messageId,
        emoji,
      );
      dependencies.events.publishReaction(result);
      response.json({ message: result.message });
    }),
  );

  router.delete(
    "/conversations/:conversationId/messages/:messageId/reactions",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(messageParamsSchema, request);
      const result = await dependencies.chatService.setReaction(
        request.auth.userId,
        params.conversationId,
        params.messageId,
        null,
      );
      dependencies.events.publishReaction(result);
      response.json({ message: result.message });
    }),
  );

  const setFavorite = (favorite: boolean) =>
    asyncHandler(async (request, response) => {
      const params = parseParams(messageParamsSchema, request);
      const result = await dependencies.chatService.setFavorite(
        request.auth.userId,
        params.conversationId,
        params.messageId,
        favorite,
      );
      response.json({ message: result.message });
    });
  router.put("/conversations/:conversationId/messages/:messageId/favorite", requireAuth, setFavorite(true));
  router.delete("/conversations/:conversationId/messages/:messageId/favorite", requireAuth, setFavorite(false));

  router.get(
    "/favorites",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json({ messages: await dependencies.chatService.listFavorites(request.auth.userId) });
    }),
  );

  router.post(
    "/conversations/:conversationId/messages/:messageId/forward",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(messageParamsSchema, request);
      const { targetConversationId } = parseBody(forwardSchema, request);
      const result = await dependencies.chatService.forwardMessage(
        request.auth.userId,
        params.conversationId,
        params.messageId,
        targetConversationId,
      );
      dependencies.events.publishNewMessage(result);
      response.status(201).json({ message: result.message });
    }),
  );

  // Yargram 0.1 compatibility: this endpoint keeps one latest pin and clearing it
  // still clears all pins, while the v2 endpoints below manage individual pins.
  router.put(
    "/conversations/:conversationId/pin",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const input = parseBody(pinMessageSchema, request);
      const result = await dependencies.chatService.setPinnedMessage(
        request.auth.userId,
        params.conversationId,
        input.messageId,
      );
      dependencies.events.publishPinnedMessage(result);
      response.json({ pinnedMessage: result.message, pinnedMessages: result.pinnedMessages });
    }),
  );

  router.delete(
    "/conversations/:conversationId/pin",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const result = await dependencies.chatService.setPinnedMessage(
        request.auth.userId,
        params.conversationId,
        null,
      );
      dependencies.events.publishPinnedMessage(result);
      response.json({ pinnedMessage: null, pinnedMessages: [] });
    }),
  );

  const setPin = (pinned: boolean) =>
    asyncHandler(async (request, response) => {
      const params = parseParams(pinParamsSchema, request);
      const result = await dependencies.chatService.setMessagePinned(
        request.auth.userId,
        params.conversationId,
        params.messageId,
        pinned,
      );
      dependencies.events.publishPinnedMessage(result);
      response.json({ pinnedMessage: result.message, pinnedMessages: result.pinnedMessages });
    });
  router.put("/conversations/:conversationId/pins/:messageId", requireAuth, setPin(true));
  router.delete("/conversations/:conversationId/pins/:messageId", requireAuth, setPin(false));

  router.patch(
    "/conversations/:conversationId/settings",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = parseParams(conversationParamsSchema, request);
      const input = parseBody(conversationSettingsSchema, request);
      const result = await dependencies.chatService.updateConversationSettings(
        request.auth.userId,
        params.conversationId,
        {
          ...(input.archived === undefined ? {} : { archived: input.archived }),
          ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }),
        },
      );
      dependencies.events.publishConversationSettings({
        userId: request.auth.userId,
        conversation: result.conversation,
      });
      response.json({ conversation: result.conversation });
    }),
  );

  router.post(
  ["/users/:userId/report", "/users/:userId/reports"],
  requireAuth,
  asyncHandler(async (request, response) => {
    const { userId } = parseParams(userParamsSchema, request);
    const input = parseBody(reportSchema, request);
    const report = await dependencies.chatService.reportUser(
      request.auth.userId,
      userId,
      input.reason,
      input.details,
    );
    response.status(201).json({ ok: true, reportId: report.id });
  }),
);

  // ---- Группы ----
  router.post(
    "/groups",
    requireAuth,
    asyncHandler(async (request, response) => {
      const input = parseBody(createGroupSchema, request);
      const result = await dependencies.groupService.createGroup(request.auth.userId, {
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
        memberIds: input.memberIds ?? input.userIds ?? [],
      });
      response.status(201).json(result);
    }),
  );

  router.post(
    "/groups/join",
    requireAuth,
    asyncHandler(async (request, response) => {
      const input = parseBody(joinGroupSchema, request);
      const result = await dependencies.groupService.joinByInvite(
        request.auth.userId,
        input.code ?? input.inviteCode ?? "",
      );
      response.json(result);
    }),
  );

  router.get(
    "/groups/:groupId/members",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const query = parseQuery(membersQuerySchema, request);
      const result = await dependencies.groupService.listMembers(request.auth.userId, groupId, query.q);
      response.json(result);
    }),
  );

  router.get(
    "/groups/:groupId/history",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      response.json(await dependencies.groupService.history(request.auth.userId, groupId));
    }),
  );

  router.patch(
    "/groups/:groupId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const input = parseBody(updateGroupSchema, request);
      response.json(await dependencies.groupService.updateInfo(request.auth.userId, groupId, input));
    }),
  );

  router.post(
    "/groups/:groupId/members",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const input = parseBody(addMembersSchema, request);
      response.json(
        await dependencies.groupService.addMembers(
          request.auth.userId,
          groupId,
          input.userIds ?? input.memberIds ?? [],
        ),
      );
    }),
  );

  router.delete(
    "/groups/:groupId/members/:userId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId, userId } = parseParams(groupMemberParamsSchema, request);
      response.json(await dependencies.groupService.removeMember(request.auth.userId, groupId, userId));
    }),
  );

  router.post(
    "/groups/:groupId/leave",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      response.json(await dependencies.groupService.leaveGroup(request.auth.userId, groupId));
    }),
  );

  router.post(
    "/groups/:groupId/admins",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const input = parseBody(setAdminSchema, request);
      response.json(
        await dependencies.groupService.setAdmin(
          request.auth.userId,
          groupId,
          input.userId,
          input.admin,
          input.permissions,
        ),
      );
    }),
  );

  router.put(
    "/groups/:groupId/permissions",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const input = parseBody(groupPermissionsBodySchema, request);
      response.json(
        await dependencies.groupService.setPermissions(request.auth.userId, groupId, input.permissions),
      );
    }),
  );

  router.post(
    "/groups/:groupId/restrict",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const input = parseBody(restrictMemberSchema, request);
      response.json(
        await dependencies.groupService.restrictMember(request.auth.userId, groupId, input.userId, {
          ...(input.permissions ? { permissions: input.permissions } : {}),
          ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }),
        }),
      );
    }),
  );

  router.put(
    "/groups/:groupId/tag",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      const input = parseBody(memberTagSchema, request);
      response.json(
        await dependencies.groupService.setMemberTag(
          request.auth.userId,
          groupId,
          input.userId,
          input.tag,
        ),
      );
    }),
  );

  router.post(
    "/groups/:groupId/invite",
    requireAuth,
    asyncHandler(async (request, response) => {
      const { groupId } = parseParams(groupParamsSchema, request);
      response.json(await dependencies.groupService.regenerateInvite(request.auth.userId, groupId));
    }),
  );

  return router;
}

/**
 * Разбирает заголовок Range. Поддерживаем только один диапазон: его достаточно
 * браузерам, чтобы перематывать аудио и видео. Всё непонятное — отдаём целиком.
 */
function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}
