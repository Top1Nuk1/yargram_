import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmojiPicker } from './MessageExtras';
import { COMPOSER_EMOJIS, MESSAGE_REACTIONS } from './messengerUtils';

afterEach(cleanup);

describe('панель эмодзи', () => {
  it('не сжимается по ширине кнопки, у которой открылась', () => {
    render(<EmojiPicker onSelect={vi.fn()} onClose={vi.fn()} className="absolute bottom-14 right-0" />);
    const panel = screen.getByRole('dialog', { name: 'Выбор эмодзи' });
    // Без w-max абсолютная панель сжималась до ширины кнопки и значки вылезали.
    expect(panel.className).toContain('w-max');
    expect(panel.className).toContain('max-w-[min(92vw,22rem)]');
  });

  it('показывает все значки сеткой и отдаёт выбранный', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} onClose={vi.fn()} />);
    const grid = screen.getByRole('dialog').querySelector('.grid-cols-7') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.className).toContain('grid-cols-7');
    const buttons = screen.getAllByRole('button', { name: /^Выбрать / });
    expect(buttons.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: `Выбрать ${COMPOSER_EMOJIS[0]}` }));
    expect(onSelect).toHaveBeenCalledWith(COMPOSER_EMOJIS[0]);
  });

  it('в режиме реакции показывает только реакции', () => {
    render(<EmojiPicker mode="reaction" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Выбор реакции' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(MESSAGE_REACTIONS.length);
  });
});
