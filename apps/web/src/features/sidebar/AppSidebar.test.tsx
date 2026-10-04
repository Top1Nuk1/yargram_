import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AppSidebar } from './AppSidebar';
import type { StoredAccount } from '../../lib/accounts';
import type { User } from '../../types';

function user(overrides: Partial<User> = {}): User {
  return { id: 'u-1', displayName: 'Владелец', username: 'owner', ...overrides };
}

function renderSidebar(currentUser: User, accounts: StoredAccount[] = [{ token: 't-1', user: currentUser }]) {
  const onAction = vi.fn();
  const { container } = render(
    <AppSidebar
      currentUser={currentUser}
      accounts={accounts}
      activeToken={accounts[0]?.token ?? 't-1'}
      theme="light"
      onAction={onAction}
      onSwitchAccount={vi.fn()}
      onAddAccount={vi.fn()}
      onRemoveAccount={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return { onAction, container };
}

/** Все подписи меню по порядку — чтобы проверять соседство пунктов. */
function menuLabels(container: HTMLElement): string[] {
  const nav = container.querySelector('nav[aria-label="Главное меню"]');
  return Array.from(nav?.querySelectorAll('button') ?? []).map((button) => button.textContent ?? '');
}

describe('AppSidebar', () => {
  it('shows the admin panel only to the owner', () => {
    const { container } = renderSidebar(user({ isOwner: true }));
    expect(menuLabels(container)).toContain('Админ-панель');
  });

  it('hides the admin panel from a regular account', () => {
    const { container } = renderSidebar(user());
    expect(menuLabels(container)).not.toContain('Админ-панель');
  });

  it('ставит поддержку и админ-панель между настройками и ночным режимом', () => {
    const { container } = renderSidebar(user({ isOwner: true }));
    const labels = menuLabels(container);
    const settings = labels.findIndex((label) => label === 'Настройки');
    const support = labels.findIndex((label) => label === 'Поддержка');
    const admin = labels.findIndex((label) => label === 'Админ-панель');
    const theme = labels.findIndex((label) => label.startsWith('Ночной режим'));
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(support).toBe(settings + 1);
    expect(admin).toBe(support + 1);
    expect(theme).toBe(admin + 1);
  });

  it('показывает поддержку всем, а не только владельцу', () => {
    expect(menuLabels(renderSidebar(user()).container)).toContain('Поддержка');
  });

  it('открывает поддержку через пункт меню', () => {
    const { onAction, container } = renderSidebar(user());
    const row = Array.from(container.querySelectorAll('nav button')).find(
      (button) => button.textContent === 'Поддержка',
    );
    expect(row).toBeTruthy();
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onAction).toHaveBeenCalledWith('support');
  });

  it('opens the admin panel through the menu action', () => {
    const { onAction, container } = renderSidebar(user({ isOwner: true }));
    const row = Array.from(container.querySelectorAll('nav button')).find(
      (button) => button.textContent === 'Админ-панель',
    );
    expect(row).toBeTruthy();
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onAction).toHaveBeenCalledWith('admin');
  });

  /** Кнопка «Добавить аккаунт» из переключателя профилей. */
  function addAccountButton(container: HTMLElement): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Добавить аккаунт',
    ) as HTMLButtonElement | undefined;
  }

  it('закрывает добавление аккаунта на пределе устройства и объясняет почему', () => {
    const accounts: StoredAccount[] = Array.from({ length: 3 }, (_, index) => ({
      token: `t-${index}`,
      user: user({ id: `u-${index}`, username: `user${index}` }),
    }));
    const { container } = renderSidebar(accounts[0]!.user, accounts);
    expect(addAccountButton(container)?.disabled).toBe(true);
    expect(container.textContent).toContain('Предел устройства — 3 аккаунта');
  });

  it('поднимает предел до четырёх, когда у аккаунта есть галочка', () => {
    const accounts: StoredAccount[] = [
      { token: 't-0', user: user({ id: 'u-0', isVerified: true }) },
      { token: 't-1', user: user({ id: 'u-1' }) },
      { token: 't-2', user: user({ id: 'u-2' }) },
    ];
    const { container } = renderSidebar(accounts[0]!.user, accounts);
    expect(addAccountButton(container)?.disabled).toBe(false);
    expect(container.textContent).not.toContain('Предел устройства');
  });

  it('не ограничивает владельца', () => {
    const accounts: StoredAccount[] = Array.from({ length: 6 }, (_, index) => ({
      token: `t-${index}`,
      user: user({ id: `u-${index}`, isOwner: index === 0 }),
    }));
    const { container } = renderSidebar(accounts[0]!.user, accounts);
    expect(addAccountButton(container)?.disabled).toBe(false);
  });
});
