import { AppError } from "../lib/errors.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories, UpdateConversationInput, UserRepository } from "../repositories/types.js";
import {
  deletedPlaceholderFor,
  publicAccountStateFor,
  toPublicUser,
  type Conversation,
  type User,
} from "../domain/models.js";

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

/** Сколько групп отдаём на один поисковый запрос. */
const GROUPS_SEARCH_LIMIT = 20;

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
export type AdminAccountsMark = "verified" | "badge" | "scam" | "fake" | "owner";

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

/** Сколько аккаунтов отдаём разом: список — обзорный, а не выгрузка базы. */
const ACCOUNTS_LIMIT = 200;

/** Состояние записи: живой, замороженный или удалённый. */
function matchesState(user: User, filter: AdminAccountsFilter): boolean {
  // Замороженный и удалённый — разные состояния: удалённый уже не войдёт,
  // замороженный войти может, но писать не может. Поэтому и фильтры разные.
  if (filter === "deleted") return user.isDeleted === true;
  if (filter === "frozen") return user.isFrozen === true && user.isDeleted !== true;
  if (filter === "active") return user.isDeleted !== true && user.isFrozen !== true;
  return true;
}

/**
 * Знаки. Включённые галочки складываются: выбрали «галочка» и «SCAM» — значит
 * у аккаунта должны быть оба, а не любой из них. Иначе фильтр был бы бесполезен:
 * SCAM-аккаунтов мало, и «или» вернуло бы почти весь список через галочки.
 */
function matchesMarks(user: User, marks: AdminAccountsMark[]): boolean {
  return marks.every((mark) => {
    if (mark === "verified") return user.isVerified === true;
    if (mark === "badge") return user.badge === "yargram";
    if (mark === "scam") return user.scam === true;
    if (mark === "fake") return user.fake === true;
    return user.isOwner === true;
  });
}

/**
 * Поиск. Область выбирается владельцем, а не угадывается: по нику, по
 * @юзернеймам или по обоим вместе с почтой.
 */
function matchesQuery(user: User, wanted: string, scope: AdminAccountsScope): boolean {
  if (!wanted) return true;
  const handles = [user.username ?? "", ...(user.usernames ?? [])];
  const byHandle = handles.some((handle) => handle.toLowerCase().includes(wanted));
  const byName = user.displayName.toLowerCase().includes(wanted);
  if (scope === "name") return byName;
  if (scope === "handle") return byHandle;
  // Почту оставляем только во «всё сразу»: искать по ней адрес владелец может,
  // а отдельной областью это было бы уже слишком узко.
  return byName || byHandle || user.email.toLowerCase().includes(wanted);
}

/**
 * Аккаунт в списке владельца. Аватар подписываем заново — `toPublicUser`
 * обновляет временную ссылку, иначе в списке был бы старый адрес с истёкшим
 * сроком. Отдельный `toPublicUser` тут, впрочем, не нужен: лишние поля
 * (био, баннер, блокировки) в списке ни к чему.
 */
function toAdminAccountView(user: User): AdminAccountView {
  const publicUser = toPublicUser(user);
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username ?? null,
    usernames: user.usernames ?? [],
    avatarUrl: publicUser.avatarUrl ?? null,
    isVerified: user.isVerified ?? false,
    badge: user.badge ?? null,
    scam: user.scam ?? false,
    fake: user.fake ?? false,
    isOwner: user.isOwner ?? false,
    isFrozen: user.isFrozen ?? false,
    isDeleted: user.isDeleted ?? false,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt ?? null,
    lastSeenAt: user.lastSeenAt,
  };
}

function groupView(conversation: Conversation): AdminGroupView {  return {
    id: conversation.id,
    title: conversation.title ?? "",
    memberCount: conversation.memberIds.length,
    isVerified: conversation.isVerified ?? false,
    badge: conversation.badge ?? null,
    scam: conversation.scam ?? false,
    fake: conversation.fake ?? false,
    inviteCode: conversation.inviteCode ?? null,
  };
}

/**
 * Ники храним в том регистре, в котором их написал человек: «Kotik» и «kotik»
 * — один и тот же адрес, но на экране он должен выглядеть так, как его набрали.
 * Поэтому здесь только чистим пробелы и @ и выбрасываем дубли, а все
 * сравнения и поиск идут через lower() — в репозиториях и на клиенте.
 */
function normalizeHandles(values: string[]): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];
  for (const value of values) {
    const handle = value.trim().replace(/^@/, "");
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    handles.push(handle);
  }
  return handles;
}

export class AdminService {
  private readonly repositories: Repositories;
  private readonly users: UserRepository;
  private readonly events: RealtimeEvents;
  /**
   * Стирание аватара с диска живёт в UploadService, а он создаётся позже —
   * поэтому подключаем его отдельно. Файлы из переписки не трогаем: история
   * остаётся у собеседников, значит вложения должны открываться и дальше.
   */
  private removeUserAvatars: ((userId: string) => Promise<void>) | undefined;

  constructor(repositories: Repositories, events: RealtimeEvents) {
    this.repositories = repositories;
    this.users = repositories.users;
    this.events = events;
  }

  setAvatarCleanup(removeUserAvatars: ((userId: string) => Promise<void>) | undefined): void {
    this.removeUserAvatars = removeUserAvatars;
  }

  async grant(grantorId: string, input: AdminGrantInput): Promise<User> {
    const targetId = input.targetUserId || (await (async () => {
      if (!input.targetUsername) return null;
      const u = await this.users.findByUsername(input.targetUsername.trim().replace(/^@/, ''));
      return u?.id ?? null;
    })());
    if (!targetId) {
      throw new AppError(404, "USER_NOT_FOUND", input.targetUsername ? `Username @${input.targetUsername} not found` : "Target user not specified");
    }
    // Себя администрировать можно (овнеру нужно назначать юзернеймы и себе),
    // но только не права: права администратора себе не выдаём никогда.
    if (targetId === grantorId && (input.isOwner !== undefined || input.adminUserIds !== undefined)) {
      throw new AppError(400, "SELF_ADMIN", "You cannot change your own administrator rights");
    }
    const target = await this.users.findById(targetId);
    if (!target) {
      throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    }
    const grantor = await this.users.findById(grantorId);
    if (!grantor || (!grantor.adminUserIds?.includes(grantorId) && !grantor.isOwner)) {
      throw new AppError(403, "NOT_ADMIN", "You are not an administrator");
    }
    if (!grantor.isOwner && !grantor.adminUserIds?.includes(target.id)) {
      throw new AppError(403, "NOT_ADMIN", "You can only administer users assigned to you");
    }
    // Галочку и значок себе может выдать только овнер: обычный админ не должен
    // через эту дырку подтверждать сам себя.
    if (
      targetId === grantorId &&
      !grantor.isOwner &&
      (input.badge !== undefined || input.isVerified !== undefined)
    ) {
      throw new AppError(400, "SELF_ADMIN", "Only the owner can badge their own account");
    }

    // Основной ник внутри списка дополнительных — не ошибка, а дубль: этот
    // адрес уже принадлежит тому же аккаунту. Молча выкидываем, иначе один
    // дубль отменял бы весь список, и новые ники не сохранялись бы вовсе.
    const primaryKey = target.username?.toLowerCase();
    const normalizedUsernames = normalizeHandles(input.usernames ?? []).filter(
      (name) => name.toLowerCase() !== primaryKey,
    );
    for (const name of normalizedUsernames) {
      const existing = await this.users.findByUsername(name);
      if (existing && existing.id !== target.id) {
        throw new AppError(409, "USERNAME_TAKEN", `Username @${name} is already in use`);
      }
    }

    const update: Partial<User> = {
      ...(input.isVerified === undefined ? {} : { isVerified: input.isVerified }),
      ...(input.isOwner === undefined ? {} : { isOwner: input.isOwner }),
      // Пустой массив — это запрос на очистку: «ничего не передали» и «передали
      // пустой список» должны означать разное.
      ...(input.usernames === undefined ? {} : { usernames: normalizedUsernames }),
      ...(input.adminUserIds === undefined ? {} : { adminUserIds: input.adminUserIds }),
    };
    if (input.badge !== undefined) {
      update.badge = input.badge;
    }

    const updated = await this.users.update(target.id, update);
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    return updated;
  }

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
  async setApp(grantorId: string, targetUserId: string, isApp: boolean): Promise<User> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can mark an account as an app");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    const updated = await this.users.update(targetUserId, { isApp });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    // Снятие пометки заодно снимает и значок: иначе он остался бы висеть на
    // аккаунте, который приложением уже не считается.
    if (!isApp && target.badge === "yargram") {
      const cleared = await this.users.update(targetUserId, { badge: null });
      return cleared ?? updated;
    }
    return updated;
  }

  /**
   * Знак «Yargram» на своём аккаунте. Раньше это умел только владелец через
   * `grant`; приложению нужно то же самое, но самообслуживанием — приложение
   * регистрируется на устройстве у человека, и ждать владельца там некому.
   *
   * Выдать знак себе можно единственным способом — будучи приложением. Всё
   * остальное по-прежнему идёт через админ-панель владельца.
   */
  async setOwnBadge(userId: string, badge: "yargram" | null): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    if (!user.isApp) {
      throw new AppError(403, "NOT_APP", "Only Yargram applications can set their own badge");
    }
    const updated = await this.users.update(userId, { badge });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "User no longer exists");
    return updated;
  }

  /**
   * Заморозка: аккаунт остаётся в базе, но войти и писать им нельзя — как
   * временная блокировка владельцем. Разморозка тем же вызовом.
   */
  async setFrozen(grantorId: string, targetUserId: string, frozen: boolean): Promise<User> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can freeze accounts");
    }
    if (targetUserId === grantorId) {
      throw new AppError(400, "SELF_ACTION", "You cannot freeze your own account");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    if (target.isOwner) {
      throw new AppError(400, "OWNER_PROTECTED", "Another owner's account cannot be frozen");
    }
    const updated = await this.users.update(targetUserId, { isFrozen: frozen });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    // Собеседники должны увидеть «Удалённый аккаунт» сразу, без перезагрузки:
    // заморозку показываем заглушкой, а разморозку — настоящим профилем.
    this.events.publishAccountState({
      userId: targetUserId,
      frozen,
      removed: false,
      user: publicAccountStateFor(updated),
    });
    return updated;
  }

  /**
   * Отметка SCAM — только владелец Yargram, как и заморозка. Человек с отметкой
   * остаётся в сети и может писать, но рядом с именем горит «SCAM», а описание
   * подменяется предупреждением о мошенничестве и не меняется, пока отметку не снимут.
   */
  async setScam(grantorId: string, targetUserId: string, scam: boolean): Promise<User> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can mark accounts as SCAM");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    const updated = await this.users.update(targetUserId, { scam });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    return updated;
  }

  /**
   * Отметка FAKE — тоже только владелец. Механика та же, что у SCAM: рядом с
   * именем горит «FAKE», а описание подменяется предупреждением о подделке под
   * официальный аккаунт. Снятие отметки возвращает человеку его описание.
   */
  async setFake(grantorId: string, targetUserId: string, fake: boolean): Promise<User> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can mark accounts as FAKE");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    const updated = await this.users.update(targetUserId, { fake });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    return updated;
  }

  /**
   * Сколько всего аккаунтов и групп в Yargram. Только владелец: это сводка по
   * всей установке, а не по своим собеседникам.
   */
  async stats(grantorId: string): Promise<AdminStats> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can see the installation stats");
    }
    // Считаем параллельно: два независимых запроса, ждать их по очереди незачем.
    const [totalUsers, groups] = await Promise.all([
      this.users.count(),
      this.repositories.conversations.countGroups(),
    ]);
    return { totalUsers, groups };
  }

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
  async listAccounts(grantorId: string, input: AdminAccountsQuery = {}): Promise<AdminAccountView[]> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can list accounts");
    }
    const filter = input.filter ?? "all";
    const scope = input.scope ?? "any";
    const marks = input.marks ?? [];
    const wanted = input.query?.trim().replace(/^@/, "").toLowerCase() ?? "";
    const users = await this.users.listAll();
    return users
      .filter((user) => matchesState(user, filter))
      .filter((user) => matchesMarks(user, marks))
      .filter((user) => matchesQuery(user, wanted, scope))
      .slice(0, ACCOUNTS_LIMIT)
      .map(toAdminAccountView);
  }

  /**
   * Поиск групп для админ-панели. Владелец Yargram помечает не человека, а
   * саму группу, поэтому группу нужно как-то найти: по названию, по коду из
   * ссылки-приглашения или по id.
   */
  async searchGroups(grantorId: string, query: string): Promise<AdminGroupView[]> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can administer groups");
    }
    const groups = await this.repositories.conversations.searchGroups(query, GROUPS_SEARCH_LIMIT);
    return groups.map(groupView);
  }

  /**
   * Знаки группы: галочка, значок Yargram и отметка SCAM — как у аккаунтов, но
   * помечается сама группа, а не её создатель. Отметка не удаляет группу и не
   * мешает писать: рядом с названием горит красная рамка, а описание
   * подменяется предупреждением, пока её не снимут.
   */
  async setGroupMarks(
    grantorId: string,
    groupId: string,
    input: AdminGroupMarksInput,
  ): Promise<AdminGroupView> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can administer groups");
    }
    const group = await this.repositories.conversations.findById(groupId);
    if (!group || group.type !== "group") {
      throw new AppError(404, "GROUP_NOT_FOUND", "Group does not exist");
    }
    const patch: UpdateConversationInput = {
      ...(input.isVerified === undefined ? {} : { isVerified: input.isVerified }),
      ...(input.badge === undefined ? {} : { badge: input.badge }),
      ...(input.scam === undefined ? {} : { scam: input.scam }),
      ...(input.fake === undefined ? {} : { fake: input.fake }),
    };
    const updated = await this.repositories.conversations.update(group.id, patch);
    return groupView(updated);
  }

  /**
   * Возврат удалённого аккаунта («разбан»): запись никуда не девалась, поэтому
   * достаточно снять флаг — профиль, диалоги и история снова на месте.
   */
  async restoreUser(grantorId: string, targetUserId: string): Promise<User> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can restore accounts");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    if (!target.isDeleted) {
      throw new AppError(400, "NOT_DELETED", "This account is not deleted");
    }
    const updated = await this.users.update(targetUserId, { isDeleted: false, deletedAt: undefined });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    this.events.publishAccountState({
      userId: targetUserId,
      frozen: false,
      removed: false,
      user: publicAccountStateFor(updated),
    });
    return updated;
  }

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
  async deleteUser(grantorId: string, targetUserId: string): Promise<void> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor?.isOwner) {
      throw new AppError(403, "NOT_OWNER", "Only the owner can delete accounts");
    }
    if (targetUserId === grantorId) {
      throw new AppError(400, "SELF_ACTION", "You cannot delete your own account");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    if (target.isOwner) {
      throw new AppError(400, "OWNER_PROTECTED", "Another owner's account cannot be deleted");
    }

    for (const draft of await this.repositories.drafts.listForUser(targetUserId)) {
      await this.repositories.drafts.delete(targetUserId, draft.conversationId);
    }
    for (const scheduled of await this.repositories.scheduledMessages.listForUser(targetUserId)) {
      await this.repositories.scheduledMessages.cancel(scheduled.id, targetUserId);
    }
    for (const note of await this.repositories.favoriteNotes.list(targetUserId)) {
      await this.repositories.favoriteNotes.delete(note.id, targetUserId);
    }
    // Сеансы: входов в удалённый аккаунт быть не должно, иначе по списку
    // активных сеансов в него всё ещё «можно попасть».
    await this.repositories.sessions.deleteForUser(targetUserId);
    // Аватар с диска и запись о нём. Файлы из переписки остаются.
    await this.removeUserAvatars?.(targetUserId);

    // Вычёркиваем удалённого из чужих списков: блокировок, администрирования и
    // дружбы. Списки дружбы взаимные, поэтому запись может остаться на любой
    // стороне — чистить надо все три, иначе у собеседника навсегда повиснет
    // «друг», которого уже нет, а сервер при попытке открыть его профиль
    // отдаст заглушку «Удалённый аккаунт».
    for (const user of await this.repositories.users.list({ limit: 10_000 })) {
      const cleanup: Partial<User> = {};
      if (user.blockedUserIds.includes(targetUserId)) {
        cleanup.blockedUserIds = user.blockedUserIds.filter((id) => id !== targetUserId);
      }
      if ((user.adminUserIds ?? []).includes(targetUserId)) {
        cleanup.adminUserIds = (user.adminUserIds ?? []).filter((id) => id !== targetUserId);
      }
      if ((user.friendIds ?? []).includes(targetUserId)) {
        cleanup.friendIds = (user.friendIds ?? []).filter((id) => id !== targetUserId);
      }
      if ((user.outgoingFriendRequestIds ?? []).includes(targetUserId)) {
        cleanup.outgoingFriendRequestIds = (user.outgoingFriendRequestIds ?? []).filter(
          (id) => id !== targetUserId,
        );
      }
      if ((user.incomingFriendRequestIds ?? []).includes(targetUserId)) {
        cleanup.incomingFriendRequestIds = (user.incomingFriendRequestIds ?? []).filter(
          (id) => id !== targetUserId,
        );
      }
      if (Object.keys(cleanup).length === 0) continue;
      await this.users.update(user.id, cleanup);
    }

    const deleted = await this.users.update(targetUserId, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
    });
    if (!deleted) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    // Рассылаем последним: клиенты подменяют профиль заглушкой прямо в открытом чате.
    this.events.publishAccountState({
      userId: targetUserId,
      frozen: false,
      removed: true,
      user: deletedPlaceholderFor(targetUserId),
    });
  }

  async listAdmins(grantorId: string): Promise<User[]> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor || (!grantor.adminUserIds?.includes(grantorId) && !grantor.isOwner)) {
      throw new AppError(403, "NOT_ADMIN", "You are not an administrator");
    }
    const ids = grantor.adminUserIds ?? [];
    const users: User[] = [];
    for (const id of ids) {
      const user = await this.users.findById(id);
      if (user) users.push(user);
    }
    return users;
  }

  async unassignAdmin(grantorId: string, targetUserId: string): Promise<User> {
    const grantor = await this.users.findById(grantorId);
    if (!grantor || (!grantor.adminUserIds?.includes(grantorId) && !grantor.isOwner)) {
      throw new AppError(403, "NOT_ADMIN", "You are not an administrator");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    if (!grantor.isOwner && !grantor.adminUserIds?.includes(targetUserId)) {
      throw new AppError(403, "NOT_ADMIN", "You can only administer users assigned to you");
    }
    const updated = await this.users.update(targetUserId, {
      adminUserIds: (target.adminUserIds ?? []).filter((id) => id !== grantorId),
    });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    return updated;
  }

  async assignAdmin(grantorId: string, targetUserId: string): Promise<User> {
    if (targetUserId === grantorId) {
      throw new AppError(400, "SELF_ADMIN", "You are already an administrator");
    }
    const grantor = await this.users.findById(grantorId);
    if (!grantor || (!grantor.adminUserIds?.includes(grantorId) && !grantor.isOwner)) {
      throw new AppError(403, "NOT_ADMIN", "You are not an administrator");
    }
    const target = await this.users.findById(targetUserId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Target user does not exist");
    if (!grantor.isOwner && grantor.adminUserIds?.includes(targetUserId)) {
      throw new AppError(409, "ALREADY_ADMIN", "This user is already administered by you");
    }
    const updated = await this.users.update(targetUserId, {
      adminUserIds: [...(target.adminUserIds ?? []), grantorId],
    });
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
    return updated;
  }
}