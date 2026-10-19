export declare const allowedReactionEmojis: readonly ["👍", "❤️", "😂", "😎", "🔥", "😢", "😮", "🍓", "🍷"];
export type ReactionEmoji = (typeof allowedReactionEmojis)[number];
/**
 * Вид вложения. От него зависит и предел размера, и то, как файл отдаётся
 * обратно: картинки и обои — инлайном, остальное — скачиванием.
 *
 * `sticker` и `gif` — не «ещё два вида файла», а именно картинки со своим
 * поведением: стикер рисуется без пузыря и во весь размер, гифка играет сама
 * по кругу и без звука.
 */
export type AttachmentKind = "image" | "file" | "avatar" | "banner" | "wallpaper" | "sticker" | "gif";
/** Уточнение поверх вида: запись голосом, кружок и видео-гифка. */
export type MediaKind = "voice" | "video_circle" | "gif";
export type Attachment = {
    id: string;
    ownerId: string;
    kind: AttachmentKind;
    mediaKind?: MediaKind;
    durationSeconds?: number;
    fileName: string;
    storedFileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
};
export type AttachmentView = Omit<Attachment, "storedFileName"> & {
    url: string;
};
/** Зачем выдан код из письма: подтверждение регистрации, вход или сброс пароля. */
export type EmailCodePurpose = "register" | "login" | "reset";
export type CallPrivacyRule = "everyone" | "contacts" | "nobody";
export type User = {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    username?: string | undefined;
    bio: string;
    avatar?: AttachmentView | undefined;
    /** Ссылка на аватар: ставится, когда аватар задан прямой URL-кой, без
     *  загрузки файла. Так оформлен служебный бот поддержки — картинку ему
     *  кладёт скрипт, а не человек через профиль. Вложение (`avatar`) важнее. */
    avatarUrl?: string | null;
    lastSeenAt: string;
    showLastSeen: boolean;
    /** Конфиденциальность звонков: кто может звонить пользователю. */
    callPrivacy?: CallPrivacyRule;
    /** Исключения звонков: пользователи, которым всегда разрешено звонить. */
    callPrivacyAllowedUserIds?: string[];
    /** Исключения звонков: пользователи, которым всегда запрещено звонить. */
    callPrivacyDeniedUserIds?: string[];
    blockedUserIds: string[];
    favoriteMessageIds: string[];
    notificationSoundEnabled: boolean;
    createdAt: string;
    themeColor?: string;
    wallpaperUrl?: string;
    /** Тип загруженного фона: `image/*` или `video/*`. Ссылка на фон хранится
     *  строкой, и по ней не видно, видео это или картинка, — а рисовать их надо
     *  по-разному: `<video>` вместо фоновой картинки. */
    wallpaperMimeType?: string;
    /** Баннер профиля, как в Discord: полоса над аватаром. Может быть заливкой
     *  (`bannerColor`) или картинкой (`banner`) — картинка важнее заливки. */
    bannerColor?: string;
    banner?: AttachmentView;
    /** Ссылка на баннер: ставится, когда баннер задан прямой URL-кой, без загрузки
     *  файла. Важнее `banner` (вложение), но если вложения нет — берётся эта ссылка. */
    bannerUrl?: string | null;
    isVerified?: boolean;
    badge?: "yargram" | null;
    /** Отметка SCAM: владелец пометил аккаунт как мошеннический. Описание
     *  при этом подменяется предупреждением, и менять его нельзя. */
    scam?: boolean;
    /** Отметка FAKE: аккаунт выдаёт себя за официальный. Работает так же, как
     *  SCAM, но с другим текстом. Обе отметки одновременно — важнее SCAM. */
    fake?: boolean;
    usernames?: string[];
    adminUserIds?: string[];
    /** Друзья: взаимный список, обе стороны хранят друг друга. */
    friendIds?: string[];
    /** Исходящие заявки — те, кому я предложил дружбу и кто ещё не ответил. */
    outgoingFriendRequestIds?: string[];
    /** Входящие заявки: их пишет автор заявки в чужой список, поэтому это
     *  единственное поле дружбы, которое меняют от чужого имени. */
    incomingFriendRequestIds?: string[];
    /** Это приложение Yargram, а не человек: ему разрешён знак «Yargram». */
    isApp?: boolean;
    /** Это бот, а не человек: рядом с именем рисуется метка «бот», а войти в
     *  такой аккаунт нельзя — у него нет настоящего пароля. */
    isBot?: boolean;
    isOwner?: boolean;
    isBanned?: boolean;
    isFrozen?: boolean;
    /** Аккаунт удалён владельцем. Запись остаётся: почта и ник не освобождаются,
     *  а владелец может вернуть аккаунт обратно. */
    isDeleted?: boolean;
    deletedAt?: string;
    birthday?: string;
    /** Почта подтверждена кодом из письма. Отсутствие поля считается `true`:
     *  у аккаунтов, созданных до появления подтверждения, поля просто нет, и
     *  запирать их мы не должны. */
    emailVerified?: boolean;
    /** Хеш действующего кода (bcrypt). Сам код в базе не лежит: если база
     *  утечёт, по ней нельзя войти. */
    emailCodeHash?: string | null;
    emailCodePurpose?: EmailCodePurpose | null;
    /** ISO-время, после которого код недействителен. */
    emailCodeExpiresAt?: string | null;
    /** Сколько раз код ввели неверно: после лимита код сгорает. */
    emailCodeAttempts?: number;
    /** Через сколько дней бездействия сеанс завершается сам. `null` — никогда:
     *  сеанс живёт, пока человек его сам не закроет. */
    sessionAutoTerminateDays?: number | null;
    /**
     * Язык интерфейса, выбранный человеком. Сам интерфейс переводится на клиенте
     * и живёт в `localStorage`, а это поле — только для того, чтобы **сервер**
     * знал язык: служебный бот поддержки пишет сообщения из сервера и должен
     * отвечать на том же языке, что и кнопки вокруг.
     *
     * Настройка не привязана к устройству, поэтому последний выбранный язык
     * побеждает: зашли с телефона по-английски — бот ответит по-английски.
     */
    language?: string;
};
/**
 * Регистрация не состоялась: человек завёл аккаунт, но код из письма так и не
 * ввёл, а срок кода уже вышел.
 *
 * Такой аккаунт не подтверждён, токена у него никогда не было, и внутри ничего
 * нет — ни переписки, ни друзей. Держать его нельзя: почта и ник остались бы
 * занятыми навсегда, и человек не смог бы даже зарегистрироваться заново.
 * Поэтому незавершённую регистрацию стирают начисто, «будто её не было».
 *
 * 🔥 Правило живёт здесь, а не в сервисе: по нему и `AuthService` (сразу, когда
 * человек пробует ту же почту), и уборщик `RegistrationCleanupService` (по
 * таймеру). Копия правила на SQL — в `postgres-repositories.ts`; меняя одно,
 * менять и другое.
 *
 * Явные действия владельца уважаем: замороженный или удалённый аккаунт не
 * трогаем, даже если почта не подтверждена, — иначе уборка отменяла бы решение
 * владельца.
 */
