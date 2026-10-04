import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_SCALE_MAX, UI_SCALE_MIN, readUiScale } from '../../lib/uiScale';
import { ScaleScreen } from './ScaleScreen';

function renderScreen() {
  const onClose = vi.fn();
  render(<ScaleScreen onClose={onClose} />);
  return { onClose };
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('экран масштаба', () => {
  it('показывает обычный размер, если человек ещё ничего не выбирал', () => {
    renderScreen();
    expect(screen.getByText('100%', { selector: '[data-scale-value]' })).toBeDefined();
  });

  it('ползунок ограничен 50% и 300%', () => {
    renderScreen();
    const slider = screen.getByLabelText('Размер') as HTMLInputElement;
    expect(Number(slider.min)).toBe(UI_SCALE_MIN);
    expect(Number(slider.max)).toBe(UI_SCALE_MAX);
  });

  it('меняет масштаб сразу: и на документе, и в хранилище', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Размер'), { target: { value: '175' } });

    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.75');
    expect(readUiScale()).toBe(175);
    expect(screen.getByText('175%', { selector: '[data-scale-value]' })).toBeDefined();
  });

  it('готовое значение применяется одним нажатием', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: '150%' }));

    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.5');
    expect(readUiScale()).toBe(150);
  });

  it('кнопка возвращает обычный размер и снимает zoom', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: '300%' }));
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('3');

    fireEvent.click(screen.getByRole('button', { name: /Обычный размер/ }));
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('');
    expect(readUiScale()).toBe(100);
  });

  it('Escape закрывает экран', () => {
    const { onClose } = renderScreen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
