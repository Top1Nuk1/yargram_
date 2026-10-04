import { useEffect, useRef, useState } from 'react';
import { Camera, UsersRound, X } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button, IconButton, Spinner } from '../../components/ui';
import { useTranslation } from '../../hooks/useLanguage';
import { avatarProps } from '../../lib/user';
import { MemberSearchList } from './MemberSearchList';
import type { Conversation, User } from '../../types';

interface GroupCreateModalProps {
  token: string;
  currentUserId: string;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}

const TITLE_MAX = 128;
const DESCRIPTION_MAX = 2_000;

/**
 * Создание группы: название, фото, описание и состав. Участников можно искать
 * по @username — так же, как в окне нового диалога, но выбирать нескольких.
 */
export function GroupCreateModal({ token, currentUserId, onClose, onCreated }: GroupCreateModalProps) {
  const t = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [selected, setSelected] = useState<User[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setError('');
    try {
      const attachment = await api.upload(token, file, 'image');
      setAvatarUrl(attachment.url);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('groups.avatarFailed'));
    } finally {
      setAvatarBusy(false);
    }
  }

  function toggleMember(user: User) {
    setSelected((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user],
    );
  }

  async function createGroup() {
    if (!title.trim()) {
      setError(t('groups.titleRequired'));
      titleRef.current?.focus();
      return;
    }
    setCreating(true);
    setError('');
    try {
      const conversation = await api.createGroup(token, {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        avatarUrl,
        memberIds: selected.map((user) => user.id),
      });
      onCreated({
        ...conversation,
        members: conversation.members?.length
          ? conversation.members
          : selected.map((user) => ({ id: user.id, user })),
      });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('groups.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  const trimmed = title.trim();

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
        aria-labelledby="group-create-title"
        className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-h-[680px] sm:max-w-[560px] sm:rounded-xl"
      >
        <header className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div>
            <h2 id="group-create-title" className="text-xl font-extrabold tracking-[-0.025em] text-ink">
              {t('groups.createTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t('groups.createSubtitle')}
            </p>
          </div>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </header>

        <div className="flex items-center gap-4 px-5 sm:px-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            className="group relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-brand transition hover:brightness-95 disabled:opacity-70"
            title={t('groups.uploadPhoto')}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : avatarBusy ? (
              <Spinner className="h-6 w-6" />
            ) : (
              <Camera className="h-7 w-7" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-[10px] font-semibold text-white">
              {avatarUrl ? t('groups.replace') : t('groups.photo')}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadAvatar(file);
            }}
          />

          <div className="min-w-0 flex-1 space-y-2">
            <label className="block">
              <span className="sr-only">{t('groups.titlePlaceholder')}</span>
              <input
                ref={titleRef}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('groups.titlePlaceholder')}
                className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-[15px] font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
              />
            </label>
            <label className="block">
              <span className="sr-only">{t('groups.descriptionGroupLabel')}</span>
              <input
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('groups.descriptionOptional')}
                className="h-10 w-full rounded-xl border border-line bg-canvas px-3.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
              />
            </label>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pt-4 sm:px-6">
            {selected.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleMember(user)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-soft py-1 pl-1 pr-2.5 text-xs font-semibold text-brand transition hover:bg-brand/20"
                title={t('groups.removeFromGroup')}
              >
                <Avatar name={user.displayName} src={user.avatarUrl} size="sm" className="h-6 w-6" {...avatarProps(user)} />
                <span className="truncate">{user.displayName}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 sm:px-6">
          <MemberSearchList
            token={token}
            currentUserId={currentUserId}
            selectedIds={selected.map((user) => user.id)}
            onToggle={toggleMember}
            placeholder={t('groups.addByUsername')}
            listClassName="min-h-[160px] flex-1"
          />
        </div>

        {error && (
          <p className="mx-5 mb-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger sm:mx-6" role="alert">
            {error}
          </p>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-line/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <UsersRound className="h-4 w-4" aria-hidden="true" />
            {selected.length > 0 ? t('groups.selectedCount', { count: selected.length }) : t('groups.canCreateAlone')}
          </span>
          <Button type="button" loading={creating} disabled={!trimmed || creating} onClick={() => void createGroup()}>
            {t('groups.create')}
          </Button>
        </footer>
      </section>
    </div>
  );
}
