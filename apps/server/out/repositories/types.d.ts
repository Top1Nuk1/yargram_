import type { Attachment, Poll, AttachmentView, BotKeyboard, CallMessage, CallRecord, Conversation, GroupEvent, GroupPermissions, ConversationDraft, ConversationFolder, Message, ReactionEmoji, ReportReason, ScheduledMessage, Session, Sticker, StickerPack, StickerPackInstall, SupportTicket, User, FavoriteNote, UserReport, EmailCodePurpose, CallPrivacyRule } from "../domain/models.js";
export type CreateUserInput = Pick<User, "email" | "passwordHash" | "displayName" | "username"> & {
    /** Почта подтверждена кодом из письма. Когда подтверждение включено, новый
     *  аккаунт создаётся неподтверждённым и ждёт код. */
    emailVerified?: boolean;
};
export type UpdateUserInput = {
    displayName?: string | undefined;
    /** Смена пароля при сбросе по коду из письма. Кладём уже хеш, не пароль. */
    passwordHash?: string | undefined;
    username?: string | undefined;
    bio?: string | undefined;
    avatar?: AttachmentView | null | undefined;
    /** Прямая ссылка на аватар (без загрузки файла). `null` убирает. */
    avatarUrl?: string | null | undefined;
    notificationSoundEnabled?: boolean | undefined;
    showLastSeen?: boolean | undefined;
    callPrivacy?: CallPrivacyRule | undefined;
    callPrivacyAllowedUserIds?: string[] | undefined;
    callPrivacyDeniedUserIds?: string[] | undefined;
    themeColor?: string | undefined;
    wallpaperUrl?: string | undefined;
    /** Тип загруженного фона: `image/*` или `video/*` (для `<video>` вместо картинки). */
    wallpaperMimeType?: string | undefined;
    /** `null` убирает заливку баннера (как `avatar: null` убирает аватар). */
    bannerColor?: string | null | undefined;
    banner?: AttachmentView | null | undefined;
    /** Прямая ссылка на баннер (без загрузки файла). `null` убирает. */
    bannerUrl?: string | null | undefined;
    isVerified?: boolean;
    badge?: "yargram" | null;
    /** Отметка SCAM: владелец пометил аккаунт как мошеннический. */
    scam?: boolean;
    /** Отметка FAKE: аккаунт выдаёт себя за официальный. */
    fake?: boolean;
    usernames?: string[];
    adminUserIds?: string[];
    isOwner?: boolean;
    isBanned?: boolean;
    isFrozen?: boolean;
    /** Язык интерфейса: по нему служебный бот поддержки выбирает, на каком
     *  языке отвечать. Клиент сообщает его при смене языка. */
    language?: string | undefined;
    /** Аккаунт удалён владельцем: запись остаётся, чтобы почта не освободилась. */
    isDeleted?: boolean;
    deletedAt?: string | undefined;
    birthday?: string | null | undefined;
    /** Подтверждение почты кодом из письма. */
    emailVerified?: boolean | undefined;
    /** Хеш действующего кода. `null` стирает код — он больше не принимается. */
    emailCodeHash?: string | null | undefined;
    emailCodePurpose?: EmailCodePurpose | null | undefined;
    emailCodeExpiresAt?: string | null | undefined;
    emailCodeAttempts?: number | undefined;
    /** Дружба. Входящие заявки пишет автор заявки — это его единственная запись
     *  в чужой профиль, поэтому удаление аккаунта чистит списки у всех. */
    friendIds?: string[];
    outgoingFriendRequestIds?: string[];
    incomingFriendRequestIds?: string[];
    /** Признак приложения Yargram: ему разрешён собственный знак. */
    isApp?: boolean;
    /** Служебный аккаунт бота: вход в него закрыт, рядом с именем — плашка. */
    isBot?: boolean;
    /** Через сколько дней бездействия сеанс завершается сам; `null` — никогда. */
    sessionAutoTerminateDays?: number | null | undefined;
};
export declare class RepositoryConflictError extends Error {
    readonly field: "email" | "username";
    constructor(field: "email" | "username");
}
export interface UserRepository {
    create(input: CreateUserInput): Promise<User>;
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    update(id: string, input: UpdateUserInput): Promise<User>;
    updateLastSeen(id: string, lastSeenAt: string): Promise<User>;
    setBlocked(userId: string, blockedUserId: string, blocked: boolean): Promise<User>;
    setFavorite(userId: string, messageId: string, favorite: boolean): Promise<User>;
    list(options: {
        query?: string;
        limit: number;
        excludeUserId?: string;
    }): Promise<User[]>;
    /**
     * Точный поиск по адресу: основной ник или любой дополнительный, без учёта
     * регистра. Нужен админ-панели: обычный `list` — это поиск по подстроке,
     * который вдобавок исключает самого ищущего и потому не годится, чтобы
     * владелец нашёл в нём свой же аккаунт.
     */
    findByHandle(handle: string): Promise<User | null>;
    findManyByIds(ids: string[]): Promise<User[]>;
    /**
     * Все аккаунты для списка владельца — свежие сверху. Удалённые и
     * замороженные **входят**: владельцу нужно видеть их отдельными фильтрами,
     * а `list` для этого не годится — он про поиск людей по подстроке, исключает
     * самого ищущего и отдаёт лишь первые `limit` совпадений.
     */
    listAll(): Promise<User[]>;
    /**
     * Сколько всего аккаунтов заведено в Yargram. Считаем **все** записи, вместе
     * с удалёнными и замороженными: удаление мягкое (почта и ник остаются
     * занятыми), и человек, которого владелец «удалил», из базы никуда не делся.
     * Отдельный счётчик нужен потому, что `list` — это поиск по подстроке с
     * жёстким пределом выдачи, по нему общее число не узнать.
     */
    count(): Promise<number>;
    /**
     * Незавершённые регистрации, которые уже не завершатся: почта не подтверждена,
     * а срок кода вышел (или кода нет вовсе). Их стирают начисто — см.
     * `isFailedRegistration`. Отдельный запрос нужен, чтобы уборка не читала всех
     * пользователей ради нескольких брошенных записей.
     */
    listFailedRegistrations(now: string): Promise<User[]>;
    /** Стирает аккаунт полностью — владелец удаляет пользователя. */
    delete(id: string): Promise<User | null>;
}
export type CreateGroupInput = {
    ownerId: string;
    title: string;
    description?: string | undefined;
    avatarUrl?: string | null | undefined;
    memberIds: string[];
    inviteCode?: string | undefined;
    /** Служебная группа поддержки: её не видно в поиске и приглашениях. */
    isSupportInbox?: boolean | undefined;
};
export type UpdateConversationInput = {
    title?: string | undefined;
    description?: string | undefined;
    avatarUrl?: string | null | undefined;
    memberIds?: string[] | undefined;
    ownerId?: string | undefined;
    adminIds?: string[] | undefined;
    adminPermissions?: Record<string, GroupPermissions> | undefined;
    adminDefaults?: GroupPermissions | undefined;
    inviteCode?: string | undefined;
    permissions?: GroupPermissions | undefined;
    restrictions?: Record<string, GroupPermissions> | undefined;
    mutedMembers?: Record<string, string | null> | undefined;
    memberTags?: Record<string, string> | undefined;
    leftIds?: string[] | undefined;
    history?: GroupEvent[] | undefined;
    /** Знаки владельца Yargram: галочка, значок и отметки SCAM/FAKE у группы. */
    isVerified?: boolean | undefined;
    badge?: "yargram" | null | undefined;
    scam?: boolean | undefined;
    fake?: boolean | undefined;
};
export interface ConversationRepository {
    findOrCreateSaved(userId: string): Promise<{
        conversation: Conversation;
        created: boolean;
    }>;
    findOrCreateDirect(firstUserId: string, secondUserId: string): Promise<{
        conversation: Conversation;
        created: boolean;
    }>;
    /** Группа: владелец всегда первый участник, права по умолчанию разрешают всё. */
    createGroup(input: CreateGroupInput): Promise<Conversation>;
    /**
     * Служебная группа поддержки, куда бот пересылает обращения. Отдельный
     * запрос, потому что искать её как обычную группу нельзя: она помечена
     * `isSupportInbox` и в поиске по названию её быть не должно.
     */
    findSupportInbox(): Promise<Conversation | null>;
    findByInviteCode(code: string): Promise<Conversation | null>;
    /**
     * Группы для админ-панели: поиск по названию, коду из ссылки-приглашения или
     * по id. Пустой запрос отдаёт первые попавшиеся группы.
     */
    searchGroups(query: string, limit: number): Promise<Conversation[]>;
    /**
     * Сколько всего групп (без личных диалогов и «Избранного»). `searchGroups`
     * для этого не годится: он отдаёт только первые `limit` совпадений, а по
     * пустому запросу это не весь список, а его начало.
     */
    countGroups(): Promise<number>;
    update(id: string, input: UpdateConversationInput): Promise<Conversation>;
    findById(id: string): Promise<Conversation | null>;
    listForUser(userId: string): Promise<Conversation[]>;
    /** Yargram 0.1 compatibility: null clears every pin. */
    setPinnedMessage(conversationId: string, messageId: string | null): Promise<Conversation>;
    setMessagePinned(conversationId: string, messageId: string, pinned: boolean): Promise<Conversation>;
    updateUserSettings(conversationId: string, userId: string, input: {
        archived?: boolean;
        mutedUntil?: string | null;
    }): Promise<Conversation>;
}
export type CreateMessageInput = Pick<Message, "conversationId" | "senderId" | "text"> & {
    replyToId?: string;
    forwardedFromId?: string;
    attachmentIds?: string[];
    kind?: Message["kind"];
    systemEvent?: Message["systemEvent"];
    call?: CallMessage;
    poll?: Poll;
    /** Кнопки под сообщением бота. */
    keyboard?: BotKeyboard;
    /** Обращение в поддержку, пересланное в группу владельцев. */
    supportTicket?: SupportTicket;
    /** Отправленные стикеры: ссылки на картинки, а не на вложения. */
    stickerIds?: string[];
    /** Присланный набор стикеров: сообщение без текста, только карточка набора. */
    stickerPackId?: string;
};
export interface MessageRepository {
    create(input: CreateMessageInput): Promise<Message>;
    /** Опрос живёт внутри сообщения: голоса и варианты меняются на месте. */
    updatePoll(id: string, poll: Poll): Promise<Message>;
    /** Сколько непрочитанных в каждой беседе: считается одним проходом на все чаты. */
    countUnread(conversationIds: string[], userId: string): Promise<Record<string, number>>;
    listForConversation(conversationId: string, options: {
        limit: number;
        before?: string;
        query?: string;
    }): Promise<Message[]>;
    listByIds(ids: string[]): Promise<Message[]>;
    findById(id: string): Promise<Message | null>;
    findByAttachmentId(attachmentId: string): Promise<Message[]>;
    updateText(id: string, text: string): Promise<Message>;
    setReaction(id: string, userId: string, emoji: ReactionEmoji | null): Promise<Message>;
    deleteFromConversation(conversationId: string, id: string): Promise<Message>;
    markRead(conversationId: string, userId: string): Promise<{
        messages: Message[];
        messageIds: string[];
    }>;
}
export interface AttachmentRepository {
    create(input: Omit<Attachment, "id" | "createdAt">): Promise<Attachment>;
    findById(id: string): Promise<Attachment | null>;
    findManyByIds(ids: string[]): Promise<Attachment[]>;
    /** Все файлы человека — нужно, чтобы удалить аккаунт без мусора на диске. */
    listByOwner(ownerId: string): Promise<Attachment[]>;
    delete(id: string): Promise<Attachment | null>;
}
export interface ReportRepository {
    create(input: {
        reporterId: string;
        reportedUserId: string;
        reason: ReportReason;
        details?: string;
    }): Promise<UserReport>;
    list(): Promise<UserReport[]>;
}
export interface FavoriteNoteRepository {
    create(input: {
        userId: string;
        content: string;
    }): Promise<FavoriteNote>;
    list(userId: string): Promise<FavoriteNote[]>;
    update(id: string, userId: string, content: string): Promise<FavoriteNote>;
    delete(id: string, userId: string): Promise<void>;
}
export interface CallRepository {
    create(input: Omit<CallRecord, "startedAt">): Promise<CallRecord>;
    findById(id: string): Promise<CallRecord | null>;
    update(id: string, input: Partial<Omit<CallRecord, "id" | "conversationId" | "initiatorId" | "startedAt">>): Promise<CallRecord>;
    listForConversation(conversationId: string): Promise<CallRecord[]>;
}
export interface DraftRepository {
    listForUser(userId: string): Promise<ConversationDraft[]>;
    find(userId: string, conversationId: string): Promise<ConversationDraft | null>;
    save(input: {
        userId: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        replyToId?: string | undefined;
    }): Promise<ConversationDraft>;
    delete(userId: string, conversationId: string): Promise<void>;
}
export interface FolderRepository {
    listForUser(userId: string): Promise<ConversationFolder[]>;
    findById(id: string): Promise<ConversationFolder | null>;
    create(input: {
        userId: string;
        name: string;
        conversationIds?: string[] | undefined;
    }): Promise<ConversationFolder>;
    update(id: string, userId: string, input: {
        name?: string | undefined;
        position?: number | undefined;
        conversationIds?: string[] | undefined;
    }): Promise<ConversationFolder>;
    delete(id: string, userId: string): Promise<void>;
}
export interface ScheduledMessageRepository {
    listForUser(userId: string): Promise<ScheduledMessage[]>;
    findById(id: string): Promise<ScheduledMessage | null>;
    create(input: {
        userId: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        replyToId?: string | undefined;
        sendAt: string;
    }): Promise<ScheduledMessage>;
    update(id: string, userId: string, input: {
        text?: string | undefined;
        attachmentIds?: string[] | undefined;
        replyToId?: string | null | undefined;
        sendAt?: string | undefined;
    }): Promise<ScheduledMessage>;
    cancel(id: string, userId: string): Promise<ScheduledMessage>;
    /** Takes ownership of a due message so two workers cannot send it twice. */
    claimDue(id: string): Promise<ScheduledMessage | null>;
    listDue(nowIso: string, limit: number): Promise<ScheduledMessage[]>;
    markSent(id: string, messageId: string, sentAt: string): Promise<ScheduledMessage>;
    markFailed(id: string, reason: string): Promise<ScheduledMessage>;
}
export type CreateSessionInput = {
    userId: string;
    tokenHashes: string[];
    site: string;
    device: string;
    deviceId?: string | undefined;
    customDeviceName?: string | null | undefined;
    /** Вход с незнакомого сайта: владельца надо предупредить. */
    newDevice?: boolean;
};
export type UpdateSessionInput = {
    tokenHashes?: string[];
    site?: string | undefined;
    device?: string | undefined;
    deviceId?: string | undefined;
    customDeviceName?: string | null | undefined;
    lastSeenAt?: string | undefined;
    acknowledgedAt?: string | null | undefined;
    terminatedAt?: string | null | undefined;
};
export interface SessionRepository {
    create(input: CreateSessionInput): Promise<Session>;
    findById(id: string): Promise<Session | null>;
    /**
     * По отпечатку токена. Завершённые сеансы тоже находятся: их токен мёртв,
     * а запись нужна, чтобы токен при следующем запросе не «усыновили» заново
     * как новый вход.
     */
    findByTokenHash(hash: string): Promise<Session | null>;
    /** Все сеансы человека, включая завершённые, — свежие сверху. */
    listForUser(userId: string): Promise<Session[]>;
    update(id: string, input: UpdateSessionInput): Promise<Session>;
    delete(id: string): Promise<Session | null>;
    /** Все сеансы человека разом: аккаунт удалён, входов быть не должно. */
    deleteForUser(userId: string): Promise<void>;
    /** Обновить имя устройства для всех сеансов с этим deviceId. */
    updateDeviceName(deviceId: string, name: string | null): Promise<void>;
    /** Найти имя устройства по deviceId, если оно было сохранено ранее. */
    findDeviceName(deviceId: string): Promise<string | null>;
}
/**
 * Наборы стикеров, собранные людьми.
 *
 * 🔥 Встроенных наборов Yargram здесь нет и быть не должно: они описаны в коде
 * и одинаковы у всех. Хранить их значило бы держать копию в согласии с кодом и
 * разноски по всем аккаунтам при каждом обновлении приложения.
 */
