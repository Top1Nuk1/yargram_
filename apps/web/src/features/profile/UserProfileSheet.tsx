import {
  AlertTriangle,
  Ban,
  Bot,
  Calendar,
  Copy,
  Edit2,
  FileText,
  Gift,
  Image as ImageIcon,
  Link2,
  Mic,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Trash2,
  Undo2,
  UserMinus,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { ScamWarning } from '../../components/ScamWarning';
import { Avatar, Button } from '../../components/ui';
import { UserName } from '../../components/UserName';
import type { FriendshipState, MediaSummary, ReportReason, User } from '../../types';
import { plural } from '../../lib/format';
import { avatarProps } from '../../lib/user';
import { formatLastSeen } from '../messenger/messengerUtils';
import {
  BIRTHDAY_YEARS,
  MONTH_NAMES,
  ageFromBirthday,
  composeBirthday,
  daysInMonth,
  formatBirthday,
  parseBirthday,
  pluralYears,
} from './birthday';
import { useTranslation } from '../../hooks/useLanguage';
import { ProfileBanner } from './ProfileBanner';
import { translateScamWarning } from '../../lib/i18n';
import { HighlightedText } from '../messenger/MessageExtras';

type Mode = 'own' | 'peer' | 'public';

/** Списки дня/месяца/года в листе профиля. */
const sheetSelectClass =
  'h-10 w-full min-w-0 appearance-none rounded-xl border border-line bg-canvas px-2 text-[13px] text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:opacity-60';

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
  /** Свой профиль правит данные на месте — отдаём свежего пользователя наружу. */
  onSaved?: (user: User) => void;
  onBlockedChange?: (blocked: boolean, user: User) => void;
  onUnauthorized?: () => void;
  /** Смотрящий — владелец Yargram: ему доступны заморозка и удаление аккаунта. */
  viewerIsOwner?: boolean;
  /** Аккаунт удалён — лист надо закрыть и обновить списки. */
  onDeleted?: (userId: string) => void;
  /** Аккаунт вернули — списки тоже надо обновить. */
  onRestored?: (userId: string) => void;
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
  onSaved,
  onBlockedChange,
  onUnauthorized,
  viewerIsOwner = false,
  onDeleted,
  onRestored,
  onClose,
}: UserProfileSheetProps) {
  const t = useTranslation();
  const [profile, setProfile] = useState(user);
  const [isBlocked, setIsBlocked] = useState(Boolean(user.blockedByMe));
  // Удалённый аккаунт: профиль и история читаются, но писать и звонить нельзя.
  const isDeleted = Boolean(profile.isDeleted);
  // Описание помеченного SCAM/FAKE сервер подменяет предупреждением. Ведущий ⚠️
  // из текста убираем — на карточке его место занимает значок, и без этого знак
  // задваивался бы. Сам текст переводим на язык интерфейса (ветка выбирается по
  // началу фразы: SCAM — про мошенничество, FAKE — про подделку под официальный).
  const markWarningText = translateScamWarning(profile.bio ?? '', t);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  // Свой день рождения правим прямо здесь, как в Telegram: три списка и автосохранение.
  // Медиа в переписке с этим человеком: пустые разделы не показываем вовсе.
  const [media, setMedia] = useState<MediaSummary | null>(null);
  const [bdDay, setBdDay] = useState(() => parseBirthday(user.birthday).day);
  const [bdMonth, setBdMonth] = useState(() => parseBirthday(user.birthday).month);
  const [bdYear, setBdYear] = useState(() => parseBirthday(user.birthday).year);
  const [bdSaving, setBdSaving] = useState(false);

  useEffect(() => setProfile(user), [user]);

  useEffect(() => {
    const parts = parseBirthday(user.birthday);
    setBdDay(parts.day);
    setBdMonth(parts.month);
    setBdYear(parts.year);
  }, [user.birthday]);

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
    if (mode === 'own') {
      setMedia(null);
      return;
    }
    const controller = new AbortController();
    void api
      .mediaSummary(token, user.id, controller.signal)
      .then(setMedia)
      .catch(() => undefined);
    return () => controller.abort();
  }, [mode, token, user.id]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const online = profile.isOnline ?? profile.online;
  const age = useMemo(() => ageFromBirthday(profile.birthday), [profile.birthday]);

  // Разделы медиа: только то, что есть в переписке. Пустые не показываем.
  const mediaRows = useMemo(() => {
    if (!media) return [];
    const rows: { key: string; icon: ReactNode; count: number; forms: [string, string, string] }[] = [
      { key: 'photos', icon: <ImageIcon className="h-5 w-5" />, count: media.photos, forms: [t('profile.mediaPhoto1'), t('profile.mediaPhoto2'), t('profile.mediaPhoto5')] },
      { key: 'videos', icon: <Video className="h-5 w-5" />, count: media.videos, forms: [t('profile.mediaVideo1'), t('profile.mediaVideo2'), t('profile.mediaVideo5')] },
      { key: 'voice', icon: <Mic className="h-5 w-5" />, count: media.voice, forms: [t('profile.mediaVoice1'), t('profile.mediaVoice2'), t('profile.mediaVoice5')] },
      { key: 'videoCircles', icon: <Video className="h-5 w-5" />, count: media.videoCircles, forms: [t('profile.mediaCircle1'), t('profile.mediaCircle2'), t('profile.mediaCircle5')] },
      { key: 'files', icon: <FileText className="h-5 w-5" />, count: media.files, forms: [t('profile.mediaFile1'), t('profile.mediaFile2'), t('profile.mediaFile5')] },
      { key: 'audio', icon: <Mic className="h-5 w-5" />, count: media.audio, forms: [t('profile.mediaAudio1'), t('profile.mediaAudio2'), t('profile.mediaAudio5')] },
      { key: 'links', icon: <Link2 className="h-5 w-5" />, count: media.links, forms: [t('profile.mediaLink1'), t('profile.mediaLink2'), t('profile.mediaLink5')] },
      { key: 'gifs', icon: <Gift className="h-5 w-5" />, count: media.gifs, forms: [t('profile.mediaGif1'), t('profile.mediaGif2'), t('profile.mediaGif5')] },
    ];
    return rows
      .filter((row) => row.count > 0)
      .map((row) => ({ key: row.key, icon: row.icon, label: `${row.count} ${plural(row.count, row.forms)}` }));
  }, [media, t]);

  async function toggleBlock() {
    if (!isBlocked && !window.confirm(t('profile.confirmBlock', { handle: `@${profile.username ?? profile.displayName}` }))) return;
    setBusy(true);
    setError('');
    try {
      const result = isBlocked ? await api.unblockUser(token, profile.id) : await api.blockUser(token, profile.id);
      const next = !isBlocked;
      setIsBlocked(next);
      onBlockedChange?.(next, result.user ?? profile);
      setNotice(next ? t('profile.blocked') : t('profile.unblocked'));
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.blockFailed'));
    } finally {
      setBusy(false);
    }
  }

  /** Заморозка аккаунта: человек не сможет войти, но данные остаются. */
  async function toggleFreeze() {
    const next = !profile.isFrozen;
    const handle = profile.username ? `@${profile.username}` : profile.displayName;
    if (next && !window.confirm(t('profile.confirmFreeze', { handle }))) return;
    setBusy(true);
    setError('');
    try {
      await api.adminFreeze(token, profile.id, next);
      setProfile((current) => ({ ...current, isFrozen: next }));
      setNotice(next ? t('profile.frozen') : t('profile.unfrozen'));
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.freezeFailed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Отметка SCAM: рядом с именем появляется красная рамка, а описание
   * подменяется предупреждением о мошенничестве — менять его человек больше
   * не сможет, пока владелец отметку не снимет. Снятие возвращает прежнее
   * описание: подмена живёт на чтении, а не затирает запись.
   */
  async function toggleScam() {
    const next = !profile.scam;
    const handle = profile.username ? `@${profile.username}` : profile.displayName;
    if (next && !window.confirm(t('profile.confirmScam', { handle }))) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.adminSetScam(token, profile.id, next);
      setProfile((current) => ({ ...current, ...updated }));
      setNotice(next ? t('profile.scamSet') : t('profile.scamCleared'));
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.scamFailed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Отметка FAKE: рядом с именем появляется янтарная рамка, а описание
   * подменяется предупреждением о подделке под официальный аккаунт — менять его
   * человек больше не сможет, пока владелец отметку не снимет. Снятие возвращает
   * прежнее описание: подмена живёт на чтении, а не затирает запись.
   */
  async function toggleFake() {
    const next = !profile.fake;
    const handle = profile.username ? `@${profile.username}` : profile.displayName;
    if (next && !window.confirm(t('profile.confirmFake', { handle }))) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.adminSetFake(token, profile.id, next);
      setProfile((current) => ({ ...current, ...updated }));
      setNotice(next ? t('profile.fakeSet') : t('profile.fakeCleared'));
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.fakeFailed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Отметка BOT: аккаунт становится служебным ботом, в него нельзя войти.
   * Смысл ровно такой же, как в админке, — здесь только второй, более короткий
   * путь к той же операции. Метку себе поставить нельзя (сервер отвечает
   * 400 SELF_ACTION): снять её после этого было бы уже некому.
   */
  async function toggleBot() {
    const next = !profile.isBot;
    const handle = profile.username ? `@${profile.username}` : profile.displayName;
    if (next && !window.confirm(t('profile.confirmBot', { handle }))) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.adminSetBot(token, profile.id, next);
      setProfile((current) => ({ ...current, ...updated }));
      setNotice(next ? t('profile.botSet') : t('profile.botCleared'));
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.botFailed'));
    } finally {
      setBusy(false);
    }
  }

  /** Возврат удалённого аккаунта: профиль и история снова на месте. */
  async function restoreAccount() {
    setBusy(true);
    setError('');
    try {
      const restored = await api.adminRestoreUser(token, profile.id);
      setProfile((current) => ({ ...current, ...restored }));
      setNotice(t('profile.accountRestored'));
      onRestored?.(profile.id);
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.restoreFailed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Удаление аккаунта владельцем: личное стирается, а история переписки
   * остаётся у собеседников — как в Telegram. Почта остаётся занятой.
   */
  async function deleteAccount() {
    const handle = profile.username ? `@${profile.username}` : profile.displayName;
    if (!window.confirm(t('profile.confirmDelete', { handle }))) return;
    setBusy(true);
    setError('');
    try {
      await api.adminDeleteUser(token, profile.id);
      onDeleted?.(profile.id);
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.deleteFailed'));
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
      setNotice(t('profile.reportSent'));
      setReportDetails('');
    } catch (reasonError) {
      if (reasonError instanceof ApiError && reasonError.status === 401) return onUnauthorized?.();
      setError(reasonError instanceof ApiError ? reasonError.message : t('profile.reportFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function copyUsername() {
    const handle = profile.username ?? '';
    if (!handle) return;
    try {
      await navigator.clipboard.writeText(`@${handle}`);
      setNotice(t('profile.usernameCopied'));
    } catch {
      setError(t('profile.copyFailed'));
    }
  }

  /** Меняет часть даты и сразу сохраняет — как в Telegram, без отдельной кнопки. */
  async function changeBirthday(part: 'day' | 'month' | 'year', value: string) {
    const nextMonth = part === 'month' ? value : bdMonth;
    const nextYear = part === 'year' ? value : bdYear;
    let nextDay = part === 'day' ? value : bdDay;
    // Поджимаем день под длину нового месяца/года.
    const max = daysInMonth(nextMonth, nextYear);
    if (nextDay && Number(nextDay) > max) nextDay = String(max);

    setBdDay(nextDay);
    setBdMonth(nextMonth);
    setBdYear(nextYear);

    const composed = composeBirthday(nextDay, nextMonth, nextYear);
    if (!composed) return; // выбрано не всё — отправим, когда дополнят
    setBdSaving(true);
    setError('');
    try {
      const updated = await api.updateProfile(token, { birthday: composed });
      setProfile((current) => ({ ...current, birthday: composed }));
      onSaved?.(updated);
      setNotice(t('profile.birthdaySaved'));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.birthdaySaveFailed'));
    } finally {
      setBdSaving(false);
    }
  }

  async function clearBirthday() {
    setBdDay('');
    setBdMonth('');
    setBdYear('');
    setBdSaving(true);
    setError('');
    try {
      const updated = await api.updateProfile(token, { birthday: null });
      setProfile((current) => ({ ...current, birthday: null }));
      onSaved?.(updated);
      setNotice(t('profile.birthdayRemoved'));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.birthdayRemoveFailed'));
    } finally {
      setBdSaving(false);
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
        aria-label={t('profile.sheetLabel')}
        className="flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-xl bg-surface shadow-float sm:max-w-[440px] sm:rounded-xl"
      >
        {/* Шапка: полоса баннера, поверх неё — кнопки, ниже — аватар (он
            заходит на баннер наполовину, как в Discord). */}
        <header className="relative pb-3 text-center">
          <ProfileBanner user={profile} />
          {mode === 'own' && onEdit && (
            <button
              type="button"
              aria-label={t('profile.editProfile')}
              onClick={onEdit}
              disabled={profile.isFrozen}
              title={profile.isFrozen ? t('profile.editTooltip') : undefined}
              className="absolute right-12 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/35"
            >
              <Edit2 className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Аватар заходит на баннер наполовину. Круглую окантовку делаем
              подложкой `rounded-full` вокруг аватара, а не `ring`: ring рисует
              тень по прямоугольному боксу обёртки и превращался в квадрат. */}
          <div className="-mt-14 flex justify-center px-5">
            <span className="grid place-items-center rounded-full bg-surface p-1">
              <Avatar
                name={profile.displayName}
                src={profile.avatarUrl ?? profile.avatar?.url}
                size="xl"
                online={mode !== 'own' ? online : undefined}
                {...avatarProps(profile)}
              />
            </span>
          </div>
          <div className="px-5">
            <h2 className="mt-3 text-lg font-extrabold tracking-[-0.02em] text-ink">
              <UserName name={profile.displayName} user={profile} />
            </h2>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-brand">
              {mode === 'own' ? (
                online ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{t('profile.online')}</span> : <span className="text-muted">{formatLastSeen(profile, t)}</span>
              ) : online ? (
                <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{t('profile.online')}</span>
              ) : (
                <span className="text-muted">{formatLastSeen(profile, t)}</span>
              )}
            </div>
          </div>
        </header>

        {/* Ряд быстрых действий — только для чужого профиля. */}
        {mode !== 'own' && (
          <div className={`grid ${profile.isBot ? 'grid-cols-2' : 'grid-cols-4'} gap-2 px-4`}>
            <ActionTile icon={<FileText className="h-5 w-5" />} label={t('profile.actionChat')} disabled={isDeleted} onClick={onMessage} />
            {!profile.isBot && <ActionTile icon={isBlocked ? <MicOff /> : <Mic className="h-5 w-5" />} label={t('profile.actionAudio')} disabled={isBlocked || isDeleted} onClick={onAudioCall} />}
            {!profile.isBot && <ActionTile icon={<Video className="h-5 w-5" />} label={t('profile.actionVideo')} disabled={isBlocked || isDeleted} onClick={onVideoCall} />}
            <ActionTile icon={<MoreHorizontal className="h-5 w-5" />} label={t('profile.actionMore')} onClick={onMore} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Описание. У помеченного SCAM или FAKE вместо «о себе» стоит
              предупреждение: сервер отдаёт его вместо текста, поэтому рисуем
              отдельным блоком со значком — как в Telegram. Подпись «О себе»
              уходит под текст. */}
          {profile.scam || profile.fake ? (
            <div className="px-5 pt-3">
              <div className="flex gap-2 text-left">
                <AlertTriangle className="mt-[3px] h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                {/* Текст выдан владельцем Yargram: выделить и скопировать его нельзя. */}
                <ScamWarning
                  text={markWarningText}
                  className="whitespace-pre-wrap text-sm leading-6 text-ink"
                />
              </div>
              <p className="mt-1 text-xs text-muted">{t('profile.bioLabel')}</p>
            </div>
          ) : (
            profile.bio && (
              <div className="px-5 pt-3">
                <p className="whitespace-pre-wrap text-center text-sm leading-6 text-ink">
                  <HighlightedText text={profile.bio} />
                </p>
              </div>
            )
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
                <span className="block text-xs text-muted">{t('profile.usernameFieldHint')}</span>
              </span>
              {profile.username && <Copy className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
            </button>
            {profile.usernames && profile.usernames.length > 0 && (
              <p className="px-1 pt-1 text-[12px] text-muted">
                {t('profile.alsoKnownAs')}{' '}
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
              {t('profile.verifiedNotice')}
            </p>
          )}

          {/* День рождения: в своём профиле правится на месте, в чужом — только показывается. */}
          {mode === 'own' ? (
            <div className="px-5 py-2.5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-brand">
                  <Calendar className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">{t('profile.birthdayLabel')}</span>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    <label className="sr-only" htmlFor="sheet-birthday-day">{t('profile.day')}</label>
                    <select
                      id="sheet-birthday-day"
                      className={sheetSelectClass}
                      value={bdDay}
                      disabled={bdSaving}
                      onChange={(event) => void changeBirthday('day', event.target.value)}
                    >
                      <option value="">{t('profile.day')}</option>
                      {Array.from({ length: daysInMonth(bdMonth, bdYear) }, (_, index) => String(index + 1)).map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>

                    <label className="sr-only" htmlFor="sheet-birthday-month">{t('profile.month')}</label>
                    <select
                      id="sheet-birthday-month"
                      className={sheetSelectClass}
                      value={bdMonth}
                      disabled={bdSaving}
                      onChange={(event) => void changeBirthday('month', event.target.value)}
                    >
                      <option value="">{t('profile.month')}</option>
                      {MONTH_NAMES.map((name, index) => (
                        <option key={name} value={String(index + 1)}>{name}</option>
                      ))}
                    </select>

                    <label className="sr-only" htmlFor="sheet-birthday-year">{t('profile.year')}</label>
                    <select
                      id="sheet-birthday-year"
                      className={sheetSelectClass}
                      value={bdYear}
                      disabled={bdSaving}
                      onChange={(event) => void changeBirthday('year', event.target.value)}
                    >
                      <option value="">{t('profile.noYear')}</option>
                      {BIRTHDAY_YEARS.map((year) => (
                        <option key={year} value={String(year)}>{year}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                    <span>
                      {bdSaving
                        ? t('profile.saving')
                        : t('profile.birthdaySavedHint')}
                    </span>
                    {(bdDay || bdMonth || bdYear) && (
                      <button type="button" onClick={() => void clearBirthday()} className="font-semibold text-brand transition hover:text-brand-strong">
                        {t('profile.removeBirthday')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <InfoRow
              icon={<Calendar className="h-5 w-5" />}
              label={profile.birthday ? `${formatBirthday(profile.birthday)}${age !== null ? ` (${t('profile.yearsOld', { age, unit: pluralYears(age) })})` : ''}` : t('profile.birthdayNotSet')}
              hint={t('profile.birthdayLabel')}
            />
          )}

          {/* Медиа — только те разделы, которые в переписке реально есть. */}
          {mode !== 'own' && mediaRows.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              {mediaRows.map((row) => (
                <MediaRow key={row.key} icon={row.icon} label={row.label} />
              ))}
            </div>
          )}

          {/* Владелец Yargram может заморозить, удалить и вернуть чужой аккаунт. */}
          {mode !== 'own' && viewerIsOwner && (
            <div className="mt-3 space-y-2 border-t border-line px-4 pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{t('profile.ownerSection')}</p>
              {profile.isDeleted ? (
                <Button variant="secondary" className="w-full" loading={busy} onClick={() => void restoreAccount()}>
                  <Undo2 className="h-4 w-4" />
                  {t('profile.restoreAccount')}
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" loading={busy} onClick={() => void toggleFreeze()}>
                  <Snowflake className="h-4 w-4" />
                  {profile.isFrozen ? t('profile.unfreezeAccount') : t('profile.freezeAccount')}
                </Button>
              )}
              {!profile.isDeleted && (
                <Button
                  variant={profile.scam ? 'secondary' : 'danger'}
                  className="w-full"
                  loading={busy}
                  onClick={() => void toggleScam()}
                >
                  <ShieldAlert className="h-4 w-4" />
                  {profile.scam ? t('profile.clearScam') : t('profile.setScam')}
                </Button>
              )}
              {!profile.isDeleted && (
                <Button
                  variant={profile.fake ? 'secondary' : 'danger'}
                  className="w-full"
                  loading={busy}
                  onClick={() => void toggleFake()}
                >
                  <ShieldAlert className="h-4 w-4" />
                  {profile.fake ? t('profile.clearFake') : t('profile.setFake')}
                </Button>
              )}
              {/* Метка BOT: закрывает вход в аккаунт — как и в админке,
                  поэтому кнопка в том же опасном стиле и с подтверждением. */}
              {!profile.isDeleted && (
                <Button
                  variant={profile.isBot ? 'secondary' : 'danger'}
                  className="w-full"
                  loading={busy}
                  onClick={() => void toggleBot()}
                >
                  <Bot className="h-4 w-4" />
                  {profile.isBot ? t('profile.clearBot') : t('profile.setBot')}
                </Button>
              )}
              {!profile.isDeleted && (
                <Button variant="danger" className="w-full" loading={busy} onClick={() => void deleteAccount()}>
                  <Trash2 className="h-4 w-4" />
                  {t('profile.deleteAccount')}
                </Button>
              )}
            </div>
          )}

          {/* Действия блокировки и жалобы — только для чужого. У служебного
              бота их нет вовсе: это не человек, а адрес поддержки, и ни
              добавить в друзья, ни заблокировать, ни пожаловаться на него
              нельзя — как и любого другого бота. */}
          {mode !== 'own' && !isDeleted && !profile.isBot && (
            <div className="px-4 pb-5 pt-2">
              <FriendButton
                token={token}
                profile={profile}
                onUnauthorized={onUnauthorized}
              />
              <Button variant="danger" loading={busy && !reportOpen} className="mt-2 w-full" onClick={() => void toggleBlock()}>
                {isBlocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {isBlocked ? t('profile.unblock') : t('profile.block')}
              </Button>
              <button
                type="button"
                onClick={() => setReportOpen((value) => !value)}
                className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-muted transition hover:border-brand/35 hover:text-ink"
              >
                {t('profile.report')}
              </button>
            </div>
          )}

          {/* Действие своего профиля: быстрый переход к настройкам.
              Замороженному он закрыт — менять профиль нельзя. */}
          {mode === 'own' && (
            <div className="px-5 pb-5 pt-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={onEdit}
                disabled={profile.isFrozen}
              >
                <Edit2 className="h-4 w-4" /> {t('profile.editProfile')}
              </Button>
              {profile.isFrozen && (
                <p className="mt-2 text-center text-xs text-muted">
                  {t('profile.frozenViewOnly')}
                </p>
              )}
            </div>
          )}

          {reportOpen && (
            <div className="mx-4 mb-5 animate-slide-up rounded-xl border border-line bg-canvas p-3 text-left">
              <p className="text-xs font-bold">{t('profile.reportReason')}</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {REPORT_REASONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${reportReason === item.value ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink'}`}
                    onClick={() => setReportReason(item.value)}
                  >
                    {reportReason === item.value && <ShieldCheck className="h-3.5 w-3.5" />}
                    {t(item.label)}
                  </button>
                ))}
              </div>
              {reportReason === 'other' && (
                <textarea
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value.slice(0, 1000))}
                  className="mt-2 min-h-20 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-brand/50"
                  placeholder={t('profile.reportPlaceholder')}
                />
              )}
              <Button className="mt-2 w-full" loading={busy && reportOpen} onClick={() => void submitReport()}>
                {t('profile.sendReport')}
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
  { value: 'spam', label: 'profile.reasonSpam' },
  { value: 'abuse', label: 'profile.reasonAbuse' },
  { value: 'fraud', label: 'profile.reasonFraud' },
  { value: 'other', label: 'profile.reasonOther' },
];

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


/**
 * Кнопка дружбы в чужом профиле. Состояние приходит с сервера вместе с
 * профилем, поэтому кнопка одинаковая и в веб-версии, и в приложении:
 * «Добавить в друзья» -> «Заявка отправлена» -> «Вы друзья».
 *
 * Взаимную заявку сервер закрывает сразу: если человек уже ждал нас, одна
 * кнопка делает обоих друзьями, и подпись это честно показывает.
 */
function FriendButton({
  token,
  profile,
  onUnauthorized,
}: {
  token: string;
  profile: User;
  onUnauthorized?: (() => void) | undefined;
}) {
  const t = useTranslation();
  const [state, setState] = useState<FriendshipState>(profile.friendship ?? 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setState(profile.friendship ?? 'none'), [profile.friendship]);

  async function act() {
    setBusy(true);
    setError('');
    try {
      const next =
        state === 'none'
          ? await api.addFriend(token, profile.id)
          : state === 'incoming'
            ? await api.acceptFriend(token, profile.id)
            : state === 'friends' || state === 'outgoing'
              ? await api.removeFriend(token, profile.id)
              : await api.addFriend(token, profile.id);
      setState(next);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) return onUnauthorized?.();
      setError(reason instanceof ApiError ? reason.message : t('friends.addFailed'));
    } finally {
      setBusy(false);
    }
  }

  const label =
    state === 'friends' ? t('friends.inFriends')
      : state === 'outgoing' ? t('friends.requestSentButton')
        : state === 'incoming' ? t('friends.acceptButton')
          : t('friends.addButton');

  return (
    <div>
      <Button
        variant={state === 'friends' ? 'secondary' : 'primary'}
        className="w-full"
        loading={busy}
        onClick={() => void act()}
      >
        {state === 'friends' ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {label}
      </Button>
      {error && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
