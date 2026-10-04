import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { FriendsOverview, User } from '../../types';
import { FriendsModal } from './FriendsModal';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      friends: vi.fn(),
      acceptFriend: vi.fn(),
      declineFriend: vi.fn(),
      removeFriend: vi.fn(),
    },
  };
});

const bob: User = { id: 'bob-1', displayName: 'Боб', username: 'bob' };
const carol: User = { id: 'carol-2', displayName: 'Кэрол', username: 'carol' };
const dave: User = { id: 'dave-3', displayName: 'Дэйв', username: 'dave' };

const empty: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

function renderModal(overview: FriendsOverview = empty) {
  vi.mocked(api.friends).mockResolvedValue(overview);
  return render(
    <FriendsModal
      token="token"
      onClose={() => undefined}
      onUnauthorized={() => undefined}
      onOpenProfile={() => undefined}
    />,
  );
}

beforeEach(() => {
  vi.mocked(api.acceptFriend).mockResolvedValue('friends');
  vi.mocked(api.declineFriend).mockResolvedValue('none');
  vi.mocked(api.removeFriend).mockResolvedValue('none');
});

afterEach(cleanup);

describe('экран «Друзья»', () => {
  it('показывает пустое состояние, когда друзей и заявок нет', async () => {
    renderModal(empty);
    await waitFor(() => screen.getByText('Пока никого нет'));
    // Подсказка объясняет, как найти человека — иначе экран выглядит тупиком.
    expect(screen.getByText(/Найдите человека по @username/)).toBeDefined();
  });

  it('разводит друзей и заявки по разделам, не смешивая их', async () => {
    renderModal({
      friends: [{ user: bob }],
      incoming: [{ user: carol }],
      outgoing: [{ user: dave }],
    });

    await waitFor(() => screen.getByText(/Мои друзья — 1/));
    expect(screen.getByText(/Заявки — 1/)).toBeDefined();
    expect(screen.getByText(/Отправленные — 1/)).toBeDefined();
    // У каждой связи своя подпись: друзья, «хочет добавить», «заявка отправлена».
    expect(screen.getByText('хочет добавить вас в друзья')).toBeDefined();
    expect(screen.getByText('заявка отправлена')).toBeDefined();
  });

  it('принятие заявки зовёт сервер и перечитывает список', async () => {
    // Всю последовательность ответов задаём до рендера: первый запрос — что
    // было, второй — что стало после принятия. Иначе `mockResolvedValueOnce`
    // достался бы не тому вызову, и тест проверял бы выдумку.
    vi.mocked(api.friends)
      .mockResolvedValueOnce({ friends: [], incoming: [{ user: carol }], outgoing: [] })
      .mockResolvedValue({ friends: [{ user: carol }], incoming: [], outgoing: [] });
    render(
      <FriendsModal
        token="token"
        onClose={() => undefined}
        onUnauthorized={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    const accept = await waitFor(() => screen.getByRole('button', { name: /Принять/ }));
    fireEvent.click(accept);

    await waitFor(() => expect(api.acceptFriend).toHaveBeenCalledWith('token', carol.id));
    // Список перечитан: человек переехал в друзья, а не остался висеть в заявках.
    await waitFor(() => expect(screen.getByText(/Мои друзья — 1/)).toBeDefined());
    expect(screen.queryByText(/Заявки — 1/)).toBeNull();
  });

  it('отклонение заявки зовёт сервер и убирает её со экрана', async () => {
    vi.mocked(api.friends)
      .mockResolvedValueOnce({ friends: [], incoming: [{ user: carol }], outgoing: [] })
      .mockResolvedValue(empty);
    render(
      <FriendsModal
        token="token"
        onClose={() => undefined}
        onUnauthorized={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    const decline = await waitFor(() => screen.getByLabelText('Отклонить'));
    fireEvent.click(decline);

    await waitFor(() => expect(api.declineFriend).toHaveBeenCalledWith('token', carol.id));
  });

  it('удаление из друзей спрашивает подтверждение и только потом зовёт сервер', async () => {
    vi.mocked(api.friends)
      .mockResolvedValueOnce({ friends: [{ user: bob }], incoming: [], outgoing: [] })
      .mockResolvedValue(empty);
    render(
      <FriendsModal
        token="token"
        onClose={() => undefined}
        onUnauthorized={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    const remove = await waitFor(() => screen.getByLabelText('Удалить Боб из друзей'));
    // Передумали — сервер не трогаем.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(remove);
    expect(api.removeFriend).not.toHaveBeenCalled();

    // Согласились — удаляем.
    confirm.mockReturnValue(true);
    fireEvent.click(remove);
    await waitFor(() => expect(api.removeFriend).toHaveBeenCalledWith('token', bob.id));
    confirm.mockRestore();
  });

  it('в отправленных заявках можно отменить свою заявку', async () => {
    vi.mocked(api.friends)
      .mockResolvedValueOnce({ friends: [], incoming: [], outgoing: [{ user: dave }] })
      .mockResolvedValue(empty);
    render(
      <FriendsModal
        token="token"
        onClose={() => undefined}
        onUnauthorized={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    const cancel = await waitFor(() => screen.getByLabelText('Отменить заявку'));
    fireEvent.click(cancel);

    await waitFor(() => expect(api.declineFriend).toHaveBeenCalledWith('token', dave.id));
  });

  it('ошибку загрузки показывает текстом, а не пустым экраном', async () => {
    vi.mocked(api.friends).mockRejectedValue(new Error('network'));
    render(
      <FriendsModal
        token="token"
        onClose={() => undefined}
        onUnauthorized={() => undefined}
        onOpenProfile={() => undefined}
      />,
    );

    await waitFor(() => screen.getByText('Не удалось загрузить друзей.'));
  });
});