export declare function isFailedRegistration(user: User, now?: Date): boolean;
export type LastSeenStatus = "recently" | "within_week" | "within_month" | "long_ago";
export type PublicUser = {
    id: string;
    displayName: string;
    username: string | null;
    bio: string;
    avatar: AttachmentView | null;
    avatarUrl: string | null;
    lastSeenAt: string | null;
    lastSeenStatus: LastSeenStatus | null;
    online: boolean;
    createdAt: string;
    /** Баннер профиля виден всем: заливка цветом или картинка. */
    bannerColor?: string | undefined;
    banner: AttachmentView | null;
    bannerUrl: string | null;
    isVerified?: boolean | undefined;
    badge?: "yargram" | null | undefined;
    scam?: boolean | undefined;
    fake?: boolean | undefined;
    usernames?: string[] | undefined;
    adminUserIds?: string[] | undefined;
    isOwner?: boolean | undefined;
    isBanned?: boolean | undefined;
    isFrozen?: boolean | undefined;
    isDeleted?: boolean | undefined;
    birthday?: string | undefined;
    /** Дружба видна всем: по ней рисуется кнопка и подпись «в друзьях». */
    friendIds?: string[] | undefined;
    isApp?: boolean | undefined;
    isBot?: boolean | undefined;
};
export type CurrentUser = PublicUser & {
    email: string;
    showLastSeen: boolean;
    callPrivacy: CallPrivacyRule;
    callPrivacyAllowedUserIds: string[];
    callPrivacyDeniedUserIds: string[];
    notificationSoundEnabled: boolean;
    /** Почта подтверждена кодом из письма. У старых аккаунтов поля нет —
     *  считаем подтверждённой, чтобы не запирать их. */
    emailVerified: boolean;
    themeColor?: string;
    wallpaperUrl?: string;
    wallpaperMimeType?: string;
    /** Через сколько дней бездействия сеанс завершается сам; `null` — никогда. */
    sessionAutoTerminateDays?: number | null;
    /** Язык интерфейса: по нему отвечает служебный бот поддержки. */
    language?: string;
};
/**
 * Отдельные права группы. Включаются независимо друг от друга: владелец
 * собирает из них любую комбинацию для администраторов и участников.
 */
/** Права, которые владелец выдаёт обычным участникам. */
export declare const memberPermissions: readonly ["send_messages", "send_media", "send_links", "send_polls", "add_members", "pin_messages", "change_info", "delete_messages"];
/**
 * Управляющие права: они есть только у владельца и администраторов и обычным
 * участникам не выдаются — иначе любой смог бы выгонять людей из группы.
 */
export declare const adminOnlyPermissions: readonly ["remove_members", "restrict_members", "manage_tags", "add_admins"];
export declare const groupPermissions: readonly ["send_messages", "send_media", "send_links", "send_polls", "add_members", "pin_messages", "change_info", "delete_messages", "remove_members", "restrict_members", "manage_tags", "add_admins"];
export type MemberPermission = (typeof memberPermissions)[number];
export type AdminOnlyPermission = (typeof adminOnlyPermissions)[number];
export type GroupPermission = (typeof groupPermissions)[number];
/**
 * `| undefined` в значении нужен из-за exactOptionalPropertyTypes: схема запроса
 * присылает объект, где ключ может присутствовать со значением undefined.
 */
export type GroupPermissions = Partial<Record<GroupPermission, boolean | undefined>>;
/** Права после вычисления: у каждого пункта есть конкретный ответ «да» или «нет». */
export type EffectiveGroupPermissions = Record<GroupPermission, boolean>;
/** Роль считается из записи группы, отдельного поля «роль» нет. */
export type GroupRole = "owner" | "admin" | "member" | "restricted";
/** Запись истории изменений группы: кто и что сделал. */
export type GroupEvent = {
    id: string;
    at: string;
    actorId: string;
    kind: "created" | "renamed" | "description_changed" | "avatar_changed" | "member_added" | "member_removed" | "member_left" | "admin_added" | "admin_removed" | "permissions_changed" | "member_restricted" | "member_muted" | "member_unmuted" | "member_tag_changed";
    targetId?: string | undefined;
    detail?: string | undefined;
};
export type Conversation = {
    id: string;
    type: "direct" | "saved" | "group";
    memberIds: string[];
    /** Пара участников личного диалога; у групп и «Избранного» пустая строка. */
    directKey: string;
    createdAt: string;
    updatedAt: string;
    lastMessageId?: string | undefined;
    /** Kept for clients and database files created by Yargram 0.1. */
    pinnedMessageId?: string | undefined;
    pinnedMessageIds: string[];
    archivedBy: string[];
    mutedUntilBy: Record<string, string | null>;
    title?: string | undefined;
    description?: string | undefined;
    avatarUrl?: string | null | undefined;
    /** Владелец группы: единственный, кто может удалить группу и сменить владельца. */
    ownerId?: string | undefined;
    adminIds?: string[] | undefined;
    /** Права конкретного администратора; отсутствующие берутся из adminDefaults. */
    adminPermissions?: Record<string, GroupPermissions> | undefined;
    /** Права администраторов по умолчанию. */
    adminDefaults?: GroupPermissions | undefined;
    /** Код из ссылки-приглашения t.me-подобного вида. */
    inviteCode?: string | undefined;
    /** Права обычных участников; отсутствующие считаются разрешёнными. */
    permissions?: GroupPermissions | undefined;
    /** Личные ограничения участника поверх общих прав. */
    restrictions?: Record<string, GroupPermissions> | undefined;
    /** Мьют участника до указанного времени (ISO) или бессрочно при null. */
    mutedMembers?: Record<string, string | null> | undefined;
    /**
     * Тег участника внутри группы: короткая подпись рядом с именем. Цвет тега
     * зависит от роли, а сам тег хранится отдельно от профиля.
     */
    memberTags?: Record<string, string> | undefined;
    /** Кто вышел из группы: чат у него в списке не показывается. */
    leftIds?: string[] | undefined;
    history?: GroupEvent[] | undefined;
    /**
     * Галочка, значок Yargram, отметка SCAM и отметка FAKE есть не только у
     * аккаунтов, но и у групп: владелец Yargram помечает саму группу, а не её
     * создателя. Хранятся отдельно от профиля владельца группы, иначе отметка
     * переезжала бы вместе со сменой владельца.
     */
    isVerified?: boolean | undefined;
    badge?: "yargram" | null | undefined;
    scam?: boolean | undefined;
    /** Отметка FAKE: группа выдаёт себя за официальную. Как у аккаунта. */
    fake?: boolean | undefined;
    /**
     * Служебная группа поддержки: в неё бот пересылает обращения, а владельцы
     * отвечают. Она не показывается обычным людям и не ищется по приглашению —
     * отдельная метка нужна, чтобы найти её и не путать с обычной группой.
     */
    isSupportInbox?: boolean | undefined;
    /** Начальная общая группа, доступная всем пользователям. */
    isDefaultGroup?: boolean | undefined;
};
/** Права администратора по умолчанию: всё, кроме смены владельца. */
export declare const defaultAdminPermissions: () => GroupPermissions;
/**
 * Роль участника считается из записи группы: отдельного поля «роль» нет,
 * чтобы не пришлось синхронизировать два источника правды.
 */
export declare function groupRoleFor(conversation: Conversation, userId: string): GroupRole | null;
/** Мьют участника: до времени или бессрочно (null). Прошедший мьют не считается. */
export declare function isGroupMemberMuted(conversation: Conversation, userId: string, now?: number): boolean;
/**
 * Проверка одного права. Порядок: владелец → всё; администратор → свои права;
 * участник → общие права группы, поверх них личные ограничения и мьют.
 */
export declare function groupCan(conversation: Conversation, userId: string, permission: GroupPermission, now?: number): boolean;
export declare function isAdminOnlyPermission(permission: GroupPermission): boolean;
/**
 * Что получает администратор, если владелец не уточнил права: всё, кроме
 * добавления новых администраторов — как в Telegram, где это выключено.
 */
export declare function defaultAdminPermission(permission: GroupPermission): boolean;
/** Все права сразу: клиент показывает по ним доступные кнопки. */
export declare function effectiveGroupPermissions(conversation: Conversation, userId: string, now?: number): EffectiveGroupPermissions;
export type MessageReaction = {
    userId: string;
    emoji: ReactionEmoji;
    createdAt: string;
};
export type CallMessage = {
    callId: string;
    callerId: string;
    mode: "audio" | "video";
    outcome: "completed" | "missed" | "declined" | "unanswered";
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
};
/** Вариант ответа в опросе. */
export type PollOption = {
    id: string;
    text: string;
};
/** Настройки опроса: владелец включает их по отдельности. */
export type PollSettings = {
    /** Показывать, кто как голосовал. */
    showNames: boolean;
    /** Разрешить несколько ответов. */
    multiple: boolean;
    /** Участники могут добавлять свои варианты. */
    addOptions: boolean;
    /** Ответ можно изменить. */
    changeVote: boolean;
    /** Показывать варианты в случайном порядке. */
    shuffle: boolean;
    /** Правильные варианты: непустой список превращает опрос в викторину. */
    correctOptionIds: string[];
    /** Когда опрос закрывается сам; null — не закрывается. */
    deadline: string | null;
};
export type Poll = {
    question: string;
    description: string;
    options: PollOption[];
    settings: PollSettings;
    /** Кто как ответил: id участника → выбранные варианты. */
    votes: Record<string, string[]>;
    closed: boolean;
};
/** Кнопка в сообщении бота: подпись и код действия, который клиент шлёт обратно. */
export type BotButton = {
    label: string;
    /** Код действия. Клиент не пишет его в чат, а отправляет серверу отдельно. */
    action: string;
};
/** Клавиатура бота — ряды кнопок под текстом сообщения. */
export type BotKeyboard = BotButton[][];
/**
 * Обращение в поддержку. Бот кладёт его в само сообщение, пересланное в группу
 * владельцев: по этому полю находится, кому вернуть ответ, когда владелец
 * ответит на сообщение бота.
 */
export type SupportTicket = {
    /** Кто обратился: id человека, написавшего боту. */
    userId: string;
    /** Раздел обращения: `error`, `idea` или `other`. */
    category: string;
    /** Уточнение внутри раздела, если человек выбрал готовый вариант. */
    topic?: string | undefined;
    /**
     * Номер обращения: короткий код, который человек видит в переписке с ботом.
     * Нужен, чтобы продолжение («спросить ещё») ушло тем же обращением, а не
     * завело новое: кнопка под ответом несёт этот код в себе.
     *
     * Поле необязательное: обращения, отправленные до его появления, его не
     * имеют — им номер просто выдаётся заново при первом ответе.
     */
    code?: string | undefined;
};
export type Message = {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    kind: "user" | "system" | "poll" | "bot";
    systemEvent?: "call" | "user_joined" | "user_left" | undefined;
    call?: CallMessage | undefined;
    /** Опрос: заполнен только у сообщений вида poll. */
    poll?: Poll | undefined;
    /** Кнопки под сообщением бота: клиент рисует их и отправляет `action` назад. */
    keyboard?: BotKeyboard | undefined;
    /** Пересланное в группу владельцев обращение: по нему бот находит адресата. */
    supportTicket?: SupportTicket | undefined;
    /**
     * Отправленные стикеры.
     *
     * 🔥 Ссылка на стикер, а не на вложение. У встроенных стикеров вложения нет
     * вообще — это файлы сборки, — а у пользовательских вложение своё, и оно
     * может быть удалено вместе со стикером. Сообщение хранит только id, а
     * готовые адреса отдаёт `toMessageView`: иначе подпись в ссылке протухала бы
     * прямо в истории сообщений.
     */
    stickerIds: string[];
    /** Присланный набор стикеров. Сообщение без текста: клиент рисует карточку. */
    stickerPackId?: string | undefined;
    createdAt: string;
    editedAt?: string | undefined;
    replyToId?: string | undefined;
    forwardedFromId?: string | undefined;
    attachmentIds: string[];
    reactions: MessageReaction[];
    readBy: string[];
};
export type ReportReason = "spam" | "abuse" | "fraud" | "other";
export type UserReport = {
    id: string;
    reporterId: string;
    reportedUserId: string;
    reason: ReportReason;
    details?: string;
    createdAt: string;
};
export type FavoriteNote = {
    id: string;
    userId: string;
    content: string;
    createdAt: string;
    updatedAt?: string | undefined;
};
export type CallRecord = {
    id: string;
    conversationId: string;
    initiatorId: string;
    mode: "audio" | "video";
    status: "ringing" | "active" | "completed" | "missed" | "rejected" | "not_answered";
    startedAt: string;
    answeredAt?: string | undefined;
    endedAt?: string | undefined;
    endedById?: string | undefined;
    durationSeconds?: number | undefined;
};
export type ConversationDraft = {
    id: string;
    userId: string;
    conversationId: string;
    text: string;
    attachmentIds: string[];
    replyToId?: string | undefined;
    updatedAt: string;
};
export type ConversationFolder = {
    id: string;
    userId: string;
    name: string;
    position: number;
    conversationIds: string[];
    icon?: string | null | undefined;
    includedChatTypes?: string[] | undefined;
    excludedConversationIds?: string[] | undefined;
    excludedChatTypes?: string[] | undefined;
    createdAt: string;
    updatedAt: string;
};
export type ScheduledMessageStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";
export type ScheduledMessage = {
    id: string;
    userId: string;
    conversationId: string;
    text: string;
    attachmentIds: string[];
    replyToId?: string | undefined;
    sendAt: string;
    status: ScheduledMessageStatus;
    createdAt: string;
    sentAt?: string | undefined;
    messageId?: string | undefined;
    failureReason?: string | undefined;
};
/**
 * Активный сеанс — вход в аккаунт.
 *
 * Yargram — это сайт, поэтому сеанс описывают не «устройство», а пара
 * «сайт + браузер»: человек видит, откуда именно он вошёл, и может закрыть
 * именно этот вход, не трогая остальные.
 *
 * Токен доступа сам в базе не лежит — только его отпечаток (SHA-256). Утечка
 * базы не даёт готового ключа, а найти сеанс по предъявленному токену всё же
 * можно. Завершённый сеанс остаётся записью: иначе его токен при следующем
 * запросе приняли бы за новый вход и «усыновили» заново.
 */
