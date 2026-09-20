import type { ScheduledMessage } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService } from "./chat-service.js";

export type ScheduledMessageInput = {
  text?: string | undefined;
  attachmentIds?: string[] | undefined;
  replyToId?: string | undefined;
  sendAt?: string | undefined;
};

const maxText = 4_000;
const maxAttachments = 10;
const minLeadMs = 5_000;
const maxHorizonMs = 30 * 24 * 60 * 60 * 1_000;
const dispatchBatchSize = 20;

/**
 * Server side queue for delayed messages. Rows are claimed atomically before
 * sending, so a restart or a second tick never delivers the same message twice.
 */
export class ScheduledMessageService {
  private timer: NodeJS.Timeout | null = null;
  private dispatching = false;

  constructor(
    private readonly repositories: Repositories,
    private readonly chatService: ChatService,
    private readonly events: RealtimeEvents,
    private readonly intervalMs = 15_000,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(currentUserId: string): Promise<ScheduledMessage[]> {
    return this.repositories.scheduledMessages.listForUser(currentUserId);
  }

  async create(
    currentUserId: string,
    conversationId: string,
    input: ScheduledMessageInput & { sendAt: string },
  ): Promise<ScheduledMessage> {
    await this.chatService.assertConversationUsable(currentUserId, conversationId);
    const prepared = await this.prepare(currentUserId, conversationId, input);
    const scheduled = await this.repositories.scheduledMessages.create({
      userId: currentUserId,
      conversationId,
      text: prepared.text,
      attachmentIds: prepared.attachmentIds,
      ...(prepared.replyToId === undefined ? {} : { replyToId: prepared.replyToId }),
      sendAt: this.parseSendAt(input.sendAt),
    });
    this.events.publishScheduledMessage({ userId: currentUserId, scheduled });
    return scheduled;
  }

  async update(
    currentUserId: string,
    scheduledId: string,
    input: ScheduledMessageInput,
  ): Promise<ScheduledMessage> {
    const existing = await this.repositories.scheduledMessages.findById(scheduledId);
    if (!existing || existing.userId !== currentUserId) {
      throw new AppError(404, "SCHEDULED_NOT_FOUND", "Scheduled message was not found");
    }
    const prepared = await this.prepare(currentUserId, existing.conversationId, {
      text: input.text ?? existing.text,
      attachmentIds: input.attachmentIds ?? existing.attachmentIds,
      ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
    });
    const scheduled = await this.repositories.scheduledMessages.update(
      scheduledId,
      currentUserId,
      {
        text: prepared.text,
        attachmentIds: prepared.attachmentIds,
        ...(input.sendAt === undefined ? {} : { sendAt: this.parseSendAt(input.sendAt) }),
      },
    );
    this.events.publishScheduledMessage({ userId: currentUserId, scheduled });
    return scheduled;
  }

  async cancel(currentUserId: string, scheduledId: string): Promise<ScheduledMessage> {
    const scheduled = await this.repositories.scheduledMessages.cancel(scheduledId, currentUserId);
    this.events.publishScheduledMessage({ userId: currentUserId, scheduled });
    return scheduled;
  }

  /** Sends every message whose time has come; returns how many were delivered. */
  async dispatchDue(): Promise<number> {
    const due = await this.repositories.scheduledMessages.listDue(
      this.clock().toISOString(),
      dispatchBatchSize,
    );
    let delivered = 0;
    for (const candidate of due) {
      const claimed = await this.repositories.scheduledMessages.claimDue(candidate.id);
      if (!claimed) continue;
      try {
        const result = await this.chatService.sendMessage(
          claimed.userId,
          claimed.conversationId,
          claimed.text,
          claimed.replyToId,
          { attachmentIds: claimed.attachmentIds },
        );
        const updated = await this.repositories.scheduledMessages.markSent(
          claimed.id,
          result.message.id,
          this.clock().toISOString(),
        );
        this.events.publishNewMessage(result);
        this.events.publishScheduledMessage({ userId: claimed.userId, scheduled: updated });
        delivered += 1;
      } catch (error) {
        const failed = await this.repositories.scheduledMessages.markFailed(
          claimed.id,
          error instanceof AppError ? error.message : "Не удалось отправить сообщение",
        );
        this.events.publishScheduledMessage({ userId: claimed.userId, scheduled: failed });
      }
    }
    return delivered;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // The queue must not keep the process alive on its own.
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      await this.dispatchDue();
    } catch (error) {
      console.error("Cannot dispatch scheduled messages", error);
    } finally {
      this.dispatching = false;
    }
  }

  private async prepare(
    currentUserId: string,
    conversationId: string,
    input: ScheduledMessageInput,
  ): Promise<{ text: string; attachmentIds: string[]; replyToId?: string | undefined }> {
    const text = (input.text ?? "").trim().slice(0, maxText);
    const attachmentIds = [...new Set(input.attachmentIds ?? [])].slice(0, maxAttachments);
    if (!text && attachmentIds.length === 0) {
      throw new AppError(
        400,
        "SCHEDULED_EMPTY",
        "A scheduled message must contain text or an attachment",
      );
    }
    await this.chatService.assertAttachableFiles(currentUserId, attachmentIds);
    if (input.replyToId !== undefined) {
      const replyTarget = await this.repositories.messages.findById(input.replyToId);
      if (!replyTarget || replyTarget.conversationId !== conversationId) {
        throw new AppError(400, "REPLY_MESSAGE_INVALID", "Reply message is not in this conversation");
      }
    }
    return {
      text,
      attachmentIds,
      ...(input.replyToId === undefined ? {} : { replyToId: input.replyToId }),
    };
  }

  private parseSendAt(value: string): string {
    const sendAt = Date.parse(value);
    if (!Number.isFinite(sendAt)) {
      throw new AppError(400, "SCHEDULED_TIME_INVALID", "Scheduled time is invalid");
    }
    const now = this.clock().getTime();
    if (sendAt < now + minLeadMs) {
      throw new AppError(
        400,
        "SCHEDULED_TIME_TOO_SOON",
        "Choose a time at least a few seconds ahead",
      );
    }
    if (sendAt > now + maxHorizonMs) {
      throw new AppError(400, "SCHEDULED_TIME_TOO_FAR", "Scheduled time must be within 30 days");
    }
    return new Date(sendAt).toISOString();
  }
}
