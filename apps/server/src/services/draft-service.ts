import type { ConversationDraft } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService } from "./chat-service.js";

export type DraftInput = {
  text: string;
  attachmentIds?: string[] | undefined;
  replyToId?: string | null | undefined;
};

const maxDraftText = 4_000;
const maxDraftAttachments = 10;

/**
 * Personal, account-bound conversation drafts. They survive restarts and are
 * readable only by their owner.
 */
export class DraftService {
  constructor(
    private readonly repositories: Repositories,
    private readonly chatService: ChatService,
    private readonly events: RealtimeEvents,
  ) {}

  list(currentUserId: string): Promise<ConversationDraft[]> {
    return this.repositories.drafts.listForUser(currentUserId);
  }

  /** Stores the draft, or removes it when everything was cleared. */
  async save(
    currentUserId: string,
    conversationId: string,
    input: DraftInput,
  ): Promise<ConversationDraft | null> {
    await this.chatService.assertConversationUsable(currentUserId, conversationId);
    const text = input.text.trim().slice(0, maxDraftText);
    const attachmentIds = [...new Set(input.attachmentIds ?? [])].slice(0, maxDraftAttachments);
    const replyToId = input.replyToId ?? undefined;
    if (replyToId !== undefined) {
      const replyTarget = await this.repositories.messages.findById(replyToId);
      if (!replyTarget || replyTarget.conversationId !== conversationId) {
        throw new AppError(400, "REPLY_MESSAGE_INVALID", "Reply message is not in this conversation");
      }
    }

    if (!text && attachmentIds.length === 0 && replyToId === undefined) {
      await this.clear(currentUserId, conversationId);
      return null;
    }
    await this.chatService.assertAttachableFiles(currentUserId, attachmentIds);

    const draft = await this.repositories.drafts.save({
      userId: currentUserId,
      conversationId,
      text,
      attachmentIds,
      ...(replyToId === undefined ? {} : { replyToId }),
    });
    this.events.publishDraft({ userId: currentUserId, draft });
    return draft;
  }

  async clear(currentUserId: string, conversationId: string): Promise<void> {
    await this.repositories.drafts.delete(currentUserId, conversationId);
    this.events.publishDraft({ userId: currentUserId, draft: null });
  }
}
