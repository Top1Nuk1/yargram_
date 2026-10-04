import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_KEY } from '../../lib/i18n';
import { LanguageScreen } from './LanguageScreen';

function renderScreen(options: { withBack?: boolean } = {}) {
  const onClose = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <LanguageScreen onClose={onClose} {...(options.withBack ? { onBack } : {})} />,
  );
  return { ...view, onClose, onBack };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe('экран «Язык»', () => {
  it('показывает все языки: своим названием и по-английски', () => {
    renderScreen();

    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('Russian')).toBeTruthy();
    expect(screen.getByText('Українська')).toBeTruthy();
    expect(screen.getByText('Ukrainian')).toBeTruthy();
    expect(screen.getByText('Беларуская')).toBeTruthy();
    expect(screen.getByText('Ελληνικά')).toBeTruthy();
    expect(screen.getByText('Greek')).toBeTruthy();
  });

  it('текущий язык отмечен в списке', () => {
    localStorage.setItem(LANGUAGE_KEY, 'bg');
    renderScreen();

    const selected = screen
      .getAllByRole('radio')
      .filter((node) => node.getAttribute('aria-checked') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Български');
  });

  it('выбор не применяется до нажатия ОК', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Українська'));
    // Выбор только подсвечивается: язык устройства остаётся прежним.
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ОК' }));
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('uk');
  });

  it('ОК применяет выбранный язык и закрывает экран', () => {
    const { onClose } = renderScreen();

    fireEvent.click(screen.getByText('Ελληνικά'));
    fireEvent.click(screen.getByRole('button', { name: 'ОК' }));

    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('el');
    expect(onClose).toHaveBeenCalled();
  });

  it('поиск ищет и по своему названию языка, и по английскому', () => {
    renderScreen();

    fireEvent.change(screen.getByPlaceholderText('Поиск'), { target: { value: 'greek' } });
    expect(screen.getByText('Ελληνικά')).toBeTruthy();
    expect(screen.queryByText('Русский')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Поиск'), { target: { value: 'бела' } });
    expect(screen.getByText('Беларуская')).toBeTruthy();
    expect(screen.queryByText('Ελληνικά')).toBeNull();
  });

  it('переключатели перевода выключены и не притворяются рабочими', () => {
    // Сам перевод сообщений ещё не сделан: тумблер выключен, а Premium-пункт
    // помечен, чтобы список совпадал с макетом, но не обещал лишнего.
    renderScreen();

    const showTranslate = screen.getByRole('button', { name: /Показать кнопку/ });
    const translateChats = screen.getByRole('button', { name: /Переводить чаты целиком/ });

    expect(showTranslate).toBeDisabled();
    expect(translateChats).toBeDisabled();
    expect(translateChats.textContent).toContain('Premium');
  });

  it('Escape закрывает экран', () => {
    const { onClose } = renderScreen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('стрелка ведёт назад на прежний экран, а не закрывает всё', () => {
    // Экран открывают из списка настроек: стрелка должна вернуть туда же,
    // а не выбросить в мессенджер.
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

  it('без возврата стрелка по-прежнему закрывает экран', () => {
    const { onClose } = renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalled();
  });
});
