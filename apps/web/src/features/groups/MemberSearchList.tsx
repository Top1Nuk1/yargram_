import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { api } from '../../api/client';
import { Avatar, InlineError, Spinner } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { avatarProps } from '../../lib/user';
import type { User } from '../../types';

interface MemberSearchListProps {
  token: string;
  currentUserId: string;
  /** Кого отмечать галочкой: обычно это выбранные или уже добавленные. */
  selectedIds: string[];
  onToggle: (user: User) => void;
  /** Кого не показывать вовсе — например, тех, кто уже в группе. */
  excludeIds?: string[];
  placeholder?: string;
  /** Высота списка: в окне создания она одна, в панели группы — другая. */
  listClassName?: string;
  autoFocus?: boolean;
}

type SearchState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Поиск людей по @username с отметкой выбранных. Один и тот же список
 * используется и при создании группы, и при добавлении новых участников.
 */
export function MemberSearchList({
  token,
  currentUserId,
  selectedIds,
  onToggle,
  excludeIds = [],
  placeholder = 'Найти человека по @username',
  listClassName = 'min-h-[160px]',
  autoFocus = false,
}: MemberSearchListProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [state, setState] = useState<SearchState>('idle');

  useEffect(() => {
    const normalized = query.trim().replace(/^@/, '');
    if (normalized.length < 3) {
      setResults([]);
      setState('idle');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState('loading');
      try {
        const found = await api.users(token, normalized, controller.signal);
        setResults(found.items.filter((user) => user.id !== currentUserId));
        setState('success');
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setState('error');
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentUserId, query, token]);

  const visible = results.filter((user) => !excludeIds.includes(user.id));

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-3 h-5 w-5 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-line bg-canvas pl-11 pr-4 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
        />
      </div>

      <div className={`overflow-y-auto px-1 pt-2 ${listClassName}`}>
        {state === 'idle' && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Введите хотя бы три символа username.
          </p>
        )}
        {state === 'loading' && (
          <div className="grid place-items-center py-8 text-brand" role="status">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {state === 'error' && <InlineError message="Не удалось выполнить поиск." />}
        {state === 'success' && visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {results.length > 0 ? 'Все найденные уже в группе.' : 'Никого не нашли.'}
          </p>
        )}
        {state === 'success' && visible.length > 0 && (
          <ul className="space-y-1" aria-label="Найденные пользователи">
            {visible.map((user) => {
              const chosen = selectedIds.includes(user.id);
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(user)}
                    aria-pressed={chosen}
                    className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-brand-soft/35"
                  >
                    <Avatar name={user.displayName} src={user.avatarUrl} size="md" {...avatarProps(user)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">
                        <UserName name={user.displayName} user={user} size="sm" />
                      </span>
                      {user.username && (
                        <span className="mt-0.5 block truncate text-xs text-muted">@{user.username}</span>
                      )}
                    </span>
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${
                        chosen ? 'border-brand bg-brand text-white' : 'border-line text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