export interface StickerPackRepository {
    /** Наборы, собранные человеком. Присланные сюда не попадают — за них отвечает установка. */
    listOwnedBy(userId: string): Promise<StickerPack[]>;
    findById(id: string): Promise<StickerPack | null>;
    findManyByIds(ids: string[]): Promise<StickerPack[]>;
    create(input: {
        ownerId: string;
        title: string;
        emoji: string;
    }): Promise<StickerPack>;
    /** Переименование и смена значка. Править можно только свой набор. */
    update(id: string, ownerId: string, input: {
        title?: string | undefined;
        emoji?: string | undefined;
    }): Promise<StickerPack>;
    delete(id: string, ownerId: string): Promise<void>;
    /** Отметка об изменении содержимого: по ней клиенты перечитывают набор. */
    bumpVersion(id: string): Promise<StickerPack>;
}
export interface StickerRepository {
    listForPack(packId: string): Promise<Sticker[]>;
    /** Стикеры сразу нескольких наборов: список наборов собирается одним проходом. */
    listForPacks(packIds: string[]): Promise<Sticker[]>;
    findById(id: string): Promise<Sticker | null>;
    /** Сколько стикеров уже в наборе: по этому числу работает предел в 200. */
    countForPack(packId: string): Promise<number>;
    create(input: {
        packId: string;
        attachmentId: string;
        emoji: string;
        animated: boolean;
    }): Promise<Sticker>;
    delete(id: string, packId: string): Promise<Sticker | null>;
    deleteForPack(packId: string): Promise<void>;
}
/**
 * Присланные наборы, которые человек оставил себе.
 *
 * Записи есть только у присланных наборов: встроенные доступны всем по
 * определению, а свои принадлежат человеку по `ownerId`.
 */
