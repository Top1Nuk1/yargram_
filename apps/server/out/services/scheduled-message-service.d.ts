import type { ScheduledMessage } from "../domain/models.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService } from "./chat-service.js";
export type ScheduledMessageInput = {
    text?: string | undefined;
    attachmentIds?: string[] | undefined;
    replyToId?: string | undefined;
    sendAt?: string | undefined;
};
/**
 * Server side queue for delayed messages. Rows are claimed atomically before
 * sending, so a restart or a second tick never delivers the same message twice.
 */
export declare class ScheduledMessageService {
    private readonly repositories;
    private readonly chatService;
    private readonly events;
    private readonly intervalMs;
    private readonly clock;
    private timer;
    private dispatching;
    constructor(repositories: Repositories, chatService: ChatService, events: RealtimeEvents, intervalMs?: number, clock?: () => Date);
    list(currentUserId: string): Promise<ScheduledMessage[]>;
    create(currentUserId: string, conversationId: string, input: ScheduledMessageInput & {
        sendAt: string;
    }): Promise<ScheduledMessage>;
    update(currentUserId: string, scheduledId: string, input: ScheduledMessageInput): Promise<ScheduledMessage>;
    cancel(currentUserId: string, scheduledId: string): Promise<ScheduledMessage>;
    /** Sends every message whose time has come; returns how many were delivered. */
    dispatchDue(): Promise<number>;
    start(): void;
    stop(): void;
    private tick;
    private prepare;
    private parseSendAt;
}
