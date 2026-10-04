/**
 * Встроенные баннеры профиля — светлые и тёмные.
 *
 * Те же восемь цветов, что у обоев, но размер другой — 1600×400, полоса под
 * шапку профиля. Хранятся как обычный `bannerUrl`, поэтому человек может
 * выбрать готовый баннер или загрузить свой — механизм один и тот же.
 */
import { yargramImageTiles, type YargramImageTile } from './yargramImages';

export type BuiltInBanner = YargramImageTile;

/** Обе палитры: в профиле они идут одной лентой, светлые первыми. */
export const BUILT_IN_BANNERS: BuiltInBanner[] = yargramImageTiles('banner');

/** Ищет готовый баннер по адресу: по нему отмечаем выбранный в галерее. */
export function findBanner(url: string | null | undefined): BuiltInBanner | undefined {
  if (!url) return undefined;
  return BUILT_IN_BANNERS.find((banner) => banner.url === url);
}
