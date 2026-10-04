import { describe, expect, it } from 'vitest';
import {
  applyAccountState,
  conversationPeerDeleted,
  conversationPeerFrozen,
  conversationTitle,
  getConversationPeer,
  sortMessages,
  unreadBadgeText,
  updateConversationPresence,
} from './conversation';
import { formatLastSeen, isUserOnline } from '../features/messenger/messengerUtils';
import type { AccountStatePayload, Conversation, Message } from '../types';

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

  it('keeps badge, verification and SCAM flags on the peer', () => {
    const flagged: Conversation = {
      id: 'conversation-2',
      members: [
        { id: 'alice', displayName: 'Алиса' },
        { id: 'bob', displayName: 'Борис', isVerified: true, badge: 'yargram', scam: true },
      ],
    };
    expect(getConversationPeer(flagged, 'alice')).toMatchObject({
      isVerified: true,
      badge: 'yargram',
      scam: true,
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
      expect(formatLastSeen(peer, undefined, new Date('2026-09-21T19:00:00'))).toBe('Был(а) в 18:00');
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

  describe('account:state', () => {
    const chat: Conversation = {
      id: 'conversation-9',
      members: [
        { id: 'alice', displayName: 'Алиса' },
        { id: 'bob', displayName: 'Борис', username: 'boris', avatarUrl: '/boris.png' },
      ],
      lastMessage: {
        id: 'm1',
        conversationId: 'conversation-9',
        text: 'привет',
        createdAt: '2026-07-27T12:00:00.000Z',
        senderId: 'bob',
        sender: { id: 'bob', displayName: 'Борис', username: 'boris' },
      },
    };
    const history: Message[] = [
      { id: 'm1', conversationId: 'conversation-9', text: 'привет', createdAt: '2026-07-27T12:00:00.000Z', senderId: 'bob', sender: { id: 'bob', displayName: 'Борис' } },
      { id: 'm2', conversationId: 'conversation-9', text: 'здравствуй', createdAt: '2026-07-27T12:01:00.000Z', senderId: 'alice', sender: { id: 'alice', displayName: 'Алиса' } },
    ];

    const frozen: AccountStatePayload = {
      userId: 'bob',
      frozen: true,
      removed: false,
      user: { id: 'bob', displayName: 'Удалённый аккаунт', isFrozen: true, avatarUrl: null, username: null },
    };
    const removed: AccountStatePayload = {
      userId: 'bob',
      frozen: false,
      removed: true,
      user: { id: 'bob', displayName: 'Удалённый аккаунт', isFrozen: false, isDeleted: true, avatarUrl: null, username: null },
    };

    it('заморозку показывает заглушкой сразу, без перезагрузки', () => {
      const result = applyAccountState([chat], history, frozen);
      const peer = getConversationPeer(result.conversations[0], 'alice');
      expect(peer).toMatchObject({ displayName: 'Удалённый аккаунт', isFrozen: true, avatarUrl: null });
      expect(conversationTitle(result.conversations[0], 'alice')).toBe('Удалённый аккаунт');
      expect(result.conversations[0].lastMessage?.sender).toMatchObject({ displayName: 'Удалённый аккаунт' });
      expect(result.messages.map((message) => message.id)).toEqual(['m1', 'm2']);
      expect(result.messages[0].sender?.displayName).toBe('Удалённый аккаунт');
    });

    it('удалённый аккаунт оставляет историю, подписывая её заглушкой', () => {
      const result = applyAccountState([chat], history, removed);
      // История не стирается — как в Telegram: меняется только автор.
      expect(result.messages.map((message) => message.id)).toEqual(['m1', 'm2']);
      expect(result.messages[0].sender).toMatchObject({
        id: 'bob',
        displayName: 'Удалённый аккаунт',
        isFrozen: false,
      });
      expect(result.messages[1].sender?.displayName).toBe('Алиса');
      expect(getConversationPeer(result.conversations[0], 'alice')).toMatchObject({
        displayName: 'Удалённый аккаунт',
        isFrozen: false,
        isDeleted: true,
      });
    });

    it('после удаления и после заморозки поле ввода закрывается', () => {
      // Удалённый собеседник не принимает сообщения: история остаётся, ввода нет.
      expect(conversationPeerDeleted(applyAccountState([chat], history, removed).conversations[0], 'alice')).toBe(true);
      // Заморозка закрывает отправку, но не путается с удалением: сервер отвечает
      // ACCOUNT_FROZEN, а не ACCOUNT_DELETED, поэтому флаги разные.
      const frozenConversation = applyAccountState([chat], history, frozen).conversations[0];
      expect(conversationPeerDeleted(frozenConversation, 'alice')).toBe(false);
      expect(conversationPeerFrozen(frozenConversation, 'alice')).toBe(true);
      expect(conversationPeerFrozen(chat, 'alice')).toBe(false);
      expect(conversationPeerDeleted(chat, 'alice')).toBe(false);
      // Избранное — диалог с собой: ввод всегда доступен.
      expect(conversationPeerDeleted({ id: 'saved', type: 'saved' }, 'alice')).toBe(false);
      expect(conversationPeerFrozen({ id: 'saved', type: 'saved' }, 'alice')).toBe(false);
    });

    it('разморозка возвращает настоящий профиль', () => {
      const unfrozen: AccountStatePayload = {
        userId: 'bob',
        frozen: false,
        removed: false,
        user: { id: 'bob', displayName: 'Борис', username: 'boris', avatarUrl: '/boris.png' },
      };
      const frozenState = applyAccountState([chat], history, frozen);
      const result = applyAccountState(frozenState.conversations, frozenState.messages, unfrozen);
      expect(getConversationPeer(result.conversations[0], 'alice')).toMatchObject({
        displayName: 'Борис',
        username: 'boris',
      });
      expect(result.messages[0].sender?.displayName).toBe('Борис');
    });

    it('чужие беседы не трогает', () => {
      const other: Conversation = { id: 'other', members: [{ id: 'carol', displayName: 'Кира' }] };
      const result = applyAccountState([other], history, frozen);
      expect(result.conversations[0].members).toEqual(other.members);
      expect(getConversationPeer(result.conversations[0], 'alice')?.displayName).toBe('Кира');
    });
  });
});

describe('unreadBadgeText', () => {
  it('показывает число и упирается в «999+»', () => {
    expect(unreadBadgeText(3)).toBe('3');
    expect(unreadBadgeText(999)).toBe('999');
    expect(unreadBadgeText(1001)).toBe('999+');
    expect(unreadBadgeText(5000)).toBe('999+');
  });

  it('молчит, когда читать нечего', () => {
    expect(unreadBadgeText(0)).toBeNull();
    expect(unreadBadgeText(undefined)).toBeNull();
    expect(unreadBadgeText(-4)).toBeNull();
  });
});
