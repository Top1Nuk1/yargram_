import type { AccountStatePayload, Conversation, Message, Participant, User } from '../types';
import { mergeUserProfile, updateUserPresence, type PresencePayload } from './presence';
import type { TranslateFn } from './i18n';

function updateParticipantProfile(participant: Participant, user: User): Participant {
  const participantId = participant.user?.id ?? participant.userId ?? participant.id;
  if (participantId !== user.id) return participant;
  return participant.user
    ? { ...participant, user: mergeUserProfile(participant.user, user) }
    : mergeUserProfile(participant, user);
}

/** Подменяет автора сообщения (и автора в replyTo) свежим профилем. */
export function updateMessageProfile(
  message: Message | null | undefined,
  user: User,
): Message | null | undefined {
  if (!message) return message;
  const replyTo = message.replyTo
    ? (updateMessageProfile({ ...message.replyTo, replyTo: null }, user) as Message)
    : message.replyTo;
  return {
    ...message,
    sender: message.sender?.id === user.id ? mergeUserProfile(message.sender, user) : message.sender,
    author: message.author?.id === user.id ? mergeUserProfile(message.author, user) : message.author,
    replyTo,
  };
}

/** Подменяет профиль участника во всех списках беседы и в её последних сообщениях. */
export function updateConversationProfile(conversation: Conversation, user: User): Conversation {
  return {
    ...conversation,
    participants: conversation.participants?.map((participant) => updateParticipantProfile(participant, user)),
    members: conversation.members?.map((participant) => updateParticipantProfile(participant, user)),
    users: conversation.users?.map((member) => (member.id === user.id ? mergeUserProfile(member, user) : member)),
    otherUser:
      conversation.otherUser?.id === user.id
        ? mergeUserProfile(conversation.otherUser, user)
        : conversation.otherUser,
    lastMessage: updateMessageProfile(conversation.lastMessage, user) ?? null,
    pinnedMessage: updateMessageProfile(conversation.pinnedMessage, user) ?? null,
    pinnedMessages: conversation.pinnedMessages?.map(
      (message) => updateMessageProfile(message, user) as Message,
    ),
  };
}

export type AccountStateResult = {
  conversations: Conversation[];
  messages: Message[];
};

/**
 * Применяет событие «аккаунт заморозили / разморозили / удалили» к уже
 * загруженным данным, чтобы «Удалённый аккаунт» появлялся без перезагрузки.
 * История при удалении не стирается — как в Telegram: сообщения остаются,
 * меняется только подпись автора.
 */
export function applyAccountState(
  conversations: Conversation[],
  messages: Message[],
  payload: AccountStatePayload,
): AccountStateResult {
  const user: User = { ...payload.user, id: payload.userId };
  return {
    conversations: conversations.map((conversation) => updateConversationProfile(conversation, user)),
    messages: messages.map((message) => updateMessageProfile(message, user) as Message),
  };
}

function participantUser(participant: Participant): User | null {
  if (participant.user) return participant.user;
  if (!participant.userId && !participant.id) return null;
  return {
    id: participant.userId ?? participant.id ?? '',
    displayName: participant.displayName ?? participant.username ?? 'Пользователь',
    username: participant.username,
    bio: participant.bio,
    avatar: participant.avatar,
    avatarUrl: participant.avatarUrl,
    isOnline: participant.isOnline,
    online: participant.online,
    lastSeenAt: participant.lastSeenAt,
    lastSeenStatus: participant.lastSeenStatus,
    showLastSeen: participant.showLastSeen,
    createdAt: participant.createdAt,
    blockedByMe: participant.blockedByMe,
    // Значки едут вместе с участником: сервер отдаёт их в members, и без этого
    // переноса значок Yargram и галочка пропадали бы в переписке.
    isVerified: participant.isVerified,
    badge: participant.badge,
    // Отметка SCAM едет тем же путём: иначе в переписке у помеченного
    // аккаунта пропадала бы рамка рядом с именем.
    scam: participant.scam,
    // FAKE — вторая такая же отметка, переносим её по той же причине.
    fake: participant.fake,
    // Заморозку тоже нужно перенести: иначе у замороженного собеседника
    // пропадала снежинка, хотя сервер её присылает.
    isFrozen: participant.isFrozen,
    // Флаг удалённого нужен владельцу, чтобы показать «Вернуть аккаунт»: без него профиль удалённого в листе выглядел бы как живой.
    isDeleted: participant.isDeleted,
    // 🔥 Метка BOT едет тем же путём, что и остальные значки. Без этой строки
    // у бота в шапке чата не было ни метки BOT, ни подписи «бот»: сервер
    // присылает `isBot` в `members`, а до собеседника он не доходил — и вместо
    // «бот» висело «Был(а) недавно».
    isBot: participant.isBot,
  };
}

