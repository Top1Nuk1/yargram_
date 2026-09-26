import { useEffect, useState } from 'react';
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
              {row.key === 'deadline' && (
                <DeadlinePicker
                  deadline={draft.settings.deadline}
                  onChange={(next) => patch({ deadline: next })}
                  disabled={busy}
                />
              )}
            </div>
          );
        })}
      </section>
    </Dialog>
  );
}

/**
 * Выбор срока в духе макета: «1 час / 3 часа / 8 часов / 1 день / 3 дня / Навсегда / Другое».
 * «Навсегда» = null, «Другое» раскрывает дату и время.
 */
type Preset =
  | { kind: 'preset'; hours: number; label: string }
  | { kind: 'forever' }
  | { kind: 'custom' };

const DEADLINE_PRESETS: Array<{ id: string; label: string; preset: Preset }> = [
  { id: '1h', label: '1 час', preset: { kind: 'preset', hours: 1, label: '1 час' } },
  { id: '3h', label: '3 часа', preset: { kind: 'preset', hours: 3, label: '3 часа' } },
  { id: '8h', label: '8 часов', preset: { kind: 'preset', hours: 8, label: '8 часов' } },
  { id: '1d', label: '1 день', preset: { kind: 'preset', hours: 24, label: '1 день' } },
  { id: '3d', label: '3 дня', preset: { kind: 'preset', hours: 24 * 3, label: '3 дня' } },
  { id: 'forever', label: 'Навсегда', preset: { kind: 'forever' } },
  { id: 'custom', label: 'Другое', preset: { kind: 'custom' } },
];

/**
 * Разбираем ISO-строку на (preset | forever | custom) и опциональную дату/время.
 * Каждый час мы пересчитываем пресет заново — иначе кнопка перестаёт подсвечиваться.
 */
function matchPreset(deadline: string | null, now: number = Date.now()): {
  preset: Preset;
  customDate?: string;
  customTime?: string;
} {
  if (deadline === null) return { preset: { kind: 'forever' } };
  const at = Date.parse(deadline);
  if (Number.isNaN(at)) return { preset: { kind: 'custom' } };
  const diffMs = at - now;
  if (diffMs <= 0) return { preset: { kind: 'custom' } };
  const diffHours = diffMs / (60 * 60 * 1_000);
  // Допускаем любое время внутри текущего часа как «1 час», «3 часа» и т. п.
  const rounded = Math.round(diffHours);
  for (const item of DEADLINE_PRESETS) {
    const preset = item.preset;
    if (preset.kind !== 'preset') continue;
    if (preset.hours === rounded) {
      return { preset };
    }
  }
  const iso = new Date(at);
  return {
    preset: { kind: 'custom' },
    customDate: toDateInput(iso),
    customTime: toTimeInput(iso),
  };
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function DeadlinePicker({
  deadline,
  onChange,
  disabled,
}: {
  deadline: string | null;
  onChange: (next: string | null) => void;
  disabled: boolean;
}) {
  // Пересчёт раз в минуту, чтобы пресет «1 час» не уезжал раньше времени.
  const [, force] = useState(0);
  useEffect(() => {
    if (deadline === null) return undefined;
    const handle = window.setInterval(() => force((value) => value + 1), 60_000);
    return () => window.clearInterval(handle);
  }, [deadline]);
  // Дедлайн не задан — выключатель «Ограничение срока» выключен, рисовать нечего.
  if (deadline === null) return null;
  const matched = matchPreset(deadline);
  return (
    <DeadlinePickerBody
      deadline={deadline}
      matched={matched}
      disabled={disabled}
      onChange={onChange}
      onForce={() => force((value) => value + 1)}
    />
  );
}

/**
 * «Кастом» запоминаем отдельно — даже если пользователь подвинул дату так, что
 * она снова попадает в пресет, мы продолжаем показывать поля ввода.
 */
function DeadlinePickerBody({
  deadline,
  matched,
  disabled,
  onChange,
  onForce,
}: {
  deadline: string;
  matched: ReturnType<typeof matchPreset>;
  disabled: boolean;
  onChange: (next: string | null) => void;
  onForce: () => void;
}) {
  const [customMode, setCustomMode] = useState(matched.preset.kind === 'custom');
  const showCustom = customMode || matched.preset.kind === 'custom';
  const activeId = showCustom
    ? 'custom'
    : matched.preset.kind === 'preset'
      ? (() => {
          const target = matched.preset.hours;
          return DEADLINE_PRESETS.find(
            (item) => item.preset.kind === 'preset' && item.preset.hours === target,
          )?.id ?? 'forever';
        })()
      : 'forever';

  function pick(preset: Preset) {
    if (disabled) return;
    if (preset.kind === 'forever') {
      onChange(null);
      return;
    }
    if (preset.kind === 'preset') {
      setCustomMode(false);
      onChange(new Date(Date.now() + preset.hours * 60 * 60 * 1_000).toISOString());
      return;
    }
    // «Другое»: фиксируем режим и инициализируем дату/время, если ещё не заданы.
    setCustomMode(true);
    if (!matched.customDate || !matched.customTime) {
      onChange(new Date(Date.now() + 60 * 60 * 1_000).toISOString());
    } else {
      // Перерисуемся: на следующем рендере поля появятся с уже заполненной датой.
      onForce();
    }
  }

  return (
    <div className="mb-3 ml-14 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DEADLINE_PRESETS.map((item) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => pick(item.preset)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'border-brand/60 bg-brand text-white shadow-sm'
                  : 'border-line bg-canvas text-ink hover:border-brand/40 hover:bg-brand-soft/40'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {!showCustom && matched.preset.kind === 'preset' && (
        <p className="text-xs leading-5 text-muted">
          Опрос автоматически завершится через {humanizeHours(matched.preset.hours)}.
        </p>
      )}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
          <span className="text-sm font-semibold text-brand">Завершение опроса</span>
          <input
            type="date"
            aria-label="Дата завершения"
            value={matched.customDate ?? toDateInput(new Date(deadline))}
            onChange={(event) => {
              const next = composeIso(
                event.target.value,
                matched.customTime ?? toTimeInput(new Date(deadline)),
              );
              onChange(next);
            }}
            disabled={disabled}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-brand/60"
          />
          <span className="text-sm text-muted">в</span>
          <input
            type="time"
            aria-label="Время завершения"
            value={matched.customTime ?? toTimeInput(new Date(deadline))}
            onChange={(event) => {
              const next = composeIso(
                matched.customDate ?? toDateInput(new Date(deadline)),
                event.target.value,
              );
              onChange(next);
            }}
            disabled={disabled}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-brand/60"
          />
        </div>
      )}
    </div>
  );
}

/** Склеиваем «YYYY-MM-DD» и «HH:mm» обратно в ISO с локальным часовым поясом. */
function composeIso(date: string, time: string): string {
  if (!date || !time) return defaultDeadline();
  const at = new Date(`${date}T${time}`);
  if (Number.isNaN(at.getTime())) return defaultDeadline();
  return at.toISOString();
}

function humanizeHours(hours: number): string {
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
  const days = Math.round(hours / 24);
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Склоняем русские существительные по числам. */
function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Срок по умолчанию: сутки вперёд — чаще всего хватает. */
function defaultDeadline(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
}
