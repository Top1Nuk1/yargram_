import { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Avatar } from '../../components/ui';
import { useTranslation } from '../../hooks/useLanguage';
import { api } from '../../api/client';
import { getConversationPeer } from '../../lib/conversation';
import type { Conversation, User } from '../../types';

export interface ExceptionUserItem {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  subtitle?: string;
  isBot?: boolean;
}

interface CallPrivacyExceptionsModalProps {
  title: string;
  initialUserIds: string[];
  conversations?: Conversation[];
  currentUserId?: string;
  token?: string;
  onSave: (userIds: string[]) => void;
  onClose: () => void;
}

export function CallPrivacyExceptionsModal({
  title,
  initialUserIds,
  conversations = [],
  currentUserId,
  token,
  onSave,
  onClose,
}: CallPrivacyExceptionsModalProps) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialUserIds);
  const [knownUsers, setKnownUsers] = useState<Record<string, ExceptionUserItem>>({});
  const [searchResults, setSearchResults] = useState<ExceptionUserItem[]>([]);
  const [friends, setFriends] = useState<User[]>([]);

  // Collect candidate items from existing conversations and friends
  const dialogItems = useMemo<ExceptionUserItem[]>(() => {
    const list: ExceptionUserItem[] = [];
    const seen = new Set<string>();

    for (const conv of conversations) {
      if (conv.type === 'group') {
        // Show group with participant count like Telegram
        const memberCount = conv.memberCount ?? conv.memberIds?.length ?? 0;
        const countText = memberCount === 1 ? '1 участник' : `${memberCount} участников`;
        list.push({
          id: conv.id,
          displayName: conv.title ?? conv.name ?? 'Группа',
          avatarUrl: conv.avatarUrl,
          subtitle: countText,
        });
      } else if (conv.type !== 'saved') {
        const peer =
          getConversationPeer(conv, currentUserId ?? '') ??
          conv.otherUser ??
          conv.users?.find((u) => u.id !== currentUserId) ??
          conv.users?.[0];
        if (peer && !seen.has(peer.id) && peer.id !== currentUserId) {
          seen.add(peer.id);
          let sub = peer.isBot ? 'бот' : '';
          if (!sub) {
            sub = peer.isOnline || peer.online ? 'в сети' : 'был(а) недавно';
          }
          list.push({
            id: peer.id,
            displayName: peer.displayName,
            avatarUrl: peer.avatarUrl ?? peer.avatar?.url,
            subtitle: sub,
            isBot: peer.isBot,
          });
        }
      }
    }

    // Also include friends / contacts who don't have an open conversation yet
    for (const f of friends) {
      if (!seen.has(f.id) && f.id !== currentUserId) {
        seen.add(f.id);
        list.push({
          id: f.id,
          displayName: f.displayName,
          avatarUrl: f.avatarUrl ?? f.avatar?.url,
          subtitle: f.isBot ? 'бот' : (f.online || f.isOnline ? 'в сети' : 'был(а) недавно'),
          isBot: f.isBot,
        });
      }
    }

    return list;
  }, [conversations, currentUserId, friends]);

  // Load friends if token available to populate contacts
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.friends(token)
      .then((res) => {
        if (cancelled) return;
        const friendUsers = (res.friends ?? []).map((f) => f.user).filter(Boolean);
        setFriends(friendUsers);
        setKnownUsers((prev) => {
          const next = { ...prev };
          for (const u of friendUsers) {
            if (!next[u.id]) {
              next[u.id] = {
                id: u.id,
                displayName: u.displayName,
                avatarUrl: u.avatarUrl ?? u.avatar?.url,
                subtitle: u.online || u.isOnline ? 'в сети' : 'был(а) недавно',
                isBot: u.isBot,
              };
            }
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Index known items by ID
  useEffect(() => {
    setKnownUsers((prev) => {
      const next = { ...prev };
      for (const item of dialogItems) {
        if (!next[item.id]) {
          next[item.id] = item;
        }
      }
      return next;
    });
  }, [dialogItems]);

  // Search remote users when typing if query doesn't match locally
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !token || trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      api.users(token, trimmed)
        .then((res) => {
          const items: ExceptionUserItem[] = (res.items ?? [])
            .filter((u) => u.id !== currentUserId)
            .map((u) => ({
              id: u.id,
              displayName: u.displayName,
              avatarUrl: u.avatarUrl ?? u.avatar?.url,
              subtitle: u.isBot ? 'бот' : u.online ? 'в сети' : 'был(а) недавно',
              isBot: u.isBot,
            }));
          setSearchResults(items);
          setKnownUsers((prev) => {
            const next = { ...prev };
            for (const it of items) next[it.id] = it;
            return next;
          });
        })
        .catch(() => {});
    }, 250);

    return () => clearTimeout(timer);
  }, [query, token, currentUserId]);

  // Filter items based on search query
  const displayedItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return dialogItems;

    const filteredDialogs = dialogItems.filter(
      (item) => item.displayName.toLowerCase().includes(trimmed) || item.subtitle?.toLowerCase().includes(trimmed),
    );

    const dialogIds = new Set(filteredDialogs.map((d) => d.id));
    const extraRemote = searchResults.filter((r) => !dialogIds.has(r.id));
    return [...filteredDialogs, ...extraRemote];
  }, [dialogItems, searchResults, query]);

  function toggleItem(item: ExceptionUserItem) {
    const conv = conversations.find((c) => c.id === item.id);
    const memberIds = conv?.memberIds;
    if (conv && conv.type === 'group' && memberIds && memberIds.length > 0) {
      const allSelected = memberIds.every((mId) => selectedIds.includes(mId));
      if (allSelected) {
        setSelectedIds((prev) => prev.filter((id) => !memberIds.includes(id)));
      } else {
        setSelectedIds((prev) => Array.from(new Set([...prev, ...memberIds])));
      }
      return;
    }

    if (selectedIds.includes(item.id)) {
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
    } else {
      setSelectedIds((prev) => [...prev, item.id]);
    }
  }

  function removeId(id: string) {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  }

  function isSelected(item: ExceptionUserItem): boolean {
    const conv = conversations.find((c) => c.id === item.id);
    const memberIds = conv?.memberIds;
    if (conv && conv.type === 'group' && memberIds && memberIds.length > 0) {
      return memberIds.every((mId) => selectedIds.includes(mId));
    }
    return selectedIds.includes(item.id);
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid items-end bg-[#171724]/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[90dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-w-[440px] sm:rounded-xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line/70 px-4 py-3 sm:px-5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            type="button"
            aria-label={t('modals.close')}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-brand-soft/60 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Selected chips and search input */}
        <div className="border-b border-line/70 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line/80 bg-canvas/40 px-2 py-1.5 focus-within:border-brand">
            {selectedIds.map((id) => {
              const item = knownUsers[id];
              const name = item?.displayName ?? id;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft border border-brand/20 py-0.5 pl-1 pr-2 text-xs font-medium text-ink transition"
                >
                  <Avatar name={name} src={item?.avatarUrl ?? undefined} className="h-5 w-5 text-[10px] shrink-0 aspect-square rounded-full" />
                  <span className="max-w-[120px] truncate">{name}</span>
                  <button
                    type="button"
                    aria-label={`Удалить ${name}`}
                    onClick={() => removeId(id)}
                    className="grid h-4 w-4 place-items-center rounded-full text-muted hover:bg-danger/20 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <div className="flex min-w-[100px] flex-1 items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-muted shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={selectedIds.length === 0 ? 'Поиск...' : ''}
                className="w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* List of dialogs / contacts */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 max-h-[380px]">
          {displayedItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              {query ? 'Ничего не найдено' : 'Список пуст'}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {displayedItems.map((item) => {
                const selected = isSelected(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleItem(item)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Avatar
                        name={item.displayName}
                        src={item.avatarUrl ?? undefined}
                        className="h-10 w-10 shrink-0 aspect-square rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">
                          {item.displayName}
                        </div>
                        {item.subtitle && (
                          <div className="truncate text-xs text-muted">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      <div
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                          selected
                            ? 'border-brand bg-brand text-white'
                            : 'border-muted/40 bg-transparent'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 stroke-[2.5]" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer actions */}
        <footer className="flex items-center justify-end gap-2 border-t border-line/70 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-brand-soft/40 hover:text-ink focus-visible:outline-none"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(selectedIds);
              onClose();
            }}
            className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('common.save')}
          </button>
        </footer>
      </section>
    </div>
  );
}
