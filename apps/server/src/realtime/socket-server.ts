import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import { createSocketCorsOptions } from "../http/cors.js";
import { sendMessageSchema } from "../http/routes.js";
import { AppError } from "../lib/errors.js";
import type { AuthService } from "../services/auth-service.js";
import type { ChatService, MessageView } from "../services/chat-service.js";
import type { RealtimeEvents } from "./events.js";

type AuthenticatedSocket = Socket & { data: { userId: string } };
type MessageAck = (
  result:
    | { ok: true; message: MessageView }
    | { ok: false; error: { code: string; message: string; details?: unknown } },
) => void;

type TypingState = {
  conversationId: string;
  memberIds: string[];
  timer: NodeJS.Timeout;
};

type CallSession = {
  callId: string;
  conversationId: string;
  initiatorId: string;
  initiatorSocketId: string;
  respondentSocketId?: string;
  memberIds: string[];
  answered: boolean;
  mode: "audio" | "video";
  invitedIds: Set<string>;
  joinedIds: Set<string>;
  participantSocketIds: Set<string>;
};

const descriptionSchema = (type: "offer" | "answer") =>
  z.object({ type: z.literal(type), sdp: z.string().min(1).max(1_000_000) });
const callBaseSchema = z.object({
  conversationId: z.string().uuid(),
  callId: z.string().min(1).max(128),
});
const callOfferSchema = callBaseSchema.extend({
  mode: z.enum(["audio", "video"]),
  offer: descriptionSchema("offer"),
});
const callAnswerSchema = callBaseSchema.extend({ answer: descriptionSchema("answer") });
const callCandidateSchema = callBaseSchema.extend({
  candidate: z.unknown().refine((candidate) => candidate !== undefined, {
    message: "candidate is required",
  }),
});
const callModeSchema = callBaseSchema.extend({ mode: z.enum(["audio", "video"]) });
const callInviteSchema = callBaseSchema.extend({ userId: z.string().uuid() });
const callJoinOfferSchema = callBaseSchema.extend({
  toUserId: z.string().uuid(),
  offer: descriptionSchema("offer"),
});
const callJoinAnswerSchema = callBaseSchema.extend({
  fromUserId: z.string().uuid(),
  answer: descriptionSchema("answer"),
});
const callDirectedIceSchema = callBaseSchema.extend({
  toUserId: z.string().uuid(),
  candidate: z.unknown().refine((candidate) => candidate !== undefined, {
    message: "candidate is required",
  }),
});
const typingSchema = z.object({ conversationId: z.string().uuid() });

type PendingWorkTracker = {
  track(task: Promise<unknown>): void;
  schedule(callback: () => void, delayMs: number): void;
  cancelScheduled(): void;
  whenIdle(): Promise<void>;
};

const pendingWorkTrackers = new WeakMap<Server, PendingWorkTracker>();

/**
 * Test and shutdown helper. Cancels scheduled presence work and waits until every
 * tracked socket task finished, so storage is not written after its owner closed it.
 */
export async function releaseSocketServer(io: Server): Promise<void> {
  const tracker = pendingWorkTrackers.get(io);
  if (!tracker) return;
  tracker.cancelScheduled();
  await tracker.whenIdle();
}

function createPendingWorkTracker(): PendingWorkTracker {
  let outstanding = 0;
  const idleResolvers: Array<() => void> = [];
  const timers = new Set<NodeJS.Timeout>();

  const begin = () => {
    outstanding += 1;
  };
  const end = () => {
    outstanding -= 1;
    if (outstanding > 0) return;
    for (const resolve of idleResolvers.splice(0)) resolve();
  };

  return {
    track(task) {
      begin();
      void task.then(end, end);
    },
    schedule(callback, delayMs) {
      begin();
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
        end();
      }, delayMs);
      timers.add(timer);
    },
    cancelScheduled() {
      for (const timer of [...timers]) {
        clearTimeout(timer);
        timers.delete(timer);
        end();
      }
    },
    whenIdle() {
      if (outstanding === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleResolvers.push(resolve));
    },
  };
}

export function attachSocketServer(
  httpServer: HttpServer,
  dependencies: {
    config: ServerConfig;
    authService: AuthService;
    chatService: ChatService;
    events: RealtimeEvents;
  },
): Server {
  const io = new Server(httpServer, {
    cors: createSocketCorsOptions(dependencies.config.corsOrigins),
    maxHttpBufferSize: 1_000_000,
  });
  const userSockets = new Map<string, Set<string>>();
  const offlineTimers = new Map<string, NodeJS.Timeout>();
  const callSessions = new Map<string, CallSession>();
  const pendingWork = createPendingWorkTracker();

  io.use(async (socket, next) => {
    try {
      const handshakeToken = socket.handshake.auth.token;
      const header = socket.handshake.headers.authorization;
      const token =
        typeof handshakeToken === "string"
          ? handshakeToken
          : typeof header === "string" && header.startsWith("Bearer ")
            ? header.slice("Bearer ".length).trim()
            : null;
      if (!token) throw new AppError(401, "AUTH_REQUIRED", "Socket access token is required");
      socket.data.userId = await dependencies.authService.authenticateToken(token);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Socket authentication failed"));
    }
  });

  io.on("connection", async (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userId = socket.data.userId;
    const typingStates = new Map<string, TypingState>();
    const pendingOffline = offlineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      offlineTimers.delete(userId);
    }

    const sockets = userSockets.get(userId) ?? new Set<string>();
    const wasOffline = sockets.size === 0;
    sockets.add(socket.id);
    userSockets.set(userId, sockets);
    void socket.join(`user:${userId}`);

    const publishPresence = async () => {
    try {
      if (wasOffline) await dependencies.chatService.markUserSeen(userId);
      // A newly connected client gets a snapshot so already-online peers do not
      // incorrectly appear offline until their next reconnect.
      for (const onlineUserId of userSockets.keys()) {
        const onlineUser = await dependencies.chatService.publicUser(onlineUserId);
        socket.emit("presence:updated", {
          userId: onlineUserId,
          online: onlineUser.lastSeenAt !== null,
          isOnline: onlineUser.lastSeenAt !== null,
          lastSeenAt: onlineUser.lastSeenAt,
          lastSeenStatus: onlineUser.lastSeenStatus,
        });
      }
      if (wasOffline) {
        const user = await dependencies.chatService.publicUser(userId);
        io.emit("presence:updated", {
          userId,
          online: user.lastSeenAt !== null,
          isOnline: user.lastSeenAt !== null,
          lastSeenAt: user.lastSeenAt,
          lastSeenStatus: user.lastSeenStatus,
        });
      }
    } catch (error) {
      console.error("Cannot publish presence", error);
    }
    };

    const stopTyping = (conversationId: string) => {
      const state = typingStates.get(conversationId);
      if (!state) return;
      clearTimeout(state.timer);
      typingStates.delete(conversationId);
      emitToOtherMembers(io, state.memberIds, userId, "typing:updated", {
        conversationId,
        userId,
        isTyping: false,
      });
    };

    socket.on("message:send", async (payload: unknown, acknowledgement?: MessageAck) => {
      try {
        const input = sendMessageSchema.required({ conversationId: true }).parse(payload);
        const result = await dependencies.chatService.sendMessage(
          userId,
          input.conversationId,
          input.text,
          input.replyToId,
          {
            ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
            ...(input.forwardedFromId === undefined
              ? {}
              : { forwardedFromId: input.forwardedFromId }),
          },
        );
        stopTyping(input.conversationId);
        dependencies.events.publishNewMessage(result);
        acknowledgement?.({ ok: true, message: result.message });
      } catch (error) {
        acknowledgement?.({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on("typing:start", async (payload: unknown) => {
      try {
        const { conversationId } = typingSchema.parse(payload);
        const memberIds = await dependencies.chatService.memberIdsForConversation(
          userId,
          conversationId,
        );
        stopTyping(conversationId);
        emitToOtherMembers(io, memberIds, userId, "typing:updated", {
          conversationId,
          userId,
          isTyping: true,
        });
        const timer = setTimeout(() => stopTyping(conversationId), 3_000);
        typingStates.set(conversationId, { conversationId, memberIds, timer });
      } catch (error) {
        socket.emit("typing:error", { error: formatSocketError(error) });
      }
    });

    socket.on("typing:stop", (payload: unknown) => {
      try {
        stopTyping(typingSchema.parse(payload).conversationId);
      } catch {
        // Invalid stop events have no lasting server state and can be ignored.
      }
    });

    socket.on("call:offer", async (payload: unknown) => {
      try {
        const input = callOfferSchema.parse(payload);
        const result = await dependencies.chatService.beginCall(
          userId,
          input.conversationId,
          input.callId,
          input.mode,
        );
        const fromUser = await dependencies.chatService.publicUser(userId);
        callSessions.set(input.callId, {
          callId: input.callId,
          conversationId: input.conversationId,
          initiatorId: userId,
          initiatorSocketId: socket.id,
          memberIds: result.memberIds,
          answered: false,
          mode: input.mode,
          invitedIds: new Set(),
          joinedIds: new Set(),
          participantSocketIds: new Set([socket.id]),
        });
        emitToOtherMembers(io, result.memberIds, userId, "call:incoming", {
          ...input,
          fromUser: { ...fromUser, online: fromUser.lastSeenAt !== null },
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:answer", async (payload: unknown) => {
      try {
        const input = callAnswerSchema.parse(payload);
        const result = await dependencies.chatService.answerCall(
          userId,
          input.conversationId,
          input.callId,
        );
        const session = callSessions.get(input.callId);
        if (session) {
          session.answered = true;
          session.respondentSocketId = socket.id;
          session.joinedIds.add(userId);
          session.participantSocketIds.add(socket.id);
        }
        emitToOtherMembers(io, result.memberIds, userId, "call:answered", {
          ...input,
          fromUserId: userId,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:invite", async (payload: unknown) => {
      try {
        const input = callInviteSchema.parse(payload);
        const session = callSessions.get(input.callId);
        if (!session) throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
        const participantIds = callParticipantIds(session);
        if (participantIds.size === 0) {
          throw new AppError(403, "CALL_EMPTY", "The call has no active participants");
        }
        if (userId !== session.initiatorId && !session.joinedIds.has(userId)) {
          throw new AppError(403, "CALL_NOT_MEMBER", "You are not a participant of this call");
        }
        if (participantIds.has(input.userId)) {
          throw new AppError(409, "CALL_ALREADY_JOINED", "This user is already in the call");
        }
        if (session.invitedIds.has(input.userId)) return;
        session.invitedIds.add(input.userId);
        const fromUser = await dependencies.chatService.publicUser(userId);
        const participantUsers: Array<{ id: string; displayName: string; username: string | null }> = [];
        for (const participantId of [...session.joinedIds, session.initiatorId]) {
          if (participantId === userId) continue;
          const participant = await dependencies.chatService.publicUser(participantId);
          participantUsers.push({
            id: participant.id,
            displayName: participant.displayName,
            username: participant.username,
          });
        }
        io.to(`user:${input.userId}`).emit("call:invite-incoming", {
          callId: input.callId,
          conversationId: input.conversationId,
          fromUser: { ...fromUser, online: fromUser.lastSeenAt !== null },
          mode: session.mode,
          participants: participantUsers,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:join", async (payload: unknown) => {
      try {
        const input = callBaseSchema.parse(payload);
        const session = callSessions.get(input.callId);
        if (!session) throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
        if (!session.invitedIds.has(userId) && session.initiatorId !== userId) {
          throw new AppError(403, "CALL_NOT_INVITED", "You are not invited to this call");
        }
        session.invitedIds.delete(userId);
        if (userId === session.initiatorId || session.joinedIds.has(userId)) return;
        session.joinedIds.add(userId);
        session.participantSocketIds.add(socket.id);
        const user = await dependencies.chatService.publicUser(userId);
        const participantIds = [...session.joinedIds, session.initiatorId];
        for (const participantId of participantIds) {
          if (participantId === userId) continue;
          io.to(`user:${participantId}`).emit("call:participant-joined", {
            callId: input.callId,
            conversationId: input.conversationId,
            user: { ...user, online: user.lastSeenAt !== null },
          });
        }
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:join-offer", async (payload: unknown) => {
      try {
        const input = callJoinOfferSchema.parse(payload);
        const session = callSessions.get(input.callId);
        if (!session) throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
        if (!session.joinedIds.has(userId) && userId !== session.initiatorId) {
          throw new AppError(403, "CALL_NOT_MEMBER", "You are not a participant of this call");
        }
        io.to(`user:${input.toUserId}`).emit("call:join-offer", {
          callId: input.callId,
          conversationId: input.conversationId,
          fromUserId: userId,
          offer: input.offer,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:join-answer", async (payload: unknown) => {
      try {
        const input = callJoinAnswerSchema.parse(payload);
        const session = callSessions.get(input.callId);
        if (!session) throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
        if (!session.joinedIds.has(input.fromUserId) && session.initiatorId !== input.fromUserId) {
          throw new AppError(403, "CALL_NOT_MEMBER", "The target is not a participant of this call");
        }
        io.to(`user:${input.fromUserId}`).emit("call:join-answer", {
          callId: input.callId,
          conversationId: input.conversationId,
          fromUserId: userId,
          answer: input.answer,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:ice", async (payload: unknown) => {
      try {
        const input = callDirectedIceSchema.parse(payload);
        const session = callSessions.get(input.callId);
        if (!session) throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
        if (!session.joinedIds.has(userId) && userId !== session.initiatorId) {
          throw new AppError(403, "CALL_NOT_MEMBER", "You are not a participant of this call");
        }
        io.to(`user:${input.toUserId}`).emit("call:ice", {
          callId: input.callId,
          conversationId: input.conversationId,
          fromUserId: userId,
          candidate: input.candidate,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:decline", async (payload: unknown) => {
      try {
        const input = callBaseSchema.parse(payload);
        callSessions.get(input.callId)?.invitedIds.delete(userId);
      } catch {
        // Invalid decline events have no lasting server state.
      }
    });

    socket.on("call:ice-candidate", async (payload: unknown) => {
      try {
        const input = callCandidateSchema.parse(payload);
        const memberIds = await dependencies.chatService.memberIdsForConversation(
          userId,
          input.conversationId,
        );
        emitToOtherMembers(io, memberIds, userId, "call:ice-candidate", {
          ...input,
          fromUserId: userId,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:mode", async (payload: unknown) => {
      try {
        const input = callModeSchema.parse(payload);
        const result = await dependencies.chatService.updateCallMode(
          userId,
          input.conversationId,
          input.callId,
          input.mode,
        );
        const session = callSessions.get(input.callId);
        if (session) session.mode = input.mode;
        emitToCallParticipants(io, callSessions.get(input.callId), result.memberIds, userId, "call:mode", {
          ...input,
          fromUserId: userId,
        });
      } catch (error) {
        emitCallError(socket, payload, error);
      }
    });

    socket.on("call:end", async (payload: unknown) => {
      try {
        const input = callBaseSchema.parse(payload);
        const memberIds = await dependencies.chatService.memberIdsForConversation(
          userId,
          input.conversationId,
        );
        const session = callSessions.get(input.callId);
        const rejected = Boolean(session && !session.answered && session.initiatorId !== userId);
        await finishCall(input.conversationId, input.callId, userId, rejected);
        emitToCallParticipants(io, session, memberIds, userId, "call:ended", {
          ...input,
          fromUserId: userId,
          rejected,
        });
      } catch (error) {
        if (!(error instanceof AppError && error.code === "CALL_ALREADY_FINISHED")) {
          emitCallError(socket, payload, error);
        }
      }
    });

    socket.on("disconnect", () => {
      for (const conversationId of [...typingStates.keys()]) stopTyping(conversationId);

      const disconnectedCalls = [...callSessions.values()].filter(
        (session) =>
          session.initiatorSocketId === socket.id
          || session.respondentSocketId === socket.id
          || session.participantSocketIds.has(socket.id),
      );
      for (const session of disconnectedCalls) {
        const rejected = !session.answered && session.initiatorId !== userId;
        if (
          !rejected
          && session.initiatorId !== userId
          && session.participantSocketIds.size > 2
        ) {
          session.joinedIds.delete(userId);
          session.participantSocketIds.delete(socket.id);
          for (const participantId of callParticipantIds(session)) {
            if (participantId === userId) continue;
            io.to(`user:${participantId}`).emit("call:participant-left", {
              callId: session.callId,
              conversationId: session.conversationId,
              userId,
            });
          }
          continue;
        }
        pendingWork.track(
          finishCall(session.conversationId, session.callId, userId, rejected)
            .then(() => {
              emitToCallParticipants(io, session, session.memberIds, userId, "call:ended", {
                callId: session.callId,
                conversationId: session.conversationId,
                fromUserId: userId,
              });
            })
            .catch((error) => console.error("Cannot finish disconnected call", error)),
        );
      }

      const remaining = userSockets.get(userId);
      remaining?.delete(socket.id);
      if (remaining?.size) return;
      userSockets.delete(userId);
      pendingWork.schedule(() => {
        offlineTimers.delete(userId);
        if (userSockets.has(userId)) return;
        pendingWork.track(
          dependencies.chatService
            .markUserSeen(userId)
            .then((user) => {
              io.emit("presence:updated", {
                userId,
                online: false,
                isOnline: false,
                lastSeenAt: user.lastSeenAt,
                lastSeenStatus: user.lastSeenStatus,
              });
            })
            .catch((error) => console.error("Cannot persist last seen", error)),
        );
      }, 3_000);
    });
    void publishPresence();
  });

  async function finishCall(
    conversationId: string,
    callId: string,
    endedById: string,
    rejected: boolean,
  ): Promise<void> {
    try {
      const result = await dependencies.chatService.finishCall(
        endedById,
        conversationId,
        callId,
        rejected,
      );
      dependencies.events.publishNewMessage({
        message: result.message,
        memberIds: result.memberIds,
      });
    } catch (error) {
      if (!(error instanceof AppError && error.code === "CALL_ALREADY_FINISHED")) throw error;
    } finally {
      callSessions.delete(callId);
    }
  }

  dependencies.events.onNewMessage(({ message, memberIds }) => {
    emitToMembers(io, memberIds, "message:new", message);
  });
  dependencies.events.onUpdatedMessage(({ message, memberIds }) => {
    emitToMembers(io, memberIds, "message:updated", message);
  });
  dependencies.events.onDeletedMessage(({ conversationId, messageId, memberIds }) => {
    emitToMembers(io, memberIds, "message:deleted", { conversationId, messageId });
  });
  dependencies.events.onPinnedMessage(({ memberIds, ...payload }) => {
    emitToMembers(io, memberIds, "message:pinned", payload);
    emitToMembers(io, memberIds, "conversation:pins", payload);
  });
  dependencies.events.onReaction(({ message, memberIds }) => {
    emitToMembers(io, memberIds, "message:reaction", message);
  });
  dependencies.events.onReadMessages(({ receipt, memberIds }) => {
    emitToMembers(io, memberIds, "messages:read", receipt);
  });
  dependencies.events.onUpdatedProfile(({ user }) => {
    const online = user.lastSeenAt !== null && (userSockets.get(user.id)?.size ?? 0) > 0;
    io.emit("profile:updated", { ...user, online, isOnline: online });
  });
  dependencies.events.onConversationSettings(({ userId, conversation }) => {
    io.to(`user:${userId}`).emit("conversation:settings", conversation);
  });
  dependencies.events.onDraft(({ userId, draft }) => {
    io.to(`user:${userId}`).emit("draft:updated", { conversationId: draft?.conversationId ?? null, draft });
  });
  dependencies.events.onFolders(({ userId, folders }) => {
    io.to(`user:${userId}`).emit("folders:updated", folders);
  });
  dependencies.events.onScheduledMessage(({ userId, scheduled }) => {
    io.to(`user:${userId}`).emit("scheduled:updated", scheduled);
  });

  pendingWorkTrackers.set(io, pendingWork);

  return io;
}

function emitCallError(socket: AuthenticatedSocket, payload: unknown, error: unknown): void {
  const callId =
    payload && typeof payload === "object" && "callId" in payload
      ? String((payload as { callId: unknown }).callId)
      : null;
  socket.emit("call:error", { callId, error: formatSocketError(error) });
}

function callParticipantIds(session: CallSession): Set<string> {
  return new Set([session.initiatorId, ...session.joinedIds]);
}

function emitToCallParticipants(
  io: Server,
  session: CallSession | undefined,
  fallbackMemberIds: string[],
  senderId: string,
  event: string,
  payload: unknown,
): void {
  if (session) {
    for (const userId of callParticipantIds(session)) {
      if (userId !== senderId) io.to(`user:${userId}`).emit(event, payload);
    }
    for (const userId of session.invitedIds) {
      if (userId !== senderId) io.to(`user:${userId}`).emit(event, payload);
    }
    return;
  }
  emitToOtherMembers(io, fallbackMemberIds, senderId, event, payload);
}

function emitToMembers(io: Server, memberIds: string[], event: string, payload: unknown): void {
  for (const userId of memberIds) io.to(`user:${userId}`).emit(event, payload);
}

function emitToOtherMembers(
  io: Server,
  memberIds: string[],
  senderId: string,
  event: string,
  payload: unknown,
): void {
  for (const userId of memberIds) {
    if (userId !== senderId) io.to(`user:${userId}`).emit(event, payload);
  }
}

function formatSocketError(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof z.ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "Realtime payload validation failed",
      details: error.flatten(),
    };
  }
  if (error instanceof AppError) return { code: error.code, message: error.message };
  console.error(error);
  return { code: "INTERNAL_ERROR", message: "An unexpected server error occurred" };
}
