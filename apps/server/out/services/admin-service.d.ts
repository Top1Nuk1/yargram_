import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import { type User } from "../domain/models.js";
export type AdminGrantInput = {
    targetUserId?: string;
    targetUsername?: string;
    isVerified?: boolean | undefined;
    isOwner?: boolean | undefined;
    badge?: "yargram" | null | undefined;
    usernames?: string[] | undefined;
    adminUserIds?: string[] | undefined;
};
/** Знаки группы, которые владелец выдаёт и снимает. */
export type AdminGroupMarksInput = {
    isVerified?: boolean | undefined;
    badge?: "yargram" | null | undefined;
    scam?: boolean | undefined;
    fake?: boolean | undefined;
};
/** Группа в списке админ-панели: название, размер и текущие знаки. */
export type AdminGroupView = {
    id: string;
    title: string;
    memberCount: number;
    isVerified: boolean;
    badge: "yargram" | null;
    scam: boolean;
    fake: boolean;
    /** Код из ссылки-приглашения: по нему группу тоже можно найти. */
    inviteCode: string | null;
};
/**
 * Сводка для админ-панели: сколько всего заведено в Yargram.
 *
 * Считаем и `totalUsers`, и `groups`: владельцу нужно видеть размер установки
 * целиком, а не только тех, кто попал в поиск. Аккаунты считаются **вместе с
 * удалёнными**: удаление мягкое, и запись остаётся в базе, держа почту и ник
 * занятыми.
 */
export type AdminStats = {
    totalUsers: number;
    groups: number;
};
/**
 * Строка списка аккаунтов в админ-панели.
 *
 * Отдаём наружу почти весь профиль, но в одном месте: владельцу нужно разом
 * видеть и знаки, и юзернеймы, и даты. Удалённый и замороженный аккаунт
 * присылаем **как есть** — с настоящим ником и аватаром, а не заглушкой
 * «Удалённый аккаунт»: владелец как раз и ищет, кого удалил, по имени.
 * Имени и аватара в строке, впрочем, хватает и клиенту: даты лежат рядом.
 */
export type AdminAccountView = {
    id: string;
    displayName: string;
    username: string | null;
    /** Дополнительные ники: их бывает много, показываем списком. */
    usernames: string[];
    avatarUrl: string | null;
    /** Знаки владельца — те же, что у профиля. */
    isVerified: boolean;
    badge: "yargram" | null;
    scam: boolean;
    fake: boolean;
    isOwner: boolean;
    isFrozen: boolean;
    isDeleted: boolean;
    /** Служебный бот: рядом с именем метка «BOT», а войти в него нельзя. */
    isBot: boolean;
    createdAt: string;
    /** Когда аккаунт удалили. Пусто, если он не удалён. */
    deletedAt: string | null;
    /**
     * Когда владелец последний раз заходил. Отдаём **истинное** значение, даже если
     * он скрыл время захода от других: админке нужен факт входа, а не то, что
     * видно посторонним. Никогда не пусто — у старых записей подставляется
     * `createdAt` (см. `userSchema`).
     */
    lastSeenAt: string;
};
/** Какие аккаунты показывает список по состоянию записи. */
export type AdminAccountsFilter = "all" | "active" | "frozen" | "deleted";
/**
 * Знак владельца, по которому можно отсеять список. Отдельно от состояния:
 * знаки комбинируются между собой и с любым состоянием, поэтому это не
 * значение перечисления, а набор включённых галочек.
 */
export type AdminAccountsMark = "verified" | "badge" | "scam" | "fake" | "owner" | "bot";
/** По чему искать: только ник, только @юзернеймы или и то и другое. */
export type AdminAccountsScope = "any" | "name" | "handle";
/** Что пришло в `listAccounts` после разбора запроса. */
export type AdminAccountsQuery = {
    query?: string;
    filter?: AdminAccountsFilter;
    /** Знаки, которые обязаны быть у аккаунта: включённые галочки складываются. */
    marks?: AdminAccountsMark[];
    scope?: AdminAccountsScope;
};
export declare class AdminService {
    private readonly repositories;
    private readonly users;
    private readonly events;
    /**
     * Стирание аватара с диска живёт в UploadService, а он создаётся позже —
     * поэтому подключаем его отдельно. Файлы из переписки не трогаем: история
     * остаётся у собеседников, значит вложения должны открываться и дальше.
     */
    private removeUserAvatars;
    constructor(repositories: Repositories, events: RealtimeEvents);
    setAvatarCleanup(removeUserAvatars: ((userId: string) => Promise<void>) | undefined): void;
    grant(grantorId: string, input: AdminGrantInput): Promise<User>;
    /**
     * Пометить аккаунт как приложение Yargram или снять пометку.
     *
     * Смысл пометки узкий и намеренно огороженный: отдельное приложение — это
     * всё-таки аккаунт в базе, и ему нужно право выдать себе значок «Yargram»
     * без вмешательства владельца. Право действует только на свой же аккаунт и
     * только когда владелец заранее отметил его приложением — обычный
     * пользователь этой пометкой не заводится, а галочку себе всё равно
     * выдать не может.
     */
    setApp(grantorId: string, targetUserId: string, isApp: boolean): Promise<User>;
    /**
     * Знак «Yargram» на своём аккаунте. Раньше это умел только владелец через
     * `grant`; приложению нужно то же самое, но самообслуживанием — приложение
     * регистрируется на устройстве у человека, и ждать владельца там некому.
     *
     * Выдать знак себе можно единственным способом — будучи приложением. Всё
     * остальное по-прежнему идёт через админ-панель владельца.
     */
    setOwnBadge(userId: string, badge: "yargram" | null): Promise<User>;
    /**
     * Заморозка: аккаунт остаётся в базе, но войти и писать им нельзя — как
     * временная блокировка владельцем. Разморозка тем же вызовом.
     */
    setFrozen(grantorId: string, targetUserId: string, frozen: boolean): Promise<User>;
    /**
     * Отметка SCAM — только владелец Yargram, как и заморозка. Человек с отметкой
     * остаётся в сети и может писать, но рядом с именем горит «SCAM», а описание
     * подменяется предупреждением о мошенничестве и не меняется, пока отметку не снимут.
     */
    setScam(grantorId: string, targetUserId: string, scam: boolean): Promise<User>;
    /**
     * Отметка FAKE — тоже только владелец. Механика та же, что у SCAM: рядом с
     * именем горит «FAKE», а описание подменяется предупреждением о подделке под
     * официальный аккаунт. Снятие отметки возвращает человеку его описание.
     */
    setFake(grantorId: string, targetUserId: string, fake: boolean): Promise<User>;
    /**
     * Сколько всего аккаунтов и групп в Yargram. Только владелец: это сводка по
     * всей установке, а не по своим собеседникам.
     */
    stats(grantorId: string): Promise<AdminStats>;
    /**
     * Список аккаунтов для админ-панели: владелец раскрывает сводку и видит,
     * кто вообще заведён.
     *
     * Фильтры разделены на три независимых слоя, чтобы ими можно было
     * пользоваться по отдельности и вместе:
     * - `filter` — состояние записи (живой / замороженный / удалённый);
     * - `marks` — знаки владельца, которые обязаны быть у аккаунта (все
     *   включённые сразу: «галочка И значок», а не «или»);
     * - `scope` — где искать введённое: в нике, в юзернеймах или везде.
     *
     * Ограничение выдачи есть намеренно: список обзорный. Точный поиск одного
     * человека живёт в `POST /admin/lookup`.
     */
    listAccounts(grantorId: string, input?: AdminAccountsQuery): Promise<AdminAccountView[]>;
    /**
     * Поиск групп для админ-панели. Владелец Yargram помечает не человека, а
     * саму группу, поэтому группу нужно как-то найти: по названию, по коду из
     * ссылки-приглашения или по id.
     */
    searchGroups(grantorId: string, query: string): Promise<AdminGroupView[]>;
    /**
     * Знаки группы: галочка, значок Yargram и отметка SCAM — как у аккаунтов, но
     * помечается сама группа, а не её создатель. Отметка не удаляет группу и не
     * мешает писать: рядом с названием горит красная рамка, а описание
     * подменяется предупреждением, пока её не снимут.
     */
    setGroupMarks(grantorId: string, groupId: string, input: AdminGroupMarksInput): Promise<AdminGroupView>;
    /**
     * Список служебных ботов: всё, что помечено `isBot`.
     *
     * Отдельно от `listAccounts`, хотя данные те же: там список обзорный и
     * отфильтрованный вручную, а ботов на установке единицы, и владельцу нужен
     * именно их перечень целиком — чтобы видеть, какие служебные аккаунты вообще
     * заведены, а не искать их поиском.
     */
    listBots(grantorId: string): Promise<AdminAccountView[]>;
    /**
     * Метка «BOT»: пометить аккаунт служебным ботом или снять метку.
     *
     * 🔥 Метка не косметическая. Войти в аккаунт с ней нельзя — `AuthService.login`
     * такие записи не пускает, а пароля у бота нет вовсе. Поэтому себе её поставить
     * нельзя: владелец запер бы сам себя без единого способа вернуться через
     * интерфейс (снять метку было бы уже некому). Для остальных аккаунтов метка
     * безопасна — её всегда можно снять отсюда.
     */
    setBot(grantorId: string, targetUserId: string, isBot: boolean): Promise<User>;
    /**
     * Возврат удалённого аккаунта («разбан»): запись никуда не девалась, поэтому
     * достаточно снять флаг — профиль, диалоги и история снова на месте.
     */
    restoreUser(grantorId: string, targetUserId: string): Promise<User>;
    /**
     * Удаление аккаунта: стираем личное — черновики, отложенные, заметки и
     * аватар. Сообщения остаются, как в Telegram: чужую историю мы не портим,
     * а автор подменяется заглушкой «Удалённый аккаунт» на лету (см.
     * `ChatService.toMessageSnapshot`). Вложения из переписки тоже остаются —
     * иначе в сохранённых сообщениях ссылки на файлы стали бы битыми.
     *
     * Саму запись не стираем, а помечаем `isDeleted`: так почта и ник остаются
     * занятыми (на них нельзя зарегистрировать новый аккаунт), а владелец может
     * вернуть аккаунт через `restoreUser`.
     */
    deleteUser(grantorId: string, targetUserId: string): Promise<void>;
    listAdmins(grantorId: string): Promise<User[]>;
    unassignAdmin(grantorId: string, targetUserId: string): Promise<User>;
    assignAdmin(grantorId: string, targetUserId: string): Promise<User>;
}
