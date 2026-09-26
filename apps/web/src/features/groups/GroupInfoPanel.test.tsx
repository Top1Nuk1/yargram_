import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { allGroupPermissions } from '../../lib/group';
import type { Conversation, GroupEvent, GroupMember, User } from '../../types';
import { GroupInfoPanel } from './GroupInfoPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      groupMembers: vi.fn(),
      groupHistory: vi.fn(),
      updateGroup: vi.fn(),
      setGroupAdmin: vi.fn(),
      setGroupPermissions: vi.fn(),
      setGroupMemberTag: vi.fn(),
      restrictGroupMember: vi.fn(),
      removeGroupMember: vi.fn(),
      addGroupMembers: vi.fn(),
      regenerateGroupInvite: vi.fn(),
      leaveGroup: vi.fn(),
    },
  };
});

const alice: Person = {
  id: 'alice-1',
  displayName: 'Алиса',
  username: 'alice',
  avatarUrl: null,
  isOnline: true,
};
const bob: Person = { id: 'bob-2', displayName: 'Боб', username: 'bob', avatarUrl: null };
const carol: Person = { id: 'carol-3', displayName: 'Кэрол', username: 'carol', avatarUrl: null };

/** Минимальный профиль: остальные поля User необязательны. */
type Person = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  lastSeenStatus?: User['lastSeenStatus'];
};

function member(
  user: Person,
  role: GroupMember['role'],
  patch: Partial<GroupMember> = {},
): GroupMember {
  return {
    user,
    role,
    permissions: allGroupPermissions(role !== 'restricted') as GroupMember['permissions'],
    // Поля с мьютом нет: сервер не присылает его незаглушённым участникам.
    addedByOwner: role === 'owner',
    ...patch,
  };
}

function group(patch: Partial<Conversation> = {}): Conversation {
  return {
    id: 'group-1',
    type: 'group',
    title: 'Поход в горы',
    description: 'Снаряжение и маршрут',
    avatarUrl: null,
    ownerId: 'alice-1',
    adminIds: ['bob-2'],
    inviteCode: 'invite-code',
    permissions: {},
    memberCount: 3,
    role: 'owner',
    myPermissions: allGroupPermissions(true) as GroupMember['permissions'],
    ...patch,
  };
}

const members = [member(alice, 'owner'), member(bob, 'admin'), member(carol, 'restricted')];

/**
 * Сервер отдаёт помеченной SCAM группе это описание вместо настоящего. Текст
 * повторяем здесь как договор: клиент его не сочиняет, а показывает пришедший.
 */
const SCAM_GROUP_WARNING =
  '⚠️ Внимание: на эту группу много жаловались в связи с мошенничеством или попытками выдать себя за официальную группу. Будьте осторожны, особенно если у Вас попросят денег.';

const history: GroupEvent[] = [
  { id: 'e2', at: '2026-09-23T11:00:00.000Z', actorId: 'alice-1', kind: 'renamed', detail: 'Горы' },
  { id: 'e1', at: '2026-09-23T10:00:00.000Z', actorId: 'alice-1', kind: 'created', detail: 'Поход' },
];

function renderPanel(patch: Partial<Conversation> = {}, handlers: Partial<Parameters<typeof GroupInfoPanel>[0]> = {}) {
  const onUpdated = vi.fn();
  const onLeft = vi.fn();
  const onClose = vi.fn();
  const onShowProfile = vi.fn();
  const view = render(
    <GroupInfoPanel
      token="token"
      currentUserId="alice-1"
      conversation={group(patch)}
      onClose={onClose}
      onUpdated={onUpdated}
      onLeft={onLeft}
      onShowProfile={onShowProfile}
      {...handlers}
    />,
  );
  return { ...view, onUpdated, onLeft, onClose, onShowProfile };
}


