import { describe, expect, it } from 'vitest';
import { conversationTitle, getConversationPeer, sortMessages, updateConversationPresence } from './conversation';
import { formatLastSeen, isUserOnline } from '../features/messenger/messengerUtils';
import type { Conversation, Message } from '../types';

const conversation: Conversation = {
  id: 'conversation-1',
  members: [
    { id: 'alice', displayName: 'Алиса' },
    { id: 'bob', displayName: 'Борис' },
  ],
};

describe('conversation helpers', () => {
  it('selects the other direct-chat member', () => {
    expect(getConversationPeer(conversation, 'alice')?.displayName).toBe('Борис');
    expect(conversationTitle(conversation, 'alice')).toBe('Борис');
  });

  it('keeps badge and verification flags on the peer', () => {
    const flagged: Conversation = {
      id: 'conversation-2',
      members: [
        { id: 'alice', displayName: 'Алиса' },
        { id: 'bob', displayName: 'Борис', isVerified: true, badge: 'yargram' },
      ],
    };
    expect(getConversationPeer(flagged, 'alice')).toMatchObject({
      isVerified: true,
      badge: 'yargram',
    });
  });

  describe('presence', () => {
    const live: Conversation = {
      id: 'conversation-3',
      members: [
        { id: 'alice', displayName: 'Алиса' },
        { id: 'bob', displayName: 'Борис', isOnline: true, online: true },
      ],
    };

    it('shows the peer as online while the payload says so', () => {
      const online = updateConversationPresence(live, { userId: 'bob', online: true, isOnline: true });
      expect(isUserOnline(getConversationPeer(online, 'alice'))).toBe(true);
    });

    it('switches the peer to «был(а) …» without re-entering the chat', () => {
      const offline = updateConversationPresence(live, {
        userId: 'bob',
        online: false,
        isOnline: false,
        lastSeenAt: '2026-09-21T18:00:00',
      });
      const peer = getConversationPeer(offline, 'alice');
      expect(isUserOnline(peer)).toBe(false);
      expect(formatLastSeen(peer, new Date('2026-09-21T19:00:00'))).toBe('Был(а) сегодня в 18:00');
    });

    it('leaves other conversations members untouched', () => {
      const offline = updateConversationPresence(live, { userId: 'carol', online: false });
      expect(isUserOnline(getConversationPeer(offline, 'alice'))).toBe(true);
    });
  });

  it('sorts messages chronologically', () => {
    const messages: Message[] = [
      { id: '2', conversationId: 'c', text: 'Позже', createdAt: '2026-07-27T12:01:00.000Z' },
      { id: '1', conversationId: 'c', text: 'Раньше', createdAt: '2026-07-27T12:00:00.000Z' },
    ];
    expect(sortMessages(messages).map((message) => message.id)).toEqual(['1', '2']);
  });
});
