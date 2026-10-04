import { DecorativeVideo } from '../../components/DecorativeVideo';
import type { User } from '../../types';

/** Высота полосы баннера — общая для показа и для редактора, чтобы картинка
 *  обрезалась одинаково и владелец видел ровно то, что увидят остальные. */
export const BANNER_HEIGHT = 'h-32 sm:h-36';

/**
 * Полоса баннера в профиле.
 *
 * Баннер — это либо фото (или видео) на всю ширину, либо однотонная заливка.
 * Фото главнее: если оно задано, заливка не видна (её не нужно сбрасывать при
 * загрузке фото — удалив фото, человек вернёт прежний цвет). Если не задано ни
 * то, ни другое, рисуется приглушённая заливка темы — шапка не должна провисать
 * пустотой.
 */
export function ProfileBanner({ user, className = '' }: { user: User; className?: string }) {
  const photo = user.bannerUrl ?? user.banner?.url ?? null;
  // Видео живёт вложением: у него известен тип. Прямая ссылка (bannerUrl) —
  // всегда картинка, видео по ссылке из интернета не ставим.
  const isVideo = !user.bannerUrl && Boolean(user.banner?.mimeType?.startsWith('video/'));
  const color = user.bannerColor?.trim() || null;

  return (
    <div
      className={`relative w-full overflow-hidden ${BANNER_HEIGHT} ${className}`}
      style={photo ? undefined : { backgroundColor: color ?? 'rgb(var(--canvas))' }}
      data-banner={photo ? 'photo' : color ? 'color' : 'empty'}
    >
      {photo && isVideo && (
        <DecorativeVideo
          src={photo}
          className="pointer-events-none h-full w-full object-cover"
        />
      )}
      {photo && !isVideo && (
        <img src={photo} alt="" className="h-full w-full object-cover" draggable={false} />
      )}
      {/* Мягкая подложка под кнопки в углу: на светлом фото белые значки иначе
          теряются, а на тёмном — тёмные. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/25 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}
