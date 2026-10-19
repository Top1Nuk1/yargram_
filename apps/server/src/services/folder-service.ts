import type { ConversationFolder } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService } from "./chat-service.js";

export type FolderInput = {
  name?: string | undefined;
  position?: number | undefined;
  conversationIds?: string[] | undefined;
  icon?: string | null | undefined;
};

const maxFolders = 20;
const maxFolderNameLength = 40;
const maxFolderConversations = 100;

/** Personal chat folders: private per account, reordered and renamed freely. */
export class FolderService {
  constructor(
    private readonly repositories: Repositories,
    private readonly chatService: ChatService,
    private readonly events: RealtimeEvents,
  ) {}

  list(currentUserId: string): Promise<ConversationFolder[]> {
    return this.repositories.folders.listForUser(currentUserId);
  }

  async create(
    currentUserId: string,
    input: {
      name: string;
      conversationIds?: string[] | undefined;
      icon?: string | null | undefined;
    },
  ): Promise<ConversationFolder> {
    const existing = await this.repositories.folders.listForUser(currentUserId);
    if (existing.length >= maxFolders) {
      throw new AppError(400, "TOO_MANY_FOLDERS", "At most 20 folders are supported");
    }
    const folder = await this.repositories.folders.create({
      userId: currentUserId,
      name: this.normalizeName(input.name),
      conversationIds: await this.ownedConversationIds(currentUserId, input.conversationIds ?? []),
      icon: input.icon ?? null,
    });
    await this.publish(currentUserId);
    return folder;
  }

  async update(
    currentUserId: string,
    folderId: string,
    input: FolderInput,
  ): Promise<ConversationFolder> {
    const folder = await this.repositories.folders.update(folderId, currentUserId, {
      ...(input.name === undefined ? {} : { name: this.normalizeName(input.name) }),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.icon === undefined ? {} : { icon: input.icon }),
      ...(input.conversationIds === undefined
        ? {}
        : {
            conversationIds: await this.ownedConversationIds(
              currentUserId,
              input.conversationIds,
            ),
          }),
    });
    await this.publish(currentUserId);
    return folder;
  }

  async delete(currentUserId: string, folderId: string): Promise<void> {
    await this.repositories.folders.delete(folderId, currentUserId);
    await this.publish(currentUserId);
  }

  private normalizeName(name: string): string {
    const trimmed = name.trim().slice(0, maxFolderNameLength);
    if (!trimmed) throw new AppError(400, "FOLDER_NAME_INVALID", "A folder name is required");
    return trimmed;
  }

  private async ownedConversationIds(userId: string, conversationIds: string[]): Promise<string[]> {
    const unique = [...new Set(conversationIds)];
    if (unique.length > maxFolderConversations) {
      throw new AppError(400, "TOO_MANY_FOLDER_CHATS", "A folder may contain at most 100 chats");
    }
    const owned = new Set(await this.chatService.conversationIdsForUser(userId));
    if (unique.some((conversationId) => !owned.has(conversationId))) {
      throw new AppError(
        403,
        "FOLDER_CONVERSATION_FORBIDDEN",
        "Only your own chats can be added to a folder",
      );
    }
    return unique;
  }

  private async publish(userId: string): Promise<void> {
    this.events.publishFolders({
      userId,
      folders: await this.repositories.folders.listForUser(userId),
    });
  }
}
