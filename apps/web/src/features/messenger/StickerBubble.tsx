import { Download, Loader2, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../../hooks/useLanguage';
import type { Sticker, StickerPack } from '../../types';
import { StickerImage } from './StickerPicker';

interface MessageStickersProps {
  stickers: Sticker[];
  /** Показывать кнопку сохранения: у отправленного стикера она лишняя. */
  showSave?: boolean;
  onSave?: (sticker: Sticker) => void;
}

/**
 * Отправленные стикеры в пузыре сообщения.
 *
 * 🔥 Стикер — не вложение, а ссылка на картинку, поэтому у пузыря нет подписи
 * о размере файла и кнопки скачивания, как у фотографии: по строке стикера всё
 * равно не видно, что это. Зато у обычного (не GIF) стикера остаётся значок
 * сохранения — отправить понравившуюся картинку в свой набор можно в один клик.
 */
export function MessageStickers({ stickers, showSave = true, onSave }: MessageStickersProps) {
  const t = useTranslation();
  const [savingId, setSavingId] = useState('');
  if (!stickers.length) return null;

  const save = (sticker: Sticker) => {
    if (!onSave || savingId) return;
    setSavingId(sticker.id);
    // Спиннер живёт на кнопке, пока сервер грузит файл и заводит стикер: иначе
    // на медленной сети ничего не видно и кажется, что клик не сработал.
    Promise.resolve(onSave(sticker)).finally(() => setSavingId(''));
  };

  return (
    <div
      className={`mb-1.5 grid max-w-[420px] gap-1 ${
        stickers.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
      }`}
    >
      {stickers.map((sticker) => (
        <div
          key={sticker.id}
          className={`group relative overflow-hidden ${
            sticker.url ? 'cursor-pointer' : ''
          }`}
        >
          <StickerImage
            sticker={sticker}
            className={`mx-auto h-32 w-32 object-contain ${
              sticker.url ? 'transition duration-200 group-hover:scale-[1.03]' : ''
            }`}
          />
          {showSave && onSave && sticker.url && (
            <button
              type="button"
              onClick={() => save(sticker)}
              disabled={Boolean(savingId)}
              className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={t('stickers.saveSticker')}
              title={t('stickers.saveSticker')}
            >
              {savingId === sticker.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

interface SharedPackCardProps {
  pack: StickerPack;
  busy?: boolean;
  /** Набор уже у меня: показано «убрать», иначе — «добавить». */
  installed: boolean;
  onInstall: () => void;
  onUninstall?: () => void;
}

/**
 * Карточка присланного набора.
 *
 * 🔥 Сообщение с набором — это не картинка, а приглашение: у получателя он
 * появляется в списке сам, отдельная кнопка нужна только чтобы убрать его.
 * Поэтому здесь нет превью содержимого — набор мог быть обновлён автором уже
 * после отправки, и показывать устаревшие картинки было бы враньём.
 */
export function SharedPackCard({
  pack,
  busy = false,
  installed,
  onInstall,
  onUninstall,
}: SharedPackCardProps) {
  const t = useTranslation();
  return (
    <div className="mb-1.5 flex max-w-[340px] items-center gap-3 rounded-xl border border-line bg-canvas/70 p-2.5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-2xl">
        <span className="emoji" aria-hidden="true">
          {pack.emoji || '🙂'}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{pack.title}</span>
        <span className="block text-[11px] text-muted">
          {t('stickers.packCount', { count: pack.stickers.length })}
        </span>
      </span>
      <button
        type="button"
        onClick={installed ? onUninstall : onInstall}
        disabled={busy || (installed && !onUninstall)}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition disabled:opacity-60 ${
          installed
            ? 'border border-line text-muted hover:bg-line/40'
            : 'bg-brand text-white hover:bg-brand-strong'
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : installed ? (
          t('stickers.removePack')
        ) : (
          <>
            <PackagePlus className="h-3.5 w-3.5" />
            {t('stickers.sharePack')}
          </>
        )}
      </button>
    </div>
  );
}