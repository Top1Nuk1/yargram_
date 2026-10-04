import { describe, expect, it } from 'vitest';
import { LANGUAGES, translate } from './i18n';
import {
  YARGRAM_IMAGE_FAMILIES,
  YARGRAM_IMAGE_SIZES,
  imageTileLabel,
  nearestImageFamily,
  variantForMode,
  yargramImageTiles,
  yargramImageUrl,
  yargramImages,
} from './yargramImages';

describe('картинки Yargram', () => {
  it('собирает адрес из вида и цвета', () => {
    expect(yargramImageUrl('wallpaper', 'blue')).toBe('/wallpapers/Yargram-wallpaper-blue.png');
    expect(yargramImageUrl('banner', 'rose')).toBe('/banners/Yargram-banner-rose.png');
    expect(yargramImageUrl('backdrop', 'aurora')).toBe('/backdrops/Yargram-backdrop-aurora.png');
  });

  it('у тёмной палитры свой файл, а не тот же самый', () => {
    expect(yargramImageUrl('wallpaper', 'blue', 'light')).toBe(
      '/wallpapers/Yargram-wallpaper-blue.png',
    );
    expect(yargramImageUrl('wallpaper', 'blue', 'dark')).toBe(
      '/wallpapers/Yargram-wallpaper-blue-dark.png',
    );
  });

  it('даёт по картинке на каждый цвет в обеих палитрах', () => {
    const images = yargramImages('backdrop');
    expect(images).toHaveLength(YARGRAM_IMAGE_FAMILIES.length);
    expect(images[0]!.lightUrl).toBe('/backdrops/Yargram-backdrop-blue.png');
    expect(images[0]!.darkUrl).toBe('/backdrops/Yargram-backdrop-blue-dark.png');
  });

  it('раскладывает плитки по палитрам: сперва все светлые, потом тёмные', () => {
    const tiles = yargramImageTiles('wallpaper');
    expect(tiles).toHaveLength(YARGRAM_IMAGE_FAMILIES.length * 2);
    expect(tiles.slice(0, YARGRAM_IMAGE_FAMILIES.length).every((tile) => tile.variant === 'light')).toBe(true);
    expect(tiles.slice(YARGRAM_IMAGE_FAMILIES.length).every((tile) => tile.variant === 'dark')).toBe(true);
    // Палитра входит в id: иначе светлая и тёмная плитки одного цвета слились бы.
    expect(yargramImageTiles('wallpaper', 'dark').map((tile) => tile.id)).toContain(
      'wallpaper-blue-dark',
    );
  });

  it('выбирает палитру по режиму темы', () => {
    expect(variantForMode('dark')).toBe('dark');
    expect(variantForMode('light')).toBe('light');
  });

  it('помечает тёмную плитку в названии, чтобы две «Изумрудные» не путались', () => {
    const t = (key: string, params?: Record<string, string | number>) =>
      key === 'themes.imageDarkName' ? `${params?.name} (тёмные)` : key === 'themes.imageEmerald' ? 'Изумрудные' : key;
    const [light] = yargramImageTiles('wallpaper', 'light').filter((tile) => tile.colorId === 'emerald');
    const [dark] = yargramImageTiles('wallpaper', 'dark').filter((tile) => tile.colorId === 'emerald');
    expect(imageTileLabel(light!, t)).toBe('Изумрудные');
    expect(imageTileLabel(dark!, t)).toBe('Изумрудные (тёмные)');
  });

  it('знает размеры всех трёх видов', () => {
    expect(YARGRAM_IMAGE_SIZES.wallpaper).toBe('1080×1920');
    expect(YARGRAM_IMAGE_SIZES.banner).toBe('1600×400');
    expect(YARGRAM_IMAGE_SIZES.backdrop).toBe('1920×1080');
  });

  it('подбирает цвет по акценту', () => {
    expect(nearestImageFamily('#3390ec').id).toBe('blue');
    expect(nearestImageFamily('#1f9d63').id).toBe('emerald');
    // Акцент, которого нет среди готовых: берём самый близкий, а не первый.
    expect(nearestImageFamily('#3a8fe8').id).toBe('blue');
  });

  it('не спотыкается о мусор вместо цвета', () => {
    // Не HEX — отдаём первый цвет, экран входа не должен остаться без фона.
    expect(nearestImageFamily('не цвет').id).toBe('blue');
    expect(nearestImageFamily('').id).toBe('blue');
  });

  it('у каждого цвета есть название на всех языках', () => {
    // Ключа нет — `translate` возвращает сам ключ, и в галерее появилась бы
    // строка вида «themes.imageBlue». Проверяем все языки сразу.
    for (const language of LANGUAGES) {
      for (const family of YARGRAM_IMAGE_FAMILIES) {
        const name = translate(language, family.nameKey);
        expect(name).not.toBe(family.nameKey);
        expect(name.trim()).not.toBe('');
      }
    }
  });
});
