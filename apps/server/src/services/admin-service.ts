import { AppError } from "../lib/errors.js";
import type { UserRepository } from "../repositories/types.js";
import type { User } from "../domain/models.js";

export type AdminGrantInput = {
  targetUserId?: string;
  targetUsername?: string;
  isVerified?: boolean | undefined;
  isOwner?: boolean | undefined;
  badge?: "yargram" | null | undefined;
  usernames?: string[] | undefined;
  adminUserIds?: string[] | undefined;
};

export class AdminService {
  constructor(private readonly users: UserRepository) {}

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

    const normalizedUsernames = (input.usernames ?? [])
      .map((name) => name.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean);
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