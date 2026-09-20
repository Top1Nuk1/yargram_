import { Clock, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { conversationTitle } from '../../lib/conversation';
import type { Conversation, ScheduledMessage } from '../../types';

interface ScheduledMessagesModalProps {
  items: ScheduledMessage[];
  conversations: Conversation[];
  currentUserId: string;
  onClose(): void;
  onCancel(scheduledId: string): void;
}

const statusLabels: Record<ScheduledMessage['status'], string> = {
  pending: 'Ожидает отправки',
  sending: 'Отправляется…',
  sent: 'Отправлено',
  failed: 'Не удалось отправить',
  cancelled: 'Отменено',
};

function formatSendTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ScheduledMessagesModal({
  items,
  conversations,
  currentUserId,
  onClose,
  onCancel,
}: ScheduledMessagesModalProps) {
  const pending = items.filter((item) => item.status === 'pending' || item.status === 'sending');
  const finished = items
    .filter((item) => item.status === 'failed' || item.status === 'sent' || item.status === 'cancelled')
    .slice(-10)
    .reverse();
  const titleFor = (conversationId: string): string => {
    const conversation = conversations.find((item) => item.id === conversationId);
    return conversation ? conversationTitle(conversation, currentUserId) : 'Диалог';
  };

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Запланированные сообщения"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-elevated p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Clock className="h-4 w-4 text-brand" /> Запланированные
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            className="grid h-8 w-8 place-items-center rounded-xl hover:bg-line/60"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">Пока нет запланированных сообщений.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <ul className="mt-4 space-y-2">
                {pending.map((item) => (
                  <li key={item.id} className="rounded-2xl border border-line bg-canvas p-3">
                    <p className="text-xs font-semibold text-muted">
                      {titleFor(item.conversationId)} · {formatSendTime(item.sendAt)}
                    </p>
                    <p className="mt-1 truncate text-sm">{item.text || '📎 Файл'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-brand">
                        {statusLabels[item.status]}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2 text-xs text-danger"
                        onClick={() => onCancel(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Отменить
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {finished.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3">
                {finished.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
                    <span className="min-w-0 flex-1 truncate">
                      {titleFor(item.conversationId)} · {item.text || '📎 Файл'}
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${item.status === 'failed' ? 'text-danger' : ''}`}
                      title={item.failureReason}
                    >
                      {statusLabels[item.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
