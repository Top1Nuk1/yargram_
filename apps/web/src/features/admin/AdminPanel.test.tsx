import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { AdminGroup, User } from '../../types';
import { AdminPanel } from './AdminPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      adminSearchGroups: vi.fn(),
      adminSetGroupMarks: vi.fn(),
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
  inviteCode: 'invite-code',
};

function renderPanel() {
  const onChanged = vi.fn();
  const view = render(
    <AdminPanel token="token" viewer={owner} onClose={() => undefined} onChanged={onChanged} />,
  );
  return { ...view, onChanged };
}

beforeEach(() => {
  vi.mocked(api.adminSearchGroups).mockResolvedValue([group]);
  vi.mocked(api.adminSetGroupMarks).mockImplementation(async (_token, _groupId, input) => ({
    ...group,
    ...input,
  }));
});

afterEach(cleanup);

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
