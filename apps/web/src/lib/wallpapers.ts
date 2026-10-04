/**
 * Встроенные фоновые рисунки для чата — светлые и тёмные.
 *
 * Это PNG из `apps/web/public/wallpapers/`, которые раздаются статикой
 * (Vite `public/` → `/wallpapers/…`). Серверу сами файлы не нужны: в профиле
 * хранится только URL, а рисунок берётся браузером с нашего же адреса.
 */
import { yargramImageTiles, type YargramImageTile } from './yargramImages';

export type BuiltInWallpaper = YargramImageTile;

/** Обе палитры: галерея раскладывает их по полкам «Светлые» и «Тёмные». */
export const BUILT_IN_WALLPAPERS: BuiltInWallpaper[] = yargramImageTiles('wallpaper');

/**
 * Ищет обои по адресу: нужно, чтобы отметить выбранные в галерее.
 * Сравниваем именно URL, а не id: в профиле лежит адрес, и только он
 * однозначно говорит, что за картинка стоит фоном.
 */
export function findWallpaper(url: string | null | undefined): BuiltInWallpaper | undefined {
  if (!url) return undefined;
  return BUILT_IN_WALLPAPERS.find((wallpaper) => wallpaper.url === url);
}
