import { Pin, PinOff, SmilePlus, X } from 'lucide-react';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from '../../components/ui';
import type { Message, MessageReaction } from '../../types';
import { COMPOSER_EMOJIS, MESSAGE_REACTIONS } from './messengerUtils';

interface EmojiPickerProps {
  mode?: 'composer' | 'reaction';
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

export function EmojiPicker({ mode = 'composer', onSelect, onClose, className = '' }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const emojis = mode === 'reaction' ? MESSAGE_REACTIONS : COMPOSER_EMOJIS;
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', closeOnOutside));
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    // w-max обязателен: панель абсолютная, и без него ширина сжимается до ширины
    // кнопки, у которой открылась — значки вылезали за край и наезжали друг на друга.
    <div
      ref={ref}
      className={`z-50 w-max max-w-[min(92vw,22rem)] animate-slide-up rounded-2xl border border-line bg-elevated p-2 shadow-float ${className}`}
      role="dialog"
      aria-label={mode === 'reaction' ? 'Выбор реакции' : 'Выбор эмодзи'}
    >
      <div className="grid grid-cols-7 gap-1">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="grid h-10 w-full min-w-0 place-items-center rounded-xl text-[22px] leading-none transition hover:scale-110 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => onSelect(emoji)}
            aria-label={`Выбрать ${emoji}`}
          >
            <span className="emoji">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function HighlightedText({ text, query, className = '' }: { text: string; query: string; className?: string }) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  if (!normalizedQuery) return <span className={className}>{text}</span>;
  const parts: ReactNode[] = [];
  const normalizedText = text.toLocaleLowerCase('ru-RU');
  let cursor = 0;
  let match = normalizedText.indexOf(normalizedQuery, cursor);
  while (match !== -1) {
    if (match > cursor) parts.push(text.slice(cursor, match));
    parts.push(
      <mark key={`${match}-${cursor}`} className="rounded bg-[#ffe66d] px-0.5 text-[#332b00]">
        {text.slice(match, match + normalizedQuery.length)}
      </mark>,
    );
    cursor = match + normalizedQuery.length;
    match = normalizedText.indexOf(normalizedQuery, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <span className={className}>{parts}</span>;
}

interface ReactionBarProps {
  reactions: MessageReaction[];
  currentUserId: string;
  mine: boolean;
  disabled?: boolean;
  onToggle: (emoji: string, active: boolean) => void;
  onAdd: () => void;
}

export const ReactionBar = memo(function ReactionBar({ reactions, currentUserId, mine, disabled, onToggle, onAdd }: ReactionBarProps) {
  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
      {reactions.filter((reaction) => reaction.count > 0).map((reaction) => {
        const active = reaction.userIds.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            disabled={disabled}
            className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs font-bold transition hover:-translate-y-0.5 ${active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink'}`}
            onClick={() => onToggle(reaction.emoji, active)}
            title={active ? 'Убрать реакцию' : 'Поставить реакцию'}
          >
            <span className="emoji text-[15px]">{reaction.emoji}</span><span>{reaction.count}</span>
          </button>
        );
      })}
      <button type="button" disabled={disabled} className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-muted transition hover:border-brand/40 hover:text-brand" onClick={onAdd} aria-label="Добавить реакцию">
        <SmilePlus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

interface PinnedMessagesBarProps {
  messages: Message[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  onJump: (messageId: string) => void;
  onUnpin: (message: Message) => void;
}

export function PinnedMessagesBar({ messages, activeIndex, onChangeIndex, onJump, onUnpin }: PinnedMessagesBarProps) {
  const message = messages[Math.min(activeIndex, messages.length - 1)];
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 border-b border-line/75 bg-surface/95 px-4 py-2.5 sm:px-6">
      <Pin className="h-4 w-4 shrink-0 text-brand" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onJump(message.id)}>
        <span className="block text-[11px] font-bold text-brand">
          Закреплённые сообщения · {activeIndex + 1} из {messages.length}
        </span>
        <span className="block truncate text-xs text-muted">{message.text || 'Вложение'}</span>
      </button>
      {messages.length > 1 && (
        <button type="button" className="rounded-lg bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand" onClick={() => onChangeIndex((activeIndex + 1) % messages.length)} aria-label="Следующее закреплённое сообщение">
          {activeIndex + 1}/{messages.length}
        </button>
      )}
      <IconButton label="Открепить сообщение" className="h-8 w-8 rounded-xl" onClick={() => onUnpin(message)}>
        <PinOff className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

export function SystemMessage({ message, currentUserId }: { message: Message; currentUserId?: string }) {
  const call = message.call;
  const outcome = call?.outcome ?? call?.status;
  const mine = Boolean(call?.callerId && call.callerId === currentUserId);
  const callIcon = call?.mode === 'video' ? '📹' : '📞';
  let label = message.text || message.systemEvent || 'Системное событие';
  if (call) {
    if (outcome === 'completed') {
      label = mine
        ? `${callIcon} Вы позвонили`
        : `${callIcon} Входящий ${call.mode === 'video' ? 'видеозвонок' : 'аудиозвонок'} завершён`;
    } else if (outcome === 'declined') {
      label = mine ? '❌ Звонок отклонён' : '⛔ Вы отклонили звонок';
    } else if (outcome === 'missed') {
      label = mine ? '📵 Вы пытались позвонить' : '❌ Пропущенный звонок';
    } else if (outcome === 'unanswered') {
      label = mine ? '📵 Вы пытались позвонить' : '📵 Не отвечено';
    }
  }
  return (
    <div className="my-2 flex justify-center px-4">
      <div className="max-w-[90%] rounded-2xl border border-line/70 bg-surface/85 px-3.5 py-2 text-center text-xs text-muted shadow-sm backdrop-blur">
        <span className="font-semibold text-ink">{label}</span>
        {message.call?.durationSeconds !== undefined && message.call.durationSeconds > 0 && (
          <span className="mt-0.5 block text-[10px]">Длительность: {Math.floor(message.call.durationSeconds / 60).toString().padStart(2, '0')}:{(message.call.durationSeconds % 60).toString().padStart(2, '0')}</span>
        )}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Закрыть" onClick={onClick}>
      <X className="h-5 w-5" />
    </IconButton>
  );
}
