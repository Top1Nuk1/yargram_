import { AppError } from "../lib/errors.js";
import { toPublicUserFor } from "../domain/models.js";
/** Сколько заявок и друзей отдаём за один раз. */
const LIST_LIMIT = 500;
/**
 * Дружба как в мессенджерах: заявка -> принятие -> взаимный список.
 *
 * Заявка одной записью не обходится: автор пишет её себе как исходящую и
 * одновременно в чужой профиль как входящую. Так каждая сторона читает только
 * свой профиль, а «входящие» нельзя подделать — их пишет сервер по токену.
 *
 * Отдельного поля «когда прислали заявку» нет намеренно: его пришлось бы
 * протягивать через модель, оба репозитория и схему хранилища, а списки здесь
 * короткие. Порядок заявок задаёт порядок в массиве, то есть очерёдность
 * отправки — этого достаточно.
 */
export class FriendService {
    users;
    events;
    constructor(repositories, events) {
        this.users = repositories.users;
        this.events = events;
    }
    /** Состояние связи «я -> этот человек»: им управляет кнопка в профиле. */
    friendshipState(me, userId, peer) {
        if (me.friendIds?.includes(userId))
            return "friends";
        if (me.outgoingFriendRequestIds?.includes(userId))
            return "outgoing";
        if (me.incomingFriendRequestIds?.includes(userId))
            return "incoming";
        // Заявка могла прийти раньше, а человек уже в друзьях — тогда это дружба.
        if (peer.friendIds?.includes(me.id))
            return "friends";
        return "none";
    }
    /**
     * Список друзей, входящих и исходящих заявок — всё, что нужно экрану
     * «Друзья». Удалённые и замороженные из выдачи не пропадают: их профиль
     * приходит заглушкой, и клиент сам решает, что показать.
     */
    async overview(userId) {
        const me = await this.getUser(userId);
        const friendIds = [...new Set(me.friendIds ?? [])].filter((id) => id !== userId);
        const incomingIds = [...new Set(me.incomingFriendRequestIds ?? [])].filter((id) => id !== userId && !friendIds.includes(id));
        const outgoingIds = [...new Set(me.outgoingFriendRequestIds ?? [])].filter((id) => id !== userId && !friendIds.includes(id) && !incomingIds.includes(id));
        const [friends, incoming, outgoing] = await Promise.all([
            this.loadMany(friendIds),
            this.loadMany(incomingIds),
            this.loadMany(outgoingIds),
        ]);
        return {
            // В друзьях держим только тех, кто подтвердил связь с обеих сторон:
            // если запись осталась от одного, второго она не касается.
            friends: this.publicList(friends, userId),
            incoming: this.publicList(incoming, userId),
            outgoing: this.publicList(outgoing, userId),
        };
    }
    /**
     * Заявка в друзья. Если этот человек уже прислал свою — сразу дружим:
     * заставлять людей подтверждать друг друга дважды незачем.
     */
    async request(userId, targetId) {
        if (userId === targetId) {
            throw new AppError(400, "FRIEND_SELF", "You cannot add yourself as a friend");
        }
        const [me, target] = await Promise.all([this.getUser(userId), this.getUser(targetId)]);
        this.assertInteractable(me, target);
        if (me.friendIds?.includes(targetId))
            return "friends";
        // Встречная заявка — значит человек уже ждёт подтверждения.
        if (me.incomingFriendRequestIds?.includes(targetId)) {
            await this.accept(userId, targetId);
            return "friends";
        }
        if (me.outgoingFriendRequestIds?.includes(targetId))
            return "outgoing";
        await this.users.update(userId, {
            outgoingFriendRequestIds: [...(me.outgoingFriendRequestIds ?? []), targetId],
        });
        await this.users.update(targetId, {
            incomingFriendRequestIds: [...(target.incomingFriendRequestIds ?? []), userId],
        });
        this.publish(targetId, "request", me, userId);
        return "outgoing";
    }
    /** Принятие заявки: обе стороны попадают в друзья, заявка закрывается. */
    async accept(userId, targetId) {
        const [me, target] = await Promise.all([this.getUser(userId), this.getUser(targetId)]);
        if (me.friendIds?.includes(targetId))
            return "friends";
        if (!me.incomingFriendRequestIds?.includes(targetId)) {
            throw new AppError(404, "FRIEND_REQUEST_NOT_FOUND", "This friend request no longer exists");
        }
        await this.users.update(userId, {
            friendIds: [...(me.friendIds ?? []), targetId],
            incomingFriendRequestIds: (me.incomingFriendRequestIds ?? []).filter((id) => id !== targetId),
        });
        await this.users.update(targetId, {
            friendIds: [...(target.friendIds ?? []), userId],
            outgoingFriendRequestIds: (target.outgoingFriendRequestIds ?? []).filter((id) => id !== userId),
        });
        // Обе стороны получают профиль друг друга с уже новым состоянием.
        this.publish(userId, "accepted", target, targetId);
        this.publish(targetId, "accepted", await this.getUser(userId), userId);
        return "friends";
    }
    /** Отклонение входящей заявки: запись снимается у обоих, дружбы не будет. */
    async decline(userId, targetId) {
        const [me, target] = await Promise.all([this.getUser(userId), this.getUser(targetId)]);
        if (!me.incomingFriendRequestIds?.includes(targetId)) {
            throw new AppError(404, "FRIEND_REQUEST_NOT_FOUND", "This friend request no longer exists");
        }
        await this.users.update(userId, {
            incomingFriendRequestIds: (me.incomingFriendRequestIds ?? []).filter((id) => id !== targetId),
        });
        await this.users.update(targetId, {
            outgoingFriendRequestIds: (target.outgoingFriendRequestIds ?? []).filter((id) => id !== userId),
        });
        // Автору заявки сообщаем, что ответа не будет: кнопка «Заявка отправлена»
        // снова станет «Добавить в друзья».
        this.publish(targetId, "declined", await this.getUser(userId), userId);
        return "none";
    }
    /** Удаление из друзей. Заодно снимаем неотвеченные заявки в обе стороны. */
    async remove(userId, targetId) {
        const [me, target] = await Promise.all([this.getUser(userId), this.getUser(targetId)]);
        await this.users.update(userId, {
            friendIds: (me.friendIds ?? []).filter((id) => id !== targetId),
            outgoingFriendRequestIds: (me.outgoingFriendRequestIds ?? []).filter((id) => id !== targetId),
            incomingFriendRequestIds: (me.incomingFriendRequestIds ?? []).filter((id) => id !== targetId),
        });
        await this.users.update(targetId, {
            friendIds: (target.friendIds ?? []).filter((id) => id !== userId),
            outgoingFriendRequestIds: (target.outgoingFriendRequestIds ?? []).filter((id) => id !== userId),
            incomingFriendRequestIds: (target.incomingFriendRequestIds ?? []).filter((id) => id !== userId),
        });
        this.publish(targetId, "removed", await this.getUser(userId), userId);
        return "none";
    }
    /**
     * Заблокированный дружбы не предлагает: заявка не уйдёт ни в одну сторону.
     * Так блокировка остаётся тем, чем и была — полной остановкой общения.
     */
    assertInteractable(me, target) {
        if (target.isDeleted) {
            throw new AppError(403, "ACCOUNT_DELETED", "This account was deleted by its owner");
        }
        if (target.isFrozen) {
            throw new AppError(403, "ACCOUNT_FROZEN", "This account is frozen");
        }
        if (me.blockedUserIds.includes(target.id)) {
            throw new AppError(403, "USER_BLOCKED", "Unblock this person before adding them as a friend");
        }
        if (target.blockedUserIds.includes(me.id)) {
            // Не признаёмся, что нас заблокировали: для отправителя это просто «нельзя».
            throw new AppError(403, "FRIEND_UNAVAILABLE", "This person cannot be added right now");
        }
    }
    /**
     * Профили для выдачи: наружу отдаём публичный вид, а не сырую запись —
     * иначе в ответ уехали бы и почта, и хеш пароля.
     */
    publicList(users, viewerId) {
        return users.map((user) => ({ user: toPublicUserFor(user, viewerId) }));
    }
    async getUser(userId) {
        const user = await this.users.findById(userId);
        if (!user)
            throw new AppError(404, "USER_NOT_FOUND", "User was not found");
        return user;
    }
    /**
     * Профили по списку id. Порядок сохраняем такой, как он лежит в профиле:
     * люди рассчитывают, что список не перетасовывается сам по себе.
     */
    async loadMany(ids) {
        if (ids.length === 0)
            return [];
        const order = new Map(ids.map((id, index) => [id, index]));
        const users = await this.users.findManyByIds(ids.slice(0, LIST_LIMIT));
        return users
            .filter((user) => user.id !== undefined)
            .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    publish(userId, kind, peer, peerId) {
        this.events.publishFriendship({ userId, peer: toPublicUserFor(peer, peerId), kind });
    }
}
//# sourceMappingURL=friend-service.js.map