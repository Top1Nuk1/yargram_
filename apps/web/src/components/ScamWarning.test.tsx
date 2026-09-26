import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScamWarning } from './ScamWarning';

const WARNING =
  '⚠️ Внимание: на этот аккаунт много жаловались в связи с мошенничеством или попытками выдать себя за официальный аккаунт.';

describe('ScamWarning', () => {
  it('показывает текст предупреждения', () => {
    const { container } = render(<ScamWarning text={WARNING} />);
    expect(container.textContent).toBe(WARNING);
  });

  it('не даёт выделить текст', () => {
    const { container } = render(<ScamWarning text={WARNING} />);
    expect(container.querySelector('p')?.className).toContain('select-none');
  });

  it('гасит копирование, вырезание, контекстное меню и перетаскивание', () => {
    const { container } = render(<ScamWarning text={WARNING} />);
    const warning = container.querySelector('p') as HTMLParagraphElement;
    // fireEvent возвращает false, когда обработчик отменил действие по умолчанию.
    expect(fireEvent.copy(warning)).toBe(false);
    expect(fireEvent.cut(warning)).toBe(false);
    expect(fireEvent.contextMenu(warning)).toBe(false);
    expect(fireEvent.dragStart(warning)).toBe(false);
  });

  it('дополняет переданные классы, а не затирает их', () => {
    const { container } = render(<ScamWarning text={WARNING} className="text-sm text-ink" />);
    const className = container.querySelector('p')?.className ?? '';
    expect(className).toContain('select-none');
    expect(className).toContain('text-ink');
  });
});
