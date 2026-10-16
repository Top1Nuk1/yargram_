import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { LANGUAGE_KEY } from '../../lib/i18n';
import type { AdminAccount, AdminGroup, User } from '../../types';
import { AdminPanel } from './AdminPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      adminSearchGroups: vi.fn(),
      adminSetGroupMarks: vi.fn(),
      adminLookup: vi.fn(),
      adminSetFake: vi.fn(),
      adminStats: vi.fn(),
      adminAccounts: vi.fn(),
      adminBots: vi.fn(),
      adminSetBot: vi.fn(),
    },
  };
});

const owner: User = { id: 'owner-1', displayName: 'Владелец', username: 'owner' };

const group: AdminGroup = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Поход в горы',
  memberCount: 3,
  isVerified: false,
  badge: null,
  scam: false,
  fake: false,
  inviteCode: 'invite-code',
};

/** Живой аккаунт с двумя дополнительными никами и знаками владельца. */
const liveAccount: AdminAccount = {
  id: 'account-live',
  displayName: 'АлисаОченьДлинноеИмя',
  username: 'alice',
  usernames: ['alice_two', 'alice_three'],
  avatarUrl: null,
  isVerified: true,
  badge: 'yargram',
  scam: false,
  fake: false,
  isOwner: false,
  isFrozen: false,
  isDeleted: false,
  isBot: false,
  createdAt: '2026-01-02T10:00:00.000Z',
  deletedAt: null,
  lastSeenAt: '2026-01-05T10:00:00.000Z',
};

/** Удалённый аккаунт: ник и аватар настоящие, но помечен `isDeleted`. */
const deletedAccount: AdminAccount = {
  id: 'account-deleted',
  displayName: 'Боб',
  username: 'bob',
  usernames: [],
  avatarUrl: null,
  isVerified: false,
  badge: null,
  scam: false,
  fake: false,
  isOwner: false,
  isFrozen: false,
  isDeleted: true,
  isBot: false,
  createdAt: '2026-01-01T10:00:00.000Z',
  deletedAt: '2026-02-03T10:00:00.000Z',
  lastSeenAt: '2026-01-01T10:00:00.000Z',
};

function renderPanel() {
  const onChanged = vi.fn();
  const view = render(
    <AdminPanel token="token" viewer={owner} onClose={() => undefined} onChanged={onChanged} />,
  );
  return { ...view, onChanged };
}

beforeEach(() => {
  // Язык — настройка устройства: без сброса тест «по-английски» утекал бы
  // в соседние проверки, и падали бы они, а не он.
  localStorage.setItem(LANGUAGE_KEY, 'ru');
  vi.mocked(api.adminSearchGroups).mockResolvedValue([group]);
  vi.mocked(api.adminSetGroupMarks).mockImplementation(async (_token, _groupId, input) => ({
    ...group,
    ...input,
  }));
  vi.mocked(api.adminStats).mockResolvedValue({ totalUsers: 7, groups: 2 });
  vi.mocked(api.adminAccounts).mockResolvedValue([liveAccount, deletedAccount]);
});

afterEach(cleanup);

describe('админ-панель: список аккаунтов', () => {
  it('раскрывает список аккаунтов по нажатию на плитку', async () => {
    renderPanel();

    // Пока список не раскрыт, запросов к нему нет — это справка по кнопке.
    expect(api.adminAccounts).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenCalledWith('token', '', 'all', [], 'any'),
    );
    expect(await screen.findByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
  });

  it('подрезает длинный ник до 10 знаков и открывает полный по подсказке', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    // «АлисаОченьДлинноеИмя» → «АлисаОчень…»: строка списка не разъезжается.
    expect(await screen.findByText('АлисаОчень…')).toBeInTheDocument();
    expect(screen.queryByText('АлисаОченьДлинноеИмя')).toBeNull();
    // Полное имя живёт в подсказке — по наведению его видно.
    expect(screen.getByTitle('АлисаОченьДлинноеИмя')).toBeInTheDocument();
  });

  it('показывает часть юзернеймов, а остальные раскрывает по нажатию', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    // Из трёх ников в строке помещаются два, третий — за кнопкой «ещё 1».
    expect(await screen.findByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('@alice_two')).toBeInTheDocument();
    expect(screen.queryByText('@alice_three')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ещё 1' }));
    expect(screen.getByText('@alice_three')).toBeInTheDocument();

    // Повторное нажатие сворачивает обратно.
    fireEvent.click(screen.getByRole('button', { name: 'свернуть' }));
    expect(screen.queryByText('@alice_three')).toBeNull();
  });

  it('пишет даты на языке интерфейса, а не всегда по-русски', async () => {
    // Даты рисует `Intl`, и без локали они оставались бы русскими на всех
    // языках: на английском это выглядело бы как «заходил 5 января 2026».
    localStorage.setItem(LANGUAGE_KEY, 'en');
    renderPanel();
    // Плитка тоже переводится: на английском подпись «Accounts».
    fireEvent.click(await screen.findByRole('button', { name: /Accounts/ }));

    expect(await screen.findByText(/last seen January 5, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/заходил 5 января 2026/)).toBeNull();
  });

  it('показывает дату создания, последний вход, а для удалённого — и дату удаления', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    expect(await screen.findByText(/создан 2 января 2026/)).toBeInTheDocument();
    // Последний вход живого аккаунта виден рядом с датой создания.
    expect(screen.getByText(/заходил 5 января 2026/)).toBeInTheDocument();
    // У удалённого последний вход — дата создания, дальше идёт дата удаления.
    expect(screen.getByText(/заходил 1 января 2026/)).toBeInTheDocument();
    expect(screen.getByText(/удалён 3 февраля 2026/)).toBeInTheDocument();
  });

  it('шлёт на сервер выбранный фильтр состояния', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));
    await waitFor(() => expect(api.adminAccounts).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: 'Удалённые' }));

    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith('token', '', 'deleted', [], 'any'),
    );
  });

  it('складывает знаки и состояние в один отбор', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));
    await waitFor(() => expect(api.adminAccounts).toHaveBeenCalledTimes(1));

    // Знак можно включить, не сбрасывая состояние: слои независимы.
    fireEvent.click(await screen.findByRole('button', { name: 'С галочкой' }));
    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith('token', '', 'all', ['verified'], 'any'),
    );

    // Второй знак добавляется к первому, а не заменяет его.
    fireEvent.click(screen.getByRole('button', { name: 'SCAM' }));
    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith(
        'token',
        '',
        'all',
        ['verified', 'scam'],
        'any',
      ),
    );

    // Владельцы — тоже знак, а не отдельный экран.
    fireEvent.click(screen.getByRole('button', { name: 'Владельцы' }));
    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith(
        'token',
        '',
        'all',
        ['verified', 'scam', 'owner'],
        'any',
      ),
    );
  });

  it('выбирает, где искать введённое', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));
    fireEvent.change(screen.getByPlaceholderText('ник, @юзернейм или почта'), {
      target: { value: 'alice' },
    });
    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith('token', 'alice', 'all', [], 'any'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'По @юзернейму' }));

    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith('token', 'alice', 'all', [], 'handle'),
    );
  });

  it('сбрасывает весь отбор одной кнопкой', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));
    await waitFor(() => expect(api.adminAccounts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('ник, @юзернейм или почта'), {
      target: { value: 'alice' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Удалённые' }));
    fireEvent.click(screen.getByRole('button', { name: 'SCAM' }));
    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith('token', 'alice', 'deleted', ['scam'], 'any'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));

    await waitFor(() =>
      expect(api.adminAccounts).toHaveBeenLastCalledWith('token', '', 'all', [], 'any'),
    );
    expect(screen.getByPlaceholderText('ник, @юзернейм или почта')).toHaveValue('');
  });

  it('гасит выбор области поиска, пока строка пуста', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    // Область поиска без самого поиска ничего не значит — кнопки недоступны.
    expect(await screen.findByRole('button', { name: 'По нику' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Везде' })).toBeDisabled();
  });

  it('открывает карточку аккаунта по клику на строку', async () => {
    vi.mocked(api.adminLookup).mockResolvedValue(owner);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    fireEvent.click(await screen.findByText('@alice'));

    // Карточка работает с полным профилем, поэтому строка идёт через точный поиск.
    await waitFor(() => expect(api.adminLookup).toHaveBeenCalledWith('token', 'alice'));
  });

  it('не ломает панель, если список аккаунтов не загрузился', async () => {
    vi.mocked(api.adminAccounts).mockRejectedValue(new Error('сеть'));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Аккаунтов/ }));

    expect(await screen.findByText(/Не удалось загрузить список аккаунтов/)).toBeInTheDocument();
    // Знаки аккаунту всё равно выдаются: сбой списка — не сбой панели.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('админ-панель: сводка', () => {
  it('показывает, сколько всего аккаунтов и групп', async () => {
    renderPanel();

    // Счётчики читаются при открытии панели, а не по кнопке.
    await waitFor(() => expect(api.adminStats).toHaveBeenCalledWith('token'));
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('Аккаунтов')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Групп')).toBeInTheDocument();
  });

  it('не мешает работе панели, если сводку посчитать не удалось', async () => {
    // Счётчики — справка: их сбой не должен ломать выдачу знаков.
    vi.mocked(api.adminStats).mockRejectedValue(new Error('сеть'));
    vi.mocked(api.adminLookup).mockResolvedValue(owner);
    renderPanel();

    expect(await screen.findByText('Не удалось посчитать')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('например: top1nuk1'), {
      target: { value: '@owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Показать состояние/ }));
    await waitFor(() => expect(api.adminLookup).toHaveBeenCalledWith('token', 'owner'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('админ-панель: поиск аккаунта', () => {
  it('находит свой же аккаунт через точный поиск, а не через поиск по людям', async () => {
    // Свой аккаунт обычный поиск (api.users) не отдаёт: он исключает ищущего.
    // Поэтому панель обязана ходить в отдельный точный поиск.
    vi.mocked(api.adminLookup).mockResolvedValue(owner);
    renderPanel();

    fireEvent.change(screen.getByPlaceholderText('например: top1nuk1'), {
      target: { value: '@owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Показать состояние/ }));

    await waitFor(() => expect(api.adminLookup).toHaveBeenCalledWith('token', 'owner'));
    // Никакой ошибки «не найден» — аккаунт выбран.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('пишет «не найден» только когда точный поиск вернул пусто', async () => {
    vi.mocked(api.adminLookup).mockResolvedValue(null);
    renderPanel();

    fireEvent.change(screen.getByPlaceholderText('например: top1nuk1'), {
      target: { value: 'неттакого' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Показать состояние/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('неттакого');
  });

  it('пишет в сводке, есть отметка FAKE или нет', async () => {
    // Знаки перечисляются словами: по одним значкам у имени не понять, стоит
    // ли отметка FAKE, — а владельцу это первое, что нужно.
    vi.mocked(api.adminLookup).mockResolvedValue({ ...owner, isVerified: true, fake: true });
    renderPanel();

    fireEvent.change(screen.getByPlaceholderText('например: top1nuk1'), {
      target: { value: '@owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Показать состояние/ }));

    const line = await screen.findByText(/галочка есть/);
    expect(line).toHaveTextContent('отметка FAKE есть');
    // SCAM при этом снят — путать две отметки нельзя.
    expect(line).toHaveTextContent('отметка SCAM нет');
  });

  it('помечает аккаунт FAKE только после подтверждения', async () => {
    vi.mocked(api.adminLookup).mockResolvedValue(owner);
    vi.mocked(api.adminSetFake).mockResolvedValue({ ...owner, fake: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();

    fireEvent.change(screen.getByPlaceholderText('например: top1nuk1'), {
      target: { value: '@owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Показать состояние/ }));

    const fake = await screen.findByRole('button', { name: 'Выдать отметку FAKE' });
    fireEvent.click(fake);
    expect(confirm).toHaveBeenCalled();
    expect(api.adminSetFake).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(fake);
    await waitFor(() => expect(api.adminSetFake).toHaveBeenCalledWith('token', owner.id, true));
  });
});

describe('админ-панель: знаки группы', () => {
  it('показывает раздел аккаунта, пока не выбран раздел группы', () => {
    renderPanel();
    expect(screen.getByText('Юзернейм аккаунта')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Найти группы/ })).toBeNull();
  });

  it('находит группу и выдаёт ей галочку', async () => {
    const { onChanged } = renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Группа' }));

    fireEvent.change(screen.getByPlaceholderText('название, ссылка-приглашение или id'), {
      target: { value: 'горы' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Найти группы/ }));

    await waitFor(() => expect(api.adminSearchGroups).toHaveBeenCalledWith('token', 'горы'));
    // Единственное совпадение выбирается само — кнопки знаков сразу живые.
    const verify = await screen.findByRole('button', { name: 'Подтвердить (галочка)' });
    expect(verify).toBeEnabled();
    fireEvent.click(verify);

    await waitFor(() =>
      expect(api.adminSetGroupMarks).toHaveBeenCalledWith('token', group.id, { isVerified: true }),
    );
    // Значок у названия группы должен появиться сразу, без перезагрузки списка.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('помечает группу SCAM только после подтверждения', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Группа' }));
    fireEvent.click(screen.getByRole('button', { name: /Найти группы/ }));

    const scam = await screen.findByRole('button', { name: 'Выдать отметку SCAM' });
    fireEvent.click(scam);
    expect(confirm).toHaveBeenCalled();
    expect(api.adminSetGroupMarks).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(scam);
    await waitFor(() =>
      expect(api.adminSetGroupMarks).toHaveBeenCalledWith('token', group.id, { scam: true }),
    );
  });

  it('снимает знаки с группы отдельными кнопками', async () => {
    vi.mocked(api.adminSetGroupMarks).mockResolvedValue({
      ...group,
      isVerified: true,
      badge: 'yargram',
      scam: true,
    });
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Группа' }));
    fireEvent.click(screen.getByRole('button', { name: /Найти группы/ }));
    await screen.findByRole('button', { name: 'Снять галочку' });

    fireEvent.click(screen.getByRole('button', { name: 'Снять значок Yargram' }));
    await waitFor(() =>
      expect(api.adminSetGroupMarks).toHaveBeenCalledWith('token', group.id, { badge: null }),
    );
    // После выдачи отметки кнопка предлагает её снять.
    expect(await screen.findByRole('button', { name: 'Снять отметку SCAM' })).toBeInTheDocument();
  });
});

describe('админ-панель: боты', () => {
  /** Служебный бот в перечне: картинка задана ссылкой, метка BOT уже стоит. */
  const botAccount: AdminAccount = {
    id: 'bot-1',
    displayName: 'Yargram Support',
    username: 'YargramSupport_Bot',
    usernames: [],
    avatarUrl: '/app/brand/bot.png',
    isVerified: true,
    badge: 'yargram',
    scam: false,
    fake: false,
    isOwner: true,
    isFrozen: false,
    isDeleted: false,
    isBot: true,
    createdAt: '2026-01-03T10:00:00.000Z',
    deletedAt: null,
    lastSeenAt: '2026-01-03T10:00:00.000Z',
  };

  it('читает перечень служебных ботов только при открытии вкладки', async () => {
    vi.mocked(api.adminBots).mockResolvedValue([botAccount]);
    renderPanel();

    // Вкладка «Боты» — не первый экран: до неё запросов к перечню нет.
    expect(api.adminBots).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Боты' }));

    await waitFor(() => expect(api.adminBots).toHaveBeenCalledWith('token'));
    expect(await screen.findByText('@YargramSupport_Bot')).toBeInTheDocument();
  });

  it('ставит метку BOT только после подтверждения', async () => {
    vi.mocked(api.adminBots).mockResolvedValue([]);
    vi.mocked(api.adminLookup).mockResolvedValue(owner);
    vi.mocked(api.adminSetBot).mockResolvedValue({ ...owner, isBot: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Боты' }));
    await waitFor(() => expect(api.adminBots).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('например: top1nuk1'), {
      target: { value: '@owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Показать состояние/ }));

    // Метка закрывает вход в аккаунт, поэтому спрашиваем подтверждение.
    const set = await screen.findByRole('button', { name: 'Поставить BOT' });
    fireEvent.click(set);
    expect(confirm).toHaveBeenCalled();
    expect(api.adminSetBot).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(set);
    await waitFor(() => expect(api.adminSetBot).toHaveBeenCalledWith('token', owner.id, true));
  });

  it('снимает метку BOT у бота из перечня без подтверждения', async () => {
    vi.mocked(api.adminBots).mockResolvedValue([botAccount]);
    vi.mocked(api.adminSetBot).mockResolvedValue({ ...botAccount, isBot: false });
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Боты' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Снять BOT' }));

    // Снятие ничего не закрывает — подтверждать нечего.
    await waitFor(() => expect(api.adminSetBot).toHaveBeenCalledWith('token', botAccount.id, false));
  });
});
