import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AtSign, Bell, Camera, FileText, Image, Palette, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button, IconButton } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { AdditionalHandles } from '../../components/AdditionalHandles';
import type { User } from '../../types';
import { isSoundEnabled, setSoundEnabled, subscribeToSoundSetting } from '../../lib/sounds';
import { browserNotificationPermission, requestBrowserNotificationPermission } from '../../lib/notifications';

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

function adminErrorMessage(reason: unknown): string {
  return reason instanceof ApiError ? reason.message : 'Не удалось выполнить действие';
}

export function ProfileModal({ token, user, onClose, onSaved }: ProfileModalProps) {
  const adminTab = user?.isOwner ? [['admin', 'Админ', ShieldCheck] as const] : [];
  const settingsTabs = [...baseTabs, ...adminTab] as (typeof baseTabs[number] | typeof adminTab[number])[];
  const [tab, setTab] = useState<string>('account');
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled);
  const [notificationPermission, setNotificationPermission] = useState(browserNotificationPermission);
  useEffect(() => subscribeToSoundSetting(setSoundEnabledState), []);
  const [profileUser, setProfileUser] = useState(user);
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
  const [birthday, setBirthday] = useState(user.birthday ?? '');
  /** Кого администрируем прямо сейчас: его состояние показывает панель ниже. */
  const [adminTarget, setAdminTarget] = useState<User | null>(null);
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
        // Пустая строка → null, чтобы сервер стёр поле. Иначе — как ввёл пользователь.
        birthday: birthday || null,
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

  /**
   * Выдача и снятие админских атрибутов. Цель — юзернейм из поля ввода;
   * пустой массив usernames очищает список дополнительных ников.
   */
  function runAdminGrant(
    input: { isVerified?: boolean; badge?: 'yargram' | null; usernames?: string[] },
    success: string,
  ) {
    const username = (document.getElementById('admin-target-id') as HTMLInputElement | null)?.value?.trim();
    if (!username) {
      setError('Укажите юзернейм');
      return;
    }
    setError('');
    api.adminGrant(token, profileUser.id ?? user.id, { targetUsername: username, ...input })
      .then((updated) => {
        setError(success);
        // Панель состояния цели должна показать свежие данные, а не те, что были до правки.
        setAdminTarget((current) => (current ? { ...current, ...updated } : current));
      })
      .catch((reason: unknown) => setError(adminErrorMessage(reason)));
  }

  /** Показывает текущее состояние цели: галочка, значок и список доп. юзернеймов. */
  function inspectAdminTarget() {
    const username = (document.getElementById('admin-target-id') as HTMLInputElement | null)
      ?.value?.trim()
      .replace(/^@/, '')
      .toLowerCase();
    if (!username) {
      setError('Укажите юзернейм');
      return;
    }
    setError('');
    api.users(token, username)
      .then((result) => {
        const wanted = username;
        const found = result.items.find(
          (candidate) =>
            candidate.username?.toLowerCase() === wanted ||
            (candidate.usernames ?? []).some((alias) => alias.toLowerCase() === wanted),
        );
        if (!found) {
          setAdminTarget(null);
          setError(`Пользователь @${username} не найден`);
          return;
        }
        setAdminTarget(found);
      })
      .catch((reason: unknown) => setError(adminErrorMessage(reason)));
  }

  const fieldClass =
    'h-12 w-full rounded-xl border border-line bg-canvas pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10';

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
          {settingsTabs.map(([id, label, Icon]) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition ${tab === id ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <form className="mt-5 space-y-4" onSubmit={save} noValidate>
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
                className={`${fieldClass} h-28 resize-none py-3`}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Пара слов о себе"
                maxLength={280}
              />
            </div>

          <div>
            <label htmlFor="profile-birthday" className="mb-1.5 block text-sm font-semibold">День рождения</label>
            <div className="relative">
              <input
                id="profile-birthday"
                type="date"
                className={fieldClass}
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
                max="2099-12-31"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
              <span>День рождения видят другие пользователи в вашем профиле.</span>
              {birthday && (
                <button type="button" onClick={() => setBirthday('')} className="font-semibold text-brand transition hover:text-brand-strong">
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

          <fieldset hidden={tab !== 'admin'} className="settings-panel rounded-2xl border border-line p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-brand" />Овнер / Админ</legend>
            <p className="text-sm text-muted">Только для владельца: галочка, значок и дополнительные юзернеймы для любого аккаунта — выдача и снятие.</p>
            <div className="mt-3 space-y-3">
              <input id="admin-target-id" className={fieldClass} placeholder="username (например: top1nuk1)" />
              <input id="admin-usernames" className={fieldClass} placeholder="доп. юзернеймы через запятую: kotik, second_name" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="text-xs" onClick={() => inspectAdminTarget()}>Показать состояние</Button>
                <Button type="button" variant="secondary" className="text-xs" onClick={() => runAdminGrant({ isVerified: true }, 'Галочка выдана')}>Подтвердить (галочка)</Button>
                <Button type="button" variant="secondary" className="text-xs" onClick={() => runAdminGrant({ badge: 'yargram' }, 'Значок Yargram выдан')}>Значок Yargram</Button>
                <Button type="button" variant="secondary" className="text-xs" onClick={() => {
                  const aliases = ((document.getElementById('admin-usernames') as HTMLInputElement | null)?.value ?? '')
                    .split(/[,\s]+/)
                    .map((value) => value.trim().replace(/^@/, ''))
                    .filter(Boolean);
                  if (aliases.length === 0) { setError('Укажите хотя бы один доп. юзернейм'); return; }
                  runAdminGrant({ usernames: aliases }, `Назначены юзернеймы: ${aliases.join(', ')}`);
                }}>Назначить юзернеймы</Button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <Button type="button" variant="secondary" className="text-xs" onClick={() => runAdminGrant({ isVerified: false }, 'Галочка снята')}>Снять галочку</Button>
                <Button type="button" variant="secondary" className="text-xs" onClick={() => runAdminGrant({ badge: null }, 'Значок Yargram снят')}>Снять значок Yargram</Button>
                <Button type="button" variant="secondary" className="text-xs" onClick={() => runAdminGrant({ usernames: [] }, 'Доп. юзернеймы очищены')}>Очистить доп. юзернеймы</Button>
                <Button type="button" variant="secondary" className="text-xs" disabled={!adminTarget} onClick={() => {
                  if (!adminTarget) return;
                  setError('');
                  api.adminUnassign(token, adminTarget.id)
                    .then((updated) => {
                      setError('Права администратора сняты');
                      setAdminTarget({ ...adminTarget, ...updated });
                    })
                    .catch((reason: unknown) => setError(adminErrorMessage(reason)));
                }}>Снять права админа</Button>
              </div>
              {adminTarget && (
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <p className="text-xs font-semibold">
                    @{adminTarget.username ?? '—'}: галочка {adminTarget.isVerified ? 'есть' : 'нет'}, значок{' '}
                    {adminTarget.badge === 'yargram' ? 'Yargram' : 'нет'}
                  </p>
                  {(adminTarget.usernames ?? []).length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {(adminTarget.usernames ?? []).map((alias) => (
                        <li key={alias} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">@{alias}</span>
                          <button
                            type="button"
                            className="shrink-0 font-semibold text-danger hover:underline"
                            onClick={() => runAdminGrant(
                              { usernames: (adminTarget.usernames ?? []).filter((item) => item !== alias) },
                              `Юзернейм @${alias} удалён`,
                            )}
                          >
                            убрать
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Дополнительных юзернеймов нет.</p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" className="text-xs" onClick={() => {
                  const field = document.getElementById('admin-target-id') as HTMLInputElement | null;
                  if (field) field.value = username || profileUser.username || '';
                }}>Подставить свой ник</Button>
                <span className="text-xs text-muted">Себя тоже можно администрировать: доп. юзернеймы назначаются и своему аккаунту (кроме прав администратора).</span>
              </div>
              <p className="text-xs text-muted">Поле юзернеймов нужно только для назначения: кнопка «Очистить» снимает все дополнительные ники сразу.</p>
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

          {error && (
            <p className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={saving} disabled={avatarBusy}>Сохранить</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
