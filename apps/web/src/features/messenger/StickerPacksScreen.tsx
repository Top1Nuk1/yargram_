import { ArrowLeft, Loader2, Plus, Send, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Avatar } from '../../components/ui';
import { useTranslation, type TranslateFn } from '../../hooks/useLanguage';
import type { Attachment, Conversation, Sticker, StickerPack } from '../../types';
import { GifPreview, StickerImage } from './StickerPicker';

/** Предел набора — тот же, что на сервере, но показываем его заранее. */
const PACK_LIMIT = 200;
/** Предел библиотеки гифок: за это место платит аккаунт на диске. */
const GIF_LIMIT = 40;

interface StickerPacksScreenProps {
  token: string;
  packs: StickerPack[];
  gifs: Attachment[];
  /** Куда можно отправить набор: автору нужно выбрать чат. */
  conversations: Conversation[];
  onPacksChange: (packs: StickerPack[]) => void;
  onGifsChange: (gifs: Attachment[]) => void;
  /** Набор уехал в переписку — её список надо обновить. */
  onShared?: () => void;
  onClose: () => void;
}

/**
 * Управление наборами: свой набор, загрузка стикеров, библиотека гифок.
 *
 * Отдельный экран, а не ещё одна вкладка пикера: здесь всё, что человек
 * загружает, и места для этого нужно заметно больше, чем для выбора.
 */
export function StickerPacksScreen({
  token,
  packs,
  gifs,
  conversations,
  onPacksChange,
  onGifsChange,
  onShared,
  onClose,
}: StickerPacksScreenProps) {
  const t = useTranslation();
  const stickerInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmoji, setNewEmoji] = useState('🙂');
  // Набор, для которого открыт список чатов. Пусто — окно закрыто.
  const [sharingPackId, setSharingPackId] = useState('');

  const mine = useMemo(() => packs.filter((pack) => pack.mine), [packs]);
  const [activeId, setActiveId] = useState(() => mine[0]?.id ?? '');
  const active = mine.find((pack) => pack.id === activeId) ?? mine[0];

  const replace = useCallback(
    (updated: StickerPack) => {
      onPacksChange(packs.map((pack) => (pack.id === updated.id ? updated : pack)));
    },
    [onPacksChange, packs],
  );

  useEffect(() => {
    if (activeId && mine.some((pack) => pack.id === activeId)) return;
    setActiveId(mine[0]?.id ?? '');
  }, [mine, activeId]);

  async function guard<T>(work: () => Promise<T>): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setNotice('');
    try {
      return await work();
    } catch (reason) {
      setNotice(readable(reason, t));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createPack() {
    const created = await guard(() =>
      api.createStickerPack(token, { title: newTitle, emoji: newEmoji }),
    );
    if (!created) return;
    onPacksChange([...packs, created]);
    setActiveId(created.id);
    setCreating(false);
    setNewTitle('');
  }

  async function removePack(pack: StickerPack) {
    if (!window.confirm(t('stickers.deletePackConfirm', { title: pack.title }))) return;
    await guard(async () => {
      await api.deleteStickerPack(token, pack.id);
      onPacksChange(packs.filter((item) => item.id !== pack.id));
    });
  }

  /** Загрузка стикеров идёт по одному файлу: предел проверяется на сервере. */
  async function addStickers(files: FileList) {
    if (!active) return;
    if (active.stickers.length >= PACK_LIMIT) {
      setNotice(t('stickers.packFull', { limit: PACK_LIMIT }));
      return;
    }
    await guard(async () => {
      let pack = active;
      for (const file of Array.from(files)) {
        const attachment = await api.upload(token, file, 'sticker');
        pack = await api.addStickerToPack(token, pack.id, attachment.id);
      }
      replace(pack);
    });
  }

  async function removeSticker(sticker: Sticker) {
    if (!active) return;
    const updated = await guard(() => api.removeStickerFromPack(token, active.id, sticker.id));
    if (updated) replace(updated);
  }

  /**
   * Прислать набор в чат.
   *
   * 🔥 Набор уезжает сообщением без текста и файлов: у получателя он сразу
   * появляется в своих стикерах, а новые стикеры приходят к нему сами — по
   * событию `stickerPack:updated`. Копировать файлы на стороне получателя не
   * нужно, поэтому обновление и не требует от него никаких действий.
   *
   * Список чатов — своим окном, а не `window.prompt`: подсказка с названием
   * отправляет не туда, если названия повторяются, и её нельзя перевести на
   * пять языков, не сломав оформление.
   */
  async function shareTo(pack: StickerPack, conversationId: string) {
    setSharingPackId('');
    await guard(async () => {
      await api.shareStickerPack(token, pack.id, conversationId);
      setNotice(t('stickers.packSharedNotice', { title: pack.title }));
      onShared?.();
    });
  }

  async function addGifs(files: FileList) {
    if (gifs.length >= GIF_LIMIT) {
      setNotice(t('stickers.gifLimit', { limit: GIF_LIMIT }));
      return;
    }
    await guard(async () => {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/');
        // 🔥 Видео-гифку шлём с `mediaKind=gif`: без него сервер не примет файл,
        // потому что видео разрешено только как оформление профиля.
        uploaded.push(
          await api.upload(token, file, 'gif', isVideo ? { mediaKind: 'gif' } : undefined),
        );
      }
      onGifsChange([...uploaded, ...gifs]);
    });
  }

  return (
    // 🔥 Экран занимает всё приложение целиком, а не окно поверх переписки:
    // здесь загружаются файлы и нужно место под сетку набора и под библиотеку
    // гифок. Слой выше пикера, но ниже того, что должно перебивать даже его.
    <div className="fixed inset-0 z-[80] bg-canvas">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
          aria-label={t('stickers.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
          {t('stickers.managePacks')}
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-strong"
        >
          <Plus className="h-4 w-4" /> {t('stickers.newPack')}
        </button>
      </header>

      {notice && (
        <p role="status" className="shrink-0 bg-danger/10 px-3 py-2 text-sm text-danger">
          {notice}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {creating && (
          <div className="mb-3 rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <input
                value={newEmoji}
                onChange={(event) => setNewEmoji(event.target.value.slice(0, 4))}
                aria-label={t('stickers.packEmoji')}
                className="h-11 w-12 shrink-0 rounded-xl border border-line bg-canvas text-center text-xl"
              />
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder={t('stickers.packTitlePlaceholder')}
                aria-label={t('stickers.packTitlePlaceholder')}
                maxLength={40}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-ink"
              />
              <button
                type="button"
                onClick={createPack}
                disabled={!newTitle.trim() || busy}
                className="h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {t('stickers.create')}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas"
                aria-label={t('stickers.cancel')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <h3 className="mb-2 text-sm font-semibold text-ink">{t('stickers.myPacks')}</h3>
        {mine.length === 0 && (
          <p className="mb-4 rounded-2xl border border-dashed border-line bg-surface px-3 py-6 text-center text-sm text-muted">
            {t('stickers.noOwnPacks')}
          </p>
        )}

        {mine.map((pack) => (
          <section key={pack.id} className="mb-3 rounded-2xl border border-line bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveId(pack.id)}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left ${
                  active?.id === pack.id ? 'text-brand' : 'text-ink'
                }`}
              >
                <span className="emoji text-xl" aria-hidden="true">
                  {pack.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{pack.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {t('stickers.packCount', { count: pack.stickers.length })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSharingPackId(pack.id)}
                disabled={busy || !pack.stickers.length}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-brand transition hover:bg-brand-soft disabled:opacity-40"
                aria-label={t('stickers.sharePack')}
                title={t('stickers.sharePack')}
              >
                <Send className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => removePack(pack)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-danger transition hover:bg-danger/10"
                aria-label={t('stickers.deletePack')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {active?.id === pack.id && (
              <>
                <input
                  ref={stickerInput}
                  type="file"
                  accept="image/png,image/webp,image/gif,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) void addStickers(event.target.files);
                    // Сбрасываем значение: повторный выбор того же файла иначе
                    // не вызовет `change`, и стикер не добавится второй раз.
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => stickerInput.current?.click()}
                  disabled={busy || pack.stickers.length >= PACK_LIMIT}
                  className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-canvas text-sm text-muted transition hover:border-brand/50 hover:text-brand disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {pack.stickers.length >= PACK_LIMIT
                    ? t('stickers.packFull', { limit: PACK_LIMIT })
                    : t('stickers.addStickers')}
                </button>

                {pack.stickers.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">
                    {t('stickers.packEmpty', { title: pack.title })}
                  </p>
                ) : (
                  <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {pack.stickers.map((sticker) => (
                      <li key={sticker.id} className="group relative">
                        <StickerImage sticker={sticker} className="h-14 w-14 object-contain" />
                        <button
                          type="button"
                          onClick={() => removeSticker(sticker)}
                          className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-danger text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t('stickers.removeSticker')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        ))}

        <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">{t('stickers.gifLibrary')}</h3>
        <p className="mb-2 text-xs text-muted">
          {t('stickers.gifHint', { count: gifs.length, limit: GIF_LIMIT })}
        </p>
        <input
          ref={gifInput}
          type="file"
          accept="image/gif,image/webp,image/png,video/mp4,video/webm"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void addGifs(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => gifInput.current?.click()}
          disabled={busy || gifs.length >= GIF_LIMIT}
          className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface text-sm text-muted transition hover:border-brand/50 hover:text-brand disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {t('stickers.addGifs')}
        </button>
        {gifs.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {gifs.map((gif) => (
              <li key={gif.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <GifPreview gif={gif} className="h-20 w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    {sharingPackId && (
        // Список чатов поверх экрана наборов: отдельный слой, а не модальное
        // окно, потому что выбирать надо просто одну строку.
        <div className="fixed inset-0 z-[85] grid place-items-center bg-black/40 p-4">
          <div className="flex max-h-[70dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-float">
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {t('stickers.sharePickChat')}
              </p>
              <button
                type="button"
                onClick={() => setSharingPackId('')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas"
                aria-label={t('stickers.cancel')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {conversations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                {t('stickers.shareNeedsChat')}
              </p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => void shareTo(mine.find((pack) => pack.id === sharingPackId) ?? active!, conversation.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-brand-soft"
                    >
                      <Avatar
                        name={conversation.title ?? t('modals.newConversation')}
                        src={conversation.avatarUrl ?? undefined}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {conversation.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function readable(reason: unknown, t: TranslateFn): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes('STICKER_PACK_FULL')) return t('stickers.packFull', { limit: PACK_LIMIT });
  return message;
}