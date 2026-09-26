import { AppError } from "../lib/errors.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories, UpdateConversationInput, UserRepository } from "../repositories/types.js";
import {
  deletedPlaceholderFor,
  publicAccountStateFor,
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
};

/** Группа в списке админ-панели: название, размер и текущие знаки. */
export type AdminGroupView = {
  id: string;
  title: string;
  memberCount: number;
  isVerified: boolean;
  badge: "yargram" | null;
  scam: boolean;
  /** Код из ссылки-приглашения: по нему группу тоже можно найти. */
  inviteCode: string | null;
};

/** Сколько групп отдаём на один поисковый запрос. */
const GROUPS_SEARCH_LIMIT = 20;

function groupView(conversation: Conversation): AdminGroupView {
  return {
    id: conversation.id,
    title: conversation.title ?? "",
    memberCount: conversation.memberIds.length,
    isVerified: conversation.isVerified ?? false,
    badge: conversation.badge ?? null,
    scam: conversation.scam ?? false,
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
    if (input.isOwner === true) {
      update.badge = "yargram";
    } else if (input.badge !== undefined) {
      update.badge = input.badge;
    }

    const updated = await this.users.update(target.id, update);
    if (!updated) throw new AppError(404, "USER_NOT_FOUND", "Target user no longer exists");
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
    // Аватар с диска и запись о нём. Файлы из переписки остаются.
    await this.removeUserAvatars?.(targetUserId);

    // Вычёркиваем удалённого из чужих списков блокировок и администрирования.
    for (const user of await this.repositories.users.list({ limit: 10_000 })) {
      const cleanup: Partial<User> = {};
      if (user.blockedUserIds.includes(targetUserId)) {
        cleanup.blockedUserIds = user.blockedUserIds.filter((id) => id !== targetUserId);
      }
      if ((user.adminUserIds ?? []).includes(targetUserId)) {
        cleanup.adminUserIds = (user.adminUserIds ?? []).filter((id) => id !== targetUserId);
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