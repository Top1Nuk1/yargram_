import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HighlightedText } from './MessageExtras';

describe('HighlightedText', () => {
  it('рендерит обычный текст без ссылок', () => {
    const { container } = render(<HighlightedText text="Привет, как дела?" query="" />);
    expect(container.textContent).toBe('Привет, как дела?');
    expect(container.querySelector('a')).toBeNull();
  });

  it('автоматически распознает ссылку и делает её открывающейся в новой вкладке браузера', () => {
    const { container } = render(<HighlightedText text="Посети https://yargram.site/app чтобы начать" query="" />);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://yargram.site/app');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('https://yargram.site/app');
  });

  it('предотвращает всплытие клика (не перекидывает приложение)', () => {
    const parentClickHandler = vi.fn();
    render(
      <div onClick={parentClickHandler}>
        <HighlightedText text="Ссылка: https://example.com" query="" />
      </div>,
    );
    const link = screen.getByText('https://example.com');
    fireEvent.click(link);
    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('подсвечивает поисковый запрос и сохраняет ссылку активной', () => {
    const { container } = render(
      <HighlightedText text="Смотри https://google.com и ищи" query="google" />,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('google');
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://google.com');
  });
});
