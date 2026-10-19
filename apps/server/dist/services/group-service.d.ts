import type { EffectiveGroupPermissions, GroupEvent, GroupPermissions, GroupRole, PublicUser } from "../domain/models.js";
import type { Repositories } from "../repositories/types.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { ChatService, ConversationView } from "./chat-service.js";
/** Бессрочный мьют: в записи группы это null, в запросе — слово «forever». */
export declare const MUTE_FOREVER = "forever";
export type GroupMemberView = {
    user: PublicUser;
    role: GroupRole;
    permissions: EffectiveGroupPermissions;
    /** Подпись рядом с именем; поля нет, если тег не задан. */
    tag?: string | undefined;
    /**
     * Поля нет, когда мьюта нет вовсе; null — бессрочный мьют. Так «нет мьюта» и
     * «заглушён навсегда» не смешиваются в одно значение.
     */
    mutedUntil?: string | null | undefined;
    addedByOwner: boolean;
};
/** История изменений группы — та же запись, что лежит в самой группе. */
export type GroupHistoryView = GroupEvent;
/**
 * Группы: состав, роли и права. Права проверяются здесь же, а не в маршрутах,
 * чтобы запрет действовал и на отправку сообщений, и на вложения, и на звонок.
 */
export declare class GroupService {
    private readonly repositories;
    private readonly events;
    private readonly chat;
    constructor(repositories: Repositories, events: RealtimeEvents, chat: ChatService);
    createGroup(currentUserId: string, input: {
        title: string;
        description?: string | undefined;
        avatarUrl?: string | null | undefined;
        memberIds?: string[] | undefined;
    }): Promise<{
        conversation: ConversationView;
    }>;
    updateInfo(currentUserId: string, groupId: string, input: {
        title?: string | undefined;
        description?: string | undefined;
        avatarUrl?: string | null | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
    }): Promise<{
        conversation: ConversationView;
    }>;
    listMembers(currentUserId: string, groupId: string, query?: string): Promise<{
        members: GroupMemberView[];
    }>;
    addMembers(currentUserId: string, groupId: string, memberIds: string[]): Promise<{
        conversation: ConversationView;
    }>;
    removeMember(currentUserId: string, groupId: string, targetUserId: string): Promise<{
        conversation: ConversationView;
    }>;
    leaveGroup(currentUserId: string, groupId: string): Promise<{
        conversation: ConversationView;
    }>;
    joinByInvite(currentUserId: string, code: string): Promise<{
        conversation: ConversationView;
    }>;
    regenerateInvite(currentUserId: string, groupId: string): Promise<{
        conversation: ConversationView;
    }>;
    revokeInvite(currentUserId: string, groupId: string): Promise<{
        conversation: ConversationView;
    }>;
    deleteGroup(currentUserId: string, groupId: string): Promise<void>;
    setAdmin(currentUserId: string, groupId: string, targetUserId: string, admin: boolean, permissions?: GroupPermissions): Promise<{
        conversation: ConversationView;
    }>;
    /** Общие права группы: что разрешено обычным участникам. */
    setPermissions(currentUserId: string, groupId: string, permissions: GroupPermissions): Promise<{
        conversation: ConversationView;
    }>;
    /** Личные ограничения участника: запреты и мьют до времени (null — бессрочно). */
    restrictMember(currentUserId: string, groupId: string, targetUserId: string, input: {
        permissions?: GroupPermissions | undefined;
        mutedUntil?: string | null | undefined;
    }): Promise<{
        conversation: ConversationView;
    }>;
    /**
     * Тег участника: короткая подпись рядом с именем. Свой тег ставит сам
     * участник, чужие — тот, у кого есть право manage_tags.
     */
    setMemberTag(currentUserId: string, groupId: string, targetUserId: string, tag: string): Promise<{
        conversation: ConversationView;
    }>;
    history(currentUserId: string, groupId: string): Promise<{
        events: GroupHistoryView[];
    }>;
    private getGroup;
    private assertCan;
    private assertAliveUsers;
    private applyRemoval;
    /** Служебное сообщение в историю группы: видно всем участникам. */
    private announce;
    /** Рассылает обновлённую группу всем её участникам. */
    private broadcast;
    private event;
    private nameOf;
    private namesOf;
}
