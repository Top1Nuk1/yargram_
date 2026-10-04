import { Check, UserMinus, UserPlus, UsersRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button, Spinner } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { useTranslation } from '../../hooks/useLanguage';
import { avatarProps } from '../../lib/user';
import type { FriendEntry, FriendsOverview, User } from '../../types';
import { Modal } from '../messenger/MessengerModals';

interface FriendsModalProps {
  token: string;
  onClose: () => void;
  onUnauthorized: () => void;
  /** Открыть профиль человека — оттуда можно написать или позвонить. */
  onOpenProfile: (user: User) => void;
}

const emptyOverview: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

/**
 * Экран «Друзья»: друзья, входящие заявки и отправленные. Список и обе очереди
 * заявок приходят одним запросом, поэтому разделы всегда согласованы — принятая
 * заявка не висит одновременно и в друзьях, и во входящих.
 *
 * Всё живёт на сервере: заявка приходит человеку по сокету, и тот, кто ждёт
 * ответа, видит изменения сразу — без перезагрузки и без ручного обновления.
 */
export function FriendsModal({ token, onClose, onUnauthorized, onOpenProfile }: FriendsModalProps) {
  const t = useTranslation();
  const [overview, setOverview] = useState<FriendsOverview>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(
    (signal?: AbortSignal) =>
      api
        .friends(token, signal)
        .then((result) =>
          setOverview({
            friends: result.friends ?? [],
            incoming: result.incoming ?? [],
            outgoing: result.outgoing ?? [],
          }),
        )
        .catch((reason: unknown) => {
          if (reason instanceof ApiError && reason.status === 401) onUnauthorized();
          else if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
            setError(t('friends.loadFailed'));
          }
        })
        .finally(() => setLoading(false)),
    [onUnauthorized, t, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Принятие заявки: человек переезжает из входящих в друзья. */
  async function accept(entry: FriendEntry) {
    await run(entry, async () => {
      await api.acceptFriend(token, entry.user.id);
      setNotice(t('friends.accepted', { name: entry.user.displayName }));
    });
  }

  /** Отклонение: заявка исчезает у обоих, дружбы не будет. */
  async function decline(entry: FriendEntry) {
    await run(entry, async () => {
      await api.declineFriend(token, entry.user.id);
    });
  }

  /** Удаление из друзей. Сервер заодно снимает неотвеченные заявки. */
  async function remove(entry: FriendEntry) {
    if (!window.confirm(t('friends.confirmRemove', { name: entry.user.displayName }))) return;
    await run(entry, async () => {
      await api.removeFriend(token, entry.user.id);
      setNotice(t('friends.removed', { name: entry.user.displayName }));
    });
  }

  async function run(entry: FriendEntry, action: () => Promise<void>) {
    setBusyId(entry.user.id);
    setError('');
    setNotice('');
    try {
      await action();
      setOverview(await api.friends(token));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        onUnauthorized();
        return;
      }
      setError(reason instanceof ApiError ? reason.message : t('friends.actionFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      title={t('friends.title')}
      description={t('friends.subtitle')}
      onClose={onClose}
      width="sm:max-w-[520px]"
    >
      {loading && (
        <div className="grid min-h-48 place-items-center">
          <Spinner className="h-7 w-7 text-brand" />
        </div>
      )}

      {!loading && overview.friends.length === 0 && overview.incoming.length === 0 && overview.outgoing.length === 0 && (
        <div className="grid min-h-48 place-items-center text-center">
          <div>
            <UsersRound className="mx-auto h-9 w-9 text-muted" aria-hidden="true" />
            <p className="mt-3 font-bold text-ink">{t('friends.empty')}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{t('friends.emptyHint')}</p>
          </div>
        </div>
      )}

      {/* Входящие — наверху: это единственное, что требует действий. */}
      {overview.incoming.length > 0 && (
        <section className="mb-4">
          <h3 className="px-1 pb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            {t('friends.incomingSection', { count: overview.incoming.length })}
          </h3>
          <ul className="space-y-1">
            {overview.incoming.map((entry) => (
              <li key={entry.user.id} className="flex items-center gap-3 rounded-xl bg-brand-soft/40 p-2.5">
                <button type="button" onClick={() => onOpenProfile(entry.user)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={entry.user.displayName} src={entry.user.avatarUrl ?? entry.user.avatar?.url} size="sm" {...avatarProps(entry.user) } />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      <UserName name={entry.user.displayName} user={entry.user} size="sm" />
                    </span>
                    <span className="block truncate text-xs text-muted">{t('friends.wantsToAddYou')}</span>
                  </span>
                </button>
                <Button
                  className="min-h-9 rounded-xl px-3 text-xs"
                  loading={busyId === entry.user.id}
                  onClick={() => void accept(entry)}
                >
                  <Check className="h-4 w-4" />
                  {t('friends.accept')}
                </Button>
                <button
                  type="button"
                  aria-label={t('friends.decline')}
                  title={t('friends.decline')}
                  disabled={busyId === entry.user.id}
                  onClick={() => void decline(entry)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overview.friends.length > 0 && (
        <section className="mb-4">
          <h3 className="px-1 pb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            {t('friends.friendsSection', { count: overview.friends.length })}
          </h3>
          <ul className="space-y-1">
            {overview.friends.map((entry) => (
              <li key={entry.user.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-brand-soft/35">
                <button type="button" onClick={() => onOpenProfile(entry.user)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={entry.user.displayName} src={entry.user.avatarUrl ?? entry.user.avatar?.url} size="sm" {...avatarProps(entry.user) } />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      <UserName name={entry.user.displayName} user={entry.user} size="sm" />
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {entry.user.username ? `@${entry.user.username}` : t('friends.noUsername')}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t('friends.remove', { name: entry.user.displayName })}
                  title={t('friends.remove', { name: entry.user.displayName })}
                  disabled={busyId === entry.user.id}
                  onClick={() => void remove(entry)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Отправленные заявки: видно, что ждём ответа, и можно передумать. */}
      {overview.outgoing.length > 0 && (
        <section>
          <h3 className="px-1 pb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            {t('friends.outgoingSection', { count: overview.outgoing.length })}
          </h3>
          <ul className="space-y-1">
            {overview.outgoing.map((entry) => (
              <li key={entry.user.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-brand-soft/35">
                <button type="button" onClick={() => onOpenProfile(entry.user)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={entry.user.displayName} src={entry.user.avatarUrl ?? entry.user.avatar?.url} size="sm" {...avatarProps(entry.user) } />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      <UserName name={entry.user.displayName} user={entry.user} size="sm" />
                    </span>
                    <span className="block truncate text-xs text-muted">{t('friends.requestSent')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t('friends.cancelRequest')}
                  title={t('friends.cancelRequest')}
                  disabled={busyId === entry.user.id}
                  onClick={() => void decline(entry)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">{notice}</p>
      )}
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-muted">
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {t('friends.addHint')}
      </p>
    </Modal>
  );
}
