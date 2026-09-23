import { describe, expect, it } from 'vitest';
import {
  allGroupPermissions,
  containsLink,
  groupEventText,
  groupInviteLink,
  groupMemberCountLabel,
  groupMemberMuted,
  groupRoleLabel,
  groupTitle,
  isGroup,
  mutedUntilLabel,
  viewerCan,
  viewerIsOwner,
  viewerManagesGroup,
  viewerPermissions,
} from './group';
import type { Conversation, GroupEvent, GroupPermissions } from '../types';

function conversation(patch: Partial<Conversation> = {}): Conversation {
  return { id: 'group-1', type: 'group', title: 'Поход', ...patch };
}

describe('isGroup', () => {
  it('отличает группу от личного диалога и «Избранного»', () => {
    expect(isGroup(conversation())).toBe(true);
    expect(isGroup({ id: 'd', type: 'direct' })).toBe(false);
    expect(isGroup({ id: 's', type: 'saved' })).toBe(false);
    expect(isGroup(null)).toBe(false);
    expect(isGroup(undefined)).toBe(false);
  });
});

describe('groupTitle', () => {
  it('подставляет запасное название для пустой строки', () => {
    expect(groupTitle(conversation({ title: '  Поход  ' }))).toBe('Поход');
    expect(groupTitle(conversation({ title: '   ' }))).toBe('Группа');
    expect(groupTitle(conversation({ title: null }))).toBe('Группа');
  });
});

describe('groupMemberCountLabel', () => {
  it('склоняет слово «участник» по правилам русского языка', () => {
    expect(groupMemberCountLabel(1)).toBe('1 участник');
    expect(groupMemberCountLabel(2)).toBe('2 участника');
    expect(groupMemberCountLabel(4)).toBe('4 участника');
    expect(groupMemberCountLabel(5)).toBe('5 участников');
    expect(groupMemberCountLabel(11)).toBe('11 участников');
    expect(groupMemberCountLabel(21)).toBe('21 участник');
    expect(groupMemberCountLabel(22)).toBe('22 участника');
    expect(groupMemberCountLabel(112)).toBe('112 участников');
    expect(groupMemberCountLabel(undefined)).toBe('0 участников');
  });
});

describe('viewerCan', () => {
  it('в личном диалоге ничего не запрещает', () => {
    expect(viewerCan({ id: 'd', type: 'direct' }, 'send_messages')).toBe(true);
  });

  it('читает готовые права смотрящего', () => {
    const group = conversation({
      myPermissions: { ...allGroupPermissions(true), send_links: false },
    } as Partial<Conversation>);
    expect(viewerCan(group, 'send_links')).toBe(false);
    expect(viewerCan(group, 'send_messages')).toBe(true);
  });

  it('без поля прав считает, что можно всё', () => {
    expect(viewerPermissions(conversation()).send_messages).toBe(true);
  });
});

describe('роль смотрящего', () => {
  it('управлять группой могут владелец и администратор', () => {
    expect(viewerManagesGroup(conversation({ role: 'owner' }))).toBe(true);
    expect(viewerManagesGroup(conversation({ role: 'admin' }))).toBe(true);
    expect(viewerManagesGroup(conversation({ role: 'member' }))).toBe(false);
    expect(viewerManagesGroup(conversation({ role: 'restricted' }))).toBe(false);
    expect(viewerManagesGroup({ id: 'd', type: 'direct' })).toBe(false);
  });

  it('владельца отличает от администратора', () => {
    expect(viewerIsOwner(conversation({ role: 'owner' }))).toBe(true);
    expect(viewerIsOwner(conversation({ role: 'admin' }))).toBe(false);
  });

  it('подписывает роли по-русски', () => {
    expect(groupRoleLabel('owner')).toBe('Владелец');
    expect(groupRoleLabel('admin')).toBe('Администратор');
    expect(groupRoleLabel('member')).toBe('Участник');
    expect(groupRoleLabel('restricted')).toBe('Ограниченный');
    expect(groupRoleLabel(null)).toBe('Участник');
  });
});

describe('groupMemberMuted', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');

  it('различает отсутствие мьюта, бессрочный, будущий и прошедший', () => {
    // Поля нет — мьюта нет: сервер не присылает его незаглушённым участникам.
    expect(groupMemberMuted({}, now)).toBe(false);
    expect(groupMemberMuted({ mutedUntil: undefined }, now)).toBe(false);
    expect(groupMemberMuted({ mutedUntil: null }, now)).toBe(true);
    expect(groupMemberMuted({ mutedUntil: '2026-09-23T13:00:00.000Z' }, now)).toBe(true);
    expect(groupMemberMuted({ mutedUntil: '2026-09-23T11:00:00.000Z' }, now)).toBe(false);
    expect(groupMemberMuted({ mutedUntil: '' }, now)).toBe(false);
  });

  it('объясняет мьют словами', () => {
    expect(mutedUntilLabel(null)).toBe('Без ограничения по времени');
    expect(mutedUntilLabel('')).toBe('Без ограничения по времени');
    expect(mutedUntilLabel('не дата')).toBe('Без ограничения по времени');
    expect(mutedUntilLabel('2026-09-23T13:30:00.000Z')).toMatch(/^До \d+ [а-яё]+, \d{2}:\d{2}$/);
  });
});

describe('groupInviteLink', () => {
  it('собирает адрес с кодом приглашения', () => {
    expect(groupInviteLink('abc123', 'https://yargram.test')).toBe('https://yargram.test/join/abc123');
    expect(groupInviteLink('abc123', 'https://yargram.test/')).toBe('https://yargram.test/join/abc123');
  });

  it('без кода ссылки нет', () => {
    expect(groupInviteLink('')).toBe('');
    expect(groupInviteLink(null)).toBe('');
    expect(groupInviteLink(undefined)).toBe('');
    expect(groupInviteLink('   ')).toBe('');
  });
});

describe('groupEventText', () => {
  const names: Record<string, string> = { a1: 'Алиса', b2: 'Боб' };
  const nameOf = (id: string) => names[id] ?? 'Кто-то';
  const event = (kind: GroupEvent['kind'], patch: Partial<GroupEvent> = {}): GroupEvent => ({
    id: 'e1',
    at: '2026-09-23T10:00:00.000Z',
    actorId: 'a1',
    kind,
    ...patch,
  });

  it('описывает создание, переименование и оформление', () => {
    expect(groupEventText(event('created', { detail: 'Поход' }), nameOf)).toBe(
      'Алиса создал(а) группу «Поход»',
    );
    expect(groupEventText(event('renamed', { detail: 'Горы' }), nameOf)).toBe(
      'Алиса изменил(а) название на «Горы»',
    );
    expect(groupEventText(event('description_changed'), nameOf)).toBe(
      'Алиса изменил(а) описание группы',
    );
    expect(groupEventText(event('avatar_changed'), nameOf)).toBe('Алиса обновил(а) фото группы');
  });

  it('называет того, кого добавили, удалили или ограничили', () => {
    expect(groupEventText(event('member_added', { targetId: 'b2' }), nameOf)).toBe(
      'Алиса добавил(а) Боб',
    );
    expect(groupEventText(event('member_removed', { targetId: 'b2' }), nameOf)).toBe(
      'Алиса удалил(а) Боб',
    );
    expect(groupEventText(event('member_left', { targetId: 'b2' }), nameOf)).toBe(
      'Боб вышел(а) из группы',
    );
    expect(groupEventText(event('admin_added', { targetId: 'b2' }), nameOf)).toBe(
      'Алиса назначил(а) Боб администратором',
    );
    expect(groupEventText(event('admin_removed', { targetId: 'b2' }), nameOf)).toBe(
      'Алиса снял(а) Боб с должности администратора',
    );
    expect(groupEventText(event('member_restricted', { targetId: 'b2' }), nameOf)).toBe(
      'Алиса ограничил(а) Боб',
    );
  });

  it('описывает снятие мьюта', () => {
    expect(groupEventText(event('member_unmuted', { targetId: 'b2' }), nameOf)).toBe(
      'Алиса снял(а) мьют с Боб',
    );
  });

  it('различает мьют бессрочный и до времени', () => {
    expect(groupEventText(event('member_muted', { targetId: 'b2', detail: 'forever' }), nameOf)).toBe(
      'Алиса заглушил(а) Боб бессрочно',
    );
    expect(
      groupEventText(event('member_muted', { targetId: 'b2', detail: '2026-09-23T13:00:00.000Z' }), nameOf),
    ).toMatch(/^Алиса заглушил\(а\) Боб до \d+ [а-яё]+, \d{2}:\d{2}$/);
  });

  it('не падает на неизвестном событии и незнакомом имени', () => {
    expect(groupEventText(event('permissions_changed'), nameOf)).toBe(
      'Алиса изменил(а) права участников',
    );
    expect(groupEventText(event('renamed', { actorId: 'zz' }), nameOf)).toBe(
      'Кто-то изменил(а) название на «»',
    );
    expect(groupEventText({ ...event('created'), kind: 'unknown' as GroupEvent['kind'] }, nameOf)).toBe(
      'Алиса изменил(а) группу',
    );
  });
});

describe('containsLink', () => {
  it('находит ссылки так же, как сервер', () => {
    expect(containsLink('смотри https://example.com')).toBe(true);
    expect(containsLink('http://yargram.test/join/abc')).toBe(true);
    expect(containsLink('HTTPS://EXAMPLE.COM')).toBe(true);
  });

  it('не считает ссылкой обычный текст и упоминание домена без схемы', () => {
    expect(containsLink('обычный текст')).toBe(false);
    expect(containsLink('example.com без схемы')).toBe(false);
    expect(containsLink('')).toBe(false);
  });
});

describe('allGroupPermissions', () => {
  it('включает и выключает все пункты сразу', () => {
    const on = allGroupPermissions() as GroupPermissions;
    const off = allGroupPermissions(false) as GroupPermissions;
    expect(Object.values(on).every(Boolean)).toBe(true);
    expect(Object.values(off).every((value) => value === false)).toBe(true);
    expect(Object.keys(on)).toHaveLength(8);
  });
});