export interface StickerPackInstallRepository {
    listForUser(userId: string): Promise<StickerPackInstall[]>;
    find(userId: string, packId: string): Promise<StickerPackInstall | null>;
    /**
     * Добавляет набор себе. Повторная установка не плодит записи: набор могли
     * прислать в чат, где он у человека уже есть, и второй раз это не новость.
     */
    install(input: {
        userId: string;
        packId: string;
        sharedByUserId: string;
    }): Promise<{
        install: StickerPackInstall;
        created: boolean;
    }>;
    /** Убирает набор у человека. `false` — набора у него и не было. */
    uninstall(userId: string, packId: string): Promise<boolean>;
    /** Все, у кого набор есть: по этому списку шлётся обновление набора. */
    listForPack(packId: string): Promise<StickerPackInstall[]>;
    /** Набор удалён: записи о нём больше никому не нужны. */
    deleteForPack(packId: string): Promise<void>;
    /** Аккаунт удалён. */
    deleteForUser(userId: string): Promise<void>;
}
export type Repositories = {
    users: UserRepository;
    conversations: ConversationRepository;
    messages: MessageRepository;
    attachments: AttachmentRepository;
    reports: ReportRepository;
    favoriteNotes: FavoriteNoteRepository;
    calls: CallRepository;
    drafts: DraftRepository;
    folders: FolderRepository;
    scheduledMessages: ScheduledMessageRepository;
    sessions: SessionRepository;
    stickerPacks: StickerPackRepository;
    stickers: StickerRepository;
    stickerInstalls: StickerPackInstallRepository;
};