export function getConversationPeer(conversation: Conversation, currentUserId: string): User | null {
  if (conversation.type === 'saved') return null;
  if (conversation.otherUser && conversation.otherUser.id !== currentUserId) return conversation.otherUser;
  if (conversation.users?.length) {
    return conversation.users.find((user) => user.id !== currentUserId) ?? conversation.users[0] ?? null;
  }
  const people = [...(conversation.participants ?? []), ...(conversation.members ?? [])]
    .map(participantUser)
    .filter((user): user is User => Boolean(user));
  return people.find((user) => user.id !== currentUserId) ?? people[0] ?? null;
}

/**
 * Собеседник удалил аккаунт: история переписки остаётся, но поле ввода
 * закрывается — как в Telegram.
 */
export function conversationPeerDeleted(
  conversation: Conversation | null | undefined,
  currentUserId: string,
): boolean {
  if (!conversation || conversation.type === 'saved') return false;
  return Boolean(getConversationPeer(conversation, currentUserId)?.isDeleted);
}

/**
 * Собеседника заморозили: ему тоже нельзя писать, пока он не разморожен.
 * История при этом читается в обе стороны — закрываем только ввод.
 */
export function conversationPeerFrozen(
  conversation: Conversation | null | undefined,
  currentUserId: string,
): boolean {
  if (!conversation || conversation.type === 'saved') return false;
  return Boolean(getConversationPeer(conversation, currentUserId)?.isFrozen);
}

/**
 * Текст круглого счётчика непрочитанных. После тысячи пишем «999+», иначе круг
 * расползается; ноль и пустое значок не показывают вовсе.
 */
export function unreadBadgeText(count?: number): string | null {
  const value = Math.max(0, Math.floor(count ?? 0));
  if (value === 0) return null;
  return value > 1000 ? '999+' : String(value);
}

export function conversationTitle(
  conversation: Conversation,
  currentUserId: string,
  t?: TranslateFn,
): string {
  if (conversation.type === 'saved') return t ? t('sidebar.favorites') : 'Избранное';
  return (
    conversation.title ??
    conversation.name ??
    getConversationPeer(conversation, currentUserId)?.displayName ??
    (t ? t('msgr.newDialog') : 'Новый диалог')
  );
}

export function conversationAvatar(conversation: Conversation, currentUserId: string): string | null {
  // У группы нет «собеседника»: без своего фото показываем инициалы названия,
  // а не аватар случайного участника.
  if (conversation.type === 'group') return conversation.avatarUrl ?? null;
  return conversation.avatarUrl ?? getConversationPeer(conversation, currentUserId)?.avatarUrl ?? null;
}

export function conversationTimestamp(conversation: Conversation): string | null {
  return (
    conversation.lastMessage?.createdAt ??
    conversation.lastMessageAt ??
    conversation.updatedAt ??
    null
  );
}

export function messageSenderId(message: Message): string | undefined {
  return message.senderId ?? message.userId ?? message.sender?.id ?? message.author?.id;
}

export function sortConversations(items: Conversation[]): Conversation[] {
  return [...items].sort((a, b) => {
    const aTime = new Date(conversationTimestamp(a) ?? 0).getTime();
    const bTime = new Date(conversationTimestamp(b) ?? 0).getTime();
    return bTime - aTime;
  });
}

export function sortMessages(items: Message[]): Message[] {
  return [...items].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return delta || a.id.localeCompare(b.id);
  });
}

/**
 * Применяет presence-событие ко всем пользователям беседы: participants, members,
 * users и otherUser. Без этого «в сети» в шапке чата обновлялось бы только после
 * перезахода в диалог.
 */
export function updateConversationPresence(
  conversation: Conversation,
  payload: PresencePayload,
): Conversation {
  const updateParticipant = (participant: Participant): Participant => {
    const id = participant.user?.id ?? participant.userId ?? participant.id;
    if (id !== payload.userId) return participant;
    return participant.user
      ? { ...participant, user: updateUserPresence(participant.user, payload) }
      : {
          ...participant,
          ...updateUserPresence(
            { ...participant, id, displayName: participant.displayName ?? '' },
            payload,
          ),
        };
  };
  return {
    ...conversation,
    participants: conversation.participants?.map(updateParticipant),
    members: conversation.members?.map(updateParticipant),
    users: conversation.users?.map((user) => updateUserPresence(user, payload)),
    otherUser: conversation.otherUser ? updateUserPresence(conversation.otherUser, payload) : undefined,
  };
}
