import { EventEmitter } from "node:events";
import type {
  ConversationView,
  MessageView,
  ReadReceipt,
} from "../services/chat-service.js";
import type {
  ConversationDraft,
  ConversationFolder,
  PublicUser,
  ScheduledMessage,
} from "../domain/models.js";

export type NewMessageEvent = { message: MessageView; memberIds: string[] };
export type UpdatedMessageEvent = { message: MessageView; memberIds: string[] };
export type DeletedMessageEvent = {
  conversationId: string;
  messageId: string;
  conversation: ConversationView;
  memberIds: string[];
};
export type PinnedMessageEvent = {
  conversationId: string;
  message: MessageView | null;
  pinnedMessages: MessageView[];
  memberIds: string[];
};
export type ReactionMessageEvent = { message: MessageView; memberIds: string[] };
export type ReadMessagesEvent = { receipt: ReadReceipt; memberIds: string[] };
export type UpdatedProfileEvent = { user: PublicUser };
export type ConversationSettingsEvent = {
  userId: string;
  conversation: ConversationView;
};
export type DraftEvent = { userId: string; draft: ConversationDraft | null };
export type FoldersEvent = { userId: string; folders: ConversationFolder[] };
export type ScheduledMessageEvent = { userId: string; scheduled: ScheduledMessage };
/**
 * Аккаунт заморозили, разморозили или удалили. Рассылаем всем: собеседники
 * должны увидеть «Удалённый аккаунт» сразу, а не после перезагрузки.
 */
export type AccountStateEvent = {
  userId: string;
  frozen: boolean;
  removed: boolean;
  /** Публичный вид: настоящий профиль (разморозка) или заглушка. */
  user: PublicUser;
};

export class RealtimeEvents {
  private readonly emitter = new EventEmitter();

  publishNewMessage(event: NewMessageEvent): void {
    this.emitter.emit("message:new", event);
  }

  onNewMessage(listener: (event: NewMessageEvent) => void): () => void {
    return this.subscribe("message:new", listener);
  }

  publishUpdatedMessage(event: UpdatedMessageEvent): void {
    this.emitter.emit("message:updated", event);
  }

  onUpdatedMessage(listener: (event: UpdatedMessageEvent) => void): () => void {
    return this.subscribe("message:updated", listener);
  }

  publishDeletedMessage(event: DeletedMessageEvent): void {
    this.emitter.emit("message:deleted", event);
  }

  onDeletedMessage(listener: (event: DeletedMessageEvent) => void): () => void {
    return this.subscribe("message:deleted", listener);
  }

  publishPinnedMessage(event: PinnedMessageEvent): void {
    this.emitter.emit("message:pinned", event);
  }

  onPinnedMessage(listener: (event: PinnedMessageEvent) => void): () => void {
    return this.subscribe("message:pinned", listener);
  }

  publishReaction(event: ReactionMessageEvent): void {
    this.emitter.emit("message:reaction", event);
  }

  onReaction(listener: (event: ReactionMessageEvent) => void): () => void {
    return this.subscribe("message:reaction", listener);
  }

  publishReadMessages(event: ReadMessagesEvent): void {
    this.emitter.emit("messages:read", event);
  }

  onReadMessages(listener: (event: ReadMessagesEvent) => void): () => void {
    return this.subscribe("messages:read", listener);
  }

  publishUpdatedProfile(event: UpdatedProfileEvent): void {
    this.emitter.emit("profile:updated", event);
  }

  onUpdatedProfile(listener: (event: UpdatedProfileEvent) => void): () => void {
    return this.subscribe("profile:updated", listener);
  }

  publishConversationSettings(event: ConversationSettingsEvent): void {
    this.emitter.emit("conversation:settings", event);
  }

  onConversationSettings(listener: (event: ConversationSettingsEvent) => void): () => void {
    return this.subscribe("conversation:settings", listener);
  }

  publishDraft(event: DraftEvent): void {
    this.emitter.emit("draft:updated", event);
  }

  onDraft(listener: (event: DraftEvent) => void): () => void {
    return this.subscribe("draft:updated", listener);
  }

  publishFolders(event: FoldersEvent): void {
    this.emitter.emit("folders:updated", event);
  }

  onFolders(listener: (event: FoldersEvent) => void): () => void {
    return this.subscribe("folders:updated", listener);
  }

  publishScheduledMessage(event: ScheduledMessageEvent): void {
    this.emitter.emit("scheduled:updated", event);
  }

  onScheduledMessage(listener: (event: ScheduledMessageEvent) => void): () => void {
    return this.subscribe("scheduled:updated", listener);
  }

  publishAccountState(event: AccountStateEvent): void {
    this.emitter.emit("account:state", event);
  }

  onAccountState(listener: (event: AccountStateEvent) => void): () => void {
    return this.subscribe("account:state", listener);
  }

  private subscribe<T>(eventName: string, listener: (event: T) => void): () => void {
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }
}
