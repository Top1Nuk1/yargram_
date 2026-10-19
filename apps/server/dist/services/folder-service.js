import { AppError } from "../lib/errors.js";
const maxFolders = 20;
const maxFolderNameLength = 40;
const maxFolderConversations = 100;
/** Personal chat folders: private per account, reordered and renamed freely. */
export class FolderService {
    repositories;
    chatService;
    events;
    constructor(repositories, chatService, events) {
        this.repositories = repositories;
        this.chatService = chatService;
        this.events = events;
    }
    list(currentUserId) {
        return this.repositories.folders.listForUser(currentUserId);
    }
    async create(currentUserId, input) {
        const existing = await this.repositories.folders.listForUser(currentUserId);
        if (existing.length >= maxFolders) {
            throw new AppError(400, "TOO_MANY_FOLDERS", "At most 20 folders are supported");
        }
        const folder = await this.repositories.folders.create({
            userId: currentUserId,
            name: this.normalizeName(input.name),
            conversationIds: await this.ownedConversationIds(currentUserId, input.conversationIds ?? []),
            icon: input.icon ?? null,
            includedChatTypes: input.includedChatTypes ?? [],
            excludedConversationIds: await this.ownedConversationIds(currentUserId, input.excludedConversationIds ?? []),
            excludedChatTypes: input.excludedChatTypes ?? [],
        });
        await this.publish(currentUserId);
        return folder;
    }
    async update(currentUserId, folderId, input) {
        const folder = await this.repositories.folders.update(folderId, currentUserId, {
            ...(input.name === undefined ? {} : { name: this.normalizeName(input.name) }),
            ...(input.position === undefined ? {} : { position: input.position }),
            ...(input.icon === undefined ? {} : { icon: input.icon }),
            ...(input.includedChatTypes === undefined ? {} : { includedChatTypes: input.includedChatTypes }),
            ...(input.excludedChatTypes === undefined ? {} : { excludedChatTypes: input.excludedChatTypes }),
            ...(input.excludedConversationIds === undefined
                ? {}
                : {
                    excludedConversationIds: await this.ownedConversationIds(currentUserId, input.excludedConversationIds),
                }),
            ...(input.conversationIds === undefined
                ? {}
                : {
                    conversationIds: await this.ownedConversationIds(currentUserId, input.conversationIds),
                }),
        });
        await this.publish(currentUserId);
        return folder;
    }
    async delete(currentUserId, folderId) {
        await this.repositories.folders.delete(folderId, currentUserId);
        await this.publish(currentUserId);
    }
    normalizeName(name) {
        const trimmed = name.trim().slice(0, maxFolderNameLength);
        if (!trimmed)
            throw new AppError(400, "FOLDER_NAME_INVALID", "A folder name is required");
        return trimmed;
    }
    async ownedConversationIds(userId, conversationIds) {
        const unique = [...new Set(conversationIds)];
        if (unique.length > maxFolderConversations) {
            throw new AppError(400, "TOO_MANY_FOLDER_CHATS", "A folder may contain at most 100 chats");
        }
        const owned = new Set(await this.chatService.conversationIdsForUser(userId));
        if (unique.some((conversationId) => !owned.has(conversationId))) {
            throw new AppError(403, "FOLDER_CONVERSATION_FORBIDDEN", "Only your own chats can be added to a folder");
        }
        return unique;
    }
    async publish(userId) {
        this.events.publishFolders({
            userId,
            folders: await this.repositories.folders.listForUser(userId),
        });
    }
}
//# sourceMappingURL=folder-service.js.map