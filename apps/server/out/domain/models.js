import { mediaUrlFor } from "../lib/media-links.js";
export const allowedReactionEmojis = ["👍", "❤️", "😂", "😎", "🔥", "😢", "😮", "🍓", "🍷"];
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
export function isFailedRegistration(user, now = new Date()) {
    if (user.emailVerified !== false)
        return false;
    if (user.isDeleted || user.isFrozen)
        return false;
    // Кода нет вовсе — подтверждать нечего, регистрация уже не завершится.
    if (!user.emailCodeExpiresAt)
        return true;
    return new Date(user.emailCodeExpiresAt).getTime() <= now.getTime();
}
/**
 * Отдельные права группы. Включаются независимо друг от друга: владелец
 * собирает из них любую комбинацию для администраторов и участников.
 */
/** Права, которые владелец выдаёт обычным участникам. */
export const memberPermissions = [
    "send_messages",
    "send_media",
    "send_links",
    "send_polls",
    "add_members",
    "pin_messages",
    "change_info",
    "delete_messages",
];
/**
 * Управляющие права: они есть только у владельца и администраторов и обычным
 * участникам не выдаются — иначе любой смог бы выгонять людей из группы.
 */
export const adminOnlyPermissions = [
    "remove_members",
    "restrict_members",
    "manage_tags",
    "add_admins",
];
export const groupPermissions = [...memberPermissions, ...adminOnlyPermissions];
/** Права администратора по умолчанию: всё, кроме смены владельца. */
export const defaultAdminPermissions = () => Object.fromEntries(groupPermissions.map((permission) => [permission, defaultAdminPermission(permission)]));
/**
 * Роль участника считается из записи группы: отдельного поля «роль» нет,
 * чтобы не пришлось синхронизировать два источника правды.
 */
export function groupRoleFor(conversation, userId) {
    if (conversation.type !== "group")
        return null;
    if (!conversation.memberIds.includes(userId))
        return null;
    if (conversation.ownerId === userId)
        return "owner";
    if ((conversation.adminIds ?? []).includes(userId))
        return "admin";
    const personal = conversation.restrictions?.[userId];
    if (personal && Object.values(personal).some((allowed) => allowed === false))
        return "restricted";
    if (isGroupMemberMuted(conversation, userId))
        return "restricted";
    return "member";
}
/** Мьют участника: до времени или бессрочно (null). Прошедший мьют не считается. */
export function isGroupMemberMuted(conversation, userId, now = Date.now()) {
    const until = conversation.mutedMembers?.[userId];
    if (until === undefined)
        return false;
    if (until === null)
        return true;
    return Date.parse(until) > now;
}
/**
 * Проверка одного права. Порядок: владелец → всё; администратор → свои права;
 * участник → общие права группы, поверх них личные ограничения и мьют.
 */
export function groupCan(conversation, userId, permission, now = Date.now()) {
    const role = groupRoleFor(conversation, userId);
    if (!role)
        return false;
    if (role === "owner")
        return true;
    if (role === "admin") {
        const own = conversation.adminPermissions?.[userId]?.[permission];
        if (own !== undefined)
            return own;
        return conversation.adminDefaults?.[permission] ?? defaultAdminPermission(permission);
    }
    // Управляющие права участникам не выдаются: иначе любой мог бы выгонять людей.
    if (isAdminOnlyPermission(permission))
        return false;
    const groupDefault = conversation.permissions?.[permission] ?? true;
    const personal = conversation.restrictions?.[userId]?.[permission];
    if (personal !== undefined)
        return personal && groupDefault;
    if (permission === "send_messages" && isGroupMemberMuted(conversation, userId, now))
        return false;
    return groupDefault;
}
export function isAdminOnlyPermission(permission) {
    return adminOnlyPermissions.includes(permission);
}
/**
 * Что получает администратор, если владелец не уточнил права: всё, кроме
 * добавления новых администраторов — как в Telegram, где это выключено.
 */
export function defaultAdminPermission(permission) {
    return permission !== "add_admins";
}
/** Все права сразу: клиент показывает по ним доступные кнопки. */
export function effectiveGroupPermissions(conversation, userId, now = Date.now()) {
    return Object.fromEntries(groupPermissions.map((permission) => [permission, groupCan(conversation, userId, permission, now)]));
}
/**
 * Отдаём ли файл инлайном. Картинки переписки, оформление профиля, стикеры и
 * гифки показываются на месте; всё остальное скачивается.
 *
 * 🔥 Ошибка здесь незаметна в коде и очень заметна в жизни: браузер не рисует
 * картинку, а предлагает её сохранить. Поэтому список один на весь сервер, а не
 * разбросан по маршрутам.
 */
export function servesInline(kind) {
    return (kind === "image" ||
        kind === "avatar" ||
        kind === "banner" ||
        kind === "wallpaper" ||
        kind === "sticker" ||
        kind === "gif");
}
export function toAttachmentView(attachment, subject) {
    const { storedFileName: _storedFileName, ...safeAttachment } = attachment;
    return {
        ...safeAttachment,
        url: mediaUrlFor(attachment.id, subject ?? attachment.ownerId, {
            // Аватар и баннер подписываются как оформление профиля: их отдаём
            // инлайном, а не как скачиваемый файл.
            kind: attachment.kind === "avatar" || attachment.kind === "banner" ? "avatar" : "attachment",
        }),
    };
}
export function lastSeenStatus(lastSeenAt, now = Date.now()) {
    const age = now - Date.parse(lastSeenAt);
    const day = 86_400_000;
    if (age <= 3 * day)
        return "recently";
    if (age <= 7 * day)
        return "within_week";
    if (age <= 30 * day)
        return "within_month";
    return "long_ago";
}
/**
 * Отметка SCAM: описание такого аккаунта всегда показывается этим текстом.
 * Подмена живёт на чтении, а не на записи — поэтому снятие отметки возвращает
 * человеку его прежнее описание, а не пустую строку.
 */
export const SCAM_BIO_WARNING = "⚠️ Внимание: на этот аккаунт часто жаловались в связи с мошенничеством или попытками выдать себя за официальный аккаунт. Будьте осторожны, особенно если у Вас попросят денег.";
/**
 * То же предупреждение для группы. Владелец помечает не человека, а саму
 * группу, поэтому текст говорит «на эту группу», а не «на этот аккаунт»:
 * иначе предупреждение читалось бы как отметка на создателе.
 */
export const SCAM_GROUP_WARNING = "⚠️ Внимание: на эту группу часто жаловались в связи с мошенничеством или попытками выдать себя за официальную группу. Будьте осторожны, особенно если у Вас попросят денег.";
/**
 * Отметка FAKE: аккаунт притворяется официальным. Текст короче и мягче, чем у
 * SCAM — здесь речь не о мошенничестве, а о подделке под официальный аккаунт.
 * Как и у SCAM, подмена живёт на чтении: снятие отметки возвращает описание.
 */
export const FAKE_BIO_WARNING = "⚠️ Внимание: многие жаловались, что этот аккаунт выдаёт себя за официальный.";
/**
 * То же предупреждение для группы: владелец помечает группу, а не её
 * создателя, поэтому речь идёт о самой группе. Надписи латиницей, как у SCAM.
 */
export const FAKE_GROUP_WARNING = "⚠️ Внимание: многие жаловались, что эта группа выдаёт себя за официальную.";
/**
 * Описание группы, которое видит клиент. Как и у аккаунта, подмена живёт на
 * чтении: снятие отметки возвращает группе её прежнее описание.
 */
export function groupDescriptionFor(conversation) {
    if (conversation.scam)
        return SCAM_GROUP_WARNING;
    if (conversation.fake)
        return FAKE_GROUP_WARNING;
    return conversation.description ?? "";
}
/**
 * Ссылка на оформление: переподписываем свою, чужую оставляем как есть.
 *
 * 🔥 Фон хранится готовой строкой, а не вложением, и подпись в ней протухает
 * через сутки. Пока строку не переподписывать при чтении, фон исчезал бы сам:
 * файл на месте, а ссылка больше не открывается. Аватар и баннер живут иначе —
 * их ссылки собираются заново из вложения на каждый ответ.
 */
function refreshDecorativeUrl(value, userId) {
    const own = /^\/api\/uploads\/([A-Za-z0-9._~-]+)(?:\?[^\s]*)?$/.exec(value.trim());
    const uploadId = own?.[1];
    // Внешняя ссылка (человек вписал адрес с картинкой из интернета) — не наша,
    // подписи у неё нет и переподписывать нечего.
    if (uploadId === undefined)
        return value;
    return mediaUrlFor(decodeURIComponent(uploadId), userId, { kind: "avatar" });
}
export function toPublicUser(user) {
    // Stored avatar views keep an old path only; the served URL is always refreshed
    // with a fresh temporary signature.
    const avatar = user.avatar
        ? { ...user.avatar, url: mediaUrlFor(user.avatar.id, user.id, { kind: "avatar" }) }
        : null;
    const banner = user.banner
        ? { ...user.banner, url: mediaUrlFor(user.banner.id, user.id, { kind: "avatar" }) }
        : null;
    return {
        id: user.id,
        displayName: user.displayName,
        username: user.username ?? null,
        // Помеченный SCAM или FAKE о себе ничего не рассказывает: вместо описания
        // всегда идёт предупреждение, даже если человек вписал что-то другое.
        // SCAM важнее — он про мошенничество, а не только про подделку.
        bio: user.scam ? SCAM_BIO_WARNING : user.fake ? FAKE_BIO_WARNING : user.bio,
        avatar,
        // Аватар бывает и ссылкой: у служебного бота картинка задана строкой, а не
        // загрузкой. Вложение важнее — как у баннера.
        avatarUrl: avatar?.url ?? (user.avatarUrl ? refreshDecorativeUrl(user.avatarUrl, user.id) : null),
        bannerColor: user.bannerColor ?? undefined,
        banner,
        bannerUrl: user.bannerUrl ? refreshDecorativeUrl(user.bannerUrl, user.id) : banner?.url ?? null,
        lastSeenAt: user.showLastSeen === false ? null : user.lastSeenAt,
        lastSeenStatus: user.showLastSeen === false ? lastSeenStatus(user.lastSeenAt) : null,
        online: false,
        createdAt: user.createdAt,
        isVerified: user.isVerified ?? false,
        badge: user.badge ?? null,
        scam: user.scam ?? false,
        fake: user.fake ?? false,
        usernames: user.usernames ?? undefined,
        adminUserIds: user.adminUserIds ?? undefined,
        isOwner: user.isOwner ?? undefined,
        isBanned: user.isBanned ?? undefined,
        isFrozen: user.isFrozen ?? undefined,
        isDeleted: user.isDeleted ?? undefined,
        birthday: user.birthday ?? undefined,
        friendIds: user.friendIds ?? undefined,
        isApp: user.isApp ?? undefined,
        isBot: user.isBot ?? undefined,
    };
}
/**
 * Публичный вид для рассылки «что стало с аккаунтом»: удалённый и замороженный
 * выглядят как заглушка, живой — своим профилем.
 */
export function publicAccountStateFor(user) {
    if (user.isDeleted)
        return deletedPlaceholderFor(user.id);
    if (user.isFrozen)
        return frozenPlaceholderFor(user.id);
    return toPublicUser(user);
}
/**
 * Профиль глазами конкретного смотрящего. Если владелец профиля заблокировал
 * смотрящего, тот видит только имя — как в Telegram: без аватара и без времени
 * визита («был(а) давно»).
 *
 * Замороженный аккаунт прячется так же, как удалённый, но с пометкой
 * `isFrozen: true`, чтобы клиент поставил рядом снежинку.
 */
