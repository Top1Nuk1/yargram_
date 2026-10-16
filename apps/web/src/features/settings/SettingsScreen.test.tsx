import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_KEY } from '../../lib/i18n';
import type { User } from '../../types';
import { SettingsScreen } from './SettingsScreen';

const user: User = {
  id: 'user-1',
  displayName: 'Васька',
  username: 'vaskaime_001',
};

function renderScreen(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const onOpenAccount = vi.fn();
  const onOpenLanguage = vi.fn();
  const onOpenPrivacy = vi.fn();
  const onOpenSessions = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <SettingsScreen
      user={user}
      onOpenAccount={onOpenAccount}
      onOpenLanguage={onOpenLanguage}
      onOpenPrivacy={onOpenPrivacy}
      onOpenSessions={onOpenSessions}
      onClose={onClose}
      {...overrides}
    />,
  );
  return {
    ...view,
    onOpenAccount,
    onOpenLanguage,
    onOpenPrivacy,
    onOpenSessions,
    onClose,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe('экран настроек: список разделов', () => {
  it('рабочие разделы нажимаются и открывают свои экраны', () => {
    const { onOpenAccount, onOpenLanguage, onOpenPrivacy, onOpenSessions } = renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /Мой аккаунт/ }));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^Язык/ }));
    expect(onOpenLanguage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Конфиденциальность/ }));
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Активные сеансы/ }));
    expect(onOpenSessions).toHaveBeenCalledTimes(1);
  });

  it('недоступные разделы выключены и подсказывают, что ещё в разработке', () => {
    // Раздел без реализации не должен притворяться рабочим: нажатие ничего
    // не открывает, а подсказка честно объясняет почему.
    const { onOpenAccount, onOpenLanguage, onOpenPrivacy } = renderScreen();
    const chats = screen.getByRole('button', { name: /Настройки чатов/ });

    expect(chats).toBeDisabled();
    expect(chats).toHaveAttribute('title', 'Этот раздел ещё в разработке.');

    fireEvent.click(chats);
    expect(onOpenAccount).not.toHaveBeenCalled();
    expect(onOpenLanguage).not.toHaveBeenCalled();
    expect(onOpenPrivacy).not.toHaveBeenCalled();
  });

  it('шапка-профиль открывает «Мой аккаунт» и показывает ник', () => {
    const { onOpenAccount } = renderScreen();

    expect(screen.getByText('@vaskaime_001')).toBeTruthy();
    fireEvent.click(screen.getByText('@vaskaime_001'));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it('поиск фильтрует разделы по переведённому названию', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }));

    const input = screen.getByPlaceholderText('Поиск в настройках');
    fireEvent.change(input, { target: { value: 'язык' } });

    expect(screen.getByRole('button', { name: /^Язык/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Настройки чатов/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Уведомления/ })).toBeNull();
  });

  it('пустой результат поиска объясняется, а не оставляет пустоту', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }));
    fireEvent.change(screen.getByPlaceholderText('Поиск в настройках'), {
      target: { value: 'ъъъъ' },
    });

    expect(screen.getByText('Ничего не найдено')).toBeTruthy();
  });

  it('Escape сначала закрывает поиск, и только вторая нажатие — экран', () => {
    const { onClose } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Поиск' }));
    const input = screen.getByPlaceholderText('Поиск в настройках');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Поиск в настройках')).toBeNull();
    expect(input.isConnected).toBe(false);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('подписи разделов берутся из словаря выбранного языка', () => {
    localStorage.setItem(LANGUAGE_KEY, 'uk');
    renderScreen();

    // Украинский словарь: «Конфіденційність» вместо «Конфиденциальность».
    expect(screen.getByRole('button', { name: /Конфіденційність/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Конфиденциальность/ })).toBeNull();
  });

  it('показывает текущий язык рядом с разделом «Язык»', () => {
    localStorage.setItem(LANGUAGE_KEY, 'bg');
    renderScreen();

    const item = screen.getByRole('button', { name: /^Език/ });
    expect(within(item).getByText('Български')).toBeTruthy();
  });
});
