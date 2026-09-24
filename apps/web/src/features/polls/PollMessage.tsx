import { useMemo, useState } from 'react';
import { Check, CheckCircle2, Plus, Square, SquareCheck, XCircle } from 'lucide-react';
import type { PollOption, PollView, User } from '../../types';

interface PollMessageProps {
  poll: PollView;
  currentUserId: string;
  /** Голосовать может участник беседы, даже если ему запрещено писать. */
  canVote: boolean;
  busy: boolean;
  /** Кто есть кто: нужен, чтобы показать имена проголосовавших. */
  nameOf: (userId: string) => User | undefined;
  /** Опрос создал я: только тогда его можно остановить. */
  isAuthor: boolean;
  onVote: (optionIds: string[]) => void;
  onAddOption: (text: string) => void;
  onClosePoll: () => void;
}

/**
 * Порядок вариантов у каждого свой, если владелец включил случайный порядок.
 * Считаем от id участника, чтобы список не прыгал при каждой перерисовке.
 */
function orderOptions(options: PollOption[], shuffle: boolean, seed: string): PollOption[] {
  if (!shuffle) return options;
  const score = (value: string) => {
    let hash = 0;
    for (const char of `${seed}:${value}`) hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
    return hash;
  };
  return [...options].sort((left, right) => score(left.id) - score(right.id));
}

export function PollMessage({
  poll,
  currentUserId,
  canVote,
  busy,
  nameOf,
  isAuthor,
  onVote,
  onAddOption,
  onClosePoll,
}: PollMessageProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [showVoters, setShowVoters] = useState(false);

  const options = useMemo(
    () => orderOptions(poll.options, poll.settings.shuffle, currentUserId),
    [currentUserId, poll.options, poll.settings.shuffle],
  );
  const myVotes = poll.votes[currentUserId] ?? [];
  const voted = myVotes.length > 0;
  const locked = poll.closed || !canVote || (voted && !poll.settings.changeVote);
  const quiz = poll.settings.correctOptionIds.length > 0;

  /** Один ответ заменяет предыдущий, несколько — переключаются по одному. */
  function pick(optionId: string) {
    if (locked) return;
    if (poll.settings.multiple) {
      const next = myVotes.includes(optionId)
        ? myVotes.filter((id) => id !== optionId)
        : [...myVotes, optionId];
      onVote(next);
      return;
    }
    onVote(myVotes.includes(optionId) ? [] : [optionId]);
  }

  return (
    <div className="min-w-0">
      <p className="whitespace-pre-wrap break-words text-[14px] font-semibold leading-[1.35] sm:text-[15px]">
        {poll.question}
      </p>
      {poll.description && (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted">
          {poll.description}
        </p>
      )}

      <ul className="mt-2 space-y-1.5">
        {options.map((option) => {
          const count = poll.counts[option.id] ?? 0;
          const share = poll.totalVoters === 0 ? 0 : Math.round((count / poll.totalVoters) * 100);
          const chosen = myVotes.includes(option.id);
          const correct = quiz && poll.settings.correctOptionIds.includes(option.id);
          const wrongPick = quiz && voted && chosen && !correct;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={locked}
                aria-pressed={chosen}
                onClick={() => pick(option.id)}
                className={`relative flex w-full items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-left transition disabled:cursor-default ${
                  chosen ? 'border-brand/60 bg-brand-soft/50' : 'border-line bg-canvas'
                } ${locked ? '' : 'hover:border-brand/40'}`}
              >
                {/* Полоса результата: видна, как только появился первый голос. */}
                {voted && (
                  <span
                    className={`absolute inset-y-0 left-0 ${chosen ? 'bg-brand/20' : 'bg-line/60'}`}
                    style={{ width: `${share}%` }}
                    aria-hidden="true"
                  />
                )}
                <span className="relative shrink-0 text-muted">
                  {poll.settings.multiple ? (
                    chosen ? <SquareCheck className="h-4 w-4 text-brand" /> : <Square className="h-4 w-4" />
                  ) : chosen ? (
                    <CheckCircle2 className="h-4 w-4 text-brand" />
                  ) : (
                    <span className="block h-4 w-4 rounded-full border border-current" />
                  )}
                </span>
                <span className="relative min-w-0 flex-1 truncate text-sm text-ink">
                  {option.text}
                </span>
                {quiz && voted && correct && <Check className="relative h-4 w-4 shrink-0 text-success" />}
                {wrongPick && <XCircle className="relative h-4 w-4 shrink-0 text-danger" />}
                {voted && (
                  <span className="relative shrink-0 text-xs font-semibold text-muted">
                    {count} · {share}%
                  </span>
                )}
              </button>
              {poll.settings.showNames && showVoters && count > 0 && (
                <p className="mt-0.5 pl-3 text-[11px] leading-4 text-muted">
                  {Object.entries(poll.votes)
                    .filter(([, picks]) => picks.includes(option.id))
                    .map(([userId]) => nameOf(userId)?.displayName ?? 'Участник')
                    .join(', ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={100}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Свой вариант"
            aria-label="Свой вариант ответа"
            className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-brand/60"
          />
          <button
            type="button"
            disabled={busy || draft.trim() === ''}
            onClick={() => {
              onAddOption(draft.trim());
              setDraft('');
              setAdding(false);
            }}
            className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-brand disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      ) : (
        !poll.closed &&
        poll.settings.addOptions &&
        canVote && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand transition hover:opacity-80"
          >
            <Plus className="h-3.5 w-3.5" /> Добавить вариант
          </button>
        )
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>
          {poll.closed ? 'Опрос завершён · ' : ''}
          Проголосовало: {poll.totalVoters}
        </span>
        {poll.settings.showNames && poll.totalVoters > 0 && (
          <button
            type="button"
            onClick={() => setShowVoters((open) => !open)}
            className="font-semibold text-brand transition hover:opacity-80"
          >
            {showVoters ? 'Скрыть имена' : 'Показать имена'}
          </button>
        )}
        {quiz && voted && <span>Правильный ответ отмечен галочкой</span>}
        {!poll.closed && isAuthor && (
          <button
            type="button"
            disabled={busy}
            onClick={onClosePoll}
            className="font-semibold text-danger transition hover:opacity-80 disabled:opacity-50"
          >
            Остановить опрос
          </button>
        )}
      </div>
      {voted && !poll.closed && !poll.settings.changeVote && (
        <p className="mt-1 text-[11px] text-muted">Ответ отправлен — изменить его нельзя.</p>
      )}
    </div>
  );
}
