import { describe, expect, it } from 'vitest';
import { conversationTitle, getConversationPeer, sortMessages } from './conversation';
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

  it('sorts messages chronologically', () => {
    const messages: Message[] = [
      { id: '2', conversationId: 'c', text: 'Позже', createdAt: '2026-07-27T12:01:00.000Z' },
      { id: '1', conversationId: 'c', text: 'Раньше', createdAt: '2026-07-27T12:00:00.000Z' },
    ];
    expect(sortMessages(messages).map((message) => message.id)).toEqual(['1', '2']);
  });
});