export type Session = {
    id: string;
    userId: string;
    /** Отпечатки всех токенов, выданных этому сеансу. */
    tokenHashes: string[];
    /** Сайт, с которого вошли: origin, например `https://yargram.ru`. */
    site: string;
    /** Браузер и система — из User-Agent, например «Chrome, Windows». */
    device: string;
    /** Постоянный идентификатор физического устройства / браузера. */
    deviceId?: string | undefined;
    /** Пользовательское имя устройства (например, «Домашний ПК»). */
    customDeviceName?: string | null | undefined;
    createdAt: string;
    lastSeenAt: string;
    /** Вход был с незнакомого сайта: владельца надо предупредить окном. */
    newDevice?: boolean | undefined;
    /** Владелец подтвердил вход («это был я»). Пусто — окно ещё не показано. */
    acknowledgedAt?: string | null | undefined;
    /** Сеанс завершён: сам он или владелец с другого сеанса. */
    terminatedAt?: string | null | undefined;
};
/**
 * Набор стикеров.
 *
 * Встроенные наборы Yargram (`ownerId === ""`) описаны в коде и одинаковы у
 * всех: их не заводят, не переименовывают и не удаляют. Пользовательский набор
 * принадлежит тому, кто его собрал, и остаётся у него, даже если стикеры из
 * набора убрать.
 */
export type StickerPack = {
    id: string;
    /** Кто собрал набор. Пусто у встроенных наборов. */
    ownerId: string;
    title: string;
    /** Значок, которым набор показывают в списке. */
    emoji: string;
    /**
     * 🔥 Растёт при каждом добавлении или удалении стикера. По нему клиент
     * понимает, что набор изменился, и перечитывает его.
     *
     * Набор **не копируется** человеку, которому его прислали, — он остаётся
     * общим. Поэтому добавили стикер в набор один раз, и он появился у всех, кому
     * этот набор прислали. Копия потребовала бы разноски по всем получателям и
     * разошлась бы с оригиналом на первом же добавлении.
     */
    version: number;
    createdAt: string;
    updatedAt: string;
};
/** Стикер внутри набора: картинка или анимация плюс значок-эмодзи. */
export type Sticker = {
    id: string;
    packId: string;
    /**
     * Вложение с картинкой. Пусто у встроенных стикеров: те лежат готовыми
     * файлами рядом с приложением и раздаются обычной статикой.
     */
    attachmentId?: string | undefined;
    /** Путь встроенного стикера, когда вложения нет. */
    imageUrl?: string | undefined;
    /** Значок, подходящий стикеру: по нему стикер ищут в наборе. */
    emoji: string;
    /** Анимированный стикер: GIF, APNG или анимированный WebP. */
    animated: boolean;
    createdAt: string;
};
/**
 * Присланный набор, который человек оставил себе.
 *
 * 🔥 Записи есть **только у присланных** наборов. Встроенные наборы доступны
 * всем по определению, а свои человеку принадлежат по `ownerId` — заводить им
 * отдельные записи значило бы держать их в согласии с кодом и раздавать всем
 * существующим аккаунтам при каждом обновлении приложения.
 */
export type StickerPackInstall = {
    id: string;
    userId: string;
    packId: string;
    /** Кто прислал набор. */
    sharedByUserId: string;
    installedAt: string;
};
/** Стикер, как его видит клиент: всегда готовый адрес картинки. */
export type StickerView = {
    id: string;
    packId: string;
    emoji: string;
    animated: boolean;
    url: string;
};
/** Набор стикеров вместе с содержимым. */
export type StickerPackView = {
    id: string;
    title: string;
    emoji: string;
    version: number;
    /** Набор человека: только свои наборы можно править. */
    mine: boolean;
    /** Встроенный набор Yargram: править нельзя никому. */
    builtin: boolean;
    /** Кто прислал набор. Пусто у встроенного и своего. */
    sharedByUserId?: string | undefined;
    updatedAt: string;
    stickers: StickerView[];
};
export type DatabaseState = {
    version: 1;
    users: User[];
    conversations: Conversation[];
    messages: Message[];
    attachments: Attachment[];
    reports: UserReport[];
    favoriteNotes: FavoriteNote[];
    calls: CallRecord[];
    drafts: ConversationDraft[];
    folders: ConversationFolder[];
    scheduledMessages: ScheduledMessage[];
    sessions: Session[];
    stickerPacks: StickerPack[];
    stickers: Sticker[];
    stickerInstalls: StickerPackInstall[];
};
/**
 * Отдаём ли файл инлайном. Картинки переписки, оформление профиля, стикеры и
 * гифки показываются на месте; всё остальное скачивается.
 *
 * 🔥 Ошибка здесь незаметна в коде и очень заметна в жизни: браузер не рисует
 * картинку, а предлагает её сохранить. Поэтому список один на весь сервер, а не
 * разбросан по маршрутам.
 */
export declare function servesInline(kind: AttachmentKind): boolean;
export declare function toAttachmentView(attachment: Attachment, subject?: string): AttachmentView;
export declare function lastSeenStatus(lastSeenAt: string, now?: number): LastSeenStatus;
/**
 * Отметка SCAM: описание такого аккаунта всегда показывается этим текстом.
 * Подмена живёт на чтении, а не на записи — поэтому снятие отметки возвращает
 * человеку его прежнее описание, а не пустую строку.
 */
export declare const SCAM_BIO_WARNING = "\u26A0\uFE0F \u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435: \u043D\u0430 \u044D\u0442\u043E\u0442 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u0447\u0430\u0441\u0442\u043E \u0436\u0430\u043B\u043E\u0432\u0430\u043B\u0438\u0441\u044C \u0432 \u0441\u0432\u044F\u0437\u0438 \u0441 \u043C\u043E\u0448\u0435\u043D\u043D\u0438\u0447\u0435\u0441\u0442\u0432\u043E\u043C \u0438\u043B\u0438 \u043F\u043E\u043F\u044B\u0442\u043A\u0430\u043C\u0438 \u0432\u044B\u0434\u0430\u0442\u044C \u0441\u0435\u0431\u044F \u0437\u0430 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0430\u043A\u043A\u0430\u0443\u043D\u0442. \u0411\u0443\u0434\u044C\u0442\u0435 \u043E\u0441\u0442\u043E\u0440\u043E\u0436\u043D\u044B, \u043E\u0441\u043E\u0431\u0435\u043D\u043D\u043E \u0435\u0441\u043B\u0438 \u0443 \u0412\u0430\u0441 \u043F\u043E\u043F\u0440\u043E\u0441\u044F\u0442 \u0434\u0435\u043D\u0435\u0433.";
/**
 * То же предупреждение для группы. Владелец помечает не человека, а саму
 * группу, поэтому текст говорит «на эту группу», а не «на этот аккаунт»:
 * иначе предупреждение читалось бы как отметка на создателе.
 */
export declare const SCAM_GROUP_WARNING = "\u26A0\uFE0F \u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435: \u043D\u0430 \u044D\u0442\u0443 \u0433\u0440\u0443\u043F\u043F\u0443 \u0447\u0430\u0441\u0442\u043E \u0436\u0430\u043B\u043E\u0432\u0430\u043B\u0438\u0441\u044C \u0432 \u0441\u0432\u044F\u0437\u0438 \u0441 \u043C\u043E\u0448\u0435\u043D\u043D\u0438\u0447\u0435\u0441\u0442\u0432\u043E\u043C \u0438\u043B\u0438 \u043F\u043E\u043F\u044B\u0442\u043A\u0430\u043C\u0438 \u0432\u044B\u0434\u0430\u0442\u044C \u0441\u0435\u0431\u044F \u0437\u0430 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u0443\u044E \u0433\u0440\u0443\u043F\u043F\u0443. \u0411\u0443\u0434\u044C\u0442\u0435 \u043E\u0441\u0442\u043E\u0440\u043E\u0436\u043D\u044B, \u043E\u0441\u043E\u0431\u0435\u043D\u043D\u043E \u0435\u0441\u043B\u0438 \u0443 \u0412\u0430\u0441 \u043F\u043E\u043F\u0440\u043E\u0441\u044F\u0442 \u0434\u0435\u043D\u0435\u0433.";
/**
 * Отметка FAKE: аккаунт притворяется официальным. Текст короче и мягче, чем у
 * SCAM — здесь речь не о мошенничестве, а о подделке под официальный аккаунт.
 * Как и у SCAM, подмена живёт на чтении: снятие отметки возвращает описание.
 */
export declare const FAKE_BIO_WARNING = "\u26A0\uFE0F \u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435: \u043C\u043D\u043E\u0433\u0438\u0435 \u0436\u0430\u043B\u043E\u0432\u0430\u043B\u0438\u0441\u044C, \u0447\u0442\u043E \u044D\u0442\u043E\u0442 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u0432\u044B\u0434\u0430\u0451\u0442 \u0441\u0435\u0431\u044F \u0437\u0430 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0439.";
/**
 * То же предупреждение для группы: владелец помечает группу, а не её
 * создателя, поэтому речь идёт о самой группе. Надписи латиницей, как у SCAM.
 */
export declare const FAKE_GROUP_WARNING = "\u26A0\uFE0F \u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435: \u043C\u043D\u043E\u0433\u0438\u0435 \u0436\u0430\u043B\u043E\u0432\u0430\u043B\u0438\u0441\u044C, \u0447\u0442\u043E \u044D\u0442\u0430 \u0433\u0440\u0443\u043F\u043F\u0430 \u0432\u044B\u0434\u0430\u0451\u0442 \u0441\u0435\u0431\u044F \u0437\u0430 \u043E\u0444\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u0443\u044E.";
/**
 * Описание группы, которое видит клиент. Как и у аккаунта, подмена живёт на
 * чтении: снятие отметки возвращает группе её прежнее описание.
 */
export declare function groupDescriptionFor(conversation: Conversation): string;
export declare function toPublicUser(user: User): PublicUser;
/**
 * Публичный вид для рассылки «что стало с аккаунтом»: удалённый и замороженный
 * выглядят как заглушка, живой — своим профилем.
 */
export declare function publicAccountStateFor(user: User): PublicUser;
/**
 * Профиль глазами конкретного смотрящего. Если владелец профиля заблокировал
 * смотрящего, тот видит только имя — как в Telegram: без аватара и без времени
 * визита («был(а) давно»).
 *
 * Замороженный аккаунт прячется так же, как удалённый, но с пометкой
 * `isFrozen: true`, чтобы клиент поставил рядом снежинку.
 */
export declare function toPublicUserFor(user: User, viewerId?: string | null): PublicUser;
/** Заглушка для удалённого аккаунта: имени/аватара нет, биография пустая. */
export declare function removedUserPlaceholder(id: string): PublicUser;
/**
 * Заглушка для удалённого аккаунта, запись которого ещё жива: владельцу нужен
 * флаг, чтобы показать кнопку возврата.
 */
export declare function deletedPlaceholderFor(id: string): PublicUser;
/**
 * Превращает отсутствующего пользователя в заглушку, чтобы диалог не развалился
 * после удаления. Если пользователь заморожен — заменяем на снежинковую версию.
 */
export declare function ensurePublicUser(user: User | null | undefined, fallbackId: string, viewerId?: string | null): PublicUser;
export declare function toCurrentUser(user: User): CurrentUser;
