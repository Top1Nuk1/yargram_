import { Film, Plus, Smile, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useLanguage';
import type { Attachment, Sticker, StickerPack } from '../../types';

/** Плитка стикера: картинка целиком, без обрезки и без подложки. */
export function StickerImage({ sticker, className = '' }: { sticker: Sticker; className?: string }) {
  // 🔥 У удалённого файла адрес пустой: показываем значок, а не пустой квадрат.
  // Иначе в наборе была бы дыра, и человек решил бы, что набор сломан.
  if (!sticker.url) {
    return (
      <span
        className={`grid place-items-center rounded-xl bg-canvas text-lg text-muted ${className}`}
        aria-hidden="true"
      >
        {sticker.emoji}
      </span>
    );
  }
  return (
    <img
      src={sticker.url}
      alt={sticker.emoji}
      // 🔥 Без `loading="lazy"`: пикер — маленькая панель, а ленивая загрузка
      // оставляет нижние плитки незагруженными, и человек видит пустые
      // квадраты вместо стикеров, пока не прокрутит вниз.
      decoding="async"
      className={className}
    />
  );
}

/** Гифка: картинка играет сама, видео — зацикленное и без звука. */
export function GifPreview({ gif, className = '' }: { gif: Attachment; className?: string }) {
  const isVideo = gif.mimeType.startsWith('video/');
  if (isVideo) {
    return (
      <video
        src={gif.url}
        // 🔥 Видео-гифка идёт по кругу и молча: звука в ней нет, а автозапуск
        // со звуком пугает. `playsInline` нужен, иначе на телефоне видео
        // развернётся на весь экран поверх переписки.
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className={className}
      />
    );
  }
  return <img src={gif.url} alt="" decoding="async" className={className} />;
}

type PickerTab = 'stickers' | 'gifs';

/** Сколько недавних стикеров показываем: одна витрина, а не лента на весь вечер. */
const RECENT_LIMIT = 20;
/** Сколько стикеров живёт в избранном: маленькая подборка под пальцем. */
const FAVORITE_LIMIT = 5;

/**
 * Где храним недавние и избранные стикеры.
 *
 * 🔥 Раньше список жил в состоянии компонента, и вкладка «Недавние» была
 * пустой при каждом повторном открытии пикера: закрыл панель — список стёрся.
 * Поэтому храним оба списка в `localStorage` и читаем при открытии.
 *
 * Ключи общие для всех аккаунтов намеренно: стикеры во встроенных наборах у
 * всех одни и те же, а свои и присланные отсеются сами — в списке остаются
 * только те, что есть в текущих наборах (см. `recent`/`favorites` ниже).
 */
const RECENT_KEY = 'yargram.stickerRecents';
const FAVORITE_KEY = 'yargram.stickerFavorites';

function readIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Убираем дубли: значение мог записать другой вкладочный скрипт или старая
    // версия приложения, а дубль в избранном выглядел бы как сбой.
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))];
  } catch {
    // Повреждённое значение — просто начинаем с нуля, а не падаем.
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Приватный режим браузера может запрещать запись. Это не повод
    // ломать отправку стикера — просто список не переживёт перезагрузку.
  }
}

interface StickerPickerProps {
  packs: StickerPack[];
  gifs: Attachment[];
  /** Кто отправляет: чужой набор присылается отдельной кнопкой. */
  onSendSticker: (sticker: Sticker) => void;
  onSendGif: (gif: Attachment) => void;
  onOpenPacks: () => void;
  onClose: () => void;
  className?: string;
}

