import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Globe,
  Languages,
  Lock,
  MessageSquare,
  Search,
  Settings2,
  Speaker,
  Folder,
  Palette,
  UserRound,
  X,
  ZoomIn,
} from 'lucide-react';
import { UserName } from '../../components/UserName';
import { Avatar } from '../../components/ui';
import { useLanguage, useTranslation } from '../../hooks/useLanguage';
import { LANGUAGE_LABELS } from '../../lib/i18n';
import type { User } from '../../types';

/**
 * Разделы настроек. Экран — это только список: самих разделов тут нет.
 * `ready: false` означает, что раздел ещё не сделан, и открывать в нём нечего —
 * такой пункт не притворяется рабочим, а честно сообщает об этом.
 */
type SectionId =
  | 'account'
  | 'notifications'
  | 'privacy'
  | 'sessions'
  | 'chats'
  | 'folders'
  | 'advanced'
  | 'sound'
  | 'language'
  | 'scale'
  | 'themes';

interface Section {
  id: SectionId;
  labelKey: string;
  Icon: typeof Bell;
  ready: boolean;
}

const SECTIONS: Section[] = [
  { id: 'account', labelKey: 'settings.myAccount', Icon: UserRound, ready: true },
  { id: 'themes', labelKey: 'settings.themes', Icon: Palette, ready: true },
  // Масштаб интерфейса: свойство экрана, поэтому хранится на устройстве.
  { id: 'scale', labelKey: 'settings.scale', Icon: ZoomIn, ready: true },
  { id: 'notifications', labelKey: 'settings.notifications', Icon: Bell, ready: false },
  { id: 'privacy', labelKey: 'settings.privacy', Icon: Lock, ready: true },
  // Сеансы: видно, с каких сайтов заходили в аккаунт.
  { id: 'sessions', labelKey: 'settings.sessions', Icon: Globe, ready: true },
  { id: 'chats', labelKey: 'settings.chatSettings', Icon: MessageSquare, ready: false },
  { id: 'folders', labelKey: 'settings.folders', Icon: Folder, ready: false },
  { id: 'advanced', labelKey: 'settings.advanced', Icon: Settings2, ready: false },
  { id: 'sound', labelKey: 'settings.soundCamera', Icon: Speaker, ready: false },
  { id: 'language', labelKey: 'settings.language', Icon: Languages, ready: true },
];

interface SettingsScreenProps {
  user: User;
  /** Открыть существующее окно профиля — это раздел «Мой аккаунт». */
  onOpenAccount: () => void;
  /** Открыть выбор языка. */
  onOpenLanguage: () => void;
  /** Открыть «Конфиденциальность». */
  onOpenPrivacy: () => void;
  /** Открыть «Активные сеансы». */
  onOpenSessions: () => void;
  /** Открыть «Темы»: встроенные наборы, свои темы и редактор. */
  onOpenThemes?: () => void;
  /** Открыть «Масштаб интерфейса». */
  onOpenScale?: () => void;
  onClose: () => void;
}

export function SettingsScreen({
  user,
  onOpenAccount,
  onOpenLanguage,
  onOpenPrivacy,
  onOpenSessions,
  onOpenThemes,
  onOpenScale,
  onClose,
}: SettingsScreenProps) {
  const t = useTranslation();
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      // Escape сначала закрывает поиск, и только потом сам экран — иначе одно
      // нажатие схлопывало бы обе ступени разом.
      if (event.key !== 'Escape') return;
      setSearchOpen((open) => {
        if (open) {
          setQuery('');
          return false;
        }
        onClose();
        return false;
      });
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return SECTIONS;
    return SECTIONS.filter((section) =>
      t(section.labelKey).toLocaleLowerCase('ru-RU').includes(normalized),
    );
  }, [query, t]);

  function open(section: Section) {
    if (section.id === 'account') return onOpenAccount();
    if (section.id === 'language') return onOpenLanguage();
    if (section.id === 'privacy') return onOpenPrivacy();
    if (section.id === 'sessions') return onOpenSessions();
    if (section.id === 'themes') return onOpenThemes?.();
    if (section.id === 'scale') return onOpenScale?.();
    // Не сделанный раздел ничего не открывает: список просто не даёт себя
    // нажать, чтобы не выглядеть сломанным.
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid items-end bg-[#171724]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-w-[460px] sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
      >
        <header className="flex items-center gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-[-0.02em] text-ink">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            aria-label={t('settings.search')}
            aria-pressed={searchOpen}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => {
              setSearchOpen((open) => {
                if (open) setQuery('');
                return !open;
              });
            }}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={t('modals.close')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {searchOpen && (
          <div className="border-b border-line/70 px-4 py-3 sm:px-5">
            <input
              autoFocus
              className="h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
              value={query}
              placeholder={t('settings.searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Шапка-профиль: открывает «Мой аккаунт». */}
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex w-full items-center gap-3 border-b border-line/70 px-4 py-4 text-left transition hover:bg-brand-soft/40 sm:px-5"
          >
            <Avatar name={user.displayName} src={user.avatarUrl} size="lg" />
            <span className="min-w-0 flex-1">
              <UserName
                name={user.displayName}
                user={user}
                size="md"
                className="block truncate text-base font-semibold text-ink"
              />
              <span className="mt-0.5 block truncate text-sm text-muted">
                {user.username ? `@${user.username}` : ''}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
          </button>

          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">
              {t('settings.nothingFound')}
            </p>
          )}

          <ul className="py-1">
            {visible.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  disabled={!section.ready}
                  title={section.ready ? undefined : t('settings.comingSoon')}
                  onClick={() => open(section)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition sm:px-5 ${
                    section.ready
                      ? 'hover:bg-brand-soft/40 text-ink'
                      : 'cursor-default text-muted/70'
                  }`}
                >
                  <section.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {t(section.labelKey)}
                  </span>
                  {section.id === 'language' && (
                    <span className="shrink-0 text-sm font-semibold text-brand">
                      {LANGUAGE_LABELS[language]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
