import type { Attachment, AttachmentView, BotKeyboard, CallRecord, Conversation, Message, Poll, PollSettings, PublicUser, ReactionEmoji, StickerView, SupportTicket, UserReport } from "../domain/models.js";
import type { EffectiveGroupPermissions, GroupRole } from "../domain/models.js";
/** Настройки из запроса: ключ может прийти как undefined, это допустимо. */
export type PollSettingsInput = {
    [K in keyof PollSettings]?: PollSettings[K] | undefined;
};
/** Настройки опроса по умолчанию: как в макете «Новый опрос». */
export declare function defaultPollSettings(): PollSettings;
/** Собираем настройки: что пришло в запросе, остальное — по умолчанию. */
export declare function mergePollSettings(input?: PollSettingsInput): PollSettings;
/** Опрос закрыт: автор остановил или вышел срок. */
export declare function pollClosed(poll: Poll, now?: number): boolean;
/**
 * Опрос глазами смотрящего. Итоги считает сервер, поэтому анонимный опрос тоже
 * показывает числа; чужие голоса уезжают наружу только при открытых именах.
 */
export declare function viewPoll(poll: Poll, viewerId?: string): PollView;
import type { Repositories } from "../repositories/types.js";
export type ReactionView = {
    emoji: ReactionEmoji;
    userIds: string[];
    count: number;
};
/**
 * Опрос глазами смотрящего. Итоги считает сервер, поэтому анонимный опрос
 * показывает числа, но не имена: чужие голоса в `votes` не уезжают.
 */
