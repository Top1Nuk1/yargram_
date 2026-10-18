import { useSyncExternalStore } from 'react';
import { Pause, Play, Volume2, X } from 'lucide-react';
import { audioManager, type ActiveAudioInfo } from '../../lib/audioManager';
import { useTranslation } from '../../hooks/useLanguage';

function formatTime(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function FloatingAudioBar() {
  const t = useTranslation();
  const info: ActiveAudioInfo | null = useSyncExternalStore(
    (onStoreChange) => audioManager.subscribe(onStoreChange),
    () => audioManager.getInfo(),
    () => null,
  );

  if (!info) return null;

  const duration = info.duration && Number.isFinite(info.duration) && info.duration > 0 ? info.duration : 0;
  const current = Math.min(duration || info.currentTime, Math.max(0, info.currentTime));
  const progressRatio = duration > 0 ? Math.min(1, current / duration) : 0;

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(event.target.value);
    audioManager.seek(val);
  };

  const cycleSpeed = () => {
    const nextSpeed = info.playbackRate === 1 ? 1.5 : info.playbackRate === 1.5 ? 2 : 1;
    audioManager.setSpeed(nextSpeed);
  };

  return (
    <aside
      role="region"
      aria-label={t('attach.voiceMessage') || 'Аудиоплеер'}
      className="relative z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur shadow-sm transition-all"
    >
      <button
        type="button"
        onClick={() => audioManager.togglePlay()}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm transition hover:bg-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/40"
        aria-label={info.isPlaying ? t('attach.pauseVoice') : t('attach.playVoice')}
      >
        {info.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 truncate font-semibold text-ink">
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span className="truncate">{info.title || t('attach.voiceMessage')}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {formatTime(current)} / {duration > 0 ? formatTime(duration) : '--:--'}
          </span>
        </div>

        <div className="relative mt-1 flex items-center">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={duration > 0 ? current : 0}
            disabled={duration <= 0}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand focus:outline-none"
            aria-label="Позиция воспроизведения"
          />
          <span
            className="pointer-events-none absolute left-0 top-0 h-1.5 rounded-full bg-brand"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className="grid h-7 min-w-8 place-items-center rounded-lg border border-line bg-canvas px-1.5 text-[11px] font-bold text-muted transition hover:border-brand/40 hover:text-ink focus:outline-none"
        title="Скорость воспроизведения"
      >
        {info.playbackRate}x
      </button>

      <button
        type="button"
        onClick={() => audioManager.close()}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-line/60 hover:text-ink focus:outline-none"
        aria-label="Закрыть плеер"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
