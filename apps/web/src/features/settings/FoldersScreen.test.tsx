import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatFolder, Conversation, User } from '../../types';
import { FoldersScreen } from './FoldersScreen';

const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Тестовый Пользователь',
  bio: '',
  lastSeenAt: new Date().toISOString(),
  showLastSeen: true,
  createdAt: new Date().toISOString(),
};

const mockFolders: ChatFolder[] = [
  {
    id: 'folder-1',
    userId: 'user-1',
    name: 'Работа',
    position: 0,
    conversationIds: ['conv-1', 'conv-2'],
    icon: 'briefcase',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    type: 'direct',
    title: 'Иван',
    participants: [{ id: 'user-2', displayName: 'Иван' } as any],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-2',
    type: 'group',
    title: 'Основная группа',
    memberCount: 5,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-3',
    type: 'direct',
    title: 'Анна',
    unreadCount: 2,
    participants: [{ id: 'user-3', displayName: 'Анна' } as any],
    updatedAt: new Date().toISOString(),
  },
];

describe('FoldersScreen', () => {
  it('renders folders screen header and folder list', () => {
    render(
      <FoldersScreen
        user={mockUser}
        folders={mockFolders}
        conversations={mockConversations}
        onFolderCreate={vi.fn()}
        onFolderUpdate={vi.fn()}
        onFolderDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Папки с чатами')).toBeDefined();
    expect(screen.getByText('Работа')).toBeDefined();
    expect(screen.getByText('2 чата')).toBeDefined();
    expect(screen.getByText('Создать новую папку')).toBeDefined();
  });

  it('renders recommended folders and allows adding one', async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <FoldersScreen
        user={mockUser}
        folders={mockFolders}
        conversations={mockConversations}
        onFolderCreate={handleCreate}
        onFolderUpdate={vi.fn()}
        onFolderDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Рекомендованные папки')).toBeDefined();
    expect(screen.getByText('Личные')).toBeDefined();
    expect(screen.getByText('Группы')).toBeDefined();

    const addButtons = screen.getAllByRole('button', { name: 'Добавить' });
    expect(addButtons.length).toBeGreaterThan(0);

    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalled();
    });
  });

  it('opens folder creation modal, selects custom icon, and saves', async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <FoldersScreen
        user={mockUser}
        folders={mockFolders}
        conversations={mockConversations}
        onFolderCreate={handleCreate}
        onFolderUpdate={vi.fn()}
        onFolderDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Создать новую папку'));
    expect(screen.getByText('Новая папка')).toBeDefined();

    // Type folder name
    const input = screen.getByPlaceholderText('Название папки');
    fireEvent.change(input, { target: { value: 'Мои игры' } });

    // Open icon picker
    const iconBtn = screen.getByTitle('Выбрать значок');
    fireEvent.click(iconBtn);

    expect(screen.getByText('Выберите значок')).toBeDefined();
    // Click on Gamepad icon ("Игры")
    const gamepadIcon = screen.getByTitle('Игры');
    fireEvent.click(gamepadIcon);

    // Save folder
    const createBtn = screen.getByRole('button', { name: 'Создать' });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Мои игры',
          icon: 'gamepad',
        }),
      );
    });
  });

  it('opens delete confirmation modal and confirms deletion', async () => {
    const handleDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <FoldersScreen
        user={mockUser}
        folders={mockFolders}
        conversations={mockConversations}
        onFolderCreate={vi.fn()}
        onFolderUpdate={vi.fn()}
        onFolderDelete={handleDelete}
        onClose={vi.fn()}
      />,
    );

    const deleteBtn = screen.getAllByTitle('Удалить папку')[0];
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Удалить папку?')).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: 'Удалить' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalledWith('folder-1');
    });
  });

  it('allows picking included and excluded chat types and conversations', async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <FoldersScreen
        user={mockUser}
        folders={mockFolders}
        conversations={mockConversations}
        onFolderCreate={handleCreate}
        onFolderUpdate={vi.fn()}
        onFolderDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Создать новую папку'));
    const input = screen.getByPlaceholderText('Название папки');
    fireEvent.change(input, { target: { value: 'Кастомная папка' } });

    // Click "Добавить чаты" for included chats (first button)
    const addButtons = screen.getAllByRole('button', { name: /Добавить чаты/i });
    expect(addButtons.length).toBe(2);
    fireEvent.click(addButtons[0]);

    expect(screen.getByText('Чаты в папке')).toBeDefined();
    expect(screen.getByText('0 / 100')).toBeDefined();

    // Select "Группы" type
    const groupsType = screen.getByRole('button', { name: /Группы/i });
    fireEvent.click(groupsType);
    expect(screen.getByText('1 / 100')).toBeDefined();

    // Select conversation "Иван"
    const ivanConv = screen.getByRole('button', { name: /Иван/i });
    fireEvent.click(ivanConv);
    expect(screen.getByText('2 / 100')).toBeDefined();

    // Click "Сохранить" in picker
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // Now click "Добавить чаты" for excluded chats (second button)
    const addExcludedButtons = screen.getAllByRole('button', { name: /Добавить чаты/i });
    fireEvent.click(addExcludedButtons[1]);

    expect(screen.getByText('Чаты не в папке')).toBeDefined();

    // Select "Без уведомлений" type
    const mutedType = screen.getByRole('button', { name: /Без уведомлений/i });
    fireEvent.click(mutedType);

    // Click "Сохранить" in exclusion picker
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // Save the folder
    const createBtn = screen.getByRole('button', { name: 'Создать' });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Кастомная папка',
          includedChatTypes: ['groups'],
          conversationIds: ['conv-1'],
          excludedChatTypes: ['muted'],
          excludedConversationIds: [],
        }),
      );
    });
  });
});

