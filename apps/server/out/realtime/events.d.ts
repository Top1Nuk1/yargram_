import type { ConversationView, MessageView, ReadReceipt } from "../services/chat-service.js";
import type { ConversationDraft, ConversationFolder, PublicUser, ScheduledMessage } from "../domain/models.js";
export type NewMessageEvent = {
    message: MessageView;
    memberIds: string[];
};
export type UpdatedMessageEvent = {
    message: MessageView;
    memberIds: string[];
};
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
export type ReactionMessageEvent = {
    message: MessageView;
    memberIds: string[];
};
export type ReadMessagesEvent = {
    receipt: ReadReceipt;
    memberIds: string[];
};
export type UpdatedProfileEvent = {
    user: PublicUser;
};
export type ConversationSettingsEvent = {
    userId: string;
    conversation: ConversationView;
};
export type DraftEvent = {
    userId: string;
    draft: ConversationDraft | null;
};
export type FoldersEvent = {
    userId: string;
    folders: ConversationFolder[];
};
export type ScheduledMessageEvent = {
    userId: string;
    scheduled: ScheduledMessage;
};
/**
 * Изменилось что-то в дружбе: заявку прислали, приняли, отклонили или дружбу
 * прекратили. Рассылаем обоим участникам — заявка должна появиться у человека
 * сразу, а не после перезагрузки страницы.
 */
export type FriendshipEvent = {
    /** Кому адресовано обновление — владельцу списка. */
    userId: string;
    /** С кем связано изменение: его профиль клиент перерисует. */
    peer: PublicUser;
    kind: "request" | "accepted" | "declined" | "removed";
};
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
/**
 * Сеанс завершён — владелец закрыл его сам или выгнал всех остальных.
 * Сокеты завершённого сеанса рвём сразу: иначе чужой вход продолжал бы
 * получать сообщения, хотя токен уже мёртв.
 */
export type SessionTerminatedEvent = {
    userId: string;
    /** Отпечатки токенов завершённых сеансов: по ним находим их сокеты. */
    tokenHashes: string[];
};
/**
 * Набор стикеров изменился или его прислали.
 *
 * 🔥 Набор остаётся общим: добавили стикер в набор один раз, и он появился у
 * всех, кому этот набор прислали. Поэтому событие уходит не автору, а **всем,
 * у кого набор есть** — иначе у получателей остались бы старые картинки до
 * перезагрузки страницы.
 */
export type StickerPackEvent = {
    packId: string;
    /** Новая версия содержимого: клиент перечитывает набор, если не совпала. */
    version: number;
    /** Набор только что прислали — клиент добавляет его в список наборов. */
    sharedWithUserId?: string | undefined;
};
export declare class RealtimeEvents {
    private readonly emitter;
    publishNewMessage(event: NewMessageEvent): void;
    onNewMessage(listener: (event: NewMessageEvent) => void): () => void;
    publishUpdatedMessage(event: UpdatedMessageEvent): void;
    onUpdatedMessage(listener: (event: UpdatedMessageEvent) => void): () => void;
    publishDeletedMessage(event: DeletedMessageEvent): void;
    onDeletedMessage(listener: (event: DeletedMessageEvent) => void): () => void;
    publishPinnedMessage(event: PinnedMessageEvent): void;
    onPinnedMessage(listener: (event: PinnedMessageEvent) => void): () => void;
    publishReaction(event: ReactionMessageEvent): void;
    onReaction(listener: (event: ReactionMessageEvent) => void): () => void;
    publishReadMessages(event: ReadMessagesEvent): void;
    onReadMessages(listener: (event: ReadMessagesEvent) => void): () => void;
    publishUpdatedProfile(event: UpdatedProfileEvent): void;
    onUpdatedProfile(listener: (event: UpdatedProfileEvent) => void): () => void;
    publishConversationSettings(event: ConversationSettingsEvent): void;
    onConversationSettings(listener: (event: ConversationSettingsEvent) => void): () => void;
    publishDraft(event: DraftEvent): void;
    onDraft(listener: (event: DraftEvent) => void): () => void;
    publishFolders(event: FoldersEvent): void;
    onFolders(listener: (event: FoldersEvent) => void): () => void;
    publishScheduledMessage(event: ScheduledMessageEvent): void;
    onScheduledMessage(listener: (event: ScheduledMessageEvent) => void): () => void;
    publishAccountState(event: AccountStateEvent): void;
    onAccountState(listener: (event: AccountStateEvent) => void): () => void;
    publishFriendship(event: FriendshipEvent): void;
    onFriendship(listener: (event: FriendshipEvent) => void): () => void;
    publishSessionTerminated(event: SessionTerminatedEvent): void;
    onSessionTerminated(listener: (event: SessionTerminatedEvent) => void): () => void;
    publishStickerPack(event: StickerPackEvent): void;
    onStickerPack(listener: (event: StickerPackEvent) => void): () => void;
    private subscribe;
}
