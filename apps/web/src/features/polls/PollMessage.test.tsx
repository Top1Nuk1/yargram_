import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PollSettings, PollView, User } from '../../types';
import { PollMessage } from './PollMessage';

const alice: User = { id: 'alice-1', displayName: 'Алиса' };
const bob: User = { id: 'bob-2', displayName: 'Боб' };
const users = new Map([
  [alice.id, alice],
  [bob.id, bob],
]);

function poll(patch: Partial<PollView> = {}, settings: Partial<PollSettings> = {}): PollView {
  return {
    question: 'Куда идём в субботу?',
    description: 'Выбираем маршрут',
    options: [
      { id: 'o1', text: 'В горы' },
      { id: 'o2', text: 'На речку' },
    ],
    settings: {
      showNames: true,
      multiple: false,
      addOptions: true,
      changeVote: true,
      shuffle: false,
      correctOptionIds: [],
      deadline: null,
      ...settings,
    },
    votes: {},
    closed: false,
    counts: { o1: 0, o2: 0 },
    totalVoters: 0,
    ...patch,
  };
}

function renderPoll(overrides: Partial<Parameters<typeof PollMessage>[0]> = {}) {
  const handlers = {
    onVote: vi.fn(),
    onAddOption: vi.fn(),
    onClosePoll: vi.fn(),
  };
  render(
    <PollMessage
      poll={poll()}
      currentUserId={alice.id}
      canVote
      busy={false}
      nameOf={(id) => users.get(id)}
      isAuthor={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe('опрос в переписке', () => {
  it('показывает вопрос, описание и варианты без результатов до первого голоса', () => {
    renderPoll();
    expect(screen.getByText('Куда идём в субботу?')).toBeInTheDocument();
    expect(screen.getByText('Выбираем маршрут')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /В горы/ })).toBeInTheDocument();
    expect(screen.getByText('Проголосовало: 0')).toBeInTheDocument();
    // Процентов нет, пока никто не голосовал.
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('в одиночном опросе выбор заменяет предыдущий', () => {
    const { onVote } = renderPoll();
    fireEvent.click(screen.getByRole('button', { name: /В горы/ }));
    expect(onVote).toHaveBeenCalledWith(['o1']);
  });

  it('в опросе с несколькими ответами выбор переключается', () => {
    const { onVote } = renderPoll({ poll: poll({}, { multiple: true }) });
    fireEvent.click(screen.getByRole('button', { name: /На речку/ }));
    expect(onVote).toHaveBeenCalledWith(['o2']);

    const withVote = renderPoll({
      poll: poll({ votes: { [alice.id]: ['o1'] }, counts: { o1: 1, o2: 0 }, totalVoters: 1 }, { multiple: true }),
    });
    fireEvent.click(screen.getAllByRole('button', { name: /В горы/ }).at(-1) as HTMLElement);
    expect(withVote.onVote).toHaveBeenCalledWith([]);
  });

  it('после голосования показывает числа и проценты', () => {
    renderPoll({
      poll: poll({
        votes: { [alice.id]: ['o1'], [bob.id]: ['o2'] },
        counts: { o1: 1, o2: 1 },
        totalVoters: 2,
      }),
    });
    expect(screen.getAllByText('1 · 50%')).toHaveLength(2);
    expect(screen.getByText('Проголосовало: 2')).toBeInTheDocument();
  });

  it('не даёт менять ответ, если это запрещено', () => {
    const { onVote } = renderPoll({
      poll: poll(
        { votes: { [alice.id]: ['o1'] }, counts: { o1: 1, o2: 0 }, totalVoters: 1 },
        { changeVote: false },
      ),
    });
    const option = screen.getByRole('button', { name: /На речку/ });
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(onVote).not.toHaveBeenCalled();
    expect(screen.getByText('Ответ отправлен — изменить его нельзя.')).toBeInTheDocument();
  });

  it('в завершённом опросе голосовать нельзя', () => {
    renderPoll({ poll: poll({ closed: true }) });
    expect(screen.getByText(/Опрос завершён/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /В горы/ })).toBeDisabled();
  });

  it('автор может остановить опрос, остальные — нет', () => {
    const author = renderPoll({ isAuthor: true });
    fireEvent.click(screen.getByRole('button', { name: 'Остановить опрос' }));
    expect(author.onClosePoll).toHaveBeenCalled();

    cleanup();
    renderPoll({ isAuthor: false });
    expect(screen.queryByRole('button', { name: 'Остановить опрос' })).toBeNull();
  });

  it('показывает имена проголосовавших по кнопке', () => {
    renderPoll({
      poll: poll({
        votes: { [alice.id]: ['o1'], [bob.id]: ['o1'] },
        counts: { o1: 2, o2: 0 },
        totalVoters: 2,
      }),
    });
    expect(screen.queryByText('Алиса, Боб')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Показать имена' }));
    expect(screen.getByText('Алиса, Боб')).toBeInTheDocument();
  });

  it('в анонимном опросе кнопки имён нет', () => {
    renderPoll({
      poll: poll(
        { votes: {}, counts: { o1: 2, o2: 0 }, totalVoters: 2 },
        { showNames: false },
      ),
    });
    expect(screen.getByText('Проголосовало: 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показать имена' })).toBeNull();
  });

  it('позволяет добавить свой вариант, если это разрешено', () => {
    const { onAddOption } = renderPoll();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    fireEvent.change(screen.getByLabelText('Свой вариант ответа'), { target: { value: 'На озеро' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onAddOption).toHaveBeenCalledWith('На озеро');
  });

  it('в викторине отмечает правильный ответ и показывает промах', () => {
    renderPoll({
      poll: poll(
        { votes: { [alice.id]: ['o2'] }, counts: { o1: 1, o2: 1 }, totalVoters: 2 },
        { correctOptionIds: ['o1'] },
      ),
    });
    expect(screen.getByText('Правильный ответ отмечен галочкой')).toBeInTheDocument();
  });
});
