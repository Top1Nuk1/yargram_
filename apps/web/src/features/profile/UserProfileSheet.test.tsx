import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import type { User } from '../../types';
import { UserProfileSheet } from './UserProfileSheet';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      user: vi.fn(),
      mediaSummary: vi.fn(),
      addFriend: vi.fn(),
      acceptFriend: vi.fn(),
      removeFriend: vi.fn(),
      adminSetBot: vi.fn(),
    },
  };
});

/** Сервер отдаёт помеченному SCAM вместо описания готовое предупреждение. */
const SCAM_TEXT =
  '⚠️ Внимание: на этот аккаунт часто жаловались в связи с мошенничеством или попытками выдать себя за официальный аккаунт. Будьте осторожны, особенно если у Вас попросят денег.';

const scammer: User = {
  id: 'scam-1',
  displayName: 'Тимур',
  username: 'timur',
  bio: SCAM_TEXT,
  scam: true,
};

/** Отметка FAKE: сервер отдаёт вместо описания предупреждение о подделке. */
const FAKE_TEXT =
  '⚠️ Внимание: многие жаловались, что этот аккаунт выдаёт себя за официальный.';

const impostor: User = {
  id: 'fake-1',
  displayName: 'Пётр',
  username: 'petr',
  bio: FAKE_TEXT,
  fake: true,
};

const honest: User = {
  id: 'honest-2',
  displayName: 'Борис',
  username: 'boris',
  bio: 'Люблю рыбалку',
};

beforeEach(() => {
  vi.mocked(api.user).mockImplementation(async (_token, userId) => {
    if (userId === scammer.id) return scammer;
    if (userId === impostor.id) return impostor;
    return honest;
  });
  vi.mocked(api.mediaSummary).mockResolvedValue({
    photos: 0,
    videos: 0,
    voice: 0,
    videoCircles: 0,
    files: 0,
    audio: 0,
    links: 0,
    gifs: 0,
  });
});

afterEach(cleanup);

describe('карточка профиля и отметка SCAM', () => {
  it('показывает предупреждение и не даёт его скопировать', () => {
    const { container } = render(
      <UserProfileSheet token="token" user={scammer} mode="peer" onClose={() => undefined} />,
    );
    const warning = Array.from(container.querySelectorAll('p')).find((node) =>
      node.textContent?.startsWith('Внимание:'),
    ) as HTMLParagraphElement;

    // Ведущий ⚠️ убирается: на карточке его место занимает значок.
    expect(warning.textContent).toBe(SCAM_TEXT.replace(/^\s*⚠️?\s*/u, ''));
    expect(warning.className).toContain('select-none');
    expect(fireEvent.copy(warning)).toBe(false);
    expect(fireEvent.contextMenu(warning)).toBe(false);
  });

  it('обычное описание по-прежнему выделяется и копируется', () => {
    const { container } = render(
      <UserProfileSheet token="token" user={honest} mode="peer" onClose={() => undefined} />,
    );
    const bio = Array.from(container.querySelectorAll('p')).find(
      (node) => node.textContent === 'Люблю рыбалку',
    ) as HTMLParagraphElement;

    expect(bio).toBeDefined();
    expect(bio.className).not.toContain('select-none');
    expect(fireEvent.copy(bio)).toBe(true);
  });

  it('у отметки FAKE тоже показывает предупреждение и закрывает копирование', () => {
    const { container } = render(
      <UserProfileSheet token="token" user={impostor} mode="peer" onClose={() => undefined} />,
    );
    const warning = Array.from(container.querySelectorAll('p')).find((node) =>
      node.textContent?.startsWith('Внимание:'),
    ) as HTMLParagraphElement;

    expect(warning.textContent).toBe(FAKE_TEXT.replace(/^\s*⚠️?\s*/u, ''));
    expect(warning.className).toContain('select-none');
    expect(fireEvent.copy(warning)).toBe(false);
    expect(fireEvent.contextMenu(warning)).toBe(false);
  });
});

describe('баннер профиля', () => {
  it('рисует фото баннера, если оно задано', async () => {
    vi.mocked(api.user).mockResolvedValue({ ...honest, bannerUrl: '/api/uploads/banner-1?t=x' });
    const { container } = render(
      <UserProfileSheet token="token" user={honest} mode="peer" onClose={() => undefined} />,
    );
    const banner = await waitFor(() => container.querySelector('[data-banner]')!);

    expect(banner.getAttribute('data-banner')).toBe('photo');
    expect(banner.querySelector('img')?.getAttribute('src')).toBe('/api/uploads/banner-1?t=x');
  });

  it('без фото заливает баннер цветом и не рисует картинку', async () => {
    vi.mocked(api.user).mockResolvedValue({ ...honest, bannerColor: '#7a5cff' });
    const { container } = render(
      <UserProfileSheet token="token" user={honest} mode="peer" onClose={() => undefined} />,
    );
    const banner = await waitFor(() => container.querySelector('[data-banner]')!);

    expect(banner.getAttribute('data-banner')).toBe('color');
    expect((banner as HTMLElement).style.backgroundColor).toBe('rgb(122, 92, 255)');
    expect(banner.querySelector('img')).toBeNull();
  });

  it('обводит аватар круглой подложкой, а не прямоугольным ring', async () => {
    const { container } = render(
      <UserProfileSheet token="token" user={honest} mode="peer" onClose={() => undefined} />,
    );
    // `ring` в Tailwind рисует тень по боксу обёртки аватара и на полосе баннера
    // выглядит квадратом — окантовку делаем круглой подложкой `rounded-full`.
    const frame = container.querySelector('span.rounded-full.bg-surface');
    expect(frame).not.toBeNull();
    expect(frame!.className).toContain('rounded-full');
    expect(container.querySelector('.ring-4')).toBeNull();
    expect(frame!.querySelector('span.rounded-full')).not.toBeNull();
  });
});

describe('кнопка дружбы в профиле', () => {
  it('без связи предлагает добавить и отправляет заявку', async () => {
    vi.mocked(api.user).mockResolvedValue({ ...honest, friendship: 'none' });
    vi.mocked(api.addFriend).mockResolvedValue('outgoing');
    render(<UserProfileSheet token="token" user={{ ...honest, friendship: 'none' }} mode="peer" onClose={() => undefined} />);

    const add = await waitFor(() => screen.getByRole('button', { name: /Добавить в друзья/ }));
    fireEvent.click(add);

    await waitFor(() => expect(api.addFriend).toHaveBeenCalledWith('token', honest.id));
    // После заявки кнопка честно показывает, что ответа ещё ждут.
    await waitFor(() => expect(screen.getByRole('button', { name: /Заявка отправлена/ })).toBeDefined());
  });

  it('входящую заявку принимает, а не отправляет встречную', async () => {
    vi.mocked(api.user).mockResolvedValue({ ...honest, friendship: 'incoming' });
    vi.mocked(api.acceptFriend).mockResolvedValue('friends');
    render(<UserProfileSheet token="token" user={{ ...honest, friendship: 'incoming' }} mode="peer" onClose={() => undefined} />);

    const accept = await waitFor(() => screen.getByRole('button', { name: /Принять заявку/ }));
    fireEvent.click(accept);

    await waitFor(() => expect(api.acceptFriend).toHaveBeenCalledWith('token', honest.id));
    expect(api.addFriend).not.toHaveBeenCalled();
  });

  it('у друзей подпись говорит о дружбе и позволяет её прекратить', async () => {
    vi.mocked(api.user).mockResolvedValue({ ...honest, friendship: 'friends' });
    vi.mocked(api.removeFriend).mockResolvedValue('none');
    render(<UserProfileSheet token="token" user={{ ...honest, friendship: 'friends' }} mode="peer" onClose={() => undefined} />);

    const remove = await waitFor(() => screen.getByRole('button', { name: /Вы друзья/ }));
    fireEvent.click(remove);

    await waitFor(() => expect(api.removeFriend).toHaveBeenCalledWith('token', honest.id));
  });

  it('в удалённом профиле кнопки дружбы нет — добавить некого', async () => {
    const removed: User = { ...honest, isDeleted: true, friendship: 'none' };
    vi.mocked(api.user).mockResolvedValue(removed);
    render(<UserProfileSheet token="token" user={removed} mode="peer" onClose={() => undefined} />);

    await waitFor(() => screen.getByRole('dialog'));
    expect(screen.queryByRole('button', { name: /Добавить в друзья/ })).toBeNull();
  });
});

describe('выдача отметки BOT из профиля', () => {
  beforeEach(() => {
    vi.mocked(api.user).mockResolvedValue(honest);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.mocked(window.confirm).mockRestore();
  });

  it('кнопка видна только владельцу', () => {
    const { unmount } = render(
      <UserProfileSheet
        token="token"
        user={honest}
        mode="peer"
        viewerIsOwner
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /Выдать отметку BOT/ })).toBeDefined();
    unmount();

    render(<UserProfileSheet token="token" user={honest} mode="peer" onClose={() => undefined} />);
    expect(screen.queryByRole('button', { name: /Выдать отметку BOT/ })).toBeNull();
  });

  it('в своём профиле кнопки нет — себе метку поставить нельзя', () => {
    render(
      <UserProfileSheet
        token="token"
        user={honest}
        mode="own"
        viewerIsOwner
        onEdit={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /Выдать отметку BOT/ })).toBeNull();
  });

  it('после подтверждения ставит метку и переключает кнопку на снятие', async () => {
    vi.mocked(api.adminSetBot).mockResolvedValue({ ...honest, isBot: true });
    render(
      <UserProfileSheet
        token="token"
        user={honest}
        mode="peer"
        viewerIsOwner
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Выдать отметку BOT/ }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.adminSetBot).toHaveBeenCalledWith('token', honest.id, true));
    // Кнопка сразу показывает новое состояние: метка стоит, дальше — снимать.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Снять отметку BOT/ })).toBeDefined(),
    );
  });

  it('отмена подтверждения ничего не отправляет', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(
      <UserProfileSheet
        token="token"
        user={honest}
        mode="peer"
        viewerIsOwner
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Выдать отметку BOT/ }));
    expect(api.adminSetBot).not.toHaveBeenCalled();
  });

  it('отказ сервера показывает ошибку и оставляет кнопку', async () => {
    vi.mocked(api.adminSetBot).mockRejectedValue(
      new ApiError('Нельзя пометить ботом свой аккаунт', 400),
    );
    render(
      <UserProfileSheet
        token="token"
        user={honest}
        mode="peer"
        viewerIsOwner
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Выдать отметку BOT/ }));
    // Ошибка рендерится обычным абзацем, без роли alert — ищем по тексту.
    await waitFor(() =>
      expect(screen.getByText('Нельзя пометить ботом свой аккаунт')).toBeDefined(),
    );
    expect(screen.getByRole('button', { name: /Выдать отметку BOT/ })).toBeDefined();
  });

  it('у удалённого аккаунта метку не выдают — сначала возврат', () => {
    const removed: User = { ...honest, isDeleted: true };
    vi.mocked(api.user).mockResolvedValue(removed);
    render(
      <UserProfileSheet
        token="token"
        user={removed}
        mode="peer"
        viewerIsOwner
        onClose={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /Выдать отметку BOT/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Вернуть аккаунт/ })).toBeDefined();
  });
});
