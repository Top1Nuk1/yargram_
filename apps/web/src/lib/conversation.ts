import type { Conversation, Message, Participant, User } from '../types';

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

export function conversationTitle(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === 'saved') return 'Избранное';
  return (
    conversation.title ??
    conversation.name ??
    getConversationPeer(conversation, currentUserId)?.displayName ??
    'Новый диалог'
  );
}

export function conversationAvatar(conversation: Conversation, currentUserId: string): string | null {
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
