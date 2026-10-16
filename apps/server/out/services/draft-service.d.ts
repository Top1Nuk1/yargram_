import type { ConversationDraft } from "../domain/models.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService } from "./chat-service.js";
export type DraftInput = {
    text: string;
    attachmentIds?: string[] | undefined;
    replyToId?: string | null | undefined;
};
/**
 * Personal, account-bound conversation drafts. They survive restarts and are
 * readable only by their owner.
 */
export declare class DraftService {
    private readonly repositories;
    private readonly chatService;
    private readonly events;
    constructor(repositories: Repositories, chatService: ChatService, events: RealtimeEvents);
    list(currentUserId: string): Promise<ConversationDraft[]>;
    /** Stores the draft, or removes it when everything was cleared. */
    save(currentUserId: string, conversationId: string, input: DraftInput): Promise<ConversationDraft | null>;
    clear(currentUserId: string, conversationId: string): Promise<void>;
}
