import {
  Ban,
  Check,
  Flag,
  Forward,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { ScamWarning } from '../../components/ScamWarning';
import { Avatar, Button, IconButton, InlineError, Spinner } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { AdditionalHandles } from '../../components/AdditionalHandles';
import { conversationTitle, getConversationPeer, messageSenderId } from '../../lib/conversation';
import { formatMessageTime } from '../../lib/format';
import { avatarProps } from '../../lib/user';
import type { Conversation, Message, ReportReason, User, FavoriteNote } from '../../types';
import { formatLastSeen, messageSummary } from './messengerUtils';
import { presenceTextClass } from '../../lib/presence';

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

function Modal({ title, description, onClose, children, width = 'sm:max-w-[560px]' }: ModalProps) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] grid items-end bg-[#171724]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:rounded-xl ${width}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>}
          </div>
          <IconButton label="Закрыть" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">{children}</div>
      </section>
    </div>
  );
}

interface ForwardMessageModalProps {
  token: string;
  message: Message;
  conversations: Conversation[];
  currentUserId: string;
  onClose: () => void;
  onForwarded: (message: Message, targetConversationId: string) => void;
  onUnauthorized: () => void;
}

export function ForwardMessageModal({ token, message, conversations, currentUserId, onClose, onForwarded, onUnauthorized }: ForwardMessageModalProps) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    return conversations.filter((conversation) => !conversation.archived && (!normalized || conversationTitle(conversation, currentUserId).toLocaleLowerCase('ru-RU').includes(normalized)));
  }, [conversations, currentUserId, query]);

  async function forward(conversation: Conversation) {
    setBusyId(conversation.id);
    setError('');
    try {
      const forwarded = await api.forwardMessage(token, message.conversationId, message.id, conversation.id);
      onForwarded(forwarded, conversation.id);
      onClose();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        onUnauthorized();
        return;
      }
      setError(reason instanceof ApiError ? reason.message : 'Не удалось переслать сообщение.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Переслать сообщение" description={messageSummary(message)} onClose={onClose}>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-line bg-canvas pl-10 pr-4 text-sm outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand/10" placeholder="Найти диалог" />
      </label>
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <ul className="mt-3 space-y-1">
        {visible.map((conversation) => {
          const peer = getConversationPeer(conversation, currentUserId);
          const title = conversationTitle(conversation, currentUserId);
          return (
            <li key={conversation.id}>
              <button type="button" disabled={busyId !== null} onClick={() => void forward(conversation)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-brand-soft/45 disabled:opacity-55">
                <Avatar name={title} src={peer?.avatarUrl} size="sm" online={peer?.isOnline ?? peer?.online} {...avatarProps(peer, title)} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{title}</span><span className="block truncate text-xs text-muted">{peer?.username ? `@${peer.username}` : 'Личный диалог'}</span></span>
                {busyId === conversation.id ? <Spinner className="h-4 w-4 text-brand" /> : <Forward className="h-4 w-4 text-muted" />}
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="py-10 text-center text-sm text-muted">Подходящих диалогов нет.</p>}
    </Modal>
  );
}

interface FavoritesModalProps {
  token: string;
  currentUserId: string;
  onClose: () => void;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  onUnauthorized: () => void;
}

export function FavoritesModal({ token, currentUserId, onClose, onOpenMessage, onUnauthorized }: FavoritesModalProps) {
  const [items, setItems] = useState<Message[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api.favorites(token, controller.signal).then((result) => {
      setItems(result.items);
      setState('ready');
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      if (reason instanceof ApiError && reason.status === 401) {
        onUnauthorized();
        return;
      }
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить избранное.');
      setState('error');
    });
    return () => controller.abort();
  }, [onUnauthorized, token]);

  return (
    <Modal title="Избранные сообщения" description="Сохранённые сообщения доступны после перезапуска" onClose={onClose}>
      {state === 'loading' && <div className="grid min-h-52 place-items-center"><Spinner className="h-7 w-7 text-brand" /></div>}
      {state === 'error' && <InlineError message={error} />}
      {state === 'ready' && items.length === 0 && (
        <div className="grid min-h-52 place-items-center text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-brand-soft text-brand"><Star className="h-7 w-7" /></span><p className="mt-4 font-bold">Здесь пока пусто</p><p className="mt-1 text-sm text-muted">Добавьте сообщение через меню действий.</p></div></div>
      )}
      {state === 'ready' && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((message) => (
            <li key={message.id}>
              <button type="button" className="w-full rounded-xl border border-line bg-canvas p-3 text-left transition hover:border-brand/35 hover:bg-brand-soft/20" onClick={() => { onOpenMessage(message.conversationId, message.id); onClose(); }}>
                <span className="flex items-center gap-2 text-[11px] font-bold text-brand"><Star className="h-3.5 w-3.5 fill-current" /><UserName size="sm" name={messageSenderId(message) === currentUserId ? 'Вы' : message.sender?.displayName ?? message.author?.displayName ?? 'Собеседник'} user={messageSenderId(message) === currentUserId ? null : message.sender ?? message.author} /><span className="ml-auto font-medium text-muted">{formatMessageTime(message.createdAt)}</span></span>
                <span className="mt-1.5 line-clamp-3 block whitespace-pre-wrap text-sm leading-5 text-ink">{messageSummary(message)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Спам' },
  { value: 'abuse', label: 'Оскорбления' },
  { value: 'fraud', label: 'Мошенничество' },
  { value: 'other', label: 'Другое' },
];

interface PeerProfileModalProps {
  token: string;
  user: User;
  blocked: boolean;
  onClose: () => void;
  onMessage: () => void;
  onAudioCall: () => void;
  onVideoCall: () => void;
  onBlockedChange: (blocked: boolean, user?: User) => void;
  onUnauthorized: () => void;
}

export function PeerProfileModal({ token, user, blocked, onClose, onMessage, onAudioCall, onVideoCall, onBlockedChange, onUnauthorized }: PeerProfileModalProps) {
  const [profile, setProfile] = useState(user);
  const [isBlocked, setIsBlocked] = useState(blocked || Boolean(user.blockedByMe));
  // Удалённый аккаунт: историю можно читать, но писать и звонить нельзя.
  const isDeleted = Boolean(profile.isDeleted);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setProfile((current) => ({ ...current, ...user }));
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    void api.user(token, user.id, controller.signal).then((fresh) => {
      setProfile((current) => ({
        ...current,
        ...fresh,
        // Presence is delivered through Socket.IO; the REST profile deliberately
        // does not guess whether a browser is connected at this exact moment.
        online: current.online,
        isOnline: current.isOnline,
      }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [token, user.id]);

  async function toggleBlock() {
    if (!isBlocked && !window.confirm(`Заблокировать @${profile.username ?? profile.displayName}? Он не сможет писать и звонить вам.`)) return;
    setBusy(true);
    setError('');
    try {
      const result = isBlocked ? await api.unblockUser(token, profile.id) : await api.blockUser(token, profile.id);
      const next = !isBlocked;
      setIsBlocked(next);
      onBlockedChange(next, result.user);
      setNotice(next ? 'Пользователь заблокирован.' : 'Пользователь разблокирован.');
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized();
      setError(reasonError instanceof ApiError ? reasonError.message : 'Не удалось изменить блокировку.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    setBusy(true);
    setError('');
    try {
      await api.reportUser(token, profile.id, reason, details);
      setReportOpen(false);
      setNotice('Жалоба отправлена и сохранена.');
      setDetails('');
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized();
      setError(reasonError instanceof ApiError ? reasonError.message : 'Не удалось отправить жалобу.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Профиль" onClose={onClose} width="sm:max-w-[520px]">
      <div className="text-center">
        <Avatar name={profile.displayName} src={profile.avatarUrl ?? profile.avatar?.url} size="xl" online={profile.isOnline ?? profile.online} className="justify-center" {...avatarProps(profile)} />
        <h3 className="mt-4 text-xl font-black tracking-[-0.025em]">
          <UserName name={profile.displayName} user={profile} />
        </h3>
        <div className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold text-brand">
          {profile.username ? <span>@{profile.username}</span> : null}
        </div>
        <AdditionalHandles
          usernames={profile.usernames}
          primaryUsername={profile.username}
          className="mt-0.5 block text-center text-muted"
        />
        <p className={`mt-1 text-xs ${presenceTextClass(profile)}`}>{formatLastSeen(profile)}</p>
      </div>
      {/* Описание помеченного SCAM — предупреждение владельца Yargram, копировать нельзя. */}
      {profile.scam ? (
        <ScamWarning
          text={profile.bio ?? ''}
          className="mx-auto mt-5 max-w-md whitespace-pre-wrap rounded-xl bg-canvas px-4 py-3 text-center text-sm leading-6 text-ink"
        />
      ) : (
        profile.bio && <p className="mx-auto mt-5 max-w-md whitespace-pre-wrap rounded-xl bg-canvas px-4 py-3 text-center text-sm leading-6 text-ink">{profile.bio}</p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-line p-3 text-xs">
        <div><dt className="text-muted">Статус</dt><dd className="mt-0.5 font-bold text-ink">{profile.isOnline ?? profile.online ? 'В сети' : 'Не в сети'}</dd></div>
        <div><dt className="text-muted">В Yargram с</dt><dd className="mt-0.5 font-bold text-ink">{profile.createdAt ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(profile.createdAt)) : 'Дата неизвестна'}</dd></div>
      </dl>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button variant="secondary" className="min-h-12 flex-col gap-0.5 px-2 text-xs" disabled={isDeleted} onClick={onMessage}><MessageCircle className="h-4 w-4" />Написать</Button>
        <Button variant="secondary" className="min-h-12 flex-col gap-0.5 px-2 text-xs" disabled={isBlocked || isDeleted} onClick={onAudioCall}><Phone className="h-4 w-4" />Позвонить</Button>
        <Button variant="secondary" className="min-h-12 flex-col gap-0.5 px-2 text-xs" disabled={isBlocked || isDeleted} onClick={onVideoCall}><Video className="h-4 w-4" />Видео</Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button variant={isBlocked ? 'secondary' : 'danger'} loading={busy && !reportOpen} onClick={() => void toggleBlock()}>{isBlocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}{isBlocked ? 'Разблокировать' : 'Заблокировать'}</Button>
        <Button variant="secondary" onClick={() => setReportOpen((value) => !value)}><Flag className="h-4 w-4" />Пожаловаться</Button>
      </div>
      {reportOpen && (
        <div className="mt-3 animate-slide-up rounded-xl border border-line bg-canvas p-3 text-left">
          <p className="text-xs font-bold">Причина жалобы</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {REPORT_REASONS.map((item) => <button key={item.value} type="button" className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${reason === item.value ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink'}`} onClick={() => setReason(item.value)}>{reason === item.value && <Check className="h-3.5 w-3.5" />}{item.label}</button>)}
          </div>
          {reason === 'other' && <textarea value={details} onChange={(event) => setDetails(event.target.value.slice(0, 1000))} className="mt-2 min-h-20 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-brand/50" placeholder="Опишите проблему" />}
          <Button className="mt-2 w-full" loading={busy && reportOpen} onClick={() => void submitReport()}><Flag className="h-4 w-4" />Отправить жалобу</Button>
        </div>
      )}
      {notice && <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">{notice}</p>}
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-center text-xs text-danger">{error}</p>}
    </Modal>
  );
}

interface BlockedUsersModalProps {
  token: string;
  onClose: () => void;
  onUnauthorized: () => void;
}

export function BlockedUsersModal({ token, onClose, onUnauthorized }: BlockedUsersModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api.blockedUsers(token, controller.signal).then((result) => setUsers(result.items)).catch((reason: unknown) => {
      if (reason instanceof ApiError && reason.status === 401) onUnauthorized();
      else if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('Не удалось загрузить список.');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [onUnauthorized, token]);

  async function unblock(user: User) {
    setBusyId(user.id);
    setError('');
    try {
      await api.unblockUser(token, user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось разблокировать.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Заблокированные" description="Эти пользователи не могут писать и звонить вам" onClose={onClose}>
      {loading && <div className="grid min-h-48 place-items-center"><Spinner className="h-7 w-7 text-brand" /></div>}
      {!loading && users.length === 0 && <div className="grid min-h-48 place-items-center text-center"><div><ShieldCheck className="mx-auto h-9 w-9 text-success" /><p className="mt-3 font-bold">Список пуст</p></div></div>}
      <ul className="space-y-1">{users.map((user) => <li key={user.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-brand-soft/35"><Avatar name={user.displayName} src={user.avatarUrl} size="sm" {...avatarProps(user)} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold"><UserName name={user.displayName} user={user} size="sm" /></span><span className="block truncate text-xs text-muted">{user.username ? `@${user.username}` : ''}</span></span><Button variant="secondary" className="min-h-9 rounded-xl px-3 text-xs" loading={busyId === user.id} onClick={() => void unblock(user)}>Разблокировать</Button></li>)}</ul>
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </Modal>
  );
}


export function NotesModal({
  token,
  onClose,
  onUnauthorized,
}: {
  token: string;
  onClose: () => void;
  onUnauthorized: () => void;
}) {
  const [notes, setNotes] = useState<FavoriteNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void api.getNotes(token, controller.signal).then((result) => setNotes(result.items)).catch((reason: unknown) => {
      if (reason instanceof ApiError && reason.status === 401) onUnauthorized();
      else setError('Не удалось загрузить заметки.');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, onUnauthorized]);

  async function addNote() {
    if (!newContent.trim()) return;
    setBusyId('new');
    setError('');
    try {
      const note = await api.addNote(token, newContent.trim());
      setNotes((prev) => [note, ...prev]);
      setNewContent('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось создать заметку.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateNote(id: string, content: string) {
    setBusyId(id);
    setError('');
    try {
      const note = await api.updateNote(token, id, content);
      setNotes((prev) => prev.map((n) => (n.id === id ? note : n)));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось обновить заметку.');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteNote(id: string) {
    setBusyId(id);
    setError('');
    try {
      await api.deleteNote(token, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить заметку.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Избранные заметки" onClose={onClose}>
      <div className="mb-4">
        <textarea
          className="w-full rounded border px-2 py-1"
          rows={3}
          placeholder="Новая заметка..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
        />
        <Button
          className="mt-2"
          loading={busyId === 'new'}
          onClick={addNote}
        >
          Добавить
        </Button>
      </div>
      {loading && <Spinner className="h-7 w-7 text-brand" />}
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <ul className="space-y-1">
        {notes.map((note) => (
          <li key={note.id} className="rounded-xl p-2 bg-surface">
            <textarea
              className="w-full rounded border px-2 py-1"
              rows={2}
              defaultValue={note.content}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val && val !== note.content) void updateNote(note.id, val);
              }}
            />
            <Button
              variant="secondary"
              className="mt-1 min-h-9 rounded-xl px-3 text-xs"
              loading={busyId === note.id}
              onClick={() => void deleteNote(note.id)}
            >
              Удалить
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}


