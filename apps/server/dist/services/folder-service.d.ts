import type { ConversationFolder } from "../domain/models.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService } from "./chat-service.js";
export type FolderInput = {
    name?: string | undefined;
    position?: number | undefined;
    conversationIds?: string[] | undefined;
};
/** Personal chat folders: private per account, reordered and renamed freely. */
export declare class FolderService {
    private readonly repositories;
    private readonly chatService;
    private readonly events;
    constructor(repositories: Repositories, chatService: ChatService, events: RealtimeEvents);
    list(currentUserId: string): Promise<ConversationFolder[]>;
    create(currentUserId: string, input: {
        name: string;
        conversationIds?: string[] | undefined;
    }): Promise<ConversationFolder>;
    update(currentUserId: string, folderId: string, input: FolderInput): Promise<ConversationFolder>;
    delete(currentUserId: string, folderId: string): Promise<void>;
    private normalizeName;
    private ownedConversationIds;
    private publish;
}