/** Карточка участника открывается из меню: строка → «Ограничить пользователя». */
async function openMemberCard(name: string) {
  fireEvent.contextMenu(await screen.findByRole('button', { name: new RegExp(name) }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Ограничить пользователя' }));
  return screen.findByRole('dialog', { name: 'Участник' });
}

beforeEach(() => {
  vi.mocked(api.groupMembers).mockResolvedValue(members);
  vi.mocked(api.groupHistory).mockResolvedValue(history);
  vi.mocked(api.setGroupPermissions).mockResolvedValue(group());
  vi.mocked(api.setGroupAdmin).mockResolvedValue(group());
  vi.mocked(api.setGroupMemberTag).mockResolvedValue(group());
  vi.mocked(api.restrictGroupMember).mockResolvedValue(group());
  vi.mocked(api.leaveGroup).mockResolvedValue(group());
  vi.mocked(api.regenerateGroupInvite).mockResolvedValue(group({ inviteCode: 'fresh-code' }));
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('карточка группы', () => {
  it('показывает название, описание и состав с ролями', async () => {
    renderPanel();

    expect(screen.getByText('Поход в горы')).toBeInTheDocument();
    expect(screen.getByText('Снаряжение и маршрут')).toBeInTheDocument();
    expect(screen.getByText('3 участника · Владелец')).toBeInTheDocument();

    for (const person of [alice, bob, carol]) {
      expect(await screen.findByText(person.displayName)).toBeInTheDocument();
    }
    // Строка участника — роль плюс отдельная подпись присутствия.
    expect(await screen.findByText('Владелец ·')).toBeInTheDocument();
    expect(await screen.findByText('Администратор ·')).toBeInTheDocument();
    expect(await screen.findByText('Ограниченный ·')).toBeInTheDocument();
  });

  it('переключает права группы и отправляет только изменённый пункт', async () => {
    const { onUpdated } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Права' }));

    const row = (await screen.findByText('Отправка медиа')).closest('div') as HTMLElement;
    const toggle = within(row).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    await waitFor(() => expect(api.setGroupPermissions).toHaveBeenCalledWith('token', 'group-1', {
      send_media: false,
    }));
    expect(onUpdated).toHaveBeenCalled();
  });

  it('не даёт менять права тому, кто не может менять информацию', async () => {
    renderPanel({ role: 'member', myPermissions: { ...allGroupPermissions(true), change_info: false } as GroupMember['permissions'] });
    fireEvent.click(screen.getByRole('button', { name: 'Права' }));

    const row = (await screen.findByText('Отправка сообщений')).closest('div') as HTMLElement;
    expect(within(row).getByRole('switch')).toBeDisabled();
  });

  it('клик по строке открывает меню, а не карточку участника', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Кэрол/ }));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Участник' })).toBeNull();
  });

  it('карточка участника открывается отдельным окном, а не на всю панель', async () => {
    renderPanel();
    const dialog = await openMemberCard('Кэрол');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).not.toContain('absolute inset-0');
    expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    // Состав панели остаётся на месте: окно его не подменяет.
    expect(screen.getByRole('button', { name: /Боб/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Участник' })).toBeNull());
  });

  it('владелец назначает администратора с выбранными правами', async () => {
    renderPanel();
    const card = await openMemberCard('Кэрол');
    fireEvent.click(within(card).getByRole('button', { name: /Назначить администратором/ }));

    // Окно назначения: список возможностей и подсказка про добавление админов.
    expect(await screen.findByRole('dialog', { name: 'Добавить администратора' })).toBeInTheDocument();
    expect(screen.getByText(/не сможет добавлять новых администраторов/)).toBeInTheDocument();

    // По умолчанию добавление администраторов выключено, остальное включено.
    const addAdmins = screen.getByRole('switch', { name: 'Добавление администраторов' });
    expect(addAdmins).toHaveAttribute('aria-checked', 'false');
    const removeMembers = screen.getByRole('switch', { name: 'Удаление участников' });
    expect(removeMembers).toHaveAttribute('aria-checked', 'true');

    // Выключаем одно право и сохраняем.
    fireEvent.click(removeMembers);
    expect(screen.getByText(/не сможет добавлять новых администраторов/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.setGroupAdmin).toHaveBeenCalledTimes(1));
    const call = vi.mocked(api.setGroupAdmin).mock.calls[0];
    expect(call?.slice(0, 4)).toEqual(['token', 'group-1', 'carol-3', true]);
    expect(call?.[4]).toMatchObject({ remove_members: false, add_admins: false });
  });

  it('меню участника по правой кнопке показывает действия и гасит недоступные', async () => {
    renderPanel({ role: 'member', myPermissions: allGroupPermissions(false) as GroupMember['permissions'] });

    const row = await screen.findByRole('button', { name: /Кэрол/ });
    fireEvent.contextMenu(row);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Показать профиль' })).toBeEnabled();
    for (const label of [
      'Изменить тег участника',
      'Назначить администратором',
      'Ограничить пользователя',
      'Удалить из группы',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDisabled();
    }
  });

  it('из меню участника открывается профиль и меняется тег', async () => {
    const { onShowProfile } = renderPanel();

    fireEvent.contextMenu(await screen.findByRole('button', { name: /Кэрол/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Показать профиль' }));
    expect(onShowProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'carol-3' }));

    fireEvent.contextMenu(await screen.findByRole('button', { name: /Кэрол/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Изменить тег участника' }));

    const dialog = await screen.findByRole('dialog', { name: 'Изменить тег участника' });
    expect(within(dialog).getByText(/будет отображаться рядом с именем/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  #смирнёха  ' } });
    // Превью показывает, как подпись встанет рядом с именем.
    expect(within(dialog).getAllByText('#смирнёха').length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(api.setGroupMemberTag).toHaveBeenCalledWith('token', 'group-1', 'carol-3', '#смирнёха'),
    );
  });

  it('ставит вперёд тех, кто в сети, и не пишет заголовков групп', async () => {
    vi.mocked(api.groupMembers).mockResolvedValue([
      member({ ...carol, isOnline: false, lastSeenAt: '2026-06-01T10:00:00.000Z' }, 'member'),
      member({ ...alice, isOnline: true }, 'owner'),
      member({ ...bob, isOnline: false, lastSeenAt: new Date(Date.now() - 3_600_000).toISOString() }, 'admin'),
    ]);
    renderPanel();

    // Ждём состав, затем смотрим порядок строк: в сети → недавний → давний.
    await screen.findByRole('button', { name: /Кэрол/ });
    const rows = screen
      .getAllByRole('button')
      .filter((node) => /Алиса|Боб|Кэрол/.test(node.textContent ?? ''));
    expect(rows.map((node) => node.textContent)).toEqual([
      expect.stringContaining('Алиса'),
      expect.stringContaining('Боб'),
      expect.stringContaining('Кэрол'),
    ]);
    // Подписей групп над строками нет: «Недавно» и родственные исчезли совсем,
    // а «В сети» остаётся только подписью самой строки.
    for (const label of ['Недавно', 'На прошлой неделе', 'В прошлом месяце']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getAllByText('В сети')).toHaveLength(1);
    // Присутствие видно в самой строке: голубым у того, кто в сети.
    const onlineRow = rows[0] as HTMLElement;
    expect(within(onlineRow).getByText('В сети')).toHaveClass('text-brand');
    const offlineRow = rows[2] as HTMLElement;
    expect(within(offlineRow).getByText(/^Был\(а\) /)).toHaveClass('text-muted');
  });

  it('берёт «в сети» из участников беседы, а не из ответа списка', async () => {
    // Сервер отдаёт всем «не в сети»: онлайн приходит только событиями сокета.
    vi.mocked(api.groupMembers).mockResolvedValue([member({ ...bob, isOnline: false }, 'admin')]);
    renderPanel({ members: [{ id: 'bob-2', isOnline: true, online: true, displayName: 'Боб' }] });

    const row = await screen.findByRole('button', { name: /Боб/ });
    expect(within(row).getByText('В сети')).toHaveClass('text-brand');
  });

  it('тег участника виден в составе и покрашен по роли', async () => {
    vi.mocked(api.groupMembers).mockResolvedValue([
      member(alice, 'owner', { tag: 'Организатор' }),
      member(bob, 'admin', { tag: '#смирнёха' }),
      member(carol, 'member', { tag: 'Новичок' }),
    ]);
    renderPanel();

    expect(await screen.findByText('Организатор')).toHaveClass('text-owner');
    expect(screen.getByText('#смирнёха')).toHaveClass('text-success');
    expect(screen.getByText('Новичок')).toHaveClass('text-muted');
  });

  it('ограничивает обычного участника и глушит его на час', async () => {
    renderPanel();
    const card = await openMemberCard('Кэрол');

    // Кэрол ограничена, поэтому переключатель выключен: включение снимает запрет.
    const messagesSwitch = within(card).getByRole('switch', { name: 'Отправка сообщений' });
    expect(messagesSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(messagesSwitch);
    await waitFor(() =>
      expect(api.restrictGroupMember).toHaveBeenCalledWith('token', 'group-1', 'carol-3', {
        permissions: { send_messages: true },
      }),
    );

    fireEvent.click(within(card).getByRole('button', { name: '1 час' }));
    await waitFor(() => expect(api.restrictGroupMember).toHaveBeenCalledTimes(2));
    const muteCall = vi.mocked(api.restrictGroupMember).mock.calls[1];
    expect(muteCall?.[3].mutedUntil).toEqual(expect.any(String));
  });

  it('права администратора меняются отдельно от ограничений участника', async () => {
    renderPanel();
    const card = await openMemberCard('Боб');

    const linksSwitch = within(card).getByRole('switch', { name: 'Отправка ссылок' });
    fireEvent.click(linksSwitch);
    await waitFor(() =>
      expect(api.setGroupAdmin).toHaveBeenCalledWith('token', 'group-1', 'bob-2', true, {
        send_links: false,
      }),
    );
    expect(api.restrictGroupMember).not.toHaveBeenCalled();
  });

  it('копирует ссылку-приглашение', async () => {
    renderPanel();
    const link = await screen.findByText(/\/join\/invite-code$/);
    expect(link).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/join/invite-code'),
      ),
    );
  });

  it('показывает историю изменений человеческим языком', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'История' }));

    expect(await screen.findByText('Алиса изменил(а) название на «Горы»')).toBeInTheDocument();
    expect(screen.getByText('Алиса создал(а) группу «Поход»')).toBeInTheDocument();
  });

  it('владелец не может выйти, а обычный участник — может', async () => {
    const owner = renderPanel();
    expect(screen.queryByRole('button', { name: /Выйти из группы/ })).toBeNull();
    expect(screen.getByText(/вы владелец группы/i)).toBeInTheDocument();
    owner.unmount();

    const { onLeft } = renderPanel({
      role: 'member',
      myPermissions: allGroupPermissions(true) as GroupMember['permissions'],
    });
    fireEvent.click(screen.getByRole('button', { name: /Выйти из группы/ }));

    await waitFor(() => expect(api.leaveGroup).toHaveBeenCalledWith('token', 'group-1'));
    await waitFor(() => expect(onLeft).toHaveBeenCalledWith('group-1'));
  });

  it('показывает знаки группы и не даёт скопировать предупреждение SCAM', () => {
    renderPanel({ isVerified: true, badge: 'yargram', scam: true, description: SCAM_GROUP_WARNING });

    // Значки стоят у названия: галочка и значок Yargram — как у аккаунта.
    const titles = Array.from(document.querySelectorAll('[title]')).map((node) =>
      node.getAttribute('title'),
    );
    expect(titles).toContain('Подтверждённая группа');
    expect(titles).toContain('Подтверждён представителями Yargram');
    expect(titles).toContain('Мошенник');
    expect(
      document.querySelector('[aria-label="Отметка SCAM: группа помечена как мошенническая"]'),
    ).not.toBeNull();

    // Описание подменено предупреждением о группе, и скопировать его нельзя.
    const warning = Array.from(document.querySelectorAll('p')).find((node) =>
      node.textContent?.startsWith('Внимание:'),
    ) as HTMLParagraphElement;
    expect(warning.textContent).toBe(SCAM_GROUP_WARNING.replace(/^\s*⚠️?\s*/u, ''));
    expect(warning.className).toContain('select-none');
    expect(fireEvent.copy(warning)).toBe(false);
  });

  it('закрывает описание группы на замок, пока стоит отметка SCAM', () => {
    renderPanel({ scam: true, description: SCAM_GROUP_WARNING });
    fireEvent.click(screen.getByRole('button', { name: 'Изменить информацию' }));

    expect(screen.getByPlaceholderText('Описание')).toBeDisabled();
    expect(screen.getByPlaceholderText('Название группы')).toBeEnabled();
    expect(screen.getByText(/На группе стоит отметка SCAM/)).toBeInTheDocument();
  });
});
