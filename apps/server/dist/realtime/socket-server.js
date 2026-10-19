import { Server } from "socket.io";
import { z } from "zod";
import { createSocketCorsOptions } from "../http/cors.js";
import { sendMessageSchema } from "../http/routes.js";
import { AppError } from "../lib/errors.js";
import { describeUserAgent, siteFrom } from "../lib/session-context.js";
import { tokenFingerprint } from "../services/session-service.js";
const descriptionSchema = (type) => z.object({ type: z.literal(type), sdp: z.string().min(1).max(1_000_000) });
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
/**
 * Повторная договорённость внутри уже идущего звонка: её шлют, когда у
 * соединения появился новый поток (демонстрация экрана) или когда связь
 * развалилась и ICE нужно запустить заново.
 */
const callRenegotiateSchema = callBaseSchema.extend({
    toUserId: z.string().uuid(),
    offer: descriptionSchema("offer"),
});
const callRenegotiateAnswerSchema = callBaseSchema.extend({
    toUserId: z.string().uuid(),
    answer: descriptionSchema("answer"),
});
const typingSchema = z.object({ conversationId: z.string().uuid() });
const pendingWorkTrackers = new WeakMap();
/**
 * Test and shutdown helper. Cancels scheduled presence work and waits until every
 * tracked socket task finished, so storage is not written after its owner closed it.
 */
