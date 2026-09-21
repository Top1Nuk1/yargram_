import {
  AlertTriangle,
  Ban,
  Calendar,
  Copy,
  Edit2,
  FileText,
  Gift,
  Image as ImageIcon,
  Link2,
  Mic,
  MoreHorizontal,
  ShieldCheck,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button } from '../../components/ui';
import { UserName } from '../../components/UserName';
import type { ReportReason, User } from '../../types';
import { formatLastSeen } from '../messenger/messengerUtils';

type Mode = 'own' | 'peer' | 'public';

interface UserProfileSheetProps {
  token: string;
  user: User;
  mode: Mode;
  /** Действия для чужого профиля. */
  onMessage?: () => void;
  onAudioCall?: () => void;
  onVideoCall?: () => void;
  onMore?: () => void;
  /** Для своего профиля — открывает редактирование (существующая модалка настроек). */
  onEdit?: () => void;
  onBlockedChange?: (blocked: boolean, user: User) => void;
  onUnauthorized?: () => void;
  onClose: () => void;
}

/**
 * Унифицированный лист профиля в стиле Telegram Desktop:
 * - Свой: аватар с карандашом, имя, био, юзернейм, день рождения, кнопка «Изменить профиль».
 * - Чужой / публичный: аватар, имя, статус, ряд кнопок Чат/Звук/Звонок/Ещё, био,
 *   юзернейм, день рождения, медиа-счётчики, общие группы, контекстное меню, красная кнопка «Заблокировать».
 */
export function UserProfileSheet({
  token,
  user,
  mode,
  onMessage,
  onAudioCall,
  onVideoCall,
  onMore,
  onEdit,
  onBlockedChange,
  onUnauthorized,
  onClose,
}: UserProfileSheetProps) {
  const [profile, setProfile] = useState(user);
  const [isBlocked, setIsBlocked] = useState(Boolean(user.blockedByMe));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');

  useEffect(() => setProfile(user), [user]);

  // Свежий профиль с сервера, но presence не перетираем — он идёт по сокету.
  useEffect(() => {
    if (mode === 'own') return;
    const controller = new AbortController();
    void api.user(token, user.id, controller.signal).then((fresh) => {
      setProfile((current) => ({
        ...current,
        ...fresh,
        online: current.online,
        isOnline: current.isOnline,
      }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [mode, token, user.id]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const online = profile.isOnline ?? profile.online;
  const age = useMemo(() => ageFromBirthday(profile.birthday), [profile.birthday]);

  async function toggleBlock() {
    if (!isBlocked && !window.confirm(`Заблокировать @${profile.username ?? profile.displayName}? Он не сможет писать и звонить вам.`)) return;
    setBusy(true);
    setError('');
    try {
      const result = isBlocked ? await api.unblockUser(token, profile.id) : await api.blockUser(token, profile.id);
      const next = !isBlocked;
      setIsBlocked(next);
      onBlockedChange?.(next, result.user ?? profile);
      setNotice(next ? 'Пользователь заблокирован.' : 'Пользователь разблокирован.');
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : 'Не удалось изменить блокировку.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    setBusy(true);
    setError('');
    try {
      await api.reportUser(token, profile.id, reportReason, reportDetails);
      setReportOpen(false);
      setNotice('Жалоба отправлена и сохранена.');
      setReportDetails('');
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : 'Не удалось отправить жалобу.');
    } finally {
      setBusy(false);
    }
  }

  async function copyUsername() {
    const handle = profile.username ?? '';
    if (!handle) return;
    try {
      await navigator.clipboard.writeText(`@${handle}`);
      setNotice('Юзернейм скопирован.');
    } catch {
      setError('Не удалось скопировать.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] grid items-end bg-[#0c1218]/45 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Профиль"
        className="flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-xl bg-surface shadow-float sm:max-w-[440px] sm:rounded-xl"
      >
        {/* Шапка: аватар, имя/бейджи, кнопки закрытия/редактирования */}
        <header className="relative px-5 pb-3 pt-5 text-center">
          {mode === 'own' && onEdit && (
            <button
              type="button"
              aria-label="Изменить профиль"
              onClick={onEdit}
              className="absolute right-12 top-4 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
            >
              <Edit2 className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
          <Avatar
            name={profile.displayName}
            src={profile.avatarUrl ?? profile.avatar?.url}
            size="xl"
            online={mode !== 'own' ? online : undefined}
            className="mx-auto"
          />
          <h2 className="mt-3 text-lg font-extrabold tracking-[-0.02em] text-ink">
            <UserName name={profile.displayName} user={profile} />
          </h2>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-brand">
            {mode === 'own' ? (
              online ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />в сети</span> : <span className="text-muted">{formatLastSeen(profile)}</span>
            ) : online ? (
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />в сети</span>
            ) : (
              <span className="text-muted">{formatLastSeen(profile)}</span>
            )}
          </div>
        </header>

        {/* Ряд быстрых действий — только для чужого профиля. */}
        {mode !== 'own' && (
          <div className="grid grid-cols-4 gap-2 px-4">
            <ActionTile icon={<FileText className="h-5 w-5" />} label="Чат" onClick={onMessage} />
            <ActionTile icon={isBlocked ? <MicOff /> : <Mic className="h-5 w-5" />} label="Звук" disabled={isBlocked} onClick={onAudioCall} />
            <ActionTile icon={<Video className="h-5 w-5" />} label="Звонок" disabled={isBlocked} onClick={onVideoCall} />
            <ActionTile icon={<MoreHorizontal className="h-5 w-5" />} label="Ещё" onClick={onMore} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Биография. */}
          {profile.bio && (
            <div className="px-5 pt-3">
              <p className="whitespace-pre-wrap text-center text-sm leading-6 text-ink">{profile.bio}</p>
            </div>
          )}

          {/* Юзернейм + имя пользователя + копирование. */}
          <div className="mt-4 px-5">
            <button
              type="button"
              onClick={() => void copyUsername()}
              disabled={!profile.username}
              className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-canvas disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-brand">{profile.username ? `@${profile.username}` : '—'}</span>
                <span className="block text-xs text-muted">Имя пользователя</span>
              </span>
              {profile.username && <Copy className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
            </button>
            {profile.usernames && profile.usernames.length > 0 && (
              <p className="px-1 pt-1 text-[12px] text-muted">
                а также{' '}
                {profile.usernames
                  .filter((alias) => alias.toLowerCase() !== profile.username?.toLowerCase())
                  .map((alias, index, list) => (
                    <span key={alias}>
                      <span className="font-semibold text-brand">@{alias}</span>
                      {index < list.length - 1 ? ', ' : ''}
                    </span>
                  ))}
              </p>
            )}
          </div>

          {/* Официальный статус — для подтверждённых публичных аккаунтов. */}
          {profile.isVerified && (
            <p className="mx-5 mt-3 rounded-xl bg-canvas px-3 py-2 text-center text-xs leading-5 text-muted">
              Этот аккаунт подтверждён представителями Yargram.
            </p>
          )}

          {/* День рождения. */}
          <InfoRow icon={<Calendar className="h-5 w-5" />} label={profile.birthday ? birthdayLabel(profile.birthday, age) : 'День рождения не указан'} hint="День рождения" />

          {/* Публикации — для публичных аккаунтов. Подарки убраны до реализации. */}
          {mode === 'public' && (
            <InfoRow icon={<FileText className="h-5 w-5" />} label="0 публикаций" hint="Публикации" />
          )}

          {/* Медиа-счётчики — для чужого профиля. Сейчас нет данных, показываем 0. */}
          {mode !== 'own' && (
            <div className="mt-4 border-t border-line pt-3">
              <MediaRow icon={<ImageIcon className="h-5 w-5" />} label="0 фотографий" />
              <MediaRow icon={<Video className="h-5 w-5" />} label="0 видео" />
              <MediaRow icon={<FileText className="h-5 w-5" />} label="0 файлов" />
              <MediaRow icon={<Mic className="h-5 w-5" />} label="0 аудиофайлов" />
              <MediaRow icon={<Link2 className="h-5 w-5" />} label="0 ссылок" />
              <MediaRow icon={<AlertTriangle className="h-5 w-5" />} label="0 опросов" />
              <MediaRow icon={<Mic className="h-5 w-5" />} label="0 голосовых сообщений" />
              <MediaRow icon={<Gift className="h-5 w-5" />} label="0 GIF" />
              <MediaRow icon={<UsersRound className="h-5 w-5" />} label="0 общих групп" />
            </div>
          )}

          {/* Действия блокировки и жалобы — только для чужого. */}
          {mode !== 'own' && (
            <div className="px-4 pb-5 pt-2">
              <Button variant="danger" loading={busy && !reportOpen} className="w-full" onClick={() => void toggleBlock()}>
                {isBlocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {isBlocked ? 'Разблокировать' : 'Заблокировать'}
              </Button>
              <button
                type="button"
                onClick={() => setReportOpen((value) => !value)}
                className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-muted transition hover:border-brand/35 hover:text-ink"
              >
                Пожаловаться
              </button>
            </div>
          )}

          {/* Действие своего профиля: быстрый переход к настройкам. */}
          {mode === 'own' && (
            <div className="px-5 pb-5 pt-2">
              <Button variant="secondary" className="w-full" onClick={onEdit}>
                <Edit2 className="h-4 w-4" /> Изменить профиль
              </Button>
            </div>
          )}

          {reportOpen && (
            <div className="mx-4 mb-5 animate-slide-up rounded-xl border border-line bg-canvas p-3 text-left">
              <p className="text-xs font-bold">Причина жалобы</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {REPORT_REASONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${reportReason === item.value ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink'}`}
                    onClick={() => setReportReason(item.value)}
                  >
                    {reportReason === item.value && <ShieldCheck className="h-3.5 w-3.5" />}
                    {item.label}
                  </button>
                ))}
              </div>
              {reportReason === 'other' && (
                <textarea
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value.slice(0, 1000))}
                  className="mt-2 min-h-20 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-brand/50"
                  placeholder="Опишите проблему"
                />
              )}
              <Button className="mt-2 w-full" loading={busy && reportOpen} onClick={() => void submitReport()}>
                Отправить жалобу
              </Button>
            </div>
          )}

          {notice && <p className="mx-4 mb-3 rounded-xl bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">{notice}</p>}
          {error && <p className="mx-4 mb-3 rounded-xl bg-danger/10 px-3 py-2 text-center text-xs text-danger">{error}</p>}
        </div>
      </section>
    </div>
  );
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Спам' },
  { value: 'abuse', label: 'Оскорбления' },
  { value: 'fraud', label: 'Мошенничество' },
  { value: 'other', label: 'Другое' },
];

function ageFromBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const parts = birthday.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

function birthdayLabel(birthday: string, age: number | null): string {
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(birthday));
  return age !== null ? `${date} (${age} ${pluralYears(age)})` : date;
}

function pluralYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'год';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'года';
  return 'лет';
}

function ActionTile({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-canvas px-2 text-xs font-semibold text-ink transition hover:bg-brand-soft/35 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand">{icon}</span>
      {label}
    </button>
  );
}

function MicOff() {
  return (
    <span className="relative inline-block h-5 w-5">
      <Mic className="h-5 w-5" />
      <Ban className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-canvas p-0.5 text-danger" />
    </span>
  );
}

function InfoRow({ icon, label, hint }: { icon: ReactNode; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </div>
  );
}

function MediaRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-1.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </div>
  );
}


