import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import { type PublicUser, type User } from "../domain/models.js";
/**
 * Кто этот человек по отношению ко мне. Клиенту это нужно, чтобы нарисовать
 * правильную кнопку в профиле: «Добавить в друзья», «Заявка отправлена»,
 * «Принять заявку» или «Вы друзья».
 */
export type FriendshipState = "none" | "outgoing" | "incoming" | "friends";
/** Профиль в списке друзей вместе со статусом связи. */
export type FriendView = {
    user: PublicUser;
};
export type FriendRequestView = {
    user: PublicUser;
};
export type FriendsOverview = {
    friends: FriendView[];
    incoming: FriendRequestView[];
    outgoing: FriendRequestView[];
};
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
export declare class FriendService {
    private readonly users;
    private readonly events;
    constructor(repositories: Repositories, events: RealtimeEvents);
    /** Состояние связи «я -> этот человек»: им управляет кнопка в профиле. */
    friendshipState(me: User, userId: string, peer: User): FriendshipState;
    /**
     * Список друзей, входящих и исходящих заявок — всё, что нужно экрану
     * «Друзья». Удалённые и замороженные из выдачи не пропадают: их профиль
     * приходит заглушкой, и клиент сам решает, что показать.
     */
    overview(userId: string): Promise<FriendsOverview>;
    /**
     * Заявка в друзья. Если этот человек уже прислал свою — сразу дружим:
     * заставлять людей подтверждать друг друга дважды незачем.
     */
    request(userId: string, targetId: string): Promise<FriendshipState>;
    /** Принятие заявки: обе стороны попадают в друзья, заявка закрывается. */
    accept(userId: string, targetId: string): Promise<FriendshipState>;
    /** Отклонение входящей заявки: запись снимается у обоих, дружбы не будет. */
    decline(userId: string, targetId: string): Promise<FriendshipState>;
    /** Удаление из друзей. Заодно снимаем неотвеченные заявки в обе стороны. */
    remove(userId: string, targetId: string): Promise<FriendshipState>;
    /**
     * Заблокированный дружбы не предлагает: заявка не уйдёт ни в одну сторону.
     * Так блокировка остаётся тем, чем и была — полной остановкой общения.
     */
    private assertInteractable;
    /**
     * Профили для выдачи: наружу отдаём публичный вид, а не сырую запись —
     * иначе в ответ уехали бы и почта, и хеш пароля.
     */
    private publicList;
    private getUser;
    /**
     * Профили по списку id. Порядок сохраняем такой, как он лежит в профиле:
     * люди рассчитывают, что список не перетасовывается сам по себе.
     */
    private loadMany;
    private publish;
}
