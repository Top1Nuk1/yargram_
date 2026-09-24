import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PollDialog } from './PollDialog';

function renderDialog(onSubmit = vi.fn()) {
  render(<PollDialog busy={false} onClose={vi.fn()} onSubmit={onSubmit} />);
  return onSubmit;
}

/** Заполняет вопрос и два варианта — минимальный опрос. */
function fillMinimal(question = 'Куда идём?', first = 'В горы', second = 'На речку') {
  fireEvent.change(screen.getByLabelText('Текст вопроса'), { target: { value: question } });
  fireEvent.change(screen.getByLabelText('Добавить ответ'), { target: { value: first } });
  fireEvent.change(screen.getByLabelText('Вариант 2'), { target: { value: second } });
}

afterEach(cleanup);

describe('окно «Новый опрос»', () => {
  it('не даёт создать опрос без вопроса и двух вариантов', () => {
    renderDialog();
    const create = screen.getByRole('button', { name: 'Создать' });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Текст вопроса'), { target: { value: 'Вопрос' } });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Добавить ответ'), { target: { value: 'Один' } });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Вариант 2'), { target: { value: 'Два' } });
    expect(create).toBeEnabled();
  });

  it('добавляет и убирает варианты, показывая остаток', () => {
    renderDialog();
    expect(screen.getByText('Можно добавить ещё 10 вариантов ответа.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить ответ…' }));
    expect(screen.getByLabelText('Вариант 3')).toBeInTheDocument();
    expect(screen.getByText('Можно добавить ещё 9 вариантов ответа.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить вариант 3' }));
    expect(screen.queryByLabelText('Вариант 3')).toBeNull();
  });

  it('включает отметку правильных ответов и срок', () => {
    renderDialog();
    expect(screen.queryByLabelText('Правильный ответ: вариант 1')).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Правильный ответ' }));
    // Первый вариант сразу помечается правильным.
    expect(screen.getByLabelText('Правильный ответ: вариант 1')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByLabelText('Правильный ответ: вариант 2'));
    expect(screen.getByLabelText('Правильный ответ: вариант 2')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    expect(screen.queryByLabelText('Когда завершить опрос')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Ограничение срока' }));
    expect(screen.getByLabelText('Когда завершить опрос')).toBeInTheDocument();
  });

  it('отдаёт собранный опрос без пустых вариантов', () => {
    const onSubmit = renderDialog();
    fillMinimal();
    // Третий вариант остаётся пустым и в опрос не попадает.
    fireEvent.click(screen.getByRole('button', { name: 'Добавить ответ…' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Несколько ответов' }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0]?.[0];
    expect(draft).toMatchObject({
      question: 'Куда идём?',
      options: ['В горы', 'На речку'],
    });
    expect(draft.settings.multiple).toBe(true);
    expect(draft.settings.showNames).toBe(true);
  });

  it('показывает все семь настроек из макета', () => {
    renderDialog();
    const labels = [
      'Имена участников',
      'Несколько ответов',
      'Добавление вариантов',
      'Изменение ответа',
      'Случайный порядок',
      'Правильный ответ',
      'Ограничение срока',
    ];
    for (const label of labels) {
      expect(screen.getByRole('switch', { name: label })).toBeInTheDocument();
    }
    expect(within(screen.getByRole('dialog', { name: 'Новый опрос' })).getAllByRole('switch')).toHaveLength(7);
  });
});
