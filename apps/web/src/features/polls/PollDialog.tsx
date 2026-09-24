import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ListChecks,
  Pencil,
  Plus,
  Shuffle,
  Smile,
  Trash2,
  Users,
} from 'lucide-react';
import { Dialog, Switch } from '../../components/Dialog';
import { Button, IconButton } from '../../components/ui';
import type { PollSettings } from '../../types';
import { EmojiPicker } from '../messenger/MessageExtras';

/** Верхняя граница вариантов: столько же держит сервер. */
const OPTIONS_MAX = 12;

export interface PollDraft {
  question: string;
  description: string;
  options: string[];
  settings: PollSettings;
}

/** Строка настроек: подпись, пояснение и цветной значок — как в макете. */
const settingRows: Array<{
  key: 'showNames' | 'multiple' | 'addOptions' | 'changeVote' | 'shuffle' | 'quiz' | 'deadline';
  label: string;
  hint: string;
  icon: typeof Users;
  tone: string;
}> = [
  {
    key: 'showNames',
    label: 'Имена участников',
    hint: 'Рядом с ответами отображаются имена всех голосовавших.',
    icon: Users,
    tone: 'bg-brand',
  },
  {
    key: 'multiple',
    label: 'Несколько ответов',
    hint: 'Участники могут выбрать более одного варианта ответа.',
    icon: ListChecks,
    tone: 'bg-[#f59e0b]',
  },
  {
    key: 'addOptions',
    label: 'Добавление вариантов',
    hint: 'Участники могут предлагать новые варианты.',
    icon: Plus,
    tone: 'bg-brand',
  },
  {
    key: 'changeVote',
    label: 'Изменение ответа',
    hint: 'Участники могут изменить выбранный ответ.',
    icon: Pencil,
    tone: 'bg-[#8b5cf6]',
  },
  {
    key: 'shuffle',
    label: 'Случайный порядок',
    hint: 'Ответы отображаются у всех участников в случайном порядке.',
    icon: Shuffle,
    tone: 'bg-[#f59e0b]',
  },
  {
    key: 'quiz',
    label: 'Правильный ответ',
    hint: 'Отметьте один или несколько правильных вариантов.',
    icon: CheckCircle2,
    tone: 'bg-success',
  },
  {
    key: 'deadline',
    label: 'Ограничение срока',
    hint: 'Опрос автоматически завершится в заданное время.',
    icon: Clock,
    tone: 'bg-danger',
  },
];

export function defaultPollDraft(): PollDraft {
  return {
    question: '',
    description: '',
    options: ['', ''],
    settings: {
      showNames: true,
      multiple: false,
      addOptions: true,
      changeVote: true,
      shuffle: false,
      correctOptionIds: [],
      deadline: null,
    },
  };
}

/**
 * Окно «Новый опрос»: вопрос, описание, варианты и семь настроек.
 * Пока вариант помечен правильным, опрос остаётся викториной.
 */
export function PollDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: PollDraft) => void;
}) {
  const [draft, setDraft] = useState<PollDraft>(defaultPollDraft);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const filled = draft.options.map((option) => option.trim()).filter((option) => option !== '');
  const canAddOption = draft.options.length < OPTIONS_MAX;
  const canSubmit = draft.question.trim() !== '' && filled.length >= 2;
  const quiz = draft.settings.correctOptionIds.length > 0;

  const patch = (next: Partial<PollSettings>) =>
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...next } }));

  /** Правильные варианты отмечаются по индексу, а id появятся на сервере. */
  function toggleCorrect(index: number) {
    const marked = draft.settings.correctOptionIds.includes(String(index));
    patch({
      correctOptionIds: marked
        ? draft.settings.correctOptionIds.filter((item) => item !== String(index))
        : [...draft.settings.correctOptionIds, String(index)],
    });
  }

  return (
    <Dialog
      wide
      title="Новый опрос"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" className="min-h-10" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            className="min-h-10"
            disabled={!canSubmit}
            loading={busy}
            onClick={() =>
              onSubmit({
                ...draft,
                question: draft.question.trim(),
                description: draft.description.trim(),
                options: filled,
              })
            }
          >
            Создать
          </Button>
        </>
      }
    >
      <p className="px-1 pb-2 text-sm font-semibold text-brand">Вопрос</p>
      <div className="relative">
        <input
          value={draft.question}
          maxLength={255}
          onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
          placeholder="Текст вопроса"
          aria-label="Текст вопроса"
          className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 pr-11 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
        />
        <IconButton
          label="Вставить значок"
          type="button"
          className="absolute right-1 top-1 h-9 w-9"
          onClick={() => setEmojiOpen((open) => !open)}
        >
          <Smile className="h-4 w-4" />
        </IconButton>
        {emojiOpen && (
          <div className="absolute right-0 top-12 z-10">
            <EmojiPicker
              onSelect={(emoji) => {
                setDraft((current) => ({ ...current, question: `${current.question}${emoji}` }));
                setEmojiOpen(false);
              }}
              onClose={() => setEmojiOpen(false)}
            />
          </div>
        )}
      </div>
      <input
        value={draft.description}
        maxLength={500}
        onChange={(event) =>
          setDraft((current) => ({ ...current, description: event.target.value }))
        }
        placeholder="Описание (необязательно)"
        aria-label="Описание"
        className="mt-2 h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
      />

      <p className="px-1 pb-2 pt-5 text-sm font-semibold text-brand">Варианты ответа</p>
      <div className="space-y-2">
        {draft.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            {quiz && (
              <button
                type="button"
                role="checkbox"
                aria-checked={draft.settings.correctOptionIds.includes(String(index))}
                aria-label={`Правильный ответ: вариант ${index + 1}`}
                onClick={() => toggleCorrect(index)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${
                  draft.settings.correctOptionIds.includes(String(index))
                    ? 'border-success bg-success/15 text-success'
                    : 'border-line text-muted hover:border-brand/40'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            <input
              value={option}
              maxLength={100}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  options: current.options.map((item, at) =>
                    at === index ? event.target.value : item,
                  ),
                }))
              }
              placeholder={index === 0 ? 'Добавить ответ…' : `Вариант ${index + 1}`}
              aria-label={index === 0 ? 'Добавить ответ' : `Вариант ${index + 1}`}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3.5 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
            />
            {draft.options.length > 2 && (
              <IconButton
                label={`Удалить вариант ${index + 1}`}
                type="button"
                className="h-9 w-9 shrink-0"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    options: current.options.filter((_, at) => at !== index),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      {canAddOption && (
        <button
          type="button"
          onClick={() =>
            setDraft((current) => ({ ...current, options: [...current.options, ''] }))
          }
          className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand transition hover:bg-brand-soft/40"
        >
          <Plus className="h-4 w-4" /> Добавить ответ…
        </button>
      )}
      <p className="mt-1 rounded-xl bg-canvas px-3.5 py-2 text-xs text-muted">
        Можно добавить ещё {Math.max(0, OPTIONS_MAX - draft.options.length)} вариантов ответа.
      </p>

      <p className="px-1 pb-2 pt-5 text-sm font-semibold text-brand">Настройки</p>
      <section className="overflow-hidden rounded-xl bg-canvas">
        {settingRows.map((row) => {
          const Icon = row.icon;
          const checked =
            row.key === 'quiz' ? quiz : row.key === 'deadline' ? draft.settings.deadline !== null : draft.settings[row.key];
          return (
            <div key={row.key} className="border-b border-line/60 last:border-b-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${row.tone}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{row.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{row.hint}</span>
                </span>
                <Switch
                  label={row.label}
                  checked={checked}
                  disabled={busy}
                  onChange={(next) => {
                    if (row.key === 'quiz') {
                      patch({ correctOptionIds: next ? draft.options.map((_, at) => String(at)).slice(0, 1) : [] });
                      return;
                    }
                    if (row.key === 'deadline') {
                      patch({ deadline: next ? defaultDeadline() : null });
                      return;
                    }
                    patch({ [row.key]: next } as Partial<PollSettings>);
                  }}
                />
              </div>
              {row.key === 'deadline' && draft.settings.deadline !== null && (
                <input
                  type="datetime-local"
                  aria-label="Когда завершить опрос"
                  value={draft.settings.deadline.slice(0, 16)}
                  onChange={(event) =>
                    patch({ deadline: new Date(event.target.value).toISOString() })
                  }
                  className="mb-3 ml-14 h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand/60"
                />
              )}
            </div>
          );
        })}
      </section>
    </Dialog>
  );
}

/** Срок по умолчанию: сутки вперёд — чаще всего хватает. */
function defaultDeadline(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
}
