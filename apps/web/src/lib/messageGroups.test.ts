import { describe, expect, it } from 'vitest';
import { buildMessageGroups, groupAt, groupSpacing, isServiceMessage } from './messageGroups';
import type { Message, MessageKind } from '../types';

const NOW = new Date('2026-09-21T12:00:00');

function message(id: string, senderId: string, createdAt: string, kind?: MessageKind): Message {
  return { id, conversationId: 'conversation-1', text: id, createdAt, senderId, kind: kind ?? 'user' };
}

/** Только то, что важно для разметки: граница дня, продолжение серии и её конец. */
function shape(messages: Message[], now = NOW) {
  return buildMessageGroups(messages, now).map((group) => ({
    day: group.day,
    showDay: group.showDay,
    service: group.service,
    continues: group.continuesGroup,
    ends: group.endsGroup,
  }));
}

describe('isServiceMessage', () => {
  it('marks system and call messages', () => {
    expect(isServiceMessage(message('1', 'alice', '2026-09-21T10:00:00', 'system'))).toBe(true);
    expect(isServiceMessage(message('2', 'alice', '2026-09-21T10:00:00', 'call'))).toBe(true);
    expect(isServiceMessage(message('3', 'alice', '2026-09-21T10:00:00'))).toBe(false);
    expect(isServiceMessage(null)).toBe(false);
  });
});

describe('buildMessageGroups', () => {
  it('returns nothing for an empty list', () => {
    expect(buildMessageGroups([], NOW)).toEqual([]);
  });

  it('opens the day and the group for a single message', () => {
    expect(shape([message('1', 'alice', '2026-09-21T10:00:00')])).toEqual([
      { day: 'Сегодня', showDay: true, service: false, continues: false, ends: true },
    ]);
  });

  it('keeps a run of one author together and ends it on the last message', () => {
    const groups = shape([
      message('1', 'alice', '2026-09-21T10:00:00'),
      message('2', 'alice', '2026-09-21T10:01:00'),
      message('3', 'alice', '2026-09-21T10:02:00'),
    ]);
    expect(groups.map((group) => group.continues)).toEqual([false, true, true]);
    // Аватар «уходит вниз»: он только у последнего сообщения серии.
    expect(groups.map((group) => group.ends)).toEqual([false, false, true]);
    expect(groups.map((group) => group.showDay)).toEqual([true, false, false]);
  });

  it('starts a new group when the author changes', () => {
    const groups = shape([
      message('1', 'alice', '2026-09-21T10:00:00'),
      message('2', 'alice', '2026-09-21T10:01:00'),
      message('3', 'bob', '2026-09-21T10:02:00'),
    ]);
    expect(groups[1]?.ends).toBe(true);
    expect(groups[2]?.continues).toBe(false);
    expect(groups[2]?.ends).toBe(true);
  });

  it('breaks the run around a service message', () => {
    const groups = shape([
      message('1', 'alice', '2026-09-21T10:00:00'),
      message('2', 'alice', '2026-09-21T10:01:00', 'system'),
      message('3', 'alice', '2026-09-21T10:02:00'),
    ]);
    expect(groups[0]?.ends).toBe(true);
    expect(groups[1]).toMatchObject({ service: true, continues: false, ends: false });
    expect(groups[2]?.continues).toBe(false);
    expect(groups[2]?.ends).toBe(true);
  });

  it('opens a new day separator when the date changes', () => {
    const groups = shape([
      message('1', 'alice', '2026-09-20T23:59:00'),
      message('2', 'alice', '2026-09-21T00:01:00'),
    ]);
    expect(groups.map((group) => group.day)).toEqual(['Вчера', 'Сегодня']);
    expect(groups.map((group) => group.showDay)).toEqual([true, true]);
    // Даже тот же автор: новая дата начинает новую серию.
    expect(groups[0]?.ends).toBe(true);
    expect(groups[1]?.continues).toBe(false);
  });

  it('uses one "now" for the whole list', () => {
    const groups = buildMessageGroups(
      [message('1', 'alice', '2026-09-15T10:00:00'), message('2', 'bob', '2026-09-21T10:00:00')],
      NOW,
    );
    expect(groups[0]?.day).not.toBe('Сегодня');
    expect(groups[1]?.day).toBe('Сегодня');
  });
});

describe('groupSpacing', () => {
  const groups = buildMessageGroups(
    [message('1', 'alice', '2026-09-21T10:00:00'), message('2', 'alice', '2026-09-21T10:01:00'), message('3', 'bob', '2026-09-21T10:02:00')],
    NOW,
  );

  it('adds no margin before the first message', () => {
    expect(groupSpacing(0, groupAt(groups, 0))).toBe('');
  });

  it('glues bubbles inside one run and separates different authors', () => {
    expect(groupSpacing(1, groupAt(groups, 1))).toBe('mt-0.5');
    expect(groupSpacing(2, groupAt(groups, 2))).toBe('mt-3');
  });
});

describe('groupAt', () => {
  it('falls back to safe values for a missing position', () => {
    const groups = buildMessageGroups([message('1', 'alice', '2026-09-21T10:00:00')], NOW);
    expect(groupAt(groups, 5)).toEqual({
      day: '',
      showDay: false,
      service: false,
      continuesGroup: false,
      endsGroup: false,
    });
  });
});