export function toPublicUserFor(user, viewerId) {
    // Удалённый аккаунт остаётся в базе (почта занята), но наружу выглядит
    // заглушкой — без снежинки: её получают только замороженные.
    if (user.isDeleted)
        return deletedPlaceholderFor(user.id);
    if (user.isFrozen)
        return frozenPlaceholderFor(user.id);
    const base = toPublicUser(user);
    if (!viewerId || !user.blockedUserIds?.includes(viewerId))
        return base;
    // Заблокировавший видит только имя — оформление профиля тоже прячем.
    return {
        ...base,
        avatar: null,
        avatarUrl: null,
        bannerColor: undefined,
        banner: null,
        bannerUrl: null,
        lastSeenAt: null,
        lastSeenStatus: "long_ago",
        online: false,
    };
}
/** Заглушка для удалённого аккаунта: имени/аватара нет, биография пустая. */
export function removedUserPlaceholder(id) {
    return {
        id,
        displayName: "Удалённый аккаунт",
        username: null,
        bio: "",
        avatar: null,
        avatarUrl: null,
        banner: null,
        bannerUrl: null,
        lastSeenAt: null,
        lastSeenStatus: null,
        online: false,
        createdAt: new Date(0).toISOString(),
        isFrozen: false,
        scam: false,
        fake: false,
    };
}
/** Заглушка для замороженного аккаунта — клиент показывает на ней снежинку. */
function frozenPlaceholderFor(id) {
    return {
        ...removedUserPlaceholder(id),
        isFrozen: true,
    };
}
/**
 * Заглушка для удалённого аккаунта, запись которого ещё жива: владельцу нужен
 * флаг, чтобы показать кнопку возврата.
 */
export function deletedPlaceholderFor(id) {
    return {
        ...removedUserPlaceholder(id),
        isDeleted: true,
    };
}
/**
 * Превращает отсутствующего пользователя в заглушку, чтобы диалог не развалился
 * после удаления. Если пользователь заморожен — заменяем на снежинковую версию.
 */
export function ensurePublicUser(user, fallbackId, viewerId) {
    if (!user)
        return removedUserPlaceholder(fallbackId);
    return toPublicUserFor(user, viewerId);
}
export function toCurrentUser(user) {
    return {
        ...toPublicUser(user),
        email: user.email,
        showLastSeen: user.showLastSeen ?? true,
        callPrivacy: user.callPrivacy ?? "everyone",
        callPrivacyAllowedUserIds: user.callPrivacyAllowedUserIds ?? [],
        callPrivacyDeniedUserIds: user.callPrivacyDeniedUserIds ?? [],
        notificationSoundEnabled: user.notificationSoundEnabled,
        // Отсутствие поля — это аккаунт, созданный до появления подтверждения:
        // считаем его подтверждённым.
        emailVerified: user.emailVerified !== false,
        ...(user.themeColor === undefined ? {} : { themeColor: user.themeColor }),
        ...(user.wallpaperUrl === undefined
            ? {}
            : { wallpaperUrl: refreshDecorativeUrl(user.wallpaperUrl, user.id) }),
        ...(user.wallpaperMimeType === undefined
            ? {}
            : { wallpaperMimeType: user.wallpaperMimeType }),
        ...(user.bannerColor === undefined ? {} : { bannerColor: user.bannerColor }),
        ...(user.isVerified === undefined ? {} : { isVerified: user.isVerified }),
        ...(user.badge === undefined ? {} : { badge: user.badge }),
        ...(user.scam === undefined ? {} : { scam: user.scam }),
        ...(user.fake === undefined ? {} : { fake: user.fake }),
        ...(user.usernames === undefined ? {} : { usernames: user.usernames }),
        ...(user.adminUserIds === undefined ? {} : { adminUserIds: user.adminUserIds }),
        ...(user.isOwner === undefined ? {} : { isOwner: user.isOwner }),
        ...(user.isBanned === undefined ? {} : { isBanned: user.isBanned }),
        ...(user.isFrozen === undefined ? {} : { isFrozen: user.isFrozen }),
        ...(user.birthday === undefined ? {} : { birthday: user.birthday }),
        ...(user.isApp === undefined ? {} : { isApp: user.isApp }),
        ...(user.isBot === undefined ? {} : { isBot: user.isBot }),
        // `null` — осознанный выбор «никогда не завершать». Отдаём его всегда, а не
        // только когда поле есть: иначе переключатель в настройках вернулся бы в
        // «никогда» после перезахода, а клиент не отличил бы «не задано» от «никогда».
        sessionAutoTerminateDays: user.sessionAutoTerminateDays ?? null,
        ...(user.language === undefined ? {} : { language: user.language }),
    };
}
//# sourceMappingURL=models.js.map