import {
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  LogOut,
  Moon,
  Phone,
  Plus,
  Settings,
  ShieldBan,
  ShieldCheck,
  Star,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Avatar } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { accountSubtitle, type StoredAccount } from '../../lib/accounts';
import { avatarProps } from '../../lib/user';
import type { User } from '../../types';

export type SidebarAction =
  | 'profile'
  | 'create-group'
  | 'create-channel'
  | 'blocked'
  | 'calls'
  | 'favorites'
  | 'favorites-notes'
  | 'settings'
  | 'admin'
  | 'toggle-theme'
  | 'logout';

interface SidebarProps {
  currentUser: User;
  /** Аккаунты, сохранённые на этом устройстве. */
  accounts: StoredAccount[];
  /** Токен активного аккаунта — по нему отмечаем галочкой. */
  activeToken: string;
  theme: 'light' | 'dark';
  onAction: (action: SidebarAction) => void;
  onSwitchAccount: (token: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (token: string) => void;
  onClose: () => void;
}

/**
 * Левая панель в стиле Telegram Desktop: шапка с аватаром и быстрыми ссылками,
 * переключатель аккаунтов, список пунктов меню, ночной режим и подвал с версией.
 */
export function AppSidebar({
  currentUser,
  accounts,
  activeToken,
  theme,
  onAction,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  onClose,
}: SidebarProps) {
  // Esc закрывает панель — так же, как и в остальных модалках.
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const online = currentUser.isOnline ?? currentUser.online;

  return (
    <div
      className="fixed inset-0 z-[80] flex bg-[#0c1218]/45 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-label="Меню"
        className="relative flex h-full w-[88vw] max-w-[360px] animate-slide-up flex-col bg-surface shadow-float sm:max-w-[400px]"
      >
        {/* Шапка: аватар, имя, статус и переключатель аккаунтов */}
        <header className="px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Avatar
              name={currentUser.displayName}
              src={currentUser.avatarUrl ?? currentUser.avatar?.url}
              size="lg"
              online={online}
              {...avatarProps(currentUser, currentUser.displayName)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-ink">
                <UserName name={currentUser.displayName} user={currentUser} />
              </p>
              {/* Эмодзи-статуса пока нет — показываем просто состояние подключения. */}
              <p className="mt-0.5 truncate text-[13px] font-semibold text-muted">
                {online ? 'в сети' : 'не в сети'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Свернуть"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Аккаунты: список сохранённых на устройстве + «Добавить аккаунт». */}
        <ul className="mx-5 mt-1 space-y-1">
          {accounts.map((account) => {
            const isActive = account.token === activeToken;
            const accountOnline = account.user.isOnline ?? account.user.online;
            return (
              <li key={account.token} className="relative">
                <button
                  type="button"
                  aria-current={isActive}
                  onClick={() => (isActive ? onAction('profile') : onSwitchAccount(account.token))}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    accounts.length > 1 ? 'pr-11' : ''
                  } ${isActive ? 'bg-brand-soft/70' : 'bg-canvas hover:bg-brand-soft/35'}`}
                >
                  <Avatar
                    name={account.user.displayName}
                    src={account.user.avatarUrl ?? account.user.avatar?.url}
                    size="sm"
                    online={accountOnline}
                    {...avatarProps(account.user, account.user.displayName)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      <UserName name={account.user.displayName} user={account.user} />
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {isActive
                        ? accountOnline
                          ? 'в сети'
                          : 'не в сети'
                        : accountSubtitle(account)}
                    </p>
                  </div>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-brand" aria-label="Активный аккаунт" />}
                </button>
                {accounts.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Выйти из аккаунта ${account.user.displayName}`}
                    title="Выйти из аккаунта"
                    onClick={() => onRemoveAccount(account.token)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={onAddAccount}
              className="flex w-full items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-left transition hover:bg-brand-soft/35"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <Plus className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-ink">Добавить аккаунт</span>
            </button>
          </li>
        </ul>

        {/* Главное меню — иконки и ярлыки как в ТГ. */}
        <nav className="mt-5 flex-1 overflow-y-auto px-2" aria-label="Главное меню">
          <MenuRow icon={<UserPlus className="h-5 w-5" />} label="Мой профиль" onClick={() => onAction('profile')} />
          <MenuRow icon={<UsersRound className="h-5 w-5" />} label="Создать группу" muted onClick={() => onAction('create-group')} />
          <MenuRow icon={<CircleHelp className="h-5 w-5" />} label="Создать канал" muted onClick={() => onAction('create-channel')} />
          <MenuRow icon={<ShieldBan className="h-5 w-5" />} label="Заблокированные" onClick={() => onAction('blocked')} />
          <MenuRow icon={<Phone className="h-5 w-5" />} label="Звонки" muted onClick={() => onAction('calls')} />
          <MenuRow icon={<Bookmark className="h-5 w-5" />} label="Избранное" onClick={() => onAction('favorites')} />
          <MenuRow icon={<Star className="h-5 w-5" />} label="Заметки" onClick={() => onAction('favorites-notes')} />
          <MenuRow icon={<Settings className="h-5 w-5" />} label="Настройки" onClick={() => onAction('settings')} />

          {/* Админ-панель — только владельцу: администрирование чужих аккаунтов
              стоит рядом с настройками, но это не личные настройки, поэтому
              отдельным пунктом, а не вкладкой внутри. */}
          {currentUser.isOwner && (
            <MenuRow icon={<ShieldCheck className="h-5 w-5" />} label="Админ-панель" onClick={() => onAction('admin')} />
          )}

          {/* Ночной режим — переключатель темы. */}
          <button
            type="button"
            onClick={() => onAction('toggle-theme')}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink transition hover:bg-brand-soft/45"
          >
            <Moon className="h-5 w-5" />
            <span className="flex-1">Ночной режим</span>
            <span
              role="switch"
              aria-checked={theme === 'dark'}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${theme === 'dark' ? 'bg-brand' : 'bg-line'}`}
            >
              <span
                className={`absolute h-5 w-5 rounded-full bg-white shadow transition ${theme === 'dark' ? 'left-[22px]' : 'left-0.5'}`}
                aria-hidden="true"
              />
            </span>
          </button>

          {/* Выйти — красный, как в Telegram Desktop. */}
          <button
            type="button"
            onClick={() => onAction('logout')}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-danger transition hover:bg-danger/10"
          >
            <LogOut className="h-5 w-5" />
            <span className="flex-1">Выйти</span>
          </button>
        </nav>

        {/* Подвал с версией сборки — как в Telegram Desktop. */}
        <footer className="border-t border-line/70 px-5 py-3 text-[12px] leading-5 text-muted">
          <p className="font-semibold text-ink">Yargram Web</p>
          {/* ЗБТ — закрытое бета-тестирование: сокращение, расшифровка в подсказке. */}
          <p title="Закрытое бета-тестирование">Версия 0.1.0 ЗБТ</p>
          <button type="button" className="mt-0.5 font-semibold text-brand transition hover:text-brand-strong">
            О программе
          </button>
        </footer>

        {/* Кнопка закрытия поверх — на мобильном шеврон может перекрываться свайпом. */}
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink sm:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </aside>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  muted,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  /** Пункт есть в ТГ, но в Yargram пока не реализован — приглушаем. */
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-brand-soft/45 ${muted ? 'text-muted' : 'text-ink'}`}
    >
      <span className={muted ? 'text-muted' : 'text-brand'}>{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}