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

  it('puts the admin panel between the settings and the night mode toggle', () => {
    const { container } = renderSidebar(user({ isOwner: true }));
    const labels = menuLabels(container);
    const settings = labels.findIndex((label) => label === 'Настройки');
    const admin = labels.findIndex((label) => label === 'Админ-панель');
    const theme = labels.findIndex((label) => label.startsWith('Ночной режим'));
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(admin).toBe(settings + 1);
    expect(theme).toBe(admin + 1);
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
});
