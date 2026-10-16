import { Pin, PinOff, SmilePlus, X } from 'lucide-react';
import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../../components/ui';
import { useTranslation } from '../../hooks/useLanguage';
import type { Message, MessageReaction } from '../../types';
import { COMPOSER_EMOJIS, EMOJI_CATEGORIES, MESSAGE_REACTIONS } from './messengerUtils';
import { tokenizeText } from '../../lib/linkify';

interface EmojiPickerProps {
  mode?: 'composer' | 'reaction';
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
  isDocked?: boolean;
  onToggleDock?: () => void;
}

export function EmojiPicker({
  mode = 'composer',
  onSelect,
  onClose,
  className = '',
  isDocked = false,
  onToggleDock,
}: EmojiPickerProps) {
  const t = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<string>('smileys');

  const emojis = mode === 'reaction'
    ? MESSAGE_REACTIONS
    : (EMOJI_CATEGORIES.find((cat) => cat.id === activeCategory)?.emojis ?? COMPOSER_EMOJIS);

  useEffect(() => {
    if (isDocked) return;
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
  }, [onClose, isDocked]);

  return (
    <div
      ref={ref}
      className={isDocked
        ? `flex h-full w-full flex-col bg-surface p-3 ${className}`
        : `z-50 flex w-max w-[320px] max-w-[min(92vw,22rem)] flex-col animate-slide-up rounded-2xl border border-line bg-elevated p-2.5 shadow-float ${className}`}
      role="dialog"
      aria-label={mode === 'reaction' ? t('modals.reactionPickerLabel') : t('modals.emojiPickerLabel')}
    >
      {/* Шапка с категориями и кнопками закрепления/закрытия */}
      {mode === 'composer' && (
        <div className="mb-2 flex items-center justify-between gap-1 border-b border-line/60 pb-2">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {EMOJI_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base transition ${
                  activeCategory === category.id
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
                title={category.id}
                aria-label={category.id}
              >
                <span className="emoji">{category.icon}</span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onToggleDock && (
              <button
                type="button"
                onClick={onToggleDock}
                className={`grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink ${
                  isDocked ? 'bg-brand-soft text-brand' : ''
                }`}
                title={isDocked ? t('extras.undockEmoji') ?? 'Открепить панель' : t('extras.dockEmoji') ?? 'Закрепить панель справа'}
                aria-label={isDocked ? 'Undock emoji picker' : 'Dock emoji picker'}
              >
                <Pin className={`h-3.5 w-3.5 ${isDocked ? 'rotate-45 text-brand' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
              title={t('common.close') ?? 'Закрыть'}
              aria-label="Close emoji picker"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Сетка эмодзи */}
      <div className={`grid grid-cols-7 gap-1 overflow-y-auto ${isDocked ? 'flex-1 max-h-none pr-1' : 'max-h-64'}`}>
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="grid h-10 w-full min-w-0 place-items-center rounded-xl text-[22px] leading-none transition hover:scale-110 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => onSelect(emoji)}
            aria-label={t('modals.selectEmoji', { emoji })}
          >
            <span className="emoji">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function renderHighlightedSlice(
  textSlice: string,
  normalizedQuery: string,
  keyPrefix: string,
): ReactNode[] {
  if (!normalizedQuery) return [textSlice];
  const parts: ReactNode[] = [];
  const normalizedText = textSlice.toLocaleLowerCase('ru-RU');
  let cursor = 0;
  let match = normalizedText.indexOf(normalizedQuery, cursor);
  while (match !== -1) {
    if (match > cursor) {
      parts.push(textSlice.slice(cursor, match));
    }
    parts.push(
      <mark
        key={`${keyPrefix}-${match}-${cursor}`}
        className="rounded bg-[#ffe66d] px-0.5 text-[#332b00]"
      >
        {textSlice.slice(match, match + normalizedQuery.length)}
      </mark>,
    );
    cursor = match + normalizedQuery.length;
    match = normalizedText.indexOf(normalizedQuery, cursor);
  }
  if (cursor < textSlice.length) {
    parts.push(textSlice.slice(cursor));
  }
  return parts;
}

export function HighlightedText({
  text,
  query = '',
  className = '',
}: {
  text: string;
  query?: string;
  className?: string;
}) {
  if (!text) return null;
  const normalizedQuery = (query ?? '').trim().toLocaleLowerCase('ru-RU');
  const tokens = tokenizeText(text);

  const elements: ReactNode[] = tokens.map((token, index) => {
    if (token.type === 'link') {
      return (
        <a
          key={`token-link-${index}`}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer break-all font-medium text-brand underline decoration-brand/40 underline-offset-2 transition hover:text-brand-dark hover:decoration-brand"
          onClick={(event) => {
            // Клик по ссылке открывает её в новой вкладке браузера и не переключает
            // текущий диалог/экран мессенджера (предотвращаем всплытие клика к пузырю сообщения).
            event.stopPropagation();
          }}
        >
          {renderHighlightedSlice(token.value, normalizedQuery, `tok-${index}`)}
        </a>
      );
    }
    return (
      <Fragment key={`token-txt-${index}`}>
        {renderHighlightedSlice(token.value, normalizedQuery, `tok-${index}`)}
      </Fragment>
    );
  });

  return <span className={className}>{elements}</span>;
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
  const t = useTranslation();
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
            title={active ? t('extras.removeReaction') : t('extras.addReaction')}
          >
            <span className="emoji text-[15px]">{reaction.emoji}</span><span>{reaction.count}</span>
          </button>
        );
      })}
      <button type="button" disabled={disabled} className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-muted transition hover:border-brand/40 hover:text-brand" onClick={onAdd} aria-label={t('extras.addReactionAria')}>
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
  const t = useTranslation();
  const message = messages[Math.min(activeIndex, messages.length - 1)];
  if (!message) return null;
  return (
    <div className="animate-slide-down flex items-center gap-3 border-b border-line/75 bg-surface/95 px-4 py-2.5 sm:px-6 transition-all duration-200">
      <Pin className="h-4 w-4 shrink-0 text-brand" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onJump(message.id)}>
        <span className="block text-[11px] font-bold text-brand">
          {t('extras.pinnedMessages', { index: activeIndex + 1, total: messages.length })}
        </span>
        <span className="block truncate text-xs text-muted">{message.text || t('extras.attachment')}</span>
      </button>
      {messages.length > 1 && (
        <button type="button" className="rounded-lg bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand" onClick={() => onChangeIndex((activeIndex + 1) % messages.length)} aria-label={t('extras.nextPinned')}>
          {activeIndex + 1}/{messages.length}
        </button>
      )}
      <IconButton label={t('extras.unpin')} className="h-8 w-8 rounded-xl" onClick={() => onUnpin(message)}>
        <PinOff className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

export function SystemMessage({ message, currentUserId }: { message: Message; currentUserId?: string }) {
  const t = useTranslation();
  const call = message.call;
  const outcome = call?.outcome ?? call?.status;
  const mine = Boolean(call?.callerId && call.callerId === currentUserId);
  const callIcon = call?.mode === 'video' ? '📹' : '📞';
  let label = message.text || message.systemEvent || t('extras.systemEvent');
  if (call) {
    if (outcome === 'completed') {
      label = mine
        ? `${callIcon} ${t('extras.youCalled')}`
        : `${callIcon} ${call.mode === 'video' ? t('extras.incomingVideoDone') : t('extras.incomingAudioDone')}`;
    } else if (outcome === 'declined') {
      label = mine ? `❌ ${t('extras.callDeclined')}` : `⛔ ${t('extras.youDeclined')}`;
    } else if (outcome === 'missed') {
      label = mine ? `📵 ${t('extras.youTriedToCall')}` : `❌ ${t('extras.missedCall')}`;
    } else if (outcome === 'unanswered') {
      label = mine ? `📵 ${t('extras.youTriedToCall')}` : `📵 ${t('extras.unanswered')}`;
    }
  }
  return (
    <div className="my-2 flex justify-center px-4">
      <div className="max-w-[90%] rounded-2xl border border-line/70 bg-surface/85 px-3.5 py-2 text-center text-xs text-muted shadow-sm backdrop-blur">
        <span className="font-semibold text-ink">{label}</span>
        {message.call?.durationSeconds !== undefined && message.call.durationSeconds > 0 && (
          <span className="mt-0.5 block text-[10px]">{t('extras.duration', { value: `${Math.floor(message.call.durationSeconds / 60).toString().padStart(2, '0')}:${(message.call.durationSeconds % 60).toString().padStart(2, '0')}` })}</span>
        )}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  const t = useTranslation();
  return (
    <IconButton label={t('common.close')} onClick={onClick}>
      <X className="h-5 w-5" />
    </IconButton>
  );
}
