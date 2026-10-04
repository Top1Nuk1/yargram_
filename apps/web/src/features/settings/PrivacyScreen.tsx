import { useEffect, useState } from 'react';
import { ArrowLeft, Lock, Moon, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../hooks/useLanguage';
import type { User } from '../../types';

/**
 * Разделы экрана. Открытый перечень — не весь Telegram: показываем только то,
 * что приложение действительно умеет, плюс явно помеченные заготовки.
 */
type PrivacySectionId = 'lastSeen' | 'calls' | 'messages' | 'birthday' | 'invites';

interface PrivacySection {
  id: PrivacySectionId;
  titleKey: string;
  hintKey: string;
  /** Раздел сделан: под ним есть рабочий переключатель. */
  ready: boolean;
}

const SECTIONS: PrivacySection[] = [
  { id: 'lastSeen', titleKey: 'privacy.lastSeen', hintKey: 'privacy.lastSeenHint', ready: true },
  { id: 'calls', titleKey: 'privacy.calls', hintKey: 'privacy.callsHint', ready: false },
  { id: 'messages', titleKey: 'privacy.messages', hintKey: 'privacy.messagesHint', ready: false },
  { id: 'birthday', titleKey: 'privacy.birthday', hintKey: 'privacy.birthdayHint', ready: false },
  { id: 'invites', titleKey: 'privacy.invites', hintKey: 'privacy.invitesHint', ready: false },
];

interface PrivacyScreenProps {
  user: User;
  /**
   * Сохранить настройку. Экран сам не знает про токен и про api: их пробрасывает
   * мессенджер, чтобы экран оставался переиспользуемым и простым в тестах.
   */
  onToggleLastSeen: (value: boolean) => Promise<void>;
  /**
   * Стрелка «назад»: вернуться на экран, откуда пришли (список настроек).
   * Не задана — стрелка работает как закрытие.
   */
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Экран «Конфиденциальность».
 *
 * Работает из перечисленного только «Время захода» — это единственный флаг,
 * который сервер реально хранит и отдаёт (`showLastSeen` в модели пользователя).
 * Остальные разделы показаны по макету, но выключены и подписаны: лучше честная
 * заглушка, чем переключатель, который ничего не меняет.
 */
export function PrivacyScreen({ user, onToggleLastSeen, onBack, onClose }: PrivacyScreenProps) {
  const t = useTranslation();
  const [showLastSeen, setShowLastSeen] = useState(user.showLastSeen ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && (onBack ?? onClose)();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onBack, onClose]);

  async function toggleLastSeen(next: boolean) {
    // Переключатель отзывается сразу, а при ошибке возвращается назад:
    // ждать ответа сервера на каждое нажатие было бы заметно медленнее.
    const previous = showLastSeen;
    setShowLastSeen(next);
    setSaving(true);
    setError('');
    try {
      await onToggleLastSeen(next);
    } catch (reason) {
      setShowLastSeen(previous);
      setError(reason instanceof Error && reason.message ? reason.message : t('privacy.saveFailed'));
    } finally {
      setSaving(false);
    }
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
        aria-label={t('settings.privacy')}
      >
        <header className="flex items-center gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <button
            type="button"
            aria-label={onBack ? t('common.back') : t('modals.close')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onBack ?? onClose}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-[-0.02em] text-ink">
            {t('settings.privacy')}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted">{t('privacy.intro')}</p>
          </div>

          {SECTIONS.map((section) => (
            <div key={section.id} className="border-b border-line/70 px-4 py-4 sm:px-5">
              <div className="flex items-start gap-3">
                <SectionIcon id={section.id} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">
                        {t(section.titleKey)}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {t(section.hintKey)}
                      </span>
                    </span>

                    {section.ready ? (
                      <Switch
                        label={t(section.titleKey)}
                        checked={showLastSeen}
                        disabled={saving}
                        onChange={toggleLastSeen}
                      />
                    ) : (
                      <span
                        className="mt-1 shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold text-muted"
                        title={t('settings.comingSoon')}
                      >
                        {t('privacy.soon')}
                      </span>
                    )}
                  </div>

                  {/* Ошибку показываем в том разделе, к которому она относится. */}
                  {section.ready && error && (
                    <p className="mt-2 text-xs font-semibold text-danger">{error}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Иконка раздела: у каждого своя, чтобы список читался по макету. */
function SectionIcon({ id }: { id: PrivacySectionId }) {
  const className = 'mt-0.5 h-5 w-5 shrink-0 text-muted';
  if (id === 'lastSeen') return <Moon className={className} aria-hidden="true" />;
  return <Lock className={className} aria-hidden="true" />;
}

/**
 * Переключатель. Роль — `switch`, состояние — `aria-checked`: скринридер
 * озвучивает его как тумблер, а не как обычную кнопку.
 */
function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        checked ? 'bg-brand' : 'bg-muted/35'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
          checked ? 'left-[1.4rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
