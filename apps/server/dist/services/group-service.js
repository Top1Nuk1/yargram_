import { randomBytes } from "node:crypto";
import { effectiveGroupPermissions, groupCan, groupRoleFor, toPublicUserFor, } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
const TITLE_MAX = 128;
const DESCRIPTION_MAX = 2_000;
/** Тег участника — короткая подпись рядом с именем. */
const TAG_MAX = 24;
/** Бессрочный мьют: в записи группы это null, в запросе — слово «forever». */
export const MUTE_FOREVER = "forever";
/** Ссылка-приглашение: короткий код в URL вида /join/<код>. */
function newInviteCode() {
    return randomBytes(9).toString("base64url");
}
/**
 * Группы: состав, роли и права. Права проверяются здесь же, а не в маршрутах,
 * чтобы запрет действовал и на отправку сообщений, и на вложения, и на звонок.
 */
export class GroupService {
    repositories;
    events;
    chat;
    constructor(repositories, events, chat) {
        this.repositories = repositories;
        this.events = events;
        this.chat = chat;
    }
    async createGroup(currentUserId, input) {
        const title = (input.title ?? "").trim();
        if (!title)
            throw new AppError(400, "TITLE_REQUIRED", "У группы должно быть название");
        if (title.length > TITLE_MAX) {
            throw new AppError(400, "TITLE_TOO_LONG", `Название длиннее ${TITLE_MAX} символов`);
        }
        const description = (input.description ?? "").trim().slice(0, DESCRIPTION_MAX);
        const invited = [...new Set((input.memberIds ?? []).filter((id) => id !== currentUserId))];
        await this.assertAliveUsers(invited);
        const conversation = await this.repositories.conversations.createGroup({
            ownerId: currentUserId,
            title,
            description,
            avatarUrl: input.avatarUrl ?? null,
            memberIds: invited,
            inviteCode: newInviteCode(),
        });
        await this.broadcast(conversation);
        return { conversation: await this.chat.viewConversation(currentUserId, conversation.id) };
    }
    async updateInfo(currentUserId, groupId, input) {
        const group = await this.getGroup(groupId, currentUserId);
        this.assertCan(currentUserId, group, "change_info");
        const patch = {};
        const history = [...(group.history ?? [])];
        const timestamp = new Date().toISOString();
        if (input.title !== undefined) {
            const title = input.title.trim();
            if (!title)
                throw new AppError(400, "TITLE_REQUIRED", "У группы должно быть название");
            if (title.length > TITLE_MAX) {
                throw new AppError(400, "TITLE_TOO_LONG", `Название длиннее ${TITLE_MAX} символов`);
            }
            if (title !== group.title) {
                patch.title = title;
                history.push(this.event(currentUserId, timestamp, "renamed", undefined, title));
            }
        }
        // Помеченной SCAM группе описание не меняем: подмена живёт на чтении, и
        // записанный текст всё равно никто не увидит. Поле не отклоняем, а тихо
        // игнорируем — карточка группы отправляет его вместе с названием и аватаром,
        // и отказ закрыл бы и переименование, и смену аватара.
        if (input.description !== undefined && !(input.scam ?? group.scam)) {
            patch.description = input.description.trim().slice(0, DESCRIPTION_MAX);
            if (patch.description !== group.description) {
                history.push(this.event(currentUserId, timestamp, "description_changed"));
            }
        }
        if (input.avatarUrl !== undefined) {
            patch.avatarUrl = input.avatarUrl;
            history.push(this.event(currentUserId, timestamp, "avatar_changed"));
        }
        const hasMarksInput = input.isVerified !== undefined ||
            input.badge !== undefined ||
            input.scam !== undefined ||
            input.fake !== undefined;
        if (hasMarksInput) {
            const user = await this.repositories.users.findById(currentUserId);
            const isInstanceOwner = Boolean(user?.isOwner);
            if (group.ownerId !== currentUserId && !isInstanceOwner) {
                throw new AppError(403, "OWNER_ONLY", "Только создатель/владелец группы может менять знаки и отметки группы");
            }
            if (input.isVerified !== undefined) {
                patch.isVerified = input.isVerified;
                history.push(this.event(currentUserId, timestamp, "verified_changed", undefined, String(input.isVerified)));
            }
            if (input.badge !== undefined) {
                patch.badge = input.badge;
                history.push(this.event(currentUserId, timestamp, "badge_changed", undefined, input.badge ?? "none"));
            }
            if (input.scam !== undefined) {
                patch.scam = input.scam;
                history.push(this.event(currentUserId, timestamp, "scam_changed", undefined, String(input.scam)));
            }
            if (input.fake !== undefined) {
                patch.fake = input.fake;
                history.push(this.event(currentUserId, timestamp, "fake_changed", undefined, String(input.fake)));
            }
        }
        patch.history = history;
        const updated = await this.repositories.conversations.update(group.id, patch);
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async listMembers(currentUserId, groupId, query) {
        const group = await this.getGroup(groupId, currentUserId);
        const users = await this.repositories.users.findManyByIds(group.memberIds);
        const byId = new Map(users.map((user) => [user.id, user]));
        const needle = (query ?? "").trim().toLowerCase();
        const members = group.memberIds
            .map((id) => byId.get(id))
            .filter((user) => Boolean(user))
            .filter((user) => {
            if (!needle)
                return true;
            return (user.displayName.toLowerCase().includes(needle) ||
                (user.username ?? "").toLowerCase().includes(needle));
        })
            .map((user) => {
            const mutedUntil = group.mutedMembers?.[user.id];
            const tag = group.memberTags?.[user.id];
            return {
                user: toPublicUserFor(user, currentUserId),
                role: groupRoleFor(group, user.id) ?? "member",
                permissions: effectiveGroupPermissions(group, user.id),
                // Мьют без срока приходит как null, отсутствие записи — как пропуск поля.
                ...(mutedUntil === undefined ? {} : { mutedUntil }),
                ...(tag ? { tag } : {}),
                addedByOwner: group.ownerId === user.id,
            };
        })
            // Владелец всегда первый, затем администраторы, остальные по имени.
            .sort((a, b) => rank(a.role) - rank(b.role) || a.user.displayName.localeCompare(b.user.displayName, "ru"));
        return { members };
    }
    async addMembers(currentUserId, groupId, memberIds) {
        const group = await this.getGroup(groupId, currentUserId);
        this.assertCan(currentUserId, group, "add_members");
        const candidates = [...new Set(memberIds.filter((id) => id !== currentUserId))];
        if (candidates.length === 0) {
            throw new AppError(400, "MEMBERS_REQUIRED", "Кого добавляем в группу?");
        }
        await this.assertAliveUsers(candidates);
        const fresh = candidates.filter((id) => !group.memberIds.includes(id));
        if (fresh.length === 0) {
            return { conversation: await this.chat.viewConversation(currentUserId, group.id) };
        }
        const timestamp = new Date().toISOString();
        const history = [...(group.history ?? [])];
        for (const id of fresh) {
            history.push(this.event(currentUserId, timestamp, "member_added", id));
        }
        const updated = await this.repositories.conversations.update(group.id, {
            memberIds: [...group.memberIds, ...fresh],
            // Если человек раньше выходил, возвращаем его в список.
            leftIds: (group.leftIds ?? []).filter((id) => !fresh.includes(id)),
            history,
        });
        await this.broadcast(updated);
        await this.announce(updated, currentUserId, `${await this.nameOf(currentUserId)} добавил(а) ${await this.namesOf(fresh)}`, "user_joined");
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async removeMember(currentUserId, groupId, targetUserId) {
        const group = await this.getGroup(groupId, currentUserId);
        this.assertCan(currentUserId, group, "remove_members");
        if (targetUserId === group.ownerId) {
            throw new AppError(400, "OWNER_PROTECTED", "Владельца группы удалить нельзя");
        }
        // Администратор не выгоняет другого администратора — только владелец.
        if (group.ownerId !== currentUserId &&
            (group.adminIds ?? []).includes(targetUserId)) {
            throw new AppError(403, "NO_RIGHTS", "Только владелец может снять администратора");
        }
        if (!group.memberIds.includes(targetUserId)) {
            throw new AppError(404, "MEMBER_NOT_FOUND", "Этого человека нет в группе");
        }
        const updated = await this.applyRemoval(group, targetUserId, currentUserId, "member_removed");
        await this.announce(updated, currentUserId, `${await this.nameOf(currentUserId)} удалил(а) ${await this.nameOf(targetUserId)}`, "user_left");
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async leaveGroup(currentUserId, groupId) {
        const group = await this.getGroup(groupId, currentUserId);
        if (group.ownerId === currentUserId) {
            throw new AppError(400, "OWNER_CANNOT_LEAVE", "Владелец не может выйти: сначала передайте группу");
        }
        // Сообщение пишется до выхода: после удаления из состава автор уже не участник.
        await this.announce(group, currentUserId, `${await this.nameOf(currentUserId)} вышел(а) из группы`, "user_left");
        // Ответ собираем тоже до выхода: после удаления группа для него закрыта.
        const view = await this.chat.viewConversation(currentUserId, group.id);
        await this.applyRemoval(group, currentUserId, currentUserId, "member_left");
        return { conversation: view };
    }
    async joinByInvite(currentUserId, code) {
        const trimmed = (code ?? "").trim();
        if (!trimmed)
            throw new AppError(400, "INVITE_REQUIRED", "Нужен код приглашения");
        const group = await this.repositories.conversations.findByInviteCode(trimmed);
        if (!group || group.type !== "group") {
            throw new AppError(404, "INVITE_NOT_FOUND", "Ссылка-приглашение недействительна");
        }
        const me = await this.repositories.users.findById(currentUserId);
        if (!me || me.isDeleted)
            throw new AppError(403, "ACCOUNT_DELETED", "Аккаунт недоступен");
        const already = group.memberIds.includes(currentUserId);
        const left = (group.leftIds ?? []).includes(currentUserId);
        if (already && !left) {
            return { conversation: await this.chat.viewConversation(currentUserId, group.id) };
        }
        const timestamp = new Date().toISOString();
        const updated = await this.repositories.conversations.update(group.id, {
            memberIds: already ? group.memberIds : [...group.memberIds, currentUserId],
            leftIds: (group.leftIds ?? []).filter((id) => id !== currentUserId),
            history: [...(group.history ?? []), this.event(currentUserId, timestamp, "member_added", currentUserId)],
        });
        await this.broadcast(updated);
        await this.announce(updated, currentUserId, `${await this.nameOf(currentUserId)} вступил(а) в группу по ссылке`, "user_joined");
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async regenerateInvite(currentUserId, groupId) {
        const group = await this.getGroup(groupId, currentUserId);
        const role = groupRoleFor(group, currentUserId);
        if (role !== "owner" && role !== "admin") {
            throw new AppError(403, "NO_RIGHTS", "Только создатель или администратор может управлять ссылкой-приглашением");
        }
        this.assertCan(currentUserId, group, "add_members");
        const updated = await this.repositories.conversations.update(group.id, {
            inviteCode: newInviteCode(),
        });
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async revokeInvite(currentUserId, groupId) {
        const group = await this.getGroup(groupId, currentUserId);
        const role = groupRoleFor(group, currentUserId);
        if (role !== "owner" && role !== "admin") {
            throw new AppError(403, "NO_RIGHTS", "Только создатель или администратор может управлять ссылкой-приглашением");
        }
        this.assertCan(currentUserId, group, "add_members");
        const updated = await this.repositories.conversations.update(group.id, {
            inviteCode: null,
        });
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async deleteGroup(currentUserId, groupId) {
        const group = await this.getGroup(groupId, currentUserId);
        const user = await this.repositories.users.findById(currentUserId);
        const isInstanceOwner = Boolean(user?.isOwner);
        if (group.ownerId !== currentUserId && !isInstanceOwner) {
            throw new AppError(403, "OWNER_ONLY", "Только создатель/владелец группы может её удалить");
        }
        const memberIds = [...group.memberIds];
        await this.repositories.conversations.delete(group.id);
        this.events.publishConversationDeleted({ conversationId: group.id, memberIds });
    }
    async setAdmin(currentUserId, groupId, targetUserId, admin, permissions) {
        const group = await this.getGroup(groupId, currentUserId);
        const isOwner = group.ownerId === currentUserId;
        // Назначать администраторов может владелец и администратор с правом
        // add_admins — но раздать больше, чем есть у себя, нельзя.
        if (!isOwner)
            this.assertCan(currentUserId, group, "add_admins");
        if (targetUserId === group.ownerId) {
            throw new AppError(400, "OWNER_PROTECTED", "Владелец и так управляет группой");
        }
        if (!group.memberIds.includes(targetUserId)) {
            throw new AppError(404, "MEMBER_NOT_FOUND", "Этого человека нет в группе");
        }
        if (!isOwner && permissions) {
            for (const [permission, allowed] of Object.entries(permissions)) {
                if (allowed !== true)
                    continue;
                if (!groupCan(group, currentUserId, permission)) {
                    throw new AppError(403, "NO_RIGHTS", "Нельзя выдать право, которого нет у вас");
                }
            }
        }
        const adminIds = [...new Set(group.adminIds ?? [])];
        const adminPermissions = { ...(group.adminPermissions ?? {}) };
        const timestamp = new Date().toISOString();
        const history = [...(group.history ?? [])];
        if (admin) {
            if (!adminIds.includes(targetUserId))
                adminIds.push(targetUserId);
            if (permissions)
                adminPermissions[targetUserId] = { ...adminPermissions[targetUserId], ...permissions };
            history.push(this.event(currentUserId, timestamp, "admin_added", targetUserId));
        }
        else {
            const next = adminIds.filter((id) => id !== targetUserId);
            adminIds.length = 0;
            adminIds.push(...next);
            delete adminPermissions[targetUserId];
            history.push(this.event(currentUserId, timestamp, "admin_removed", targetUserId));
        }
        const updated = await this.repositories.conversations.update(group.id, {
            adminIds,
            adminPermissions,
            history,
        });
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    /** Общие права группы: что разрешено обычным участникам. */
    async setPermissions(currentUserId, groupId, permissions) {
        const group = await this.getGroup(groupId, currentUserId);
        this.assertCan(currentUserId, group, "change_info");
        const updated = await this.repositories.conversations.update(group.id, {
            permissions: { ...(group.permissions ?? {}), ...permissions },
            history: [
                ...(group.history ?? []),
                this.event(currentUserId, new Date().toISOString(), "permissions_changed", undefined, Object.entries(permissions).map(([key, value]) => `${key}=${value}`).join(",")),
            ],
        });
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    /** Личные ограничения участника: запреты и мьют до времени (null — бессрочно). */
    async restrictMember(currentUserId, groupId, targetUserId, input) {
        const group = await this.getGroup(groupId, currentUserId);
        this.assertCan(currentUserId, group, "restrict_members");
        if (targetUserId === group.ownerId) {
            throw new AppError(400, "OWNER_PROTECTED", "Владельца ограничить нельзя");
        }
        if (group.ownerId !== currentUserId && (group.adminIds ?? []).includes(targetUserId)) {
            throw new AppError(403, "NO_RIGHTS", "Только владелец ограничивает администратора");
        }
        if (!group.memberIds.includes(targetUserId)) {
            throw new AppError(404, "MEMBER_NOT_FOUND", "Этого человека нет в группе");
        }
        const restrictions = { ...(group.restrictions ?? {}) };
        const mutedMembers = { ...(group.mutedMembers ?? {}) };
        const history = [...(group.history ?? [])];
        const timestamp = new Date().toISOString();
        if (input.permissions) {
            restrictions[targetUserId] = { ...restrictions[targetUserId], ...input.permissions };
            history.push(this.event(currentUserId, timestamp, "member_restricted", targetUserId));
        }
        if (input.mutedUntil !== undefined) {
            if (input.mutedUntil === null) {
                // null — снять мьют; «навсегда» приходит словом, иначе эти два случая
                // было бы не различить.
                if (mutedMembers[targetUserId] !== undefined)
                    delete mutedMembers[targetUserId];
                history.push(this.event(currentUserId, timestamp, "member_unmuted", targetUserId));
            }
            else {
                mutedMembers[targetUserId] = input.mutedUntil === MUTE_FOREVER ? null : input.mutedUntil;
                history.push(this.event(currentUserId, timestamp, "member_muted", targetUserId, input.mutedUntil));
            }
        }
        const updated = await this.repositories.conversations.update(group.id, {
            restrictions,
            mutedMembers,
            history,
        });
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    /**
     * Тег участника: короткая подпись рядом с именем. Свой тег ставит сам
     * участник, чужие — тот, у кого есть право manage_tags.
     */
    async setMemberTag(currentUserId, groupId, targetUserId, tag) {
        const group = await this.getGroup(groupId, currentUserId);
        if (!group.memberIds.includes(targetUserId)) {
            throw new AppError(404, "MEMBER_NOT_FOUND", "Этого человека нет в группе");
        }
        // Тег владельца трогает только сам владелец: иначе его подпись подменит админ.
        if (targetUserId !== currentUserId) {
            if (targetUserId === group.ownerId) {
                throw new AppError(403, "OWNER_PROTECTED", "Тег владельца меняет только владелец");
            }
            this.assertCan(currentUserId, group, "manage_tags");
        }
        const cleaned = tag.trim().slice(0, TAG_MAX);
        const memberTags = { ...(group.memberTags ?? {}) };
        if (cleaned) {
            memberTags[targetUserId] = cleaned;
        }
        else {
            delete memberTags[targetUserId];
        }
        const updated = await this.repositories.conversations.update(group.id, {
            memberTags,
            history: [
                ...(group.history ?? []),
                this.event(currentUserId, new Date().toISOString(), "member_tag_changed", targetUserId, cleaned),
            ],
        });
        await this.broadcast(updated);
        return { conversation: await this.chat.viewConversation(currentUserId, updated.id) };
    }
    async history(currentUserId, groupId) {
        const group = await this.getGroup(groupId, currentUserId);
        return { events: [...(group.history ?? [])].reverse() };
    }
    // ---- внутреннее ----
    async getGroup(groupId, currentUserId) {
        const conversation = await this.repositories.conversations.findById(groupId);
        if (!conversation || conversation.type !== "group") {
            throw new AppError(404, "GROUP_NOT_FOUND", "Группа не найдена");
        }
        // Вышедший участник больше не считается членом группы.
        if (!conversation.memberIds.includes(currentUserId) ||
            (conversation.leftIds ?? []).includes(currentUserId)) {
            throw new AppError(403, "GROUP_FORBIDDEN", "Вы не участник этой группы");
        }
        return conversation;
    }
    assertCan(currentUserId, group, permission) {
        if (!groupCan(group, currentUserId, permission)) {
            throw new AppError(403, "NO_RIGHTS", "Недостаточно прав в группе");
        }
    }
    async assertAliveUsers(ids) {
        if (ids.length === 0)
            return;
        const users = await this.repositories.users.findManyByIds(ids);
        const byId = new Map(users.map((user) => [user.id, user]));
        for (const id of ids) {
            const user = byId.get(id);
            if (!user)
                throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден");
            if (user.isDeleted) {
                throw new AppError(400, "ACCOUNT_DELETED", "Удалённый аккаунт нельзя добавить в группу");
            }
        }
    }
    async applyRemoval(group, targetUserId, actorId, kind) {
        const adminIds = (group.adminIds ?? []).filter((id) => id !== targetUserId);
        const adminPermissions = { ...(group.adminPermissions ?? {}) };
        delete adminPermissions[targetUserId];
        const restrictions = { ...(group.restrictions ?? {}) };
        delete restrictions[targetUserId];
        const mutedMembers = { ...(group.mutedMembers ?? {}) };
        delete mutedMembers[targetUserId];
        const memberTags = { ...(group.memberTags ?? {}) };
        delete memberTags[targetUserId];
        const updated = await this.repositories.conversations.update(group.id, {
            memberIds: group.memberIds.filter((id) => id !== targetUserId),
            adminIds,
            adminPermissions,
            restrictions,
            mutedMembers,
            memberTags,
            leftIds: [...new Set([...(group.leftIds ?? []), targetUserId])],
            history: [
                ...(group.history ?? []),
                this.event(actorId, new Date().toISOString(), kind, targetUserId),
            ],
        });
        // Оставшиеся видят новый состав сразу, вышедшего рассылка пропускает.
        await this.broadcast(updated);
        return updated;
    }
    /** Служебное сообщение в историю группы: видно всем участникам. */
    async announce(group, actorId, text, systemEvent) {
        const result = await this.chat.createGroupEventMessage(group.id, actorId, text, systemEvent);
        this.events.publishNewMessage({ message: result.message, memberIds: result.memberIds });
    }
    /** Рассылает обновлённую группу всем её участникам. */
    async broadcast(group) {
        // Вид считается отдельно на каждого: роли и права у участников разные.
        for (const view of await this.chat.viewsForMembers(group.id)) {
            this.events.publishConversationSettings(view);
        }
    }
    event(actorId, at, kind, targetId, detail) {
        return {
            id: randomBytes(8).toString("hex"),
            at,
            actorId,
            kind,
            ...(targetId ? { targetId } : {}),
            ...(detail ? { detail } : {}),
        };
    }
    async nameOf(userId) {
        const user = await this.repositories.users.findById(userId);
        return user?.displayName ?? "Пользователь";
    }
    async namesOf(ids) {
        const users = await this.repositories.users.findManyByIds(ids);
        const names = ids.map((id) => users.find((user) => user.id === id)?.displayName ?? "Пользователь");
        if (names.length <= 1)
            return names[0] ?? "Пользователь";
        if (names.length === 2)
            return `${names[0]} и ${names[1]}`;
        return `${names.slice(0, -1).join(", ")} и ${names.at(-1)}`;
    }
}
function rank(role) {
    return role === "owner" ? 0 : role === "admin" ? 1 : role === "restricted" ? 3 : 2;
}
//# sourceMappingURL=group-service.js.map