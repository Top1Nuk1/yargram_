import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HighlightedText } from './MessageExtras';

describe('HighlightedText', () => {
  it('рендерит обычный текст без ссылок', () => {
    const { container } = render(<HighlightedText text="Привет, как дела?" query="" />);
    expect(container.textContent).toBe('Привет, как дела?');
    expect(container.querySelector('a')).toBeNull();
  });

  it('автоматически распознает внешнюю ссылку и делает её открывающейся в новой вкладке браузера', () => {
    const { container } = render(<HighlightedText text="Посети https://example.com чтобы начать" query="" />);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('https://example.com');
  });

  it('распознает внутреннюю ссылку YarGram и открывает её бесшовно в текущем окне', () => {
    const { container } = render(<HighlightedText text="Вступай: https://yargram.site/join/test-code" query="" />);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://yargram.site/join/test-code');
    expect(link?.getAttribute('target')).toBeNull();
    expect(link?.getAttribute('rel')).toBeNull();
  });

  it('предотвращает всплытие клика (не перекидывает приложение)', () => {
    const parentClickHandler = vi.fn();
    const { container } = render(
      <div onClick={parentClickHandler}>
        <HighlightedText text="Ссылка: https://external-domain.org" query="" />
      </div>,
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    fireEvent.click(link!);
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