export function StickerPicker({
  packs,
  gifs,
  onSendSticker,
  onSendGif,
  onOpenPacks,
  onClose,
  className = '',
}: StickerPickerProps) {
  const t = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PickerTab>('stickers');
  // Недавние — то, что человек слал последним; избранное — то, что он выбрал
  // сам. Хранятся только id: сами картинки лежат в наборах, а держать копию
  // адресов значило бы слать битые ссылки после перезагрузки страницы.
  const [recentIds, setRecentIds] = useState<string[]>(() => readIds(RECENT_KEY));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readIds(FAVORITE_KEY));

  const allStickers = useMemo(() => packs.flatMap((pack) => pack.stickers), [packs]);
  const byId = useMemo(
    () => new Map(allStickers.map((sticker) => [sticker.id, sticker])),
    [allStickers],
  );
  // 🔥 В списке недавних/избранного остаются только стикеры, которые есть в
  // наборах прямо сейчас: набор могли убрать, файл удалить — показывать
  // битую плитку хуже, чем показать на одну меньше.
  const recent = useMemo(
    () =>
      recentIds
        .map((id) => byId.get(id))
        .filter((sticker): sticker is Sticker => Boolean(sticker))
        .slice(0, RECENT_LIMIT),
    [recentIds, byId],
  );
  const favorites = useMemo(
    () =>
      favoriteIds
        .map((id) => byId.get(id))
        .filter((sticker): sticker is Sticker => Boolean(sticker))
        .slice(0, FAVORITE_LIMIT),
    [favoriteIds, byId],
  );

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    // Навешиваем слушатель после кадра: иначе тот же клик, которым открыли
    // панель, тут же её и закрыл бы.
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', closeOnOutside));
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const send = (sticker: Sticker) => {
    setRecentIds((current) => {
      const next = [sticker.id, ...current.filter((id) => id !== sticker.id)].slice(0, RECENT_LIMIT);
      writeIds(RECENT_KEY, next);
      return next;
    });
    onSendSticker(sticker);
  };

  const toggleFavorite = (sticker: Sticker) => {
    setFavoriteIds((current) => {
      const without = current.filter((id) => id !== sticker.id);
      // 🔥 Предел — FAVORITE_LIMIT, но не отказом, а заменой самого старого:
      // человек жмёт «в избранное» и ожидает, что стикер туда попал.
      const next = current.includes(sticker.id) ? without : [...without, sticker.id].slice(-FAVORITE_LIMIT);
      writeIds(FAVORITE_KEY, next);
      return next;
    });
  };

  const empty = tab === 'gifs' ? !gifs.length : !packs.length && !favorites.length && !recent.length;

  return (
    <div
      ref={ref}
      className={`z-50 flex w-[min(94vw,24rem)] animate-slide-up flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-float ${className}`}
      role="dialog"
      aria-label={t('stickers.pickerLabel')}
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        <TabButton
          active={tab === 'stickers'}
          onClick={() => setTab('stickers')}
          label={t('stickers.tabStickers')}
        >
          <Smile className="h-4 w-4" />
        </TabButton>
        <TabButton
          active={tab === 'gifs'}
          onClick={() => setTab('gifs')}
          label={t('stickers.tabGifs')}
        >
          <Film className="h-4 w-4" />
        </TabButton>
        <button
          type="button"
          onClick={onOpenPacks}
          className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand"
          aria-label={t('stickers.managePacks')}
          title={t('stickers.managePacks')}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink"
          aria-label={t('stickers.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-72 min-h-32 overflow-y-auto p-2">
        {empty && (
          <p className="px-2 py-6 text-center text-sm text-muted">
            {tab === 'gifs' ? t('stickers.noGifs') : t('stickers.noOwnPacks')}
          </p>
        )}

        {tab === 'gifs'
          ? gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSendGif(gif)}
                className="block w-full overflow-hidden rounded-xl border border-line bg-canvas transition hover:border-brand/50"
                aria-label={t('stickers.sendGif')}
              >
                <GifPreview gif={gif} className="h-36 w-full object-cover" />
              </button>
            ))
          : (
              <>
                {favorites.length > 0 && (
                  <Section title={`${t('stickers.favorites')} · ${favorites.length}/${FAVORITE_LIMIT}`}>
                    {favorites.map((sticker) => (
                      <StickerTile
                        key={`fav-${sticker.id}`}
                        sticker={sticker}
                        favorite
                        onSend={send}
                        onToggleFavorite={toggleFavorite}
                        addLabel={t('stickers.addFavorite')}
                        removeLabel={t('stickers.removeFavorite')}
                        sendLabel={t('stickers.sendSticker')}
                      />
                    ))}
                  </Section>
                )}

                {recent.length > 0 ? (
                  <Section title={t('stickers.recent')}>
                    {recent.map((sticker) => (
                      <StickerTile
                        key={`recent-${sticker.id}`}
                        sticker={sticker}
                        favorite={favoriteIds.includes(sticker.id)}
                        onSend={send}
                        onToggleFavorite={toggleFavorite}
                        addLabel={t('stickers.addFavorite')}
                        removeLabel={t('stickers.removeFavorite')}
                        sendLabel={t('stickers.sendSticker')}
                      />
                    ))}
                  </Section>
                ) : (
                  // Пустые «Недавние» не прячем полностью: человек должен понять,
                  // откуда список возьмётся, а не решить, что функции нет.
                  <Section title={t('stickers.recent')} hint={t('stickers.noRecent')} />
                )}

                {packs.map((pack) => (
                  <Section
                    key={pack.id}
                    title={`${pack.emoji} ${pack.title}`}
                    hint={pack.stickers.length ? undefined : t('stickers.packEmpty', { title: pack.title })}
                  >
                    {pack.stickers.map((sticker) => (
                      <StickerTile
                        key={sticker.id}
                        sticker={sticker}
                        favorite={favoriteIds.includes(sticker.id)}
                        onSend={send}
                        onToggleFavorite={toggleFavorite}
                        addLabel={t('stickers.addFavorite')}
                        removeLabel={t('stickers.removeFavorite')}
                        sendLabel={t('stickers.sendSticker')}
                      />
                    ))}
                  </Section>
                ))}
              </>
            )}
      </div>
    </div>
  );
}

/** Заголовок секции пикера: «Избранное», «Недавние» или имя набора. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mb-3 last:mb-1">
      <h3 className="mb-1 flex items-baseline gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {title}
      </h3>
      {hint ? (
        <p className="px-1 pb-1 text-xs text-muted">{hint}</p>
      ) : (
        <div className="grid grid-cols-4 gap-1">{children}</div>
      )}
    </section>
  );
}

/**
 * Плитка стикера: само изображение отправляется по нажатию, а звёздочка в
 * углу только перекладывает стикер в избранное. Кнопки — соседями, а не
 * вложенными: два `<button>` один внутри другого браузер и тесты читают как
 * ошибку разметки.
 */
function StickerTile({
  sticker,
  favorite,
  onSend,
  onToggleFavorite,
  addLabel,
  removeLabel,
  sendLabel,
}: {
  sticker: Sticker;
  favorite: boolean;
  onSend: (sticker: Sticker) => void;
  onToggleFavorite: (sticker: Sticker) => void;
  addLabel: string;
  removeLabel: string;
  sendLabel: string;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSend(sticker)}
        className="block w-full rounded-xl p-1 transition hover:bg-brand-soft"
        aria-label={sendLabel}
      >
        <StickerImage sticker={sticker} className="mx-auto aspect-square w-full object-contain" />
      </button>
      <button
        type="button"
        onClick={() => onToggleFavorite(sticker)}
        aria-label={favorite ? removeLabel : addLabel}
        title={favorite ? removeLabel : addLabel}
        className={`absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-elevated/85 text-muted shadow-sm transition hover:text-brand focus-visible:opacity-100 group-hover:opacity-100 ${
          favorite ? 'text-brand opacity-100' : 'opacity-0'
        }`}
      >
        <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
        active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-canvas'
      }`}
    >
      {children}
    </button>
  );
}
