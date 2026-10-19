import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, UsersRound, X } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button, IconButton, InlineError, Spinner } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { avatarProps } from '../../lib/user';
import type { Conversation, User } from '../../types';
import { useTranslation } from '../../hooks/useLanguage';

interface UserSearchModalProps {
  token: string;
  currentUserId: string;
  onClose: () => void;
  onConversation: (conversation: Conversation) => void;
  onCreateGroup?: () => void;
}

type SearchState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Какой @ник показать в строке результата. Если человека нашли по
 * дополнительному юзернейму, показываем именно его — иначе не понятно, почему
 * строка попала в выдачу.
 */
function displayHandle(user: User, query: string): string {
  const wanted = query.trim().replace(/^@/, '').toLowerCase();
  const handles = [user.username ?? '', ...(user.usernames ?? [])].filter(Boolean);
  const matched = handles.find((handle) => handle.toLowerCase().includes(wanted));
  return matched ?? handles[0] ?? '';
}

export function UserSearchModal({ token, currentUserId, onClose, onConversation, onCreateGroup }: UserSearchModalProps) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [error, setError] = useState('');
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const normalized = query.trim().replace(/^@/, '');
    if (normalized.length < 3) {
      setUsers([]);
      setState('idle');
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState('loading');
      setError('');
      try {
        const result = await api.users(token, normalized, controller.signal);
        // Без основного ника человек тоже находится — по дополнительному.
        setUsers(
          result.items.filter(
            (user) => user.id !== currentUserId && (Boolean(user.username) || Boolean(user.usernames?.length)),
          ),
        );
        setState('success');
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof ApiError ? reason.message : t('modals.searchFailed'));
        setState('error');
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentUserId, query, token, t]);

  async function createConversation(user: User) {
    setCreatingUserId(user.id);
    setError('');
    try {
      const conversation = await api.createDirect(token, user.id);
      onConversation({
        ...conversation,
        otherUser: conversation.otherUser ?? user,
      });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('modals.createChatFailed'));
    } finally {
      setCreatingUserId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid items-end bg-[#171724]/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-search-title"
        className="flex max-h-[86dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-h-[620px] sm:max-w-[520px] sm:rounded-xl"
      >
        <header className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div>
            <h2 id="user-search-title" className="text-xl font-extrabold tracking-[-0.025em] text-ink">{t('modals.newChat')}</h2>
            <p className="mt-1 text-sm text-muted">{t('modals.searchSubtitle')}</p>
          </div>
          <IconButton label={t('modals.close')} onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </header>

        <div className="px-5 sm:px-6">
          <label htmlFor="user-search" className="sr-only">{t('modals.searchUsersLabel')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              id="user-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
              placeholder={t('modals.searchExample')}
              autoComplete="off"
            />
          </div>
        </div>

        {onCreateGroup && !query.trim() && (
          <div className="px-5 pt-3 sm:px-6">
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateGroup();
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas p-3 text-left transition hover:bg-brand-soft/40 hover:border-brand/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <UsersRound className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{t('sidebar.createGroup')}</div>
                <div className="text-xs text-muted">Создать новую группу для общения</div>
              </div>
            </button>
          </div>
        )}

        <div className="min-h-[245px] flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
          {state === 'idle' && (
            <div className="grid min-h-[245px] place-items-center px-8 text-center">
              <div>
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] bg-brand-soft text-brand">
                  <UserPlus className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="mt-4 font-semibold text-ink">{t('modals.whoToFind')}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{t('modals.enterThreeChars')}</p>
              </div>
            </div>
          )}

          {state === 'loading' && (
            <div className="grid min-h-[245px] place-items-center text-brand" role="status">
              <div className="text-center">
                <Spinner className="mx-auto h-7 w-7" />
                <p className="mt-3 text-sm text-muted">{t('modals.searching')}</p>
              </div>
            </div>
          )}

          {state === 'error' && <InlineError message={error} />}

          {state === 'success' && users.length === 0 && (
            <div className="grid min-h-[245px] place-items-center px-8 text-center">
              <div>
                <p className="font-semibold text-ink">{t('modals.noResults')}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{t('modals.noResultsHint')}</p>
              </div>
            </div>
          )}

          {state === 'success' && users.length > 0 && (
            <ul className="space-y-1" aria-label={t('modals.foundUsers')}>
              {users.map((user) => (
                <li key={user.id}>
                  <div className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-brand-soft/35">
                    <Avatar name={user.displayName} src={user.avatarUrl} size="md" online={user.isOnline} {...avatarProps(user)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">
                        <UserName name={user.displayName} user={user} size="sm" />
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {displayHandle(user, query) ? `@${displayHandle(user, query)}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-10 rounded-xl px-3"
                      loading={creatingUserId === user.id}
                      disabled={creatingUserId !== null}
                      onClick={() => createConversation(user)}
                    >
                      {t('modals.write')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && state !== 'error' && (
            <p className="mx-2 mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>
          )}
        </div>
      </section>
    </div>
  );
}
