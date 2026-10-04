import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LanguageProvider } from '../lib/useLandingLanguage';

/**
 * Переключатель живёт внутри `LanguageProvider` (он тянет оттуда текущий язык
 * и функцию выбора), поэтому каждый рендер оборачиваем в провайдер. Кнопка
 * показывает двухбуквенный код, а раскрытое меню — шесть пунктов-радио.
 */
function renderSwitcher() {
  return render(
    <LanguageProvider>
      <LanguageSwitcher />
    </LanguageProvider>,
  );
}

const storageKey = 'yargram.landing.lang';

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  document.documentElement.removeAttribute('lang');
});

describe('LanguageSwitcher', () => {
  it('показывает текущий язык и закрыт по умолчанию', () => {
    renderSwitcher();
    const toggle = screen.getByRole('button', { name: /русский/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Двухбуквенный код русского на кнопке.
    expect(toggle).toHaveTextContent('RU');
  });

  it('по клику раскрывает меню из шести языков', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /русский/i }));
    const menu = screen.getByRole('menu', { name: 'Язык' });
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /русский/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('выбор английского меняет язык, сохраняет выбор и закрывает меню', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: /русский/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /english/i }));

    // Выбор запомнен на устройстве и отражён в <html lang>.
    expect(localStorage.getItem(storageKey)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    // Кнопка теперь показывает английский код и снова закрыта.
    const toggle = screen.getByRole('button', { name: /english/i });
    expect(toggle).toHaveTextContent('EN');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape закрывает раскрытое меню', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: /русский/i }));
    expect(screen.getByRole('button', { name: /русский/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('клик вне переключателя закрывает меню', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: /русский/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('активный язык помечен в меню как выбранный', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: /русский/i }));

    const active = screen.getByRole('menuitemradio', { name: /русский/i });
    expect(active).toHaveAttribute('aria-checked', 'true');
    const others = screen.getAllByRole('menuitemradio').filter((el) => el !== active);
    for (const item of others) {
      expect(item).toHaveAttribute('aria-checked', 'false');
    }
  });
});