export type PollView = Poll & {
    counts: Record<string, number>;
    totalVoters: number;
};
export type MessageSnapshot = Omit<Message, "attachmentIds" | "stickerIds" | "reactions" | "poll"> & {
    sender: PublicUser;
    attachments: AttachmentView[];
    /**
     * 🔥 Отправленные стикеры с готовыми адресами. В самом сообщении лежат только
     * id, а подпись на загруженный файл живёт недолго — если бы она попала в
     * историю, старые сообщения рано или поздно остались бы без картинки.
     */
    stickers?: StickerView[];
    reactions: ReactionView[];
    poll?: PollView | undefined;
    isFavorite?: boolean;
};
export type MessageView = MessageSnapshot & {
    replyTo: MessageSnapshot | null;
    forwardedFrom: MessageSnapshot | null;
};
export type ConversationView = Omit<Conversation, "directKey" | "lastMessageId" | "pinnedMessageId" | "pinnedMessageIds" | "archivedBy" | "mutedUntilBy"> & {
    members: PublicUser[];
    lastMessage: MessageView | null;
    /** Latest pin, retained for Yargram 0.1 clients. */
    pinnedMessage: MessageView | null;
    pinnedMessages: MessageView[];
    archived: boolean;
    mutedUntil: string | null;
    blocked: boolean;
    /** Я заблокировал собеседника: писать и звонить нельзя, пока не разблокирую. */
    blockedByMe: boolean;
    /** Собеседник заблокировал меня: писать можно, но ему это не доставляется. */
    blockedByPeer: boolean;
    /** Роль смотрящего в группе; у личного диалога и «Избранного» — null. */
    role?: GroupRole | null;
    /** Эффективные права смотрящего: клиент по ним включает или гасит кнопки. */
    myPermissions?: EffectiveGroupPermissions;
    memberCount?: number;
    /** Сколько сообщений в чате я ещё не прочитал. */
    unreadCount: number;
};
/** Сколько чего лежит в переписке с человеком — для разделов медиа в профиле. */
export type MediaSummary = {
    photos: number;
    videos: number;
    files: number;
    audio: number;
    voice: number;
    videoCircles: number;
    gifs: number;
    links: number;
};
export type ReadReceipt = {
    conversationId: string;
    messageIds: string[];
    userId: string;
    readAt: string;
};
export type PinsResult = {
    conversationId: string;
    message: MessageView | null;
    pinnedMessages: MessageView[];
    memberIds: string[];
};
export declare class ChatService {
    private readonly repositories;
    constructor(repositories: Repositories);
    createSavedConversation(currentUserId: string): Promise<{
        conversation: ConversationView;
        created: boolean;
    }>;
    createDirectConversation(currentUserId: string, otherUserId: string): Promise<{
        conversation: ConversationView;
        created: boolean;
    }>;
    listConversations(currentUserId: string, archived?: boolean | "all"): Promise<ConversationView[]>;
    listMessages(currentUserId: string, conversationId: string, options: {
        limit: number;
        before?: string;
        query?: string;
    }): Promise<MessageView[]>;
    /**
     * Считает медиа, которое есть в переписке с этим человеком. Профиль показывает
     * только те разделы, где счётчик больше нуля: пустые «0 файлов» не нужны.
     */
    mediaSummary(currentUserId: string, peerId: string): Promise<MediaSummary>;
    sendMessage(currentUserId: string, conversationId: string, text: string, replyToId?: string, options?: {
        attachmentIds?: string[];
        forwardedFromId?: string;
        /** Отправленные стикеры: ссылки на картинки, а не на вложения. */
        stickerIds?: string[];
        /** Присланный набор стикеров: сообщение без текста, только карточка. */
        stickerPackId?: string;
    }): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    /**
     * Сообщение от бота: свой вид `bot`, своя клавиатура и, если это пересылка
     * обращения, привязка к тому, кому вернуть ответ владельца. Обычной отправкой
     * этого не сделать: там вид всегда `user`, а кнопок не бывает вовсе.
     */
    sendBotMessage(input: {
        conversationId: string;
        senderId: string;
        text: string;
        keyboard?: BotKeyboard | undefined;
        supportTicket?: SupportTicket | undefined;
        /**
         * Вложения, которые бот пересылает от чужого имени. Так обращение уносит
         * в служебную группу снимок экрана, приложенный человеком: ссылки на файлы
         * подписываются заново на того, кто смотрит, поэтому владельцы увидят их
         * как обычные вложения.
         */
        attachmentIds?: string[] | undefined;
    }): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    /** Опрос: отдельное сообщение вида poll, а не текст с разметкой. */
    createPoll(currentUserId: string, conversationId: string, input: {
        question: string;
        description?: string | undefined;
        options: string[];
        settings?: PollSettingsInput | undefined;
    }): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    /** Голос: один или несколько вариантов, с учётом настроек опроса. */
    votePoll(currentUserId: string, messageId: string, optionIds: string[]): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    /** Свой вариант ответа: только если владелец опроса это разрешил. */
    addPollOption(currentUserId: string, messageId: string, text: string): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    /** Остановить опрос может только его автор. */
    closePoll(currentUserId: string, messageId: string): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    /**
     * Вид сообщения для рассылки всем сразу: в анонимном опросе чужие голоса
     * не уезжают никому, поэтому итоги считаем без смотрящего.
     */
    broadcastView(messageId: string): Promise<MessageView | null>;
    private getPollMessage;
    forwardMessage(currentUserId: string, sourceConversationId: string, messageId: string, targetConversationId: string): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    updateMessage(currentUserId: string, conversationId: string, messageId: string, text: string): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    deleteMessage(currentUserId: string, conversationId: string, messageId: string): Promise<{
        conversationId: string;
        messageId: string;
        conversation: ConversationView;
        memberIds: string[];
    }>;
    setReaction(currentUserId: string, conversationId: string, messageId: string, emoji: ReactionEmoji | null): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    setFavorite(currentUserId: string, conversationId: string, messageId: string, favorite: boolean): Promise<{
        message: MessageView;
        favorite: boolean;
    }>;
    listFavorites(currentUserId: string): Promise<MessageView[]>;
    setPinnedMessage(currentUserId: string, conversationId: string, messageId: string | null): Promise<PinsResult>;
    setMessagePinned(currentUserId: string, conversationId: string, messageId: string, pinned: boolean): Promise<PinsResult>;
    updateConversationSettings(currentUserId: string, conversationId: string, input: {
        archived?: boolean;
        mutedUntil?: string | null;
    }): Promise<{
        conversation: ConversationView;
        memberIds: string[];
    }>;
    markConversationRead(currentUserId: string, conversationId: string): Promise<{
        receipt: ReadReceipt;
        memberIds: string[];
    }>;
    setBlocked(currentUserId: string, otherUserId: string, blocked: boolean): Promise<{
        userId: string;
        blocked: boolean;
    }>;
    listBlocked(currentUserId: string): Promise<PublicUser[]>;
    reportUser(currentUserId: string, reportedUserId: string, reason: UserReport["reason"], details?: string): Promise<UserReport>;
    beginCall(currentUserId: string, conversationId: string, callId: string, mode: "audio" | "video"): Promise<{
        call: CallRecord;
        memberIds: string[];
    }>;
    answerCall(currentUserId: string, conversationId: string, callId: string): Promise<{
        call: CallRecord;
        memberIds: string[];
    }>;
    updateCallMode(currentUserId: string, conversationId: string, callId: string, mode: "audio" | "video"): Promise<{
        call: CallRecord;
        memberIds: string[];
    }>;
    finishCall(currentUserId: string, conversationId: string, callId: string, rejected?: boolean): Promise<{
        call: CallRecord;
        message: MessageView;
        memberIds: string[];
    }>;
    ensureDefaultCommunityGroup(userId: string): Promise<Conversation>;
    conversationIdsForUser(userId: string): Promise<string[]>;
    /** Публичный просмотр беседы: нужен сервису групп, чтобы разослать обновление. */
    viewConversation(currentUserId: string, conversationId: string): Promise<ConversationView>;
    /**
     * Вид беседы отдельно для каждого участника — то, что рассылается при смене
     * названия, состава или знаков группы. Вид считается на каждого, потому что
     * роли, права и непрочитанные у всех разные. Вышедшего пропускаем: он остался
     * в memberIds, но группы у себя в списке не видит.
     */
    viewsForMembers(conversationId: string): Promise<{
        userId: string;
        conversation: ConversationView;
    }[]>;
    /**
     * Служебное сообщение группы («Алиса добавила Боба»). Пишется от имени того,
     * кто совершил действие, чтобы в истории было видно, кто именно.
     */
    createGroupEventMessage(conversationId: string, actorId: string, text: string, systemEvent: "user_joined" | "user_left"): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    memberIdsForConversation(userId: string, conversationId: string): Promise<string[]>;
    publicUser(userId: string, viewerId?: string | null): Promise<PublicUser>;
    markUserSeen(userId: string, timestamp?: string): Promise<PublicUser>;
    canAccessAttachment(userId: string, attachment: Attachment): Promise<boolean>;
    /** Shared validation for drafts and scheduled messages: only own, non-avatar files. */
    assertAttachableFiles(userId: string, attachmentIds: string[]): Promise<void>;
    /** Shared validation for drafts and scheduled messages: membership plus blocking. */
    assertConversationUsable(userId: string, conversationId: string): Promise<Conversation>;
    private assertOwnedMessageAttachments;
    private assertConversationInteractionAllowed;
    /** Звонок запрещён в обе стороны: звонить заблокировавшему нельзя. */
    private assertConversationCallable;
    private assertCallPrivacyAllowed;
    private assertUsersCanInteract;
    /** Права группы: писать, отправлять медиа и ссылки — три независимых запрета. */
    private assertGroupSendingAllowed;
    /**
     * Удалённый аккаунт остаётся в базе, но общение с ним закрыто совсем.
     * Замороженному писать и звонить тоже нельзя: он читает историю, но в переписке
     * не участвует — ни он собеседнику, ни собеседник ему.
     */
    private assertAccountAlive;
    /**
     * Замороженный автор — только читатель. Проверяем на отправке: сокет и HTTP
     * идут через один и тот же метод, поэтому запрет не обойти вторым путём.
     * Публичный, потому что сокет проверяет то же самое перед «печатает…»:
     * у замороженного не должно быть даже индикатора набора.
     */
    assertAuthorWritable(userId: string): Promise<void>;
    /**
     * Блокирующий не может общаться, пока не снимет блокировку. Обратное направление
     * здесь не запрещаем: как в Telegram, заблокированный писать может — сообщение
     * сохраняется у него, но блокирующему не доставляется (см. membersBlocking).
     */
    private assertNotBlockedByMe;
    /** Участники, которым не доставляем сообщения автора: те, кто его заблокировал. */
    membersBlocking(authorId: string, memberIds: string[]): Promise<string[]>;
    private getUser;
    private getAuthorizedConversation;
    private getConversationMessage;
    private getConversationCall;
    private toConversationView;
    private toPinsResult;
    private toMessageViews;
    private toMessageSnapshot;
    private toMessageView;
    /**
     * Снимок сообщения для автора, которого уже нет в базе. Чтобы переписка не
     * падала, подставляем заглушку «Удалённый аккаунт» вместо настоящего профиля.
     */
    private placeholderSnapshot;
}
