import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AtSign, Bell, Camera, FileText, Image, Palette, ShieldCheck, Snowflake, Trash2, UserRound, X } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button, IconButton } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { AdditionalHandles } from '../../components/AdditionalHandles';
import type { User } from '../../types';
import { isSoundEnabled, setSoundEnabled, subscribeToSoundSetting } from '../../lib/sounds';
import { browserNotificationPermission, requestBrowserNotificationPermission } from '../../lib/notifications';
import { BIRTHDAY_YEARS, MONTH_NAMES, composeBirthday, daysInMonth, parseBirthday } from './birthday';

const baseTabs = [
  ['account', 'Аккаунт', UserRound], ['privacy', 'Приватность', ShieldCheck],
  ['appearance', 'Оформление', Palette], ['notifications', 'Уведомления', Bell],
] as const;

interface ProfileModalProps {
  token: string;
  user: User;
  onClose: () => void;
  onSaved: (user: User) => void;
}

export function ProfileModal({ token, user, onClose, onSaved }: ProfileModalProps) {
  const [tab, setTab] = useState<string>('account');
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled);
  const [notificationPermission, setNotificationPermission] = useState(browserNotificationPermission);
  useEffect(() => subscribeToSoundSetting(setSoundEnabledState), []);
  const [profileUser, setProfileUser] = useState(user);
  // Замороженный аккаунт профиль не меняет — форму закрываем целиком.
  const frozen = Boolean(user.isFrozen);
  // Отметку SCAM могут выдать при уже открытом окне: сервер тут же подменяет
  // описание, поэтому забираем его в форму и закрываем поле.
  useEffect(() => {
    setProfileUser(user);
    if (user.scam) setBio(user.bio ?? '');
  }, [user]);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username ?? '');
  const [themeColor, setThemeColor] = useState(user.themeColor ?? '#3390ec');
  const [showLastSeen, setShowLastSeen] = useState(user.showLastSeen ?? true);
  const [wallpaperUrl, setWallpaperUrl] = useState(user.wallpaperUrl ?? '');

  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [bio, setBio] = useState(user.bio ?? '');
  // День рождения держим тремя частями: нативное <input type="date"> в этой вёрстке
  // не работает, а список «день / месяц / год» выбирается без сюрпризов браузера.
  const initialBirthday = parseBirthday(user.birthday ?? '');
  const [bdDay, setBdDay] = useState(initialBirthday.day);
  const [bdMonth, setBdMonth] = useState(initialBirthday.month);
  const [bdYear, setBdYear] = useState(initialBirthday.year);
  const nameRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!supportedTypes.has(file.type)) {
      setError('Аватар должен быть в формате JPG, PNG или WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Размер аватара не должен превышать 10 МБ.');
      return;
    }

    setError('');
    setAvatarBusy(true);
    setAvatarProgress(0);
    setAvatarPreview(URL.createObjectURL(file));
    try {
      const updated = await api.updateAvatar(token, file, {
        onProgress: setAvatarProgress,
      });
      setProfileUser(updated);
      onSaved(updated);
      setAvatarPreview(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить аватар.');
      setAvatarPreview(null);
    } finally {
      setAvatarBusy(false);
      setAvatarProgress(null);
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
      setError(reason instanceof ApiError ? reason.message : 'Не удалось удалить аватар.');
    } finally {
      setAvatarBusy(false);
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
      setError('Имя не может быть пустым.');
      return;
    }
    if (!/^[A-Za-z0-9_]{3,32}$/.test(normalizedUsername)) {
      setError('Username: 3–32 символа, латиница, цифры или _.');
      return;
    }
    if (wallpaperUrl.trim() && !/^https?:\/\//i.test(wallpaperUrl.trim())) {
      setError('Укажите ссылку на фон, начинающуюся с https:// или http://.');
      setTab('appearance');
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
        showLastSeen,
        // Собираем дату из трёх списков; неполный выбор → null, сервер сотрёт поле.
        birthday: composeBirthday(bdDay, bdMonth, bdYear),
      });
      setProfileUser(updated);
      onSaved(updated);
      onClose();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить профиль.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    'h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10';
  // Списки дня/месяца/года: без иконки слева, поэтому без pl-11.
  const selectClass =
    'h-12 w-full min-w-0 appearance-none rounded-xl border border-line bg-canvas px-3 text-[15px] text-ink outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10';

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
        className="max-h-[92dvh] w-full animate-slide-up overflow-y-auto rounded-t-xl border border-line bg-surface p-5 sm:max-w-[520px] sm:rounded-xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              name={displayName || profileUser.displayName}
              src={avatarPreview ?? profileUser.avatarUrl ?? profileUser.avatar?.url}
              size="xl"
            />
 
              <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">Ваш аккаунт</p><h2 id="profile-title" className="text-xl font-extrabold tracking-[-0.025em]">
                <UserName name={displayName || profileUser.displayName} user={profileUser} />
              </h2>
              <div className="mt-1 flex items-center gap-2 truncate text-sm text-muted">
                <span>@{username || 'username'}</span>
              </div>
              <AdditionalHandles
                usernames={profileUser.usernames}
                primaryUsername={profileUser.username}
                className="mt-0.5 block text-muted"
              /></div>
            </div>
          <IconButton label="Закрыть" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </header>

        <nav className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1 sm:grid-cols-4" aria-label="Разделы настроек">
          {baseTabs.map(([id, label, Icon]) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition ${tab === id ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <form className="mt-5 space-y-4" onSubmit={save} noValidate>
          {/* Замороженный профиль показываем как есть, но менять ничего нельзя:
              один `fieldset disabled` закрывает и поля, и загрузку аватара. */}
          {frozen && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-xs font-medium text-brand"
            >
              <Snowflake className="h-4 w-4 shrink-0" aria-hidden="true" />
              Аккаунт заморожен — профиль доступен только для просмотра, изменения недоступны.
            </p>
          )}
          <fieldset disabled={frozen} className="space-y-4 border-0 p-0">
          <div hidden={tab !== 'account'} className="settings-panel space-y-4">
          <div className="rounded-xl border border-line bg-canvas/70 p-3">
            <input
              ref={avatarInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(event) => void changeAvatar(event.target.files?.[0])}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={avatarBusy}
                onClick={() => avatarInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                {profileUser.avatarUrl || profileUser.avatar ? 'Заменить фото' : 'Загрузить фото'}
              </Button>
              {(profileUser.avatarUrl || profileUser.avatar) && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={avatarBusy}
                  onClick={() => void deleteAvatar()}
                >
                  <Trash2 className="h-4 w-4" /> Удалить
                </Button>
              )}
              <span className="text-xs text-muted">JPG, PNG или WebP · до 10 МБ</span>
            </div>
            {avatarProgress !== null && (
              <div className="mt-3" role="status" aria-label={`Загрузка аватара: ${avatarProgress}%`}>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${avatarProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs font-semibold text-muted">{avatarProgress}%</p>
              </div>
            )}
          </div>

          <fieldset className="space-y-4 rounded-2xl border border-line p-4">
            <legend className="px-2 text-sm font-semibold">Личные данные</legend>
          <div>
            <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold">Имя</label>
            <div className="relative">
              <UserRound className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
              <input
                ref={nameRef}
                id="profile-name"
                className={fieldClass}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-username" className="mb-1.5 block text-sm font-semibold">Username</label>
            <div className="relative">
              <AtSign className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
              <input
                id="profile-username"
                className={fieldClass}
                value={username}
                onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))}
                placeholder="top1nuk1"
                maxLength={32}
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">По этому адресу вас смогут найти: @{username || 'username'} · регистр не важен</p>
          </div>

            <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-semibold">О себе</label>
            <div className="relative">
              <FileText className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
              <textarea
                id="profile-bio"
                className={`${fieldClass} h-28 resize-none py-3 disabled:cursor-not-allowed disabled:opacity-70`}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Пара слов о себе"
                maxLength={280}
                disabled={profileUser.scam}
              />
            </div>
            {profileUser.scam && (
              <p className="mt-1.5 text-xs font-semibold text-danger" role="status">
                На аккаунте стоит отметка SCAM: описание заменено предупреждением о мошенничестве и не
                редактируется, пока владелец Yargram не снимет отметку.
              </p>
            )}

          <div>
            <span className="mb-1.5 block text-sm font-semibold">День рождения</span>
            <div className="grid grid-cols-3 gap-2">
              <label className="sr-only" htmlFor="birthday-day">День</label>
              <select
                id="birthday-day"
                className={selectClass}
                value={bdDay}
                onChange={(event) => changeBirthdayPart('day', event.target.value)}
              >
                <option value="">День</option>
                {Array.from({ length: daysInMonth(bdMonth, bdYear) }, (_, index) => String(index + 1)).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>

              <label className="sr-only" htmlFor="birthday-month">Месяц</label>
              <select
                id="birthday-month"
                className={selectClass}
                value={bdMonth}
                onChange={(event) => changeBirthdayPart('month', event.target.value)}
              >
                <option value="">Месяц</option>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={String(index + 1)}>{name}</option>
                ))}
              </select>

              <label className="sr-only" htmlFor="birthday-year">Год</label>
              <select
                id="birthday-year"
                className={selectClass}
                value={bdYear}
                onChange={(event) => changeBirthdayPart('year', event.target.value)}
              >
                <option value="">Без года</option>
                {BIRTHDAY_YEARS.map((year) => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </select>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
              <span>День рождения видят другие в вашем профиле. Год можно не указывать — тогда возраст не показывается.</span>
              {(bdDay || bdMonth || bdYear) && (
                <button type="button" onClick={clearBirthday} className="font-semibold text-brand transition hover:text-brand-strong">
                  Убрать
                </button>
              )}
            </div>
          </div>
          </fieldset>

          </div>
          <fieldset hidden={tab !== 'privacy'} className="settings-panel rounded-2xl border border-line p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-brand" />Приватность</legend>
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span><span className="block text-sm font-semibold">Показывать время посещения</span>
                <span id="last-seen-description" className="mt-1 block text-xs leading-relaxed text-muted">Когда выключено, другие видят только приблизительный период. Статус «В сети» также скрыт.</span>
              </span>
              <input type="checkbox" role="switch" aria-describedby="last-seen-description" checked={showLastSeen} onChange={(event) => setShowLastSeen(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-brand" />
            </label>
          </fieldset>

          <fieldset hidden={tab !== 'appearance'} className="settings-panel space-y-4 rounded-2xl border border-line p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold"><Palette className="h-4 w-4 text-brand" />Оформление</legend>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="profile-theme" className="mb-1.5 block text-sm font-semibold">Тема (цвет)</label>
            <input
              id="profile-theme"
              type="color"
              className="h-10 w-10 rounded border border-line bg-canvas"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
            />
          </div>
          <div className="mt-4">
            <label htmlFor="profile-wallpaper" className="mb-1.5 block text-sm font-semibold">Фоновый рисунок (URL)</label>
            <div className="relative">
            <Image className="absolute left-4 top-3.5 h-5 w-5 text-muted" />
            <input
              id="profile-wallpaper"
              type="url"
              className={fieldClass}
              placeholder="https://example.com/wallpaper.jpg"
              value={wallpaperUrl}
              onChange={(e) => setWallpaperUrl(e.target.value)}
            />
            </div>
            <p className="mt-1.5 text-xs text-muted">Оставьте пустым, чтобы вернуть стандартный фон.</p>
          </div>
          </fieldset>

          <fieldset hidden={tab !== 'notifications'} className="settings-panel space-y-4 rounded-2xl border border-line p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold"><Bell className="h-4 w-4 text-brand" />Уведомления</legend>
            <label className="flex items-center justify-between gap-4 text-sm font-semibold">Звуки сообщений
              <input type="checkbox" role="switch" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} className="h-5 w-5 accent-brand" />
            </label>
            <div className="border-t border-line pt-4">
              <p className="text-sm font-semibold">Уведомления браузера</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{notificationPermission === 'granted' ? 'Включены. Новые сообщения появятся, когда вкладка неактивна.' : notificationPermission === 'denied' ? 'Заблокированы браузером. Разрешите уведомления в настройках сайта.' : notificationPermission === 'unsupported' ? 'Этот браузер не поддерживает уведомления.' : 'Получайте уведомления о новых сообщениях вне вкладки.'}</p>
              {notificationPermission === 'default' && <Button type="button" variant="secondary" className="mt-3" onClick={() => void requestBrowserNotificationPermission().then(setNotificationPermission)}>Включить уведомления</Button>}
            </div>
            <p className="text-xs text-muted">Эти настройки применяются сразу на этом устройстве.</p>
          </fieldset>

          </fieldset>

          {error && (
            <p className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={saving} disabled={avatarBusy || frozen}>Сохранить</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
