import { describe, expect, it } from 'vitest';
import {
  allGroupPermissions,
  containsLink,
  groupEventText,
  groupInviteLink,
  groupMemberCountLabel,
  groupMemberMuted,
  groupMembersByPresence,
  groupRoleLabel,
  groupRoleOf,
  groupTitle,
  isAdminOnlyPermission,
  isGroup,
  memberActionAllowed,
  memberTagClass,
  mergeMemberPresence,
  mutedUntilLabel,
  normalizeMemberTag,
  orderMembersByPresence,
  viewerCan,
  viewerIsOwner,
  viewerManagesGroup,
  viewerPermissions,
} from './group';
import {
  adminOnlyPermissionKeys,
  memberPermissionKeys,
  type Conversation,
  type GroupEvent,
  type GroupMember,
  type GroupPermissions,
  type GroupRole,
  type User,
} from '../types';

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
    // Восемь прав участников и четыре управляющих.
    expect(Object.keys(on)).toHaveLength(12);
    expect(memberPermissionKeys).toHaveLength(8);
    expect(adminOnlyPermissionKeys).toHaveLength(4);
  });

  it('управляющие права отделены от прав участников', () => {
    for (const key of adminOnlyPermissionKeys) expect(isAdminOnlyPermission(key)).toBe(true);
    for (const key of memberPermissionKeys) expect(isAdminOnlyPermission(key)).toBe(false);
  });
});

describe('memberActionAllowed', () => {
  const member = (id: string, role: GroupRole) => ({ user: { id, displayName: id }, role });

  it('обычный участник может только смотреть профиль и ставить свой тег', () => {
    const group = conversation({
      role: 'member',
      myPermissions: allGroupPermissions(false) as GroupMember['permissions'],
    });
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'profile')).toBe(true);
    expect(memberActionAllowed(group, 'me', member('me', 'member'), 'tag')).toBe(true);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'tag')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'admin')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'remove')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'restrict')).toBe(false);
  });

  it('владелец управляет всеми, кроме самого себя', () => {
    const group = conversation({ role: 'owner' });
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'admin')).toBe(true);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'remove')).toBe(true);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'restrict')).toBe(true);
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'tag')).toBe(true);
    // Себя владелец не удаляет и не ограничивает, но свой тег ставит.
    expect(memberActionAllowed(group, 'me', member('me', 'owner'), 'remove')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('me', 'owner'), 'restrict')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('me', 'owner'), 'tag')).toBe(true);
  });

  it('администратор не трогает другого администратора и владельца', () => {
    const group = conversation({ role: 'admin', myPermissions: allGroupPermissions(true) as GroupMember['permissions'] });
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'remove')).toBe(true);
    expect(memberActionAllowed(group, 'me', member('bob', 'admin'), 'remove')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('bob', 'admin'), 'restrict')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('bob', 'owner'), 'tag')).toBe(false);
    expect(memberActionAllowed(group, 'me', member('bob', 'owner'), 'admin')).toBe(false);
  });

  it('без права добавления администраторов назначить нельзя', () => {
    const group = conversation({
      role: 'admin',
      myPermissions: { ...allGroupPermissions(true), add_admins: false } as GroupMember['permissions'],
    });
    expect(memberActionAllowed(group, 'me', member('bob', 'member'), 'admin')).toBe(false);
  });

  it('в личном диалоге действий участника нет', () => {
    expect(memberActionAllowed({ id: 'd', type: 'direct' }, 'me', member('bob', 'member'), 'profile')).toBe(false);
    expect(memberActionAllowed(null, 'me', member('bob', 'member'), 'profile')).toBe(false);
  });
});

describe('groupRoleOf', () => {
  const base = conversation({ ownerId: 'a1', adminIds: ['b2'], memberIds: ['a1', 'b2', 'c3', 'd4'] });

  it('считает роль из записи группы', () => {
    expect(groupRoleOf(base, 'a1')).toBe('owner');
    expect(groupRoleOf(base, 'b2')).toBe('admin');
    expect(groupRoleOf(base, 'c3')).toBe('member');
    // Постороннему роли нет.
    expect(groupRoleOf(base, 'zz')).toBeNull();
    expect(groupRoleOf({ id: 'd', type: 'direct' }, 'a1')).toBeNull();
  });

  it('ограниченным делает личный запрет или действующий мьют', () => {
    expect(groupRoleOf({ ...base, restrictions: { c3: { send_messages: false } } }, 'c3')).toBe('restricted');
    expect(groupRoleOf({ ...base, mutedMembers: { c3: null } }, 'c3')).toBe('restricted');
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(groupRoleOf({ ...base, mutedMembers: { c3: future } }, 'c3')).toBe('restricted');
    // Прошедший мьют роль не меняет.
    expect(groupRoleOf({ ...base, mutedMembers: { c3: past } }, 'c3')).toBe('member');
    expect(groupRoleOf({ ...base, mutedMembers: {} }, 'c3')).toBe('member');
  });
});

describe('groupMembersByPresence', () => {
  const person = (id: string, patch: Partial<User> = {}): User => ({ id, displayName: id, ...patch });
  const asMember = (id: string, role: GroupRole, patch: Partial<User> = {}): GroupMember => ({
    user: person(id, patch),
    role,
    permissions: allGroupPermissions(true) as GroupMember['permissions'],
    addedByOwner: false,
  });

  it('раскладывает состав по времени: в сети, недавно, давно', () => {
    const now = Date.parse('2026-09-24T16:00:00.000Z');
    const sections = groupMembersByPresence(
      [
        asMember('давний', 'member', { lastSeenAt: '2026-06-01T10:00:00.000Z' }),
        asMember('в сети', 'owner', { isOnline: true }),
        asMember('недавний', 'member', { lastSeenAt: '2026-09-24T15:00:00.000Z' }),
      ],
      now,
    );

    expect(sections.map((section) => section.bucket)).toEqual(['online', 'recent', 'long_ago']);
    expect(sections.map((section) => section.label)).toEqual(['В сети', 'Недавно', 'Давно']);
    expect(sections[0]?.members.map((item) => item.user.id)).toEqual(['в сети']);
    expect(sections[1]?.members.map((item) => item.user.id)).toEqual(['недавний']);
    expect(sections[2]?.members.map((item) => item.user.id)).toEqual(['давний']);
  });

  it('внутри группы свежие визиты выше, пустые группы не показываются', () => {
    const now = Date.parse('2026-09-24T16:00:00.000Z');
    const sections = groupMembersByPresence(
      [
        asMember('утро', 'member', { lastSeenAt: '2026-09-24T08:00:00.000Z' }),
        asMember('день', 'member', { lastSeenAt: '2026-09-24T14:00:00.000Z' }),
      ],
      now,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.members.map((item) => item.user.id)).toEqual(['день', 'утро']);
    expect(groupMembersByPresence([], now)).toEqual([]);
  });

  it('отдаёт тот же порядок плоским списком, без заголовков', () => {
    const now = Date.parse('2026-09-24T16:00:00.000Z');
    const members = [
      asMember('давний', 'member', { lastSeenAt: '2026-06-01T10:00:00.000Z' }),
      asMember('в сети', 'owner', { isOnline: true }),
      asMember('недавний', 'member', { lastSeenAt: '2026-09-24T15:00:00.000Z' }),
    ];
    expect(orderMembersByPresence(members, now).map((item) => item.user.id)).toEqual([
      'в сети',
      'недавний',
      'давний',
    ]);
    expect(orderMembersByPresence([], now)).toEqual([]);
  });
});

describe('mergeMemberPresence', () => {
  const asMember = (id: string, patch: Partial<User> = {}): GroupMember => ({
    user: { id, displayName: id, ...patch },
    role: 'member',
    permissions: allGroupPermissions(true) as GroupMember['permissions'],
    addedByOwner: false,
  });

  it('берёт онлайн из участников беседы: сервер отдаёт «не в сети» всем', () => {
    const merged = mergeMemberPresence([asMember('b2', { isOnline: false })], [
      { id: 'b2', isOnline: true, online: true, lastSeenAt: null },
    ]);
    expect(merged[0]?.user.isOnline).toBe(true);
    expect(merged[0]?.user.online).toBe(true);
  });

  it('подставляет точное время и статус, не затирая остальное', () => {
    const merged = mergeMemberPresence(
      [asMember('b2', { isOnline: false, lastSeenAt: null })],
      [{ id: 'b2', isOnline: false, lastSeenAt: '2026-09-24T15:00:00.000Z', lastSeenStatus: null }],
    );
    expect(merged[0]?.user.lastSeenAt).toBe('2026-09-24T15:00:00.000Z');
    expect(merged[0]?.user.lastSeenStatus).toBeNull();
  });

  it('не трогает состав без данных о присутствии и не теряет роли', () => {
    const members = [asMember('b2'), asMember('c3')];
    expect(mergeMemberPresence(members, undefined)).toEqual(members);
    expect(mergeMemberPresence(members, [])).toEqual(members);
    const merged = mergeMemberPresence(members, [{ userId: 'c3', isOnline: true }]);
    expect(merged[0]?.user.isOnline).toBeUndefined();
    expect(merged[1]?.user.isOnline).toBe(true);
    expect(merged.map((item) => item.role)).toEqual(['member', 'member']);
  });
});

describe('тег участника', () => {
  it('обрезает пробелы и ограничивает длину', () => {
    expect(normalizeMemberTag('  #смирнёха  ')).toBe('#смирнёха');
    expect(normalizeMemberTag('')).toBe('');
    expect(normalizeMemberTag('я'.repeat(40))).toHaveLength(24);
  });

  it('красит тег по роли: владелец фиолетовый, администратор зелёный, участник серый', () => {
    expect(memberTagClass('owner')).toBe('text-owner');
    expect(memberTagClass('admin')).toBe('text-success');
    expect(memberTagClass('member')).toBe('text-muted');
    expect(memberTagClass('restricted')).toBe('text-muted');
  });

  it('описывает смену тега в истории', () => {
    const event: GroupEvent = {
      id: 'e1',
      at: '2026-09-23T10:00:00.000Z',
      actorId: 'a1',
      kind: 'member_tag_changed',
      targetId: 'b2',
      detail: '#смирнёха',
    };
    expect(groupEventText(event, (id) => (id === 'a1' ? 'Алиса' : 'Боб'))).toBe(
      'Алиса поставил(а) Боб тег «#смирнёха»',
    );
    expect(groupEventText({ ...event, detail: '' }, (id) => (id === 'a1' ? 'Алиса' : 'Боб'))).toBe(
      'Алиса снял(а) тег с Боб',
    );
  });
});