export async function releaseSocketServer(io) {
    const tracker = pendingWorkTrackers.get(io);
    if (!tracker)
        return;
    tracker.cancelScheduled();
    await tracker.whenIdle();
}
function createPendingWorkTracker() {
    let outstanding = 0;
    const idleResolvers = [];
    const timers = new Set();
    const begin = () => {
        outstanding += 1;
    };
    const end = () => {
        outstanding -= 1;
        if (outstanding > 0)
            return;
        for (const resolve of idleResolvers.splice(0))
            resolve();
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
            if (outstanding === 0)
                return Promise.resolve();
            return new Promise((resolve) => idleResolvers.push(resolve));
        },
    };
}
export function attachSocketServer(httpServer, dependencies) {
    const io = new Server(httpServer, {
        cors: createSocketCorsOptions(dependencies.config.corsOrigins),
        maxHttpBufferSize: 1_000_000,
    });
    const userSockets = new Map();
    /** Отпечаток токена каждого подключения: завершённый сеанс рвём по нему. */
    const socketTokens = new Map();
    const offlineTimers = new Map();
    const callSessions = new Map();
    const pendingDirectedIce = new Map();
    const pendingWork = createPendingWorkTracker();
    const flushPendingIce = (callId) => {
        const candidates = pendingDirectedIce.get(callId);
        if (!candidates || candidates.length === 0)
            return;
        pendingDirectedIce.delete(callId);
        for (const item of candidates) {
            if (Date.now() - item.timestamp > 30_000)
                continue;
            io.to(`user:${item.toUserId}`).emit("call:ice", {
                callId: item.callId,
                conversationId: item.conversationId,
                fromUserId: item.fromUserId,
                candidate: item.candidate,
            });
        }
    };
    io.use(async (socket, next) => {
        try {
            const handshakeToken = socket.handshake.auth.token;
            const header = socket.handshake.headers.authorization;
            const token = typeof handshakeToken === "string"
                ? handshakeToken
                : typeof header === "string" && header.startsWith("Bearer ")
                    ? header.slice("Bearer ".length).trim()
                    : null;
            if (!token)
                throw new AppError(401, "AUTH_REQUIRED", "Socket access token is required");
            const headers = socket.handshake.headers;
            socket.data.userId = await dependencies.authService.authenticateToken(token, {
                site: siteFrom(typeof headers.origin === "string" ? headers.origin : undefined, typeof headers.referer === "string" ? headers.referer : undefined, typeof headers.host === "string" ? headers.host : undefined, "http"),
                device: describeUserAgent(typeof headers["user-agent"] === "string" ? headers["user-agent"] : undefined),
            });
            socketTokens.set(socket.id, tokenFingerprint(token));
            next();
        }
        catch (error) {
            next(error instanceof Error ? error : new Error("Socket authentication failed"));
        }
    });
    io.on("connection", async (rawSocket) => {
        const socket = rawSocket;
        const userId = socket.data.userId;
        const typingStates = new Map();
        const pendingOffline = offlineTimers.get(userId);
        if (pendingOffline) {
            pendingOffline();
            offlineTimers.delete(userId);
        }
        const sockets = userSockets.get(userId) ?? new Set();
        const wasOffline = sockets.size === 0;
        sockets.add(socket.id);
        userSockets.set(userId, sockets);
        void socket.join(`user:${userId}`);
        const publishPresence = async () => {
            try {
                if (wasOffline)
                    await dependencies.chatService.markUserSeen(userId);
                // A newly connected client gets a snapshot so already-online peers do not
                // incorrectly appear offline until their next reconnect.
                for (const onlineUserId of userSockets.keys()) {
                    const onlineUser = await dependencies.chatService.publicUser(onlineUserId);
                    // Онлайн определяют живые подключения, а не lastSeenAt: время последнего
                    // визита есть и у тех, кто уже давно вышел, и по нему все подряд
                    // казались бы «в сети» до следующего переподключения.
                    // Онлайн определяют живые подключения, а не lastSeenAt: время последнего
                    // визита есть и у давно вышедших. Но приватность важнее: кто скрыл время
                    // визита (lastSeenStatus задан), тот не светится как «в сети».
                    const live = (userSockets.get(onlineUserId)?.size ?? 0) > 0 && onlineUser.lastSeenStatus === null;
                    socket.emit("presence:updated", {
                        userId: onlineUserId,
                        online: live,
                        isOnline: live,
                        lastSeenAt: live ? null : onlineUser.lastSeenAt,
                        lastSeenStatus: live ? null : onlineUser.lastSeenStatus,
                    });
                }
                if (wasOffline) {
                    const user = await dependencies.chatService.publicUser(userId);
                    const live = (userSockets.get(userId)?.size ?? 0) > 0 && user.lastSeenStatus === null;
                    io.emit("presence:updated", {
                        userId,
                        online: live,
                        isOnline: live,
                        lastSeenAt: live ? null : user.lastSeenAt,
                        lastSeenStatus: live ? null : user.lastSeenStatus,
                    });
                }
            }
            catch (error) {
                console.error("Cannot publish presence", error);
            }
        };
        const stopTyping = (conversationId) => {
            const state = typingStates.get(conversationId);
            if (!state)
                return;
            clearTimeout(state.timer);
            typingStates.delete(conversationId);
            emitToOtherMembers(io, state.memberIds, userId, "typing:updated", {
                conversationId,
                userId,
                isTyping: false,
            });
        };
        socket.on("message:send", async (payload, acknowledgement) => {
            try {
                const input = sendMessageSchema.required({ conversationId: true }).parse(payload);
                const result = await dependencies.chatService.sendMessage(userId, input.conversationId, input.text, input.replyToId, {
                    ...(input.attachmentIds === undefined ? {} : { attachmentIds: input.attachmentIds }),
                    ...(input.forwardedFromId === undefined
                        ? {}
                        : { forwardedFromId: input.forwardedFromId }),
                });
                stopTyping(input.conversationId);
                dependencies.events.publishNewMessage(result);
                acknowledgement?.({ ok: true, message: result.message });
            }
            catch (error) {
                acknowledgement?.({ ok: false, error: formatSocketError(error) });
            }
        });
        socket.on("typing:start", async (payload) => {
            try {
                const { conversationId } = typingSchema.parse(payload);
                // Замороженный не пишет — значит и «печатает…» показывать не должен.
                await dependencies.chatService.assertAuthorWritable(userId);
                const memberIds = await dependencies.chatService.memberIdsForConversation(userId, conversationId);
                stopTyping(conversationId);
                emitToOtherMembers(io, memberIds, userId, "typing:updated", {
                    conversationId,
                    userId,
                    isTyping: true,
                });
                const timer = setTimeout(() => stopTyping(conversationId), 3_000);
                typingStates.set(conversationId, { conversationId, memberIds, timer });
            }
            catch (error) {
                socket.emit("typing:error", { error: formatSocketError(error) });
            }
        });
        socket.on("typing:stop", (payload) => {
            try {
                stopTyping(typingSchema.parse(payload).conversationId);
            }
            catch {
                // Invalid stop events have no lasting server state and can be ignored.
            }
        });
        socket.on("call:offer", async (payload) => {
            try {
                const input = callOfferSchema.parse(payload);
                const result = await dependencies.chatService.beginCall(userId, input.conversationId, input.callId, input.mode);
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
                flushPendingIce(input.callId);
                emitToOtherMembers(io, result.memberIds, userId, "call:incoming", {
                    ...input,
                    fromUser: { ...fromUser, online: fromUser.lastSeenAt !== null },
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:answer", async (payload) => {
            try {
                const input = callAnswerSchema.parse(payload);
                const result = await dependencies.chatService.answerCall(userId, input.conversationId, input.callId);
                const session = callSessions.get(input.callId);
                if (session) {
                    session.answered = true;
                    session.respondentSocketId = socket.id;
                    session.joinedIds.add(userId);
                    session.participantSocketIds.add(socket.id);
                }
                flushPendingIce(input.callId);
                emitToOtherMembers(io, result.memberIds, userId, "call:answered", {
                    ...input,
                    fromUserId: userId,
                });
                for (const sockId of userSockets.get(userId) ?? []) {
                    if (sockId !== socket.id) {
                        io.to(sockId).emit("call:answered", {
                            ...input,
                            fromUserId: userId,
                        });
                    }
                }
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:invite", async (payload) => {
            try {
                const input = callInviteSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session)
                    throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
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
                if (session.invitedIds.has(input.userId))
                    return;
                session.invitedIds.add(input.userId);
                const fromUser = await dependencies.chatService.publicUser(userId);
                const participantUsers = [];
                for (const participantId of [...session.joinedIds, session.initiatorId]) {
                    if (participantId === userId)
                        continue;
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
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:join", async (payload) => {
            try {
                const input = callBaseSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session)
                    throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
                const isAllowed = session.invitedIds.has(userId) ||
                    session.initiatorId === userId ||
                    session.joinedIds.has(userId) ||
                    session.memberIds.includes(userId);
                if (!isAllowed) {
                    throw new AppError(403, "CALL_NOT_INVITED", "You are not invited to this call");
                }
                session.invitedIds.delete(userId);
                if (userId !== session.initiatorId && !session.joinedIds.has(userId)) {
                    session.joinedIds.add(userId);
                    session.participantSocketIds.add(socket.id);
                }
                flushPendingIce(input.callId);
                const user = await dependencies.chatService.publicUser(userId);
                const participantIds = [...session.joinedIds, session.initiatorId];
                for (const participantId of participantIds) {
                    if (participantId === userId)
                        continue;
                    io.to(`user:${participantId}`).emit("call:participant-joined", {
                        callId: input.callId,
                        conversationId: input.conversationId,
                        user: { ...user, online: user.lastSeenAt !== null },
                    });
                }
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:join-offer", async (payload) => {
            try {
                const input = callJoinOfferSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session)
                    throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
                const isParticipant = session.joinedIds.has(userId) ||
                    session.initiatorId === userId ||
                    session.memberIds.includes(userId);
                if (!isParticipant) {
                    throw new AppError(403, "CALL_NOT_MEMBER", "You are not a participant of this call");
                }
                io.to(`user:${input.toUserId}`).emit("call:join-offer", {
                    callId: input.callId,
                    conversationId: input.conversationId,
                    fromUserId: userId,
                    offer: input.offer,
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:join-answer", async (payload) => {
            try {
                const input = callJoinAnswerSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session)
                    throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
                const isParticipant = session.joinedIds.has(input.fromUserId) ||
                    session.initiatorId === input.fromUserId ||
                    session.memberIds.includes(input.fromUserId);
                if (!isParticipant) {
                    throw new AppError(403, "CALL_NOT_MEMBER", "The target is not a participant of this call");
                }
                io.to(`user:${input.fromUserId}`).emit("call:join-answer", {
                    callId: input.callId,
                    conversationId: input.conversationId,
                    fromUserId: userId,
                    answer: input.answer,
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:ice", async (payload) => {
            try {
                const input = callDirectedIceSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session) {
                    const pending = pendingDirectedIce.get(input.callId) ?? [];
                    if (pending.length < 64) {
                        pending.push({
                            callId: input.callId,
                            conversationId: input.conversationId,
                            fromUserId: userId,
                            toUserId: input.toUserId,
                            candidate: input.candidate,
                            timestamp: Date.now(),
                        });
                        pendingDirectedIce.set(input.callId, pending);
                    }
                    return;
                }
                const isParticipant = session.initiatorId === userId ||
                    session.joinedIds.has(userId) ||
                    session.memberIds.includes(userId);
                if (!isParticipant)
                    return;
                io.to(`user:${input.toUserId}`).emit("call:ice", {
                    callId: input.callId,
                    conversationId: input.conversationId,
                    fromUserId: userId,
                    candidate: input.candidate,
                });
            }
            catch {
                // Directed ICE signaling issues should never kill an active call
            }
        });
        // Демонстрация экрана и перезапуск ICE: новый offer внутри идущего звонка.
        socket.on("call:renegotiate", async (payload) => {
            try {
                const input = callRenegotiateSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session)
                    throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
                const isParticipant = session.joinedIds.has(userId) ||
                    session.initiatorId === userId ||
                    session.memberIds.includes(userId);
                if (!isParticipant) {
                    throw new AppError(403, "CALL_NOT_MEMBER", "You are not a participant of this call");
                }
                if (!session.memberIds.includes(input.toUserId)) {
                    throw new AppError(403, "CALL_NOT_MEMBER", "This user is not a participant of the call");
                }
                io.to(`user:${input.toUserId}`).emit("call:renegotiate", {
                    callId: input.callId,
                    conversationId: input.conversationId,
                    fromUserId: userId,
                    offer: input.offer,
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:renegotiate-answer", async (payload) => {
            try {
                const input = callRenegotiateAnswerSchema.parse(payload);
                const session = callSessions.get(input.callId);
                if (!session)
                    throw new AppError(404, "CALL_NOT_FOUND", "The call does not exist");
                const isParticipant = session.joinedIds.has(userId) ||
                    session.initiatorId === userId ||
                    session.memberIds.includes(userId);
                if (!isParticipant) {
                    throw new AppError(403, "CALL_NOT_MEMBER", "You are not a participant of this call");
                }
                io.to(`user:${input.toUserId}`).emit("call:renegotiate-answer", {
                    callId: input.callId,
                    conversationId: input.conversationId,
                    fromUserId: userId,
                    answer: input.answer,
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:decline", async (payload) => {
            try {
                const input = callBaseSchema.parse(payload);
                callSessions.get(input.callId)?.invitedIds.delete(userId);
            }
            catch {
                // Invalid decline events have no lasting server state.
            }
        });
        socket.on("call:ice-candidate", async (payload) => {
            try {
                const input = callCandidateSchema.parse(payload);
                const memberIds = await dependencies.chatService.memberIdsForConversation(userId, input.conversationId);
                emitToOtherMembers(io, memberIds, userId, "call:ice-candidate", {
                    ...input,
                    fromUserId: userId,
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:mode", async (payload) => {
            try {
                const input = callModeSchema.parse(payload);
                const result = await dependencies.chatService.updateCallMode(userId, input.conversationId, input.callId, input.mode);
                const session = callSessions.get(input.callId);
                if (session)
                    session.mode = input.mode;
                emitToCallParticipants(io, callSessions.get(input.callId), result.memberIds, userId, "call:mode", {
                    ...input,
                    fromUserId: userId,
                });
            }
            catch (error) {
                emitCallError(socket, payload, error);
            }
        });
        socket.on("call:end", async (payload) => {
            try {
                const input = callBaseSchema.parse(payload);
                const memberIds = await dependencies.chatService.memberIdsForConversation(userId, input.conversationId);
                const session = callSessions.get(input.callId);
                const rejected = Boolean(session && !session.answered && session.initiatorId !== userId);
                await finishCall(input.conversationId, input.callId, userId, rejected);
                emitToCallParticipants(io, session, memberIds, userId, "call:ended", {
                    ...input,
                    fromUserId: userId,
                    rejected,
                });
            }
            catch (error) {
                if (!(error instanceof AppError && error.code === "CALL_ALREADY_FINISHED")) {
                    emitCallError(socket, payload, error);
                }
            }
        });
        socket.on("disconnect", () => {
            for (const conversationId of [...typingStates.keys()])
                stopTyping(conversationId);
            const disconnectedCalls = [...callSessions.values()].filter((session) => session.initiatorSocketId === socket.id
                || session.respondentSocketId === socket.id
                || session.participantSocketIds.has(socket.id));
            for (const session of disconnectedCalls) {
                const rejected = !session.answered && session.initiatorId !== userId;
                if (!rejected
                    && session.initiatorId !== userId
                    && session.participantSocketIds.size > 2) {
                    session.joinedIds.delete(userId);
                    session.participantSocketIds.delete(socket.id);
                    for (const participantId of callParticipantIds(session)) {
                        if (participantId === userId)
                            continue;
                        io.to(`user:${participantId}`).emit("call:participant-left", {
                            callId: session.callId,
                            conversationId: session.conversationId,
                            userId,
                        });
                    }
                    continue;
                }
                if (!session.answered) {
                    const remainingSockets = userSockets.get(userId);
                    if (remainingSockets && remainingSockets.size > 1) {
                        session.participantSocketIds.delete(socket.id);
                        continue;
                    }
                    pendingWork.schedule(() => {
                        const currentSession = callSessions.get(session.callId);
                        if (!currentSession || currentSession.answered)
                            return;
                        if ((userSockets.get(userId)?.size ?? 0) > 0)
                            return;
                        pendingWork.track(finishCall(session.conversationId, session.callId, userId, rejected)
                            .then(() => {
                            emitToCallParticipants(io, session, session.memberIds, userId, "call:ended", {
                                callId: session.callId,
                                conversationId: session.conversationId,
                                fromUserId: userId,
                            });
                        })
                            .catch((error) => console.error("Cannot finish disconnected call", error)));
                    }, 3_000);
                    continue;
                }
                pendingWork.track(finishCall(session.conversationId, session.callId, userId, rejected)
                    .then(() => {
                    emitToCallParticipants(io, session, session.memberIds, userId, "call:ended", {
                        callId: session.callId,
                        conversationId: session.conversationId,
                        fromUserId: userId,
                    });
                })
                    .catch((error) => console.error("Cannot finish disconnected call", error)));
            }
            socketTokens.delete(socket.id);
            const remaining = userSockets.get(userId);
            remaining?.delete(socket.id);
            if (remaining?.size)
                return;
            userSockets.delete(userId);
            let cancelled = false;
            offlineTimers.set(userId, () => {
                cancelled = true;
            });
            pendingWork.schedule(() => {
                offlineTimers.delete(userId);
                if (cancelled || userSockets.has(userId))
                    return;
                pendingWork.track(dependencies.chatService
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
                    .catch((error) => console.error("Cannot persist last seen", error)));
            }, 3_000);
        });
        void publishPresence();
    });
    async function finishCall(conversationId, callId, endedById, rejected) {
        try {
            const result = await dependencies.chatService.finishCall(endedById, conversationId, callId, rejected);
            dependencies.events.publishNewMessage({
                message: result.message,
                memberIds: result.memberIds,
            });
        }
        catch (error) {
            if (!(error instanceof AppError && error.code === "CALL_ALREADY_FINISHED"))
                throw error;
        }
        finally {
            callSessions.delete(callId);
            pendingDirectedIce.delete(callId);
        }
    }
    dependencies.events.onNewMessage(({ message, memberIds }) => {
        // Заблокировавшему автора сообщения оно не доставляется: как в Telegram,
        // отправка проходит, но адресат её не видит даже после разблокировки.
        void dependencies.chatService
            .membersBlocking(message.senderId, memberIds)
            .then((hidden) => emitToMembers(io, memberIds.filter((id) => !hidden.includes(id)), "message:new", message))
            .catch(() => emitToMembers(io, memberIds, "message:new", message));
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
    dependencies.events.onConversationDeleted(({ conversationId, memberIds }) => {
        emitToMembers(io, memberIds, "conversation:deleted", { conversationId });
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
    dependencies.events.onAccountState((event) => {
        io.emit("account:state", event);
        // Удалённый аккаунт из сети убираем — он больше не участник. Замороженный
        // остаётся читателем, поэтому сокет ему не рвём: иначе он перестанет видеть
        // новые сообщения в группах и статусы, хотя читать ему по-прежнему можно.
        if (!event.removed)
            return;
        for (const socketId of userSockets.get(event.userId) ?? []) {
            io.sockets.sockets.get(socketId)?.disconnect(true);
        }
        userSockets.delete(event.userId);
    });
    // Дружба: заявку и принятие присылаем лично тому, чей список изменился.
    dependencies.events.onFriendship((event) => {
        io.to(`user:${event.userId}`).emit("friendship:changed", event);
    });
    // Набор стикеров: лично тому, у кого он есть. `sharedWithUserId` заполнен, когда
    // набор только что прислали — тогда клиент добавляет его в список.
    //
    // 🔥 Событие адресное, а не «всем подряд»: у человека может не быть этого
    // набора, и обновление ему ничего не скажет, только зря разбудит сокет.
    dependencies.events.onStickerPack((event) => {
        io.to(`user:${event.sharedWithUserId ?? ""}`).emit("stickerPack:updated", event);
    });
    // Сеанс завершён: его подключения рвём сразу, чтобы чужой вход перестал
    // получать сообщения, а не дожидался, пока истёкший токен заметят по HTTP.
    dependencies.events.onSessionTerminated(({ userId, tokenHashes }) => {
        for (const socketId of userSockets.get(userId) ?? []) {
            const hash = socketTokens.get(socketId);
            if (!hash || !tokenHashes.includes(hash))
                continue;
            io.sockets.sockets.get(socketId)?.disconnect(true);
            socketTokens.delete(socketId);
        }
    });
    pendingWorkTrackers.set(io, pendingWork);
    return io;
}
function emitCallError(socket, payload, error) {
    const callId = payload && typeof payload === "object" && "callId" in payload
        ? String(payload.callId)
        : null;
    socket.emit("call:error", { callId, error: formatSocketError(error) });
}
function callParticipantIds(session) {
    return new Set([session.initiatorId, ...session.joinedIds]);
}
function emitToCallParticipants(io, session, fallbackMemberIds, senderId, event, payload) {
    if (session) {
        for (const userId of callParticipantIds(session)) {
            if (userId !== senderId)
                io.to(`user:${userId}`).emit(event, payload);
        }
        for (const userId of session.invitedIds) {
            if (userId !== senderId)
                io.to(`user:${userId}`).emit(event, payload);
        }
        return;
    }
    emitToOtherMembers(io, fallbackMemberIds, senderId, event, payload);
}
function emitToMembers(io, memberIds, event, payload) {
    for (const userId of memberIds)
        io.to(`user:${userId}`).emit(event, payload);
}
function emitToOtherMembers(io, memberIds, senderId, event, payload) {
    for (const userId of memberIds) {
        if (userId !== senderId)
            io.to(`user:${userId}`).emit(event, payload);
    }
}
function formatSocketError(error) {
    if (error instanceof z.ZodError) {
        return {
            code: "VALIDATION_ERROR",
            message: "Realtime payload validation failed",
            details: error.flatten(),
        };
    }
    if (error instanceof AppError)
        return { code: error.code, message: error.message };
    console.error(error);
    return { code: "INTERNAL_ERROR", message: "An unexpected server error occurred" };
}
//# sourceMappingURL=socket-server.js.map