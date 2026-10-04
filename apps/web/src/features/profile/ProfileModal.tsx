import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AtSign,
  Cake,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Palette,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { scamGuard } from '../../components/ScamWarning';
import { Avatar, Button, IconButton } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { AdditionalHandles } from '../../components/AdditionalHandles';
import type { User } from '../../types';
import { isSoundEnabled, setSoundEnabled, subscribeToSoundSetting } from '../../lib/sounds';
import { isDecorativeUrl } from '../../lib/decorativeUrl';
import { BUILT_IN_BANNERS } from '../../lib/banners';
import { imageTileLabel, type ImageVariant } from '../../lib/yargramImages';
import { browserNotificationPermission, requestBrowserNotificationPermission } from '../../lib/notifications';
import { BIRTHDAY_YEARS, MONTH_NAMES, composeBirthday, daysInMonth, parseBirthday } from './birthday';
import { ProfileBanner } from './ProfileBanner';
import { useLanguage } from '../../hooks/useLanguage';

/**
 * Порядок полок с готовыми баннерами: светлые сверху, тёмные ниже — как в
 * галерее обоев, чтобы выбор палитры выглядел одинаково в обоих местах.
 */
const BANNER_VARIANTS: ImageVariant[] = ['light', 'dark'];

/**
 * Каркас списка на экране «Информация». Каждая строка: иконка слева,
 * основной текст и значение справа. Поддерживает состояние «скоро» для
 * полей, у которых пока нет серверной модели.
 */
type Row =
  | { kind: 'edit'; id: string; icon: typeof UserRound; label: string; control: React.ReactNode }
  | { kind: 'static'; id: string; icon: typeof UserRound; label: string; value: string; muted?: boolean; badge?: string }
  | { kind: 'soon'; id: string; icon: typeof UserRound; label: string; hint: string; badge?: string };

interface ProfileModalProps {
  token: string;
  user: User;
  onClose: () => void;
  onSaved: (user: User) => void;
}

export function ProfileModal({ token, user, onClose, onSaved }: ProfileModalProps) {
  const { t } = useLanguage();
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled);
  const [notificationPermission, setNotificationPermission] = useState(browserNotificationPermission);
  useEffect(() => subscribeToSoundSetting(setSoundEnabledState), []);
  const [profileUser, setProfileUser] = useState(user);
  // Замороженный аккаунт профиль не меняет — форму закрываем целиком.
  const frozen = Boolean(user.isFrozen);
  // Отметку SCAM или FAKE могут выдать при уже открытом окне: сервер тут же
  // подменяет описание, поэтому забираем его в форму и закрываем поле.
  useEffect(() => {
    setProfileUser(user);
    if (user.scam || user.fake) setBio(user.bio ?? '');
    // Баннер живёт вне формы и сохраняется сразу: при обновлении пользователя
    // с сервера подтягиваем и заливку, чтобы пикер не показывал старый цвет.
    setBannerColor(user.bannerColor ?? '#3390ec');
  }, [user]);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username ?? '');
  const [themeColor, setThemeColor] = useState(user.themeColor ?? '#3390ec');
  const [showLastSeen, setShowLastSeen] = useState(user.showLastSeen ?? true);
  const [wallpaperUrl, setWallpaperUrl] = useState(user.wallpaperUrl ?? '');

  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  // Баннер: полоса в шапке профиля. Сохраняется сразу, как аватар — цвет и фото
  // не проходят через «Сохранить», иначе их пришлось бы тащить в updateProfile.
  const [bannerColor, setBannerColor] = useState(user.bannerColor ?? '#3390ec');
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerProgress, setBannerProgress] = useState<number | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  /** Тип выбранного файла: предпросмотр видео и картинки рисуется по-разному. */
  const [bannerPreviewType, setBannerPreviewType] = useState<string | null>(null);
  // URL баннера: вводится вручную, сохраняется сразу (как заливка). Прямая ссылка
  // работает и без загрузки файла — удобно, когда картинка уже лежит где-то.
  const [bannerUrlInput, setBannerUrlInput] = useState(profileUser.bannerUrl ?? '');
  const [bannerUrlBusy, setBannerUrlBusy] = useState(false);
  // Фон чата можно задать не только ссылкой, но и файлом (картинка или GIF).
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  // Знак «Yargram» на аккаунте приложения. Обычному человеку кнопка недоступна:
  // сервер выдаёт знак только тому, кого владелец пометил приложением.
  const [appBadgeBusy, setAppBadgeBusy] = useState(false);
  const [appBadge, setAppBadge] = useState<'yargram' | null>(user.badge ?? null);
  const [error, setError] = useState('');
  const [bio, setBio] = useState(user.bio ?? '');
  // День рождения держим тремя частями: нативное <input type="date"> в этой вёрстке
  // не работает, а список «день / месяц / год» выбирается без сюрпризов браузера.
  const initialBirthday = parseBirthday(user.birthday ?? '');
  const [bdDay, setBdDay] = useState(initialBirthday.day);
  const [bdMonth, setBdMonth] = useState(initialBirthday.month);
  const [bdYear, setBdYear] = useState(initialBirthday.year);
  const nameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const themeColorInputRef = useRef<HTMLInputElement>(null);
  const avatarPickerOpenRef = useRef(false);

  useEffect(() => {
    nameRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  useEffect(
    () => () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    },
    [bannerPreview],
  );

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!supportedTypes.has(file.type)) {
      setError(t('profile.badAvatarType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('profile.avatarTooLarge'));
      return;
    }

    setError('');
    setAvatarBusy(true);
    setAvatarPreview(URL.createObjectURL(file));
    try {
      const updated = await api.updateAvatar(token, file);
      setProfileUser(updated);
      onSaved(updated);
      setAvatarPreview(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.avatarUploadFailed'));
      setAvatarPreview(null);
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function deleteAvatar() {
    setAvatarBusy(true);
    setError('');
    try {
      const updated = await api.deleteAvatar(token);
      setProfileUser(updated);
      onSaved(updated);
      setAvatarPreview(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.avatarDeleteFailed'));
    } finally {
      setAvatarBusy(false);
    }
  }

  /**
   * Фото баннера: лимит выше, чем у аватара — полоса широкая. GIF разрешён
   * только здесь: на баннере анимация уместна, на круглом аватаре — нет.
   */
  async function changeBanner(file: File | undefined) {
    if (!file) return;
    const supportedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      // Баннер можно сделать живым: видео играет само, по кругу.
      'video/mp4',
      'video/webm',
    ]);
    if (!supportedTypes.has(file.type)) {
      setError(t('profile.badBannerType'));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError(t('profile.bannerTooLarge'));
      return;
    }

    setError('');
    setBannerBusy(true);
    setBannerProgress(0);
    setBannerPreview(URL.createObjectURL(file));
    setBannerPreviewType(file.type);
    try {
      const updated = await api.updateBanner(token, file, { onProgress: setBannerProgress });
      setProfileUser(updated);
      onSaved(updated);
      setBannerPreview(null);
      setBannerPreviewType(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.bannerUploadFailed'));
      setBannerPreview(null);
      setBannerPreviewType(null);
    } finally {
      setBannerBusy(false);
      setBannerProgress(null);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function deleteBanner() {
    setBannerBusy(true);
    setError('');
    try {
      const updated = await api.deleteBanner(token);
      setProfileUser(updated);
      onSaved(updated);
      setBannerPreview(null);
      // Поле ссылки тоже чистим: иначе «Сохранить» вернуло бы удалённый баннер.
      setBannerUrlInput('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.bannerDeleteFailed'));
    } finally {
      setBannerBusy(false);
    }
  }

  /**
   * Знак «Yargram» на аккаунте приложения. Повторное нажатие снимает знак:
   * приложение должно уметь и отказаться от него, а не только поставить.
   */
  async function toggleAppBadge() {
    const next = appBadge === 'yargram' ? null : 'yargram';
    setAppBadgeBusy(true);
    setError('');
    try {
      const updated = await api.setAppBadge(token, next);
      setAppBadge(updated.badge ?? null);
      setProfileUser(updated);
      onSaved(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.appBadgeFailed'));
    } finally {
      setAppBadgeBusy(false);
    }
  }

  /**
   * Заливка баннера сохраняется сразу при выборе цвета — как в Discord, где цвет
   * применяется мгновенно. Пустая строка означает «без заливки»: тогда, если фото
   * нет, полоса рисуется приглушённой темой.
   */
  async function saveBannerColor(next: string) {
    setBannerColor(next);
    setError('');
    try {
      const updated = await api.updateProfile(token, { bannerColor: next });
      setProfileUser(updated);
      onSaved(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.saveFailed'));
    }
  }

  /**
   * Прямая ссылка на баннер сохраняется сразу. Пустая строка означает «убрать
   * баннер» — сервер сотрёт поле. Проверяем как ссылку оформления: подходят
   * и внешние адреса, и свои загрузки, и готовые баннеры приложения.
   */
  async function saveBannerUrl(next: string) {
    const trimmed = next.trim();
    if (trimmed && !isDecorativeUrl(trimmed)) {
      setError(t('profile.bannerUrlInvalid'));
      return;
    }
    setBannerUrlBusy(true);
    setError('');
    try {
      const updated = await api.updateProfile(token, { bannerUrl: trimmed || null });
      setProfileUser(updated);
      // Поле ввода держим в согласии с профилем: иначе нажатие «Сохранить»
      // отправило бы старое значение поля и стёрло только что выбранный баннер.
      setBannerUrlInput(trimmed);
      onSaved(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.saveFailed'));
    } finally {
      setBannerUrlBusy(false);
    }
  }

  /**
   * Фон чата можно задать файлом — картинкой или GIF. Грузим через общий аплоад,
   * получаем публичный URL и подставляем его в `wallpaperUrl`, как если бы ввели
   * ссылку вручную. Это переиспользует существующее поле, без новых эндпоинтов.
   */
  async function changeWallpaperFile(file: File | undefined) {
    if (!file) return;
    const supportedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      // Фон тоже бывает живым: видео идёт по кругу за перепиской.
      'video/mp4',
      'video/webm',
    ]);
    if (!supportedTypes.has(file.type)) {
      setError(t('profile.wallpaperBadType'));
      return;
    }
    // Фон — как баннер: его часто ставят анимированным GIF, поэтому предел
    // 50 МБ, а не 20, как у обычного фото в переписке. Отдельный вид загрузки
    // `wallpaper` затем, чтобы поднять предел фону и не сдвинуть предел фото.
    if (file.size > 50 * 1024 * 1024) {
      setError(t('profile.wallpaperTooLarge'));
      return;
    }
    setError('');
    setWallpaperBusy(true);
    try {
      const attachment = await api.upload(token, file, 'wallpaper');
      // Тип сохраняем рядом со ссылкой: по самой ссылке не видно, видео это
      // или картинка, а рисовать их надо по-разному.
      const updated = await api.updateProfile(token, {
        wallpaperUrl: attachment.url,
        wallpaperMimeType: attachment.mimeType,
      });
      setWallpaperUrl(attachment.url);
      setProfileUser(updated);
      onSaved(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('profile.saveFailed'));
    } finally {
      setWallpaperBusy(false);
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
    }
  }

  /** Меняет часть даты; при смене месяца/года поджимает день под их длину. */
  function changeBirthdayPart(part: 'day' | 'month' | 'year', value: string) {
    if (part === 'day') {
      setBdDay(value);
      return;
    }
    if (part === 'year') {
      setBdYear(value);
      const max = daysInMonth(bdMonth, value);
      if (bdDay && Number(bdDay) > max) setBdDay(String(max));
      return;
    }
    setBdMonth(value);
    const max = daysInMonth(value, bdYear);
    if (bdDay && Number(bdDay) > max) setBdDay(String(max));
  }

  function clearBirthday() {
    setBdDay('');
    setBdMonth('');
    setBdYear('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const normalizedUsername = username.trim().replace(/^@/, '');
    if (!displayName.trim()) {
      setError(t('profile.nameEmpty'));
      return;
    }
    if (!/^[A-Za-z0-9_]{3,32}$/.test(normalizedUsername)) {
      setError(t('profile.usernameInvalid'));
      return;
    }
    // Фон может быть внешней ссылкой, своей загрузкой (`/api/uploads/…`) или
    // готовой картинкой приложения (`/wallpapers/…`) — последние две задаются
    // без протокола, поэтому одной проверки «начинается с http» мало: она
    // ругалась бы на фон, который уже стоит.
    if (wallpaperUrl.trim() && !isDecorativeUrl(wallpaperUrl.trim())) {
      setError(t('profile.wallpaperInvalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateProfile(token, {
        displayName: displayName.trim(),
        username: normalizedUsername,
        bio: bio.trim(),
        ...(themeColor !== (user.themeColor ?? '#3390ec') ? { themeColor } : {}),
        wallpaperUrl: wallpaperUrl.trim(),
        // Заливка баннера живёт вне формы, но её тоже досылаем: иначе цвет,
        // выбранный и не подтверждённый закрытием пикера, потерялся бы.
        bannerColor,
        // URL баннера тоже сохраняется сразу, но досылаем и здесь — на случай,
        // если пользователь нажал «Сохранить», не уйдя с поля ввода.
        ...(bannerUrlInput.trim() !== (profileUser.bannerUrl ?? '')
          ? { bannerUrl: bannerUrlInput.trim() || null }
          : {}),
        showLastSeen,
        // Собираем дату из трёх списков; неполный выбор → null, сервер сотрёт поле.
        birthday: composeBirthday(bdDay, bdMonth, bdYear),
      });
      setProfileUser(updated);
      onSaved(updated);
      onClose();
    } catch (reason) {
      setError(reason instanceof ApiError && reason.message ? reason.message : t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const birthdaySelectClass =
    'h-10 rounded-xl border border-line bg-canvas px-3 text-[15px] text-ink outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10';

  // Цвет интерфейса меняет оформление всего приложения (кнопки, ссылки, акценты).
  // Сам он не красит ничего напрямую: `useTheme` берёт его как акцент встроенных
  // тем и кладёт в CSS-переменную `--brand` (см. `withProfileAccent`). Свои темы
  // он не трогает — там цвет задан прямо в теме. Рисуем кружком с шевроном:
  // подпись уже стоит слева в строке, повторять её в кнопке незачем.
  const interfaceColorSwatch = (
    <button
      type="button"
      onClick={() => themeColorInputRef.current?.click()}
      aria-label={t('profile.interfaceColor')}
      className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 transition hover:border-brand/35"
    >
      <span
        className="inline-block h-4 w-4 rounded-full border border-white/40"
        style={{ backgroundColor: themeColor }}
        aria-hidden="true"
      />
      <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
    </button>
  );

  const rows: Row[] = [
    {
      kind: 'edit',
      id: 'name',
      icon: UserRound,
      label: t('profile.nameLabel'),
      control: (
        <input
          ref={nameRef}
          aria-label={t('profile.nameLabel')}
          className="h-11 w-full min-w-0 rounded-xl border border-line bg-canvas px-3 text-left text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={80}
          required
        />
      ),
    },
    {
      kind: 'edit',
      id: 'username',
      icon: AtSign,
      label: t('profile.usernameLabel'),
      control: (
        <input
          ref={usernameRef}
          aria-label={t('profile.usernameLabel')}
          className="h-11 w-full min-w-0 rounded-xl border border-line bg-canvas px-3 text-left text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
          placeholder={t('profile.usernamePlaceholder')}
          maxLength={32}
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      ),
    },
    {
      kind: 'soon',
      id: 'channel',
      icon: Megaphone,
      label: t('profile.personalChannelLabel'),
      hint: t('profile.personalChannelComingSoon'),
      badge: t('profile.soonBadge'),
    },
    {
      kind: 'soon',
      id: 'automation',
      icon: Sparkles,
      label: t('profile.chatAutomationLabel'),
      hint: t('profile.chatAutomationComingSoon'),
      badge: t('profile.chatAutomationNew'),
    },
    {
      kind: 'edit',
      id: 'interfaceColor',
      icon: Palette,
      label: t('profile.interfaceColor'),
      control: (
        <>
          {interfaceColorSwatch}
          <input
            ref={themeColorInputRef}
            id="profile-theme"
            type="color"
            className="sr-only"
            value={themeColor}
            onChange={(event) => setThemeColor(event.target.value)}
          />
        </>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] grid items-end bg-[#171724]/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="max-h-[92dvh] w-full max-w-[100vw] animate-slide-up overflow-y-auto overflow-x-hidden rounded-t-xl border border-line bg-surface p-5 sm:max-w-[520px] sm:rounded-xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-3">
          <IconButton label={t('common.close')} onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
          <h1 id="profile-title" className="flex-1 text-center text-base font-bold tracking-[-0.01em]">
            {t('profile.infoTitle')}
          </h1>
          <span className="w-9" aria-hidden="true" />
        </header>

        {frozen && (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-xs font-medium text-brand"
          >
            <Snowflake className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('profile.frozenNotice')}
          </p>
        )}

        <form className="mt-4 space-y-4" onSubmit={save} noValidate>
          {/* Замороженный профиль показываем как есть, но менять ничего нельзя:
              один `fieldset disabled` закрывает и поля, и загрузку аватара. */}
          <fieldset disabled={frozen} className="space-y-4 border-0 p-0">

            {/* Шапка профиля: аватар с шевроном камеры, имя, статус «в сети». */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <input
                ref={avatarInputRef}
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={(event) => void changeAvatar(event.target.files?.[0])}
              />
              <div className="relative">
                <Avatar
                  name={displayName || profileUser.displayName}
                  src={avatarPreview ?? profileUser.avatarUrl ?? profileUser.avatar?.url}
                  size="xl"
                />
                {/* Шеврон-камера на аватаре, как в Telegram. Двойной клик откроет
                    системный диалог; повторный клик не сработает из-за ref-флага. */}
                <button
                  type="button"
                  aria-label={t('profile.changePhotoAria')}
                  onClick={() => {
                    if (avatarPickerOpenRef.current) return;
                    avatarPickerOpenRef.current = true;
                    avatarInputRef.current?.click();
                    window.setTimeout(() => {
                      avatarPickerOpenRef.current = false;
                    }, 200);
                  }}
                  className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-brand text-white shadow-lg ring-2 ring-surface transition hover:bg-brand-strong"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                disabled={avatarBusy || frozen}
                onClick={() => avatarInputRef.current?.click()}
                className="text-sm font-semibold text-brand"
              >
                {(profileUser.avatarUrl || profileUser.avatar) ? t('profile.changePhoto') : t('profile.setPhoto')}
              </button>
              {(profileUser.avatarUrl || profileUser.avatar) && (
                <button
                  type="button"
                  disabled={avatarBusy || frozen}
                  onClick={() => void deleteAvatar()}
                  className="text-xs font-semibold text-danger"
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {t('common.delete')}
                </button>
              )}
              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em]">
                <UserName name={displayName || profileUser.displayName} user={profileUser} />
              </h2>
              <p className="text-sm font-semibold text-brand">{t('profile.online')}</p>
            </div>

            {/* Бейджи: «а также @handle, @handle» + счётчик (заглушка — счёт
                сообщений/фото мы тут не показываем, чтобы экран оставался
                «о себе»). */}
            <p className="text-center text-sm text-muted">
              <AdditionalHandles
                usernames={profileUser.usernames}
                primaryUsername={profileUser.username}
                className="text-muted"
              />
            </p>

            {/* О себе — крупное поле, как в скриншоте: «Любые подробности…». */}
            <div className="rounded-2xl bg-canvas/70 p-3">
              <label htmlFor="profile-bio" className="sr-only">{t('profile.bioLabel')}</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3.5 h-5 w-5 text-muted" />
                <textarea
                  ref={bioRef}
                  id="profile-bio"
                  className={`h-28 w-full resize-none rounded-xl border border-line bg-canvas pl-10 pr-3 pt-3 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10 ${profileUser.scam || profileUser.fake ? 'select-none' : ''}`}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={280}
                  disabled={profileUser.scam || profileUser.fake}
                  /* Текст предупреждения выдан владельцем Yargram — не выделяется и не копируется. */
                  {...(profileUser.scam || profileUser.fake ? scamGuard : {})}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{t('profile.bioHint')}</p>
              {(profileUser.scam || profileUser.fake) && (
                <p
                  className={`mt-1.5 text-xs font-semibold ${profileUser.scam ? 'text-danger' : 'text-warning'}`}
                  role="status"
                >
                  {profileUser.scam ? t('profile.scamBioNotice') : t('profile.fakeBioNotice')}
                </p>
              )}
            </div>

            {/* Список строк по скриншоту: иконка + подпись слева, значение справа.
                Вёрстка не «прыгает» при вводе: подпись фиксирована (shrink-0), а
                правая часть — это flex-1 колонка с right-aligned полем фиксированной
                ширины, поэтому текст растёт влево, не сдвигая строку. */}
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-canvas/40">
              {rows.map((row) => {
                const Icon = row.icon;
                const body = (
                  <div className="flex min-h-[44px] items-center gap-3 px-3 py-2 transition hover:bg-canvas/40">
                    <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="max-w-[45%] shrink-0 truncate text-[15px] font-semibold text-ink">
                      {row.label}
                    </span>
                    <span className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
                      {row.kind === 'edit' && row.control}
                      {row.kind === 'static' && (
                        <span className={`truncate text-[15px] ${row.muted ? 'text-muted' : 'text-brand'}`}>
                          {row.value}
                        </span>
                      )}
                      {row.kind === 'soon' && (
                        <span className="inline-flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand">
                            {row.badge}
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                );
                return (
                  <li key={row.id}>
                    {row.kind === 'soon' ? (
                      <div
                        aria-describedby={`profile-row-${row.id}-hint`}
                        title={row.hint}
                        className="block cursor-help"
                      >
                        {body}
                      </div>
                    ) : (
                      body
                    )}
                    {row.kind === 'soon' && (
                      <p id={`profile-row-${row.id}-hint`} className="px-3 pb-2 text-xs text-muted">
                        {row.hint}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* День рождения — вынесен из списка намеренно: три селекта вместе с
                кнопкой «убрать» не влезали в одну строку списка и на узкой ширине
                вызывали горизонтальный скролл. Здесь им отведена вся ширина, а
                селекты переносятся на следующую строку (flex-wrap) при нехватке места. */}
            <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3">
              <div className="mb-2 flex items-center gap-3">
                <Cake className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                <span className="text-[15px] font-semibold text-ink">{t('profile.birthdayLabel')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={t('profile.day')}
                  className={birthdaySelectClass}
                  style={{ width: '4.5rem' }}
                  value={bdDay}
                  onChange={(event) => changeBirthdayPart('day', event.target.value)}
                >
                  <option value="">{t('profile.day')}</option>
                  {Array.from({ length: daysInMonth(bdMonth, bdYear) }, (_, index) => String(index + 1)).map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
                <select
                  aria-label={t('profile.month')}
                  className={birthdaySelectClass}
                  style={{ width: '8rem' }}
                  value={bdMonth}
                  onChange={(event) => changeBirthdayPart('month', event.target.value)}
                >
                  <option value="">{t('profile.month')}</option>
                  {MONTH_NAMES.map((name, index) => (
                    <option key={name} value={String(index + 1)}>{name}</option>
                  ))}
                </select>
                <select
                  aria-label={t('profile.year')}
                  className={birthdaySelectClass}
                  style={{ width: '5.5rem' }}
                  value={bdYear}
                  onChange={(event) => changeBirthdayPart('year', event.target.value)}
                >
                  <option value="">{t('profile.noYear')}</option>
                  {BIRTHDAY_YEARS.map((year) => (
                    <option key={year} value={String(year)}>{year}</option>
                  ))}
                </select>
                {(bdDay || bdMonth || bdYear) && (
                  <button type="button" onClick={clearBirthday} className="text-xs font-semibold text-brand">
                    {t('profile.removeBirthday')}
                  </button>
                )}
              </div>
            </div>

            {/* Подпись под списком: «С помощью имени пользователя…» — в скриншоте
                относится к строке «Username». */}
            <p className="-mt-2 px-1 text-xs leading-relaxed text-muted">
              {t('profile.usernameHintFull')}
            </p>

            {/* Подсказка под «День рождения»: «В настройках можно выбрать…». */}
            {(bdDay || bdMonth || bdYear) && (
              <p className="-mt-2 px-1 text-xs leading-relaxed text-muted">
                {t('profile.birthdayHintFull')}
              </p>
            )}

            {/* Быстрый доступ к приватности: «Показывать время посещения» —
                живёт в основном в отдельном экране, но переключатель здесь
                сохраняет один клик доходу до «Конфиденциальности». */}
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-canvas/40 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate text-[15px] font-semibold">
                  {t('profile.showLastSeen')}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-describedby="last-seen-description"
                checked={showLastSeen}
                onChange={(event) => setShowLastSeen(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-brand"
              />
            </label>
            <p id="last-seen-description" className="-mt-2 px-1 text-xs leading-relaxed text-muted">
              {t('profile.showLastSeenHint')}
            </p>

            {/* --- Дополнительные секции: их нет в скриншоте, но модели у нас
                живые. Оставляем свёрнутыми — это «всё прочее», как в Discord
                или Telegram: основные поля выше, остальное ниже и не отвлекает. --- */}

            <details className="rounded-2xl border border-line bg-canvas/40" open>
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted" aria-hidden="true" />
                  {t('profile.bannerLabel')}
                </span>
                <span className="text-xs font-semibold text-brand">▾</span>
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                <ProfileBanner
                  user={{
                    ...profileUser,
                    bannerColor,
                    bannerUrl: bannerPreview
                      ? null
                      : (bannerUrlInput.trim() || profileUser.bannerUrl) ?? null,
                    // Предпросмотр тоже вложение: иначе по ссылке не понять,
                    // видео это или картинка, и видео показалось бы сломанным.
                    banner: bannerPreview
                      ? {
                          id: 'banner-preview',
                          ownerId: profileUser.id,
                          kind: 'banner',
                          fileName: 'preview',
                          mimeType: bannerPreviewType ?? 'image/jpeg',
                          size: 0,
                          url: bannerPreview,
                          createdAt: new Date().toISOString(),
                        }
                      : profileUser.banner,
                  }}
                  className="rounded-xl border border-line"
                />
                {/* Готовые баннеры: те же цвета, что у обоев, но полосой под
                    шапку профиля и в двух палитрах — светлой и тёмной. Выбор
                    одним нажатием, без файла и без ссылки; хранятся как обычный
                    `bannerUrl`. 🔥 Сетка, а не лента с прокруткой: плитки ровно
                    по четыре в ряд и ничего не срезается по краям. */}
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">{t('profile.bannerBuiltIn')}</span>
                  {BANNER_VARIANTS.map((variant) => (
                    <div key={variant} className="space-y-1.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">
                        {t(variant === 'dark' ? 'themes.imageDarkGroup' : 'themes.imageLightGroup')}
                      </span>
                      <div
                        className="grid grid-cols-4 gap-2"
                        role="group"
                        aria-label={`${t('profile.bannerBuiltIn')} — ${
                          t(variant === 'dark' ? 'themes.imageDarkGroup' : 'themes.imageLightGroup')
                        }`}
                      >
                        {BUILT_IN_BANNERS.filter((banner) => banner.variant === variant).map((banner) => {
                          const active = (profileUser.bannerUrl ?? '') === banner.url;
                          const label = imageTileLabel(banner, t);
                          return (
                            <button
                              key={banner.id}
                              type="button"
                              data-banner-id={banner.id}
                              aria-pressed={active}
                              aria-label={label}
                              title={label}
                              disabled={bannerBusy}
                              onClick={() => void saveBannerUrl(banner.url)}
                              className={`relative aspect-[2/1] overflow-hidden rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                active
                                  ? 'border-brand ring-2 ring-brand/35'
                                  : 'border-line hover:border-brand/35'
                              }`}
                            >
                              {/* Картинка вне потока: у файла своя ширина 1600 px,
                                  и в потоке она задавала бы плитке минимум. */}
                              <img
                                src={banner.url}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                              />
                              {active && (
                                <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Баннер можно задать прямой ссылкой — как в Telegram фон чата.
                    Сохраняется сразу при уходе с поля (blur). */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="profile-banner-url" className="text-sm font-semibold">{t('profile.bannerUrlLabel')}</label>
                  <input
                    id="profile-banner-url"
                    type="url"
                    className="h-12 w-full rounded-xl border border-line bg-canvas px-3 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                    placeholder={t('profile.bannerUrlPlaceholder')}
                    value={bannerUrlInput}
                    onChange={(event) => setBannerUrlInput(event.target.value)}
                    onBlur={(event) => void saveBannerUrl(event.target.value)}
                    disabled={bannerUrlBusy}
                  />
                  <p className="text-xs text-muted">{t('profile.bannerUrlHint')}</p>
                </div>
                <input
                  ref={bannerInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm"
                  onChange={(event) => void changeBanner(event.target.files?.[0])}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={bannerBusy}
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4" />
                    {profileUser.bannerUrl || profileUser.banner ? t('profile.bannerReplace') : t('profile.bannerUpload')}
                  </Button>
                  {(profileUser.bannerUrl || profileUser.banner) && (
                    <Button type="button" variant="ghost" disabled={bannerBusy} onClick={() => void deleteBanner()}>
                      <Trash2 className="h-4 w-4" /> {t('profile.bannerRemovePhoto')}
                    </Button>
                  )}
                </div>
                {bannerProgress !== null && (
                  <div className="mt-2" role="status" aria-label={t('profile.uploadingBanner', { percent: bannerProgress })}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${bannerProgress}%` }} />
                    </div>
                    <p className="mt-1 text-right text-xs font-semibold text-muted">{bannerProgress}%</p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 pt-2">
                  <label htmlFor="profile-banner-color" className="text-sm font-semibold">{t('profile.bannerColor')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="profile-banner-color"
                      type="color"
                      className="h-10 w-10 rounded border border-line bg-canvas"
                      value={bannerColor}
                      onChange={(event) => setBannerColor(event.target.value)}
                      onBlur={(event) => void saveBannerColor(event.target.value)}
                    />
                    <Button type="button" variant="ghost" onClick={() => void saveBannerColor('')}>
                      {t('profile.bannerNoColor')}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted">{t('profile.bannerHint')}</p>
              </div>
            </details>

            <details className="rounded-2xl border border-line bg-canvas/40">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted" aria-hidden="true" />
                  {t('profile.wallpaperLabel')}
                </span>
                <span className="text-xs font-semibold text-brand">▾</span>
              </summary>
              <div className="space-y-2 border-t border-line p-4">
                <input
                  id="profile-wallpaper"
                  type="url"
                  className="h-12 w-full rounded-xl border border-line bg-canvas px-3 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                  placeholder={t('profile.wallpaperPlaceholder')}
                  value={wallpaperUrl}
                  onChange={(event) => setWallpaperUrl(event.target.value)}
                />
                <input
                  ref={wallpaperInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm"
                  onChange={(event) => void changeWallpaperFile(event.target.files?.[0])}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={wallpaperBusy}
                    onClick={() => wallpaperInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4" />
                    {t('profile.wallpaperUpload')}
                  </Button>
                </div>
                <p className="text-xs text-muted">{t('profile.wallpaperHint')}</p>
              </div>
            </details>

            {/* Знак приложения Yargram. Отдельное приложение — тоже аккаунт, и
                значок «Yargram» оно ставит себе само, без админ-панели. Сервер
                пропускает только аккаунт, помеченный приложением владельцем,
                поэтому остальным блок просто объясняет, почему кнопки нет. */}
            <div className="rounded-2xl border border-line bg-canvas/40 p-4">
              <span className="mb-2 block text-sm font-semibold">{t('profile.appBadgeLabel')}</span>
              {profileUser.isApp ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs leading-5 text-muted">{t('profile.appBadgeHint')}</p>
                    <Button
                      type="button"
                      variant={profileUser.badge === 'yargram' ? 'secondary' : 'primary'}
                      disabled={appBadgeBusy}
                      onClick={() => void toggleAppBadge()}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {profileUser.badge === 'yargram' ? t('profile.appBadgeRemove') : t('profile.appBadgeSet')}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted">{t('profile.appBadgeHow')}</p>
                </>
              ) : (
                <p className="text-xs leading-5 text-muted">{t('profile.appBadgeOwnerOnly')}</p>
              )}
            </div>

            <details className="rounded-2xl border border-line bg-canvas/40">
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-muted" aria-hidden="true" />
                  {t('profile.messageSounds')}
                </span>
                <span className="text-xs font-semibold text-brand">▾</span>
              </summary>
              <div className="space-y-2 border-t border-line p-4">
                <label className="flex items-center justify-between gap-4 text-sm font-semibold">
                  {t('profile.messageSounds')}
                  <input
                    type="checkbox"
                    role="switch"
                    checked={soundEnabled}
                    onChange={(event) => setSoundEnabled(event.target.checked)}
                    className="h-5 w-5 accent-brand"
                  />
                </label>
                <div className="border-t border-line pt-3">
                  <p className="text-sm font-semibold">{t('profile.browserNotifications')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {notificationPermission === 'granted' ? t('profile.notifGranted') : notificationPermission === 'denied' ? t('profile.notifDenied') : notificationPermission === 'unsupported' ? t('profile.notifUnsupported') : t('profile.notifDefault')}
                  </p>
                  {notificationPermission === 'default' && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => void requestBrowserNotificationPermission().then(setNotificationPermission)}
                    >
                      {t('profile.enableNotifications')}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted">{t('profile.deviceSettingsHint')}</p>
              </div>
            </details>
          </fieldset>

          {error && (
            <p className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={saving} disabled={avatarBusy || frozen}>{t('common.save')}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}