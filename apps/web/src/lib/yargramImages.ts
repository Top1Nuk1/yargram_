/**
 * Картинки Yargram: обои, баннеры и фоны — светлые и тёмные.
 *
 * Рисунок один и тот же — мягкий градиент из стрелок логотипа, — а цветов
 * восемь, ровно по встроенным акцентам оформления. И у каждого цвета две
 * палитры: светлая и тёмная. Тёмная нужна тёмным темам: светлая картинка на
 * тёмном интерфейсе превращается в серую пелену.
 *
 * Отсюда общее описание: одна семья цветов даёт два вида палитры и три размера,
 * и они не разъезжаются между собой.
 *
 * Файлы лежат в `apps/web/public/` и раздаются статикой:
 * `public/wallpapers/…`, `public/banners/…`, `public/backdrops/…`.
 * Имена: `Yargram-<вид>-<цвет>.png` и `Yargram-<вид>-<цвет>-dark.png`.
 */
export type YargramImageKind = 'wallpaper' | 'banner' | 'backdrop';

/** Палитра картинки: светлая для светлых тем, тёмная для тёмных. */
export type ImageVariant = 'light' | 'dark';

/** Семья цветов: имя для человека и базовый акцент для подбора. */
export interface YargramImageFamily {
  /** Идентификатор цвета: он же в имени файла — `Yargram-banner-<id>.png`. */
  id: string;
  /** Ключ перевода названия цвета. */
  nameKey: string;
  /** Базовый цвет темы: по нему картинку подбирают под акцент оформления. */
  accent: string;
}

/**
 * Восемь цветов. Акценты совпадают со встроенными темами (`BUILT_IN_THEMES`),
 * чтобы картинка не выбивалась из выбранного оформления. У градиентных тем
 * взят первый цвет: для подбора «самого близкого» этого достаточно.
 */
export const YARGRAM_IMAGE_FAMILIES: YargramImageFamily[] = [
  { id: 'blue', nameKey: 'themes.imageBlue', accent: '#3390ec' },
  { id: 'emerald', nameKey: 'themes.imageEmerald', accent: '#1f9d63' },
  { id: 'rose', nameKey: 'themes.imageRose', accent: '#d94f8a' },
  { id: 'sepia', nameKey: 'themes.imageSepia', accent: '#a8763c' },
  { id: 'midnight', nameKey: 'themes.imageMidnight', accent: '#4a6fd4' },
  { id: 'sunset', nameKey: 'themes.imageSunset', accent: '#f97362' },
  { id: 'aurora', nameKey: 'themes.imageAurora', accent: '#3ddc97' },
  { id: 'ocean', nameKey: 'themes.imageOcean', accent: '#2b8fe0' },
];

/** Готовая картинка одного цвета в обеих палитрах. */
export interface YargramImage {
  colorId: string;
  nameKey: string;
  lightUrl: string;
  darkUrl: string;
}

/**
 * Плитка галереи: конкретная картинка конкретного цвета.
 *
 * Плитка — то, что человек выбирает и что лежит в профиле, поэтому у неё свой
 * адрес и свой `id`. `id` включает палитру: светлые и тёмные плитки одного цвета
 * стоят рядом, и без палитры в идентификаторе они бы слились.
 */
export interface YargramImageTile {
  /** Уникальный id плитки: `wallpaper-blue`, `wallpaper-blue-dark`. */
  id: string;
  colorId: string;
  nameKey: string;
  variant: ImageVariant;
  url: string;
}

/** Размеры картинок в пикселях — подписываем в галерее, чтобы было видно. */
export const YARGRAM_IMAGE_SIZES: Record<YargramImageKind, string> = {
  wallpaper: '1080×1920',
  banner: '1600×400',
  backdrop: '1920×1080',
};

/**
 * Адрес файла. Папка — множественное число от вида (`wallpaper` → `wallpapers`),
 * имя файла — `<вид>-<цвет>.png`, у тёмной палитры ещё `-dark`: так `ls` сразу
 * показывает, что это и какого оно цвета.
 */
export function yargramImageUrl(
  kind: YargramImageKind,
  colorId: string,
  variant: ImageVariant = 'light',
): string {
  const suffix = variant === 'dark' ? '-dark' : '';
  return `/${kind}s/Yargram-${kind}-${colorId}${suffix}.png`;
}

/** Все цвета одного вида — обе палитры сразу. */
export function yargramImages(kind: YargramImageKind): YargramImage[] {
  return YARGRAM_IMAGE_FAMILIES.map((family) => ({
    colorId: family.id,
    nameKey: family.nameKey,
    lightUrl: yargramImageUrl(kind, family.id, 'light'),
    darkUrl: yargramImageUrl(kind, family.id, 'dark'),
  }));
}

/**
 * Плитки одного вида. Без палитры — обе: сперва все светлые, потом все тёмные,
 * чтобы галерея могла разложить их по двум полкам одним `filter`.
 */
export function yargramImageTiles(
  kind: YargramImageKind,
  variant?: ImageVariant,
): YargramImageTile[] {
  const variants: ImageVariant[] = variant ? [variant] : ['light', 'dark'];
  return variants.flatMap((current) =>
    YARGRAM_IMAGE_FAMILIES.map((family) => ({
      id: `${kind}-${family.id}${current === 'dark' ? '-dark' : ''}`,
      colorId: family.id,
      nameKey: family.nameKey,
      variant: current,
      url: yargramImageUrl(kind, family.id, current),
    })),
  );
}

/**
 * Название плитки для человека. У тёмной палитры цвет тот же, поэтому к имени
 * добавляем пометку — иначе в галерее стояли бы две «Изумрудные» подряд.
 */
export function imageTileLabel(
  tile: YargramImageTile,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const name = t(tile.nameKey);
  return tile.variant === 'dark' ? t('themes.imageDarkName', { name }) : name;
}

/** Палитра, подходящая текущему режиму темы: светлая тема — светлая картинка. */
export function variantForMode(mode: 'light' | 'dark'): ImageVariant {
  return mode === 'dark' ? 'dark' : 'light';
}

function hexToRgb(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const number = Number.parseInt(match[1]!, 16);
  return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff];
}

/**
 * Ближайший цвет из восьми к заданному акценту.
 *
 * Нужен там, где выбора ещё нет — на экране входа: аккаунта нет, а акцент
 * оформления на устройстве уже известен. Сравниваем по сумме квадратов
 * разницы каналов: для «какой из восьми ближе» этого достаточно, а
 * восприятие тут ни при чём — цвета всё равно разнесены далеко.
 */
export function nearestImageFamily(accent: string): YargramImageFamily {
  const target = hexToRgb(accent);
  if (!target) return YARGRAM_IMAGE_FAMILIES[0]!;
  let best = YARGRAM_IMAGE_FAMILIES[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const family of YARGRAM_IMAGE_FAMILIES) {
    const rgb = hexToRgb(family.accent);
    if (!rgb) continue;
    const distance =
      (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = family;
    }
  }
  return best;
}
