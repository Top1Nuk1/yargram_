import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton, Spinner } from '../../components/ui';
import type { Attachment } from '../../types';
import { formatFileSize, isImageAttachment, isVoiceAttachment, type UploadKind } from './messengerUtils';
import { discoverAudioDuration, finiteDuration, seekTime } from './mediaDuration';

type MediaAttachment = Attachment & { mediaKind?: string; durationSeconds?: number };
function isVideoCircle(attachment: Attachment): attachment is MediaAttachment & { mediaKind: 'video_circle' } {
  return (attachment as MediaAttachment).mediaKind === 'video_circle';
}

export type DraftUploadStatus = 'ready' | 'uploading' | 'uploaded' | 'error';

export interface DraftAttachment {
  localId: string;
  file: File;
  kind: UploadKind;
  previewUrl?: string;
  progress: number;
  status: DraftUploadStatus;
  uploaded?: Attachment;
  error?: string;
}

interface AttachmentDraftTrayProps {
  items: DraftAttachment[];
  onRemove: (localId: string) => void;
  onRetry?: (localId: string) => void;
}

export function AttachmentDraftTray({ items, onRemove, onRetry }: AttachmentDraftTrayProps) {
  if (items.length === 0) return null;
  return (
    <div className="mx-auto mb-2 flex max-w-[920px] gap-2 overflow-x-auto rounded-2xl border border-line bg-canvas/75 p-2" aria-label="Выбранные файлы">
      {items.map((item) => (
        <article key={item.localId} className="relative flex w-56 shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border border-line bg-surface p-2 shadow-sm">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-soft text-brand">
            {item.kind === 'image' && item.previewUrl ? (
              <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <FileText className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-ink" title={item.file.name}>{item.file.name}</span>
            <span className={`mt-0.5 block truncate text-[10px] ${item.status === 'error' ? 'text-danger' : 'text-muted'}`}>
              {item.status === 'uploading'
                ? `Загрузка ${item.progress}%`
                : item.status === 'error'
                  ? item.error ?? 'Ошибка загрузки'
                  : formatFileSize(item.file.size)}
            </span>
            {item.status === 'uploading' && (
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                <span className="block h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${item.progress}%` }} />
              </span>
            )}
          </span>
          {item.status === 'uploading' ? (
            <Spinner className="h-4 w-4 shrink-0 text-brand" />
          ) : item.status === 'error' && onRetry ? (
            <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger/10" onClick={() => onRetry(item.localId)} aria-label={`Повторить загрузку ${item.file.name}`}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-line/60" onClick={() => onRemove(item.localId)} aria-label={`Убрать ${item.file.name}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

interface MessageAttachmentsProps {
  attachments: Attachment[];
  mine: boolean;
  onOpenImage: (attachment: Attachment) => void;
}

export function MessageAttachments({ attachments, mine, onOpenImage }: MessageAttachmentsProps) {
  const circles = attachments.filter(isVideoCircle);
  const images = attachments.filter((attachment) => !isVideoCircle(attachment) && isImageAttachment(attachment));
  const voice = attachments.filter((attachment) => !isVideoCircle(attachment) && isVoiceAttachment(attachment));
  const files = attachments.filter(
    (attachment) => !isVideoCircle(attachment) && !isImageAttachment(attachment) && !isVoiceAttachment(attachment),
  );
  return (
    <div className={attachments.length ? 'mb-1.5 space-y-2' : ''}>
      {circles.map((attachment) => <VideoCircle key={attachment.id} attachment={attachment} />)}
      {voice.map((attachment) => (
        <VoiceMessage key={attachment.id} attachment={attachment} mine={mine} />
      ))}
      {images.length > 0 && (
        <div className={`grid max-w-[420px] gap-1 overflow-hidden rounded-xl ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {images.map((attachment, index) => (
            <button
              key={attachment.id}
              type="button"
              className={`group relative overflow-hidden bg-black/10 ${images.length === 1 ? 'max-h-[390px]' : 'h-36 sm:h-44'} ${images.length === 3 && index === 0 ? 'row-span-2 h-full' : ''}`}
              onClick={() => onOpenImage(attachment)}
              aria-label={`Открыть ${attachment.fileName}`}
            >
              <img
                src={attachment.url}
                alt={attachment.fileName}
                loading="lazy"
                decoding="async"
                className={`${images.length === 1 ? 'max-h-[390px] w-full object-contain' : 'h-full w-full object-cover'} transition duration-200 group-hover:scale-[1.02]`}
              />
              <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white backdrop-blur">
                {formatFileSize(attachment.size)}
              </span>
            </button>
          ))}
        </div>
      )}
      {files.map((attachment) => (
        <a
          key={attachment.id}
          href={`${attachment.url}${attachment.url.includes('?') ? '&' : '?'}download=1`}
          download={attachment.fileName}
          className={`flex min-w-[230px] max-w-[390px] items-center gap-3 rounded-xl border p-2.5 transition ${mine ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-line bg-canvas/70 hover:border-brand/35'}`}
          title={`Скачать ${attachment.fileName}`}
        >
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${mine ? 'bg-white/15 text-white' : 'bg-brand-soft text-brand'}`}>
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold">{attachment.fileName}</span>
            <span className={`mt-0.5 block text-[10px] ${mine ? 'text-white/65' : 'text-muted'}`}>{formatFileSize(attachment.size)}</span>
          </span>
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function waveformHeights(seed: string, count: number): number[] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const heights: number[] = [];
  for (let index = 0; index < count; index += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    heights.push(0.28 + (hash % 68) / 100);
  }
  return heights;
}

export function VideoCircle({ attachment }: { attachment: Attachment }) {
  return (
    <video
      key={attachment.url}
      src={attachment.url}
      playsInline
      controls
      preload="metadata"
      aria-label={`Видеосообщение: ${attachment.fileName}`}
      className="aspect-square w-[min(260px,65vw)] rounded-full bg-black object-cover"
    />
  );
}

export function VoiceMessage(props: { attachment: Attachment; mine: boolean }) {
  // A source change gets a fresh element, state and cancelled duration probe.
  return <VoicePlayer key={`${props.attachment.id}:${props.attachment.url}`} {...props} />;
}

function VoicePlayer({ attachment, mine }: { attachment: Attachment; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const recordedDuration = finiteDuration((attachment as MediaAttachment).durationSeconds);
  const [duration, setDuration] = useState<number | undefined>(recordedDuration);
  const [error, setError] = useState(false);
  const bars = useMemo(() => waveformHeights(attachment.id, 26), [attachment.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const controller = new AbortController();
    let probing = false;
    let recoveredUrl: string | undefined;
    let recoveredDuration: number | undefined;
    const onTime = () => setCurrent(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0);
    const onMeta = () => {
      const known = finiteDuration(audio.duration) ?? recordedDuration ?? recoveredDuration;
      setDuration(known);
      const unseekableWebm = /webm/i.test(attachment.mimeType) && !recordedDuration
        && (!audio.seekable.length || audio.seekable.end(audio.seekable.length - 1) === 0);
      if ((!known || unseekableWebm) && !probing && audio.readyState >= 1) {
        probing = true;
        void discoverAudioDuration(attachment.url, attachment.size, controller.signal).then((value) => {
          if (controller.signal.aborted) return;
          recoveredDuration = value?.duration;
          if (value?.blob && (!finiteDuration(audio.duration) || !audio.seekable.length || audio.seekable.end(audio.seekable.length - 1) === 0)) {
            const position = audio.currentTime;
            const resume = !audio.paused && !audio.ended;
            recoveredUrl = URL.createObjectURL(value.blob);
            const restore = () => {
              if (controller.signal.aborted) return;
              try { audio.currentTime = seekTime(position, value.duration) ?? 0; } catch { setError(true); }
              if (resume) void audio.play().catch(() => {
                if (!controller.signal.aborted) { setPlaying(false); setError(true); }
              });
            };
            audio.addEventListener('loadedmetadata', restore, { once: true, signal: controller.signal });
            audio.src = recoveredUrl;
            audio.load();
          }
          setDuration(finiteDuration(audio.duration) ?? recordedDuration ?? recoveredDuration);
        });
      }
    };
    const onPlay = () => { setPlaying(true); setError(false); };
    const onPause = () => setPlaying(false);
    const onError = () => { setPlaying(false); setError(true); };
    const onEnded = () => {
      setPlaying(false);
      // Natural completion is also reliable evidence for headerless recordings.
      if (!finiteDuration(audio.duration) && !recordedDuration && !recoveredDuration) {
        recoveredDuration = finiteDuration(audio.currentTime);
        setDuration(recoveredDuration);
      }
      onTime();
    };
    const handlers = { timeupdate: onTime, loadedmetadata: onMeta, durationchange: onMeta, play: onPlay, pause: onPause, ended: onEnded, error: onError };
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler);
    onMeta();
    return () => {
      controller.abort();
      for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler);
      audio.pause();
      if (recoveredUrl) URL.revokeObjectURL(recoveredUrl);
    };
  }, [attachment.url, attachment.size, attachment.mimeType, recordedDuration]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setError(false);
    if (audio.ended) audio.currentTime = 0;
    void audio.play().catch(() => {
      if (audioRef.current !== audio) return;
      setPlaying(false);
      setError(true);
    });
  };

  const progress = duration ? Math.min(1, current / duration) : 0;
  const accent = 'bg-brand-soft text-brand hover:bg-brand-soft/70';

  return (
    <div className={`flex w-[min(300px,72vw)] items-center gap-2.5 rounded-xl border border-line p-2 text-ink ${mine ? 'bg-brand-soft/40' : 'bg-canvas/70'}`}>
      <audio ref={audioRef} src={attachment.url} preload="metadata" />
      <button
        type="button"
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${accent}`}
        onClick={togglePlayback}
        aria-label={playing ? 'Остановить голосовое сообщение' : 'Слушать голосовое сообщение'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`flex h-8 items-center gap-[2px] ${mine ? '' : 'text-brand'}`} aria-hidden="true">
          {bars.map((height, index) => {
            const active = progress > 0 && index / bars.length <= progress;
            return (
              <span
                key={`${attachment.id}-${index}`}
                className={`w-[2.5px] shrink-0 rounded-full transition-colors bg-brand ${active ? 'opacity-100' : 'opacity-35'}`}
                style={{ height: `${Math.round(height * 30)}px` }}
              />
            );
          })}
        </div>
        <input
          type="range"
          min="0"
          max={duration ?? 0}
          disabled={!duration}
          step="0.05"
          value={duration ? Math.min(current, duration) : 0}
          onChange={(event) => {
            const audio = audioRef.current;
            const value = seekTime(Number(event.target.value), duration);
            if (!audio || value === undefined) return;
            try {
              audio.currentTime = value;
              setCurrent(value);
            } catch { setError(true); }
          }}
          className="h-1 w-full cursor-pointer accent-[#8c7cff] disabled:cursor-default disabled:opacity-40"
          aria-label="Перемотка голосового сообщения"
        />
        <p className="mt-0.5 flex justify-between text-[10px] font-semibold text-muted">
          <span>{formatAudioTime(current)}</span>
          <span>{duration ? formatAudioTime(duration) : '—:—'}</span>
        </p>
        {error && <p role="status" className="text-[10px] text-danger">Не удалось воспроизвести. Попробуйте ещё раз.</p>}
      </div>
    </div>
  );
}

interface ImageViewerProps {
  images: Attachment[];
  initialId: string;
  onClose: () => void;
}

export function ImageViewer({ images, initialId, onClose }: ImageViewerProps) {
  const initialIndex = Math.max(0, images.findIndex((attachment) => attachment.id === initialId));
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const current = images[index] ?? images[0];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setIndex((value) => (value - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') setIndex((value) => (value + 1) % images.length);
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(3, value + 0.25));
      if (event.key === '-') setZoom((value) => Math.max(0.5, value - 0.25));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [images.length, onClose]);

  useEffect(() => setZoom(1), [index]);

  const controls = useMemo(() => ({
    previous: () => setIndex((value) => (value - 1 + images.length) % images.length),
    next: () => setIndex((value) => (value + 1) % images.length),
  }), [images.length]);

  if (!current) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#080810]/95 text-white backdrop-blur-lg" role="dialog" aria-modal="true" aria-label="Просмотр фотографии">
      <header className="flex min-h-16 items-center gap-3 border-b border-white/10 px-3 sm:px-5">
        <ImageIcon className="h-5 w-5 text-white/65" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{current.fileName}</p>
          <p className="text-[11px] text-white/55">{formatFileSize(current.size)} · {index + 1} из {images.length}</p>
        </div>
        <a href={`${current.url}${current.url.includes('?') ? '&' : '?'}download=1`} download={current.fileName} className="grid h-10 w-10 place-items-center rounded-2xl text-white/75 hover:bg-white/10 hover:text-white" aria-label="Скачать фотографию">
          <Download className="h-5 w-5" />
        </a>
        <IconButton label="Закрыть" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={onClose}>
          <X className="h-5 w-5" />
        </IconButton>
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto" onDoubleClick={() => setZoom((value) => value === 1 ? 2 : 1)}>
        <div className="flex min-h-full min-w-full items-center justify-center p-4 sm:p-8">
          <img
            src={current.url}
            alt={current.fileName}
            className="max-h-[calc(100dvh-9rem)] max-w-full select-none object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>
        {images.length > 1 && (
          <>
            <button type="button" className="fixed left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur hover:bg-black/65 sm:left-6" onClick={controls.previous} aria-label="Предыдущее фото">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" className="fixed right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur hover:bg-black/65 sm:right-6" onClick={controls.next} aria-label="Следующее фото">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
      <footer className="flex min-h-16 items-center justify-center gap-2 border-t border-white/10 px-4">
        <IconButton label="Уменьшить" className="text-white/75 hover:bg-white/10 hover:text-white" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
          <Minus className="h-5 w-5" />
        </IconButton>
        <span className="w-14 text-center text-xs font-bold text-white/70">{Math.round(zoom * 100)}%</span>
        <IconButton label="Увеличить" className="text-white/75 hover:bg-white/10 hover:text-white" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
          <Plus className="h-5 w-5" />
        </IconButton>
      </footer>
    </div>
  );
}
