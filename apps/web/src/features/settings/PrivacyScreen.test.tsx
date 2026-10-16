import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallPrivacyRule, Conversation, User } from '../../types';
import { PrivacyScreen } from './PrivacyScreen';

const user: User = {
  id: 'user-1',
  displayName: 'Васька',
  username: 'vaskaime_001',
  showLastSeen: true,
  callPrivacy: 'everyone',
  callPrivacyAllowedUserIds: [],
  callPrivacyDeniedUserIds: [],
};

const peerUser: User = {
  id: 'user-2',
  displayName: 'Брат Дима',
  username: 'dima',
};

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    type: 'direct',
    title: 'Брат Дима',
    unreadCount: 0,
    updatedAt: new Date().toISOString(),
    otherUser: peerUser,
    memberIds: ['user-1', 'user-2'],
  },
];

function renderScreen(
  overrides: {
    user?: User;
    conversations?: Conversation[];
    onToggleLastSeen?: (value: boolean) => Promise<void>;
    onUpdateCallPrivacy?: (
      privacy: CallPrivacyRule,
      allowedUserIds: string[],
      deniedUserIds: string[],
    ) => Promise<void>;
    withBack?: boolean;
  } = {},
) {
  const onToggleLastSeen =
    overrides.onToggleLastSeen ?? vi.fn(async () => undefined);
  const onUpdateCallPrivacy =
    overrides.onUpdateCallPrivacy ?? vi.fn(async () => undefined);
  const onClose = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <PrivacyScreen
      user={overrides.user ?? user}
      conversations={overrides.conversations ?? mockConversations}
      onToggleLastSeen={onToggleLastSeen}
      onUpdateCallPrivacy={onUpdateCallPrivacy}
      onClose={onClose}
      {...(overrides.withBack ? { onBack } : {})}
    />,
  );
  return { ...view, onToggleLastSeen, onUpdateCallPrivacy, onClose, onBack };
}

afterEach(cleanup);

describe('экран «Конфиденциальность»', () => {
  it('переключатель «Время захода» берёт значение из профиля', () => {
    renderScreen({ user: { ...user, showLastSeen: false } });

    const toggle = screen.getByRole('switch', { name: 'Время захода' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('переключение уходит на сервер с новым значением', async () => {
    const onToggleLastSeen = vi.fn(async () => undefined);
    renderScreen({ onToggleLastSeen });

    fireEvent.click(screen.getByRole('switch', { name: 'Время захода' }));

    expect(onToggleLastSeen).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Время захода' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );
  });

  it('при ошибке сохранения переключатель возвращается назад', async () => {
    const onToggleLastSeen = vi.fn(async () => {
      throw new Error('Сервер недоступен');
    });
    renderScreen({ onToggleLastSeen });

    fireEvent.click(screen.getByRole('switch', { name: 'Время захода' }));

    await waitFor(() => expect(screen.getByText('Сервер недоступен')).toBeTruthy());
    expect(screen.getByRole('switch', { name: 'Время захода' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('недоступные разделы помечены «скоро», а звонки доступны', () => {
    renderScreen();

    expect(screen.queryByRole('switch', { name: 'Звонки' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Сообщения' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'День рождения' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Приглашения' })).toBeNull();

    expect(screen.getByText('Звонки')).toBeTruthy();
    expect(screen.getAllByText('скоро')).toHaveLength(3);
  });

  it('переход в экран звонков и переключение правила на «Никто»', async () => {
    const onUpdateCallPrivacy = vi.fn(async () => undefined);
    renderScreen({ onUpdateCallPrivacy });

    // Кликаем по кнопке перехода в звонки ("Все")
    fireEvent.click(screen.getByText('Все'));

    // Открылся экран Звонки
    expect(screen.getByText('Кто может звонить мне')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Все' })).toHaveAttribute('aria-checked', 'true');

    // Переключаем на «Никто»
    fireEvent.click(screen.getByRole('radio', { name: 'Никто' }));
    expect(onUpdateCallPrivacy).toHaveBeenCalledWith('nobody', [], []);
  });

  it('добавление исключений через модальное окно', async () => {
    const onUpdateCallPrivacy = vi.fn(async () => undefined);
    renderScreen({
      user: { ...user, callPrivacy: 'nobody', callPrivacyAllowedUserIds: [] },
      onUpdateCallPrivacy,
    });

    // Открываем звонки
    fireEvent.click(screen.getByText('Никто'));

    // Кликаем «Всегда разрешать»
    fireEvent.click(screen.getByText('Всегда разрешать'));

    // Открылось модальное окно
    expect(screen.getByRole('dialog', { name: 'Всегда разрешать' })).toBeTruthy();
    expect(screen.getByText('Брат Дима')).toBeTruthy();

    // Выбираем «Брат Дима»
    fireEvent.click(screen.getByText('Брат Дима'));

    // Сохраняем
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => {
      expect(onUpdateCallPrivacy).toHaveBeenCalledWith('nobody', ['user-2'], []);
    });
  });

  it('Escape закрывает экран', () => {
    const { onClose } = renderScreen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('стрелка ведёт назад на прежний экран, а не закрывает всё', () => {
    const { onBack, onClose } = renderScreen({ withBack: true });

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape при заданном возврате тоже ведёт назад', () => {
    const { onBack, onClose } = renderScreen({ withBack: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('подписи берутся из словаря выбранного языка', () => {
    localStorage.setItem('yargram.lang', 'uk');
    renderScreen();

    expect(screen.getByText('Конфіденційність')).toBeTruthy();
    expect(screen.getByText('Час останнього входу')).toBeTruthy();
  });
});

beforeEach(() => {
  localStorage.clear();
});
