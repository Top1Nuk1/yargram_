import { useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui';
import { useTranslation } from '../../hooks/useLanguage';
import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_PRESETS,
  applyUiScale,
  clampUiScale,
  readUiScale,
  writeUiScale,
} from '../../lib/uiScale';

interface ScaleScreenProps {
  /** Стрелка «назад»: вернуться к списку настроек. Нет — работает как закрытие. */
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Экран «Масштаб интерфейса».
 *
 * Масштаб меняется сразу, без кнопки ОК: человек должен видеть результат
 * прямо во время перетаскивания, иначе подбирать значение вслепую. Поэтому
 * каждое изменение и применяется к документу, и сохраняется на устройстве.
 */
export function ScaleScreen({ onBack, onClose }: ScaleScreenProps) {
  const t = useTranslation();
  const [scale, setScale] = useState(readUiScale);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && (onBack ?? onClose)();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onBack, onClose]);

  function change(next: number) {
    const clamped = clampUiScale(next);
    setScale(clamped);
    applyUiScale(clamped);
    writeUiScale(clamped);
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
        aria-label={t('scale.title')}
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
          <h2 className="text-[17px] font-semibold tracking-tight">{t('scale.title')}</h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          {/* Метка нужна тестам: «100%» встречается и тут, и на готовой кнопке,
              поэтому отличать текущее значение по одному тексту нельзя. */}
          <p
            data-scale-value={scale}
            className="text-[32px] font-semibold leading-none tracking-tight text-ink"
          >
            {scale}%
          </p>
          <p className="mt-3 text-sm text-muted">{t('scale.hint')}</p>

          <div className="mt-6">
            <label htmlFor="uiScale" className="mb-2 block text-sm font-semibold text-ink">
              {t('scale.slider')}
            </label>
            <input
              id="uiScale"
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={5}
              value={scale}
              onChange={(event) => change(Number(event.target.value))}
              className="w-full accent-brand"
              aria-valuemin={UI_SCALE_MIN}
              aria-valuemax={UI_SCALE_MAX}
              aria-valuenow={scale}
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>{UI_SCALE_MIN}%</span>
              <span>{UI_SCALE_MAX}%</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {UI_SCALE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={scale === preset}
                onClick={() => change(preset)}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                  scale === preset
                    ? 'bg-brand text-white'
                    : 'bg-canvas text-muted hover:bg-brand-soft/50 hover:text-ink'
                }`}
              >
                {preset}%
              </button>
            ))}
          </div>

          <div className="mt-6">
            <Button variant="secondary" onClick={() => change(UI_SCALE_DEFAULT)} className="w-full">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t('scale.reset')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
