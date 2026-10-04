import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { PrivacyScreen } from './PrivacyScreen';

const user: User = {
  id: 'user-1',
  displayName: 'Васька',
  username: 'vaskaime_001',
  showLastSeen: true,
};

function renderScreen(
  overrides: {
    user?: User;
    onToggleLastSeen?: (value: boolean) => Promise<void>;
    withBack?: boolean;
  } = {},
) {
  const onToggleLastSeen =
    overrides.onToggleLastSeen ?? vi.fn(async () => undefined);
  const onClose = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <PrivacyScreen
      user={overrides.user ?? user}
      onToggleLastSeen={onToggleLastSeen}
      onClose={onClose}
      {...(overrides.withBack ? { onBack } : {})}
    />,
  );
  return { ...view, onToggleLastSeen, onClose, onBack };
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

    // false, потому что в профиле было true.
    expect(onToggleLastSeen).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Время захода' })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    );
  });

  it('при ошибке сохранения переключатель возвращается назад', async () => {
    // Оптимистичное переключение не должно оставлять пользователя с тем, чего
    // сервер не принял.
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

  it('недоступные разделы помечены, а не притворяются рабочими', () => {
    renderScreen();

    // У разделов без реализации нет переключателя вообще: иначе он выглядел бы
    // как рабочая настройка, которая ничего не меняет.
    expect(screen.queryByRole('switch', { name: 'Звонки' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Сообщения' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'День рождения' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Приглашения' })).toBeNull();

    expect(screen.getByText('Звонки')).toBeTruthy();
    expect(screen.getAllByText('скоро')).toHaveLength(4);
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
