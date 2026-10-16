import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Share, Smartphone } from 'lucide-react';
import { Button } from '../../components/ui';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useTranslation } from '../../hooks/useLanguage';

interface InstallScreenProps {
  /** Стрелка «назад»: вернуться к списку настроек. Нет — работает как закрытие. */
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Экран «Установить приложение».
 *
 * 🔥 Здесь нет своего окна подтверждения: «Установить» открывает **системное**
 * окно браузера, то самое с кнопками «Установить» и «Отмена». Так и задумано —
 * согласие на установку даёт браузер, а не мы, и подделать этот диалог нельзя.
 * Своё окно было бы лишь декорацией поверх настоящего.
 *
 * Поэтому состояний ровно три, и они честно различаются:
 *
 *  1. Браузер предложил установку — показываем активную кнопку (Chrome, Edge).
 *  2. Приложение уже установлено — предлагать нечего, объясняем это.
 *  3. Браузер установку не предлагает — показываем, как это сделать вручную.
 *     Так всегда на iOS (Safari не умеет `beforeinstallprompt`) и в Firefox;
 *     молчаливая неактивная кнопка тут выглядела бы поломкой.
 */
export function InstallScreen({ onBack, onClose }: InstallScreenProps) {
  const t = useTranslation();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && (onBack ?? onClose)();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onBack, onClose]);

  async function install() {
    const outcome = await promptInstall();
    // «Недоступно» — предложение уже использовали в другой вкладке или
    // браузер передумал. Честно говорим об этом, а не делаем вид, что всё ок.
    if (outcome === 'unavailable') setFailed(true);
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
        aria-label={t('install.title')}
      >
        <header className="flex items-center gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <button
            type="button"
            aria-label={onBack ? t('common.back') : t('modals.close')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onBack ?? onClose}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 className="text-[17px] font-semibold tracking-tight">{t('install.title')}</h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted">{t('install.lead')}</p>
          </div>

          {installed ? (
            <p data-install-state="installed" className="mt-5 text-sm font-semibold text-ink">
              {t('install.alreadyInstalled')}
            </p>
          ) : canInstall ? (
            <>
              <div className="mt-5">
                <Button onClick={() => void install()} className="w-full">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t('install.button')}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted">{t('install.browserAsks')}</p>
            </>
          ) : (
            <>
              <p data-install-state="manual" className="mt-5 text-sm font-semibold text-ink">
                {t('install.manualTitle')}
              </p>
              <p className="mt-2 text-sm text-muted">{t('install.manualHint')}</p>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Share className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('install.manualIos')}
              </p>
            </>
          )}

          {failed && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {t('install.failed')}
            </p>
          )}

          <p className="mt-6 text-xs text-muted">{t('install.why')}</p>
        </div>
      </section>
    </div>
  );
}
