import type { ThemeMode } from '../types';

/**
 * Темы Yargram.
 *
 * Тема — это именованный набор значений для CSS-переменных плюс шрифт. Раньше в
 * приложении было ровно две темы (светлая и тёмная), зашитые в `index.css`, а из
 * аккаунта приходил только акцент. Теперь тем может быть сколько угодно: часть
 * везёт приложение, часть делает человек сам, а третьи приезжают по ссылке.
 *
 * Хранятся темы на устройстве (`localStorage`), как язык: это выбор этого
 * браузера, а не свойство аккаунта. Поэтому сервер о темах ничего не знает, и
 * поделиться темой можно только ссылкой — она несёт саму тему внутри себя.
 */

/**
 * Шрифт темы. Своих файлов шрифтов приложение не возит: наборы собраны из
 * системных семейств, поэтому выбор работает офлайн и ничего не догружает.
 * Порядок в стеке — от самого желаемого к запасному.
 */
export type ThemeFont = 'system' | 'rounded' | 'serif' | 'mono';

export const FONT_STACKS: Record<ThemeFont, string> = {
  system:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Varela Round", "Segoe UI", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", "PT Serif", ui-serif, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

export const THEME_FONTS: ThemeFont[] = ['system', 'rounded', 'serif', 'mono'];

export const FONT_LABEL_KEYS: Record<ThemeFont, string> = {
  system: 'themes.fontSystem',
  rounded: 'themes.fontRounded',
  serif: 'themes.fontSerif',
  mono: 'themes.fontMono',
};

/**
 * Цвета темы. Список намеренно короткий и осмысленный: это роли в интерфейсе, а
 * не «синий №3». Служебные цвета — успех, ошибка, предупреждение — в тему не
 * входят: они означают состояние, и перекрашивать их в своё нельзя.
 */
export interface ThemeColors {
  /** Общий фон приложения (то, что видно за панелями). */
  canvas: string;
  /** Панели, шапки, карточки. */
  surface: string;
  /** Всплывающие меню и окна — чуть светлее панелей. */
  elevated: string;
  /** Основной текст. */
  ink: string;
  /** Второстепенный текст и подписи. */
  muted: string;
  /** Границы и разделители. */
  line: string;
  /** Акцент: кнопки, ссылки, выделение. */
  brand: string;
  /** Мягкая подложка акцента — фон наведения и плашек. */
  brandSoft: string;
  /** Второй цвет: градиенты и тег владельца. */
  accent: string;
  /** Фон переписки. */
  chatBg: string;
  /** Свои сообщения в переписке. */
  bubbleOut: string;
}

export const THEME_COLOR_KEYS: (keyof ThemeColors)[] = [
  'canvas',
  'surface',
  'elevated',
  'ink',
  'muted',
  'line',
  'brand',
  'brandSoft',
  'accent',
  'chatBg',
  'bubbleOut',
];

export const COLOR_LABEL_KEYS: Record<keyof ThemeColors, string> = {
  canvas: 'themes.colorCanvas',
  surface: 'themes.colorSurface',
  elevated: 'themes.colorElevated',
  ink: 'themes.colorInk',
  muted: 'themes.colorMuted',
  line: 'themes.colorLine',
  brand: 'themes.colorBrand',
  brandSoft: 'themes.colorBrandSoft',
  accent: 'themes.colorAccent',
  chatBg: 'themes.colorChatBg',
  bubbleOut: 'themes.colorBubbleOut',
};

export interface Theme {
  id: string;
  /**
   * Название. У встроенных тем оно тут лежит по-английски (для ссылок и
   * экспорта), а на экране показывается перевод из `nameKey`.
   */
  name: string;
  /** Ключ перевода названия — только у встроенных тем. */
  nameKey?: string;
  mode: ThemeMode;
  font: ThemeFont;
  colors: ThemeColors;
  /**
   * Градиентная палитра: от 2 до 5 цветов, которые переливаются на фоне
   * переписки, обоях и в шапке списка чатов. Не задана — градиент строится из
   * `brand` и `accent`, как было раньше.
   */
  palette?: string[];
  /**
   * «Перелив»: цвета палитры плавно перетекают друг в друга. Выключено —
   * стоят резко, как обычная заливка. Флаг живёт в теме, поэтому готовая тема
   * приезжает с уже выбранным поведением, но человек может его поменять.
   */
  animated?: boolean;
  /**
   * Тема того же набора в другом режиме — на неё переключает кнопка
   * солнце/луна. Нет пары — переключение уходит на встроенную тему.
   */
  counterpartId?: string;
  /** Встроенную тему нельзя ни изменить, ни удалить. */
  builtIn?: boolean;
}

/** Сколько цветов в палитре темы: два — минимум для градиента, пять — предел. */
export const THEME_PALETTE_MIN = 2;
export const THEME_PALETTE_MAX = 5;

export const DEFAULT_LIGHT_THEME_ID = 'light';
export const DEFAULT_DARK_THEME_ID = 'dark';

/** Встроенные темы. Первые две — те же, что были в `index.css`. */
export const BUILT_IN_THEMES: Theme[] = [
  {
    id: DEFAULT_LIGHT_THEME_ID,
    name: 'Light',
    nameKey: 'themes.presetLight',
    mode: 'light',
    font: 'system',
    counterpartId: DEFAULT_DARK_THEME_ID,
    builtIn: true,
    colors: {
      canvas: '#f6f7fd',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#18232d',
      muted: '#70808d',
      line: '#e2e7eb',
      brand: '#3390ec',
      brandSoft: '#e8f3fd',
      accent: '#8964eb',
      chatBg: '#ebf1f8',
      bubbleOut: '#daedff',
    },
  },
  {
    id: DEFAULT_DARK_THEME_ID,
    name: 'Dark',
    nameKey: 'themes.presetDark',
    mode: 'dark',
    font: 'system',
    counterpartId: DEFAULT_LIGHT_THEME_ID,
    builtIn: true,
    colors: {
      canvas: '#111525',
      surface: '#17212b',
      elevated: '#1e2b38',
      ink: '#ebf2f8',
      muted: '#899cad',
      line: '#2a3947',
      brand: '#52a5f1',
      brandSoft: '#22394e',
      accent: '#a98cff',
      chatBg: '#0e1621',
      bubbleOut: '#2b5278',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    nameKey: 'themes.presetEmerald',
    mode: 'light',
    font: 'system',
    counterpartId: 'emerald-night',
    builtIn: true,
    colors: {
      canvas: '#f2f7f4',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#16241d',
      muted: '#6b8378',
      line: '#dfe9e3',
      brand: '#2f9e6b',
      brandSoft: '#e3f4ec',
      accent: '#4fae86',
      chatBg: '#e9f2ed',
      bubbleOut: '#d6f0e2',
    },
  },
  {
    id: 'emerald-night',
    name: 'Emerald night',
    nameKey: 'themes.presetEmeraldNight',
    mode: 'dark',
    font: 'system',
    counterpartId: 'emerald',
    builtIn: true,
    colors: {
      canvas: '#0e1a15',
      surface: '#14231c',
      elevated: '#1b2c24',
      ink: '#e6f2eb',
      muted: '#85a294',
      line: '#23402f',
      brand: '#46b483',
      brandSoft: '#1c3a2c',
      accent: '#6cc39a',
      chatBg: '#0b1512',
      bubbleOut: '#1f4736',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    nameKey: 'themes.presetRose',
    mode: 'light',
    font: 'system',
    counterpartId: 'rose-night',
    builtIn: true,
    colors: {
      canvas: '#fdf5f8',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#2a1c22',
      muted: '#8a7280',
      line: '#f0e1e8',
      brand: '#e0508f',
      brandSoft: '#fde8f1',
      accent: '#b463d6',
      chatBg: '#fbeef4',
      bubbleOut: '#fbd9e7',
    },
  },
  {
    id: 'rose-night',
    name: 'Rose night',
    nameKey: 'themes.presetRoseNight',
    mode: 'dark',
    font: 'system',
    counterpartId: 'rose',
    builtIn: true,
    colors: {
      canvas: '#1a1016',
      surface: '#231520',
      elevated: '#2d1c28',
      ink: '#f7e9f0',
      muted: '#b090a2',
      line: '#3d2735',
      brand: '#f06fa6',
      brandSoft: '#3a1f2e',
      accent: '#c987e6',
      chatBg: '#160d13',
      bubbleOut: '#4a2640',
    },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    nameKey: 'themes.presetSepia',
    mode: 'light',
    font: 'serif',
    counterpartId: 'sepia-night',
    builtIn: true,
    colors: {
      canvas: '#f6efe3',
      surface: '#fffaf1',
      elevated: '#fffdf7',
      ink: '#3a3128',
      muted: '#857a6a',
      line: '#e6dccb',
      brand: '#b07d3a',
      brandSoft: '#f6ecdb',
      accent: '#9a6b52',
      chatBg: '#f1e7d6',
      bubbleOut: '#f3e0bd',
    },
  },
  {
    id: 'sepia-night',
    name: 'Sepia night',
    nameKey: 'themes.presetSepiaNight',
    mode: 'dark',
    font: 'serif',
    counterpartId: 'sepia',
    builtIn: true,
    colors: {
      canvas: '#1a1712',
      surface: '#231f19',
      elevated: '#2d271f',
      ink: '#f2e9db',
      muted: '#a89a86',
      line: '#3d3529',
      brand: '#cf9a52',
      brandSoft: '#3a3023',
      accent: '#bb8a6e',
      chatBg: '#16130f',
      bubbleOut: '#463726',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    nameKey: 'themes.presetMidnight',
    mode: 'dark',
    font: 'system',
    counterpartId: 'midnight-day',
    builtIn: true,
    colors: {
      canvas: '#0b0b12',
      surface: '#14141d',
      elevated: '#1d1d29',
      ink: '#e9e9f2',
      muted: '#8b8ba3',
      line: '#26263a',
      brand: '#8b7bf0',
      brandSoft: '#26244a',
      accent: '#c084fc',
      chatBg: '#08080e',
      bubbleOut: '#2b2a55',
    },
  },
  {
    id: 'midnight-day',
    name: 'Midnight day',
    nameKey: 'themes.presetMidnightDay',
    mode: 'light',
    font: 'system',
    counterpartId: 'midnight',
    builtIn: true,
    colors: {
      canvas: '#f4f3fb',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#1e1c2e',
      muted: '#77738f',
      line: '#e4e2f2',
      brand: '#6f5ce6',
      brandSoft: '#ece9fd',
      accent: '#a259e8',
      chatBg: '#efedf9',
      bubbleOut: '#e0dbfb',
    },
  },
  // Градиентные темы. Палитра — от трёх цветов, `animated` включает перелив.
  // Их можно взять как основу и подстроить под себя: сохранённая копия станет
  // своей темой, а исходная останется нетронутой.
  {
    id: 'sunset',
    name: 'Sunset',
    nameKey: 'themes.presetSunset',
    mode: 'light',
    font: 'system',
    counterpartId: 'sunset-night',
    builtIn: true,
    palette: ['#f97362', '#f5a04a', '#d95ba8', '#8b5cf6'],
    animated: true,
    colors: {
      canvas: '#fdf5f1',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#2d1e1a',
      muted: '#8d7468',
      line: '#f0e2da',
      brand: '#f0663f',
      brandSoft: '#fdeae3',
      accent: '#d95ba8',
      chatBg: '#fbeef0',
      bubbleOut: '#fbdfd2',
    },
  },
  {
    id: 'sunset-night',
    name: 'Sunset night',
    nameKey: 'themes.presetSunsetNight',
    mode: 'dark',
    font: 'system',
    counterpartId: 'sunset',
    builtIn: true,
    palette: ['#e8705a', '#c98338', '#b04a86', '#7b52d8'],
    animated: true,
    colors: {
      canvas: '#1c1310',
      surface: '#261a17',
      elevated: '#32221e',
      ink: '#f7e9e3',
      muted: '#b1928a',
      line: '#432c26',
      brand: '#f2795e',
      brandSoft: '#3d2019',
      accent: '#d972b0',
      chatBg: '#160f0d',
      bubbleOut: '#4e2a26',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    nameKey: 'themes.presetAurora',
    mode: 'dark',
    font: 'system',
    counterpartId: 'aurora-day',
    builtIn: true,
    palette: ['#3ddc97', '#3ec7e8', '#7c6cf5', '#d264e8'],
    animated: true,
    colors: {
      canvas: '#0c1218',
      surface: '#131c24',
      elevated: '#1b2731',
      ink: '#e7f2f4',
      muted: '#8ba4ad',
      line: '#233440',
      brand: '#3ddc97',
      brandSoft: '#17332c',
      accent: '#3ec7e8',
      chatBg: '#080f13',
      bubbleOut: '#1d4440',
    },
  },
  {
    id: 'aurora-day',
    name: 'Aurora day',
    nameKey: 'themes.presetAuroraDay',
    mode: 'light',
    font: 'system',
    counterpartId: 'aurora',
    builtIn: true,
    palette: ['#22b57a', '#2aa6c4', '#6b5ce0', '#b74fd0'],
    animated: true,
    colors: {
      canvas: '#f1f8f7',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#16241f',
      muted: '#6d8b87',
      line: '#dcebe8',
      brand: '#18a86f',
      brandSoft: '#e2f6ee',
      accent: '#2aa6c4',
      chatBg: '#e9f4f2',
      bubbleOut: '#d5f0e5',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    nameKey: 'themes.presetOcean',
    mode: 'light',
    font: 'system',
    counterpartId: 'ocean-night',
    builtIn: true,
    palette: ['#2b8fe0', '#38b6d9', '#4f6ee0', '#7a5ce0', '#2fb0a8'],
    animated: true,
    colors: {
      canvas: '#f1f6fc',
      surface: '#ffffff',
      elevated: '#ffffff',
      ink: '#152534',
      muted: '#6b8399',
      line: '#d9e7f2',
      brand: '#2b8fe0',
      brandSoft: '#e2f0fc',
      accent: '#4f6ee0',
      chatBg: '#e8f1f9',
      bubbleOut: '#d3e8fa',
    },
  },
  {
    id: 'ocean-night',
    name: 'Ocean night',
    nameKey: 'themes.presetOceanNight',
    mode: 'dark',
    font: 'system',
    counterpartId: 'ocean',
    builtIn: true,
    palette: ['#3a9be6', '#39bcd6', '#5f7ce8', '#8a6ce8', '#35bdb4'],
    animated: true,
    colors: {
      canvas: '#0b121a',
      surface: '#121c26',
      elevated: '#1a2735',
      ink: '#e6f0f8',
      muted: '#87a0b6',
      line: '#223343',
      brand: '#4aa4ee',
      brandSoft: '#17324a',
      accent: '#5f7ce8',
      chatBg: '#080f16',
      bubbleOut: '#21456b',
    },
  },
];

export const BUILT_IN_THEME_IDS = new Set(BUILT_IN_THEMES.map((theme) => theme.id));

/**
 * Фильтр списка тем по режиму. `all` ничего не прячет — так список выглядит по
 * умолчанию; `light` и `dark` оставляют только темы нужного режима.
 */
export type ThemeFilter = 'all' | ThemeMode;

export const THEME_FILTERS: ThemeFilter[] = ['all', 'light', 'dark'];

export const THEME_FILTER_LABEL_KEYS: Record<ThemeFilter, string> = {
  all: 'themes.filterAll',
  light: 'themes.filterLight',
  dark: 'themes.filterDark',
};

/**
 * Раскладывает темы по режимам, не пряча ничего.
 *
 * Выбранный режим — первым, второй — следом. Порядок внутри каждой группы
 * сохраняется как есть, поэтому встроенные темы остаются выше своих, а «свежие
 * сверху» в своих темах не ломается. Пустой фильтр (`all`) вернёт список
 * нетронутым — это и есть обычный вид экрана.
 */
export function groupThemesByFilter<T extends { mode: ThemeMode }>(
  themes: T[],
  filter: ThemeFilter,
): { mode: ThemeMode; themes: T[] }[] {
  if (filter === 'all') return [];
  const other: ThemeMode = filter === 'light' ? 'dark' : 'light';
  return [
    { mode: filter, themes: themes.filter((theme) => theme.mode === filter) },
    { mode: other, themes: themes.filter((theme) => theme.mode === other) },
  ].filter((group) => group.themes.length > 0);
}

// ---------------------------------------------------------------------------
// Цвет
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Приводит `#abc` и `ABC` к виду `#aabbcc`. Возвращает `null`, если это не цвет. */
export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .split('')
      .map((character) => character + character)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  return null;
}

export function isHexColor(value: string): boolean {
  return normalizeHex(value) !== null;
}

/** `#3390ec` → `51 144 236` — в таком виде цвета читают CSS-переменные. */
export function hexToRgbTriplet(value: string): string {
  const hex = normalizeHex(value) ?? '#000000';
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(' ');
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(value: string): Hsl {
  const hex = normalizeHex(value) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
      : h < 120 ? [x, c, 0]
        : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c]
            : h < 300 ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Сдвигает светлоту, сохраняя тон и насыщенность. Нужен для производных цветов
 * (`--brand-strong` темнее акцента, как в исходной палитре).
 */
export function shiftLightness(value: string, delta: number): string {
  const { h, s, l } = hexToHsl(value);
  return hslToHex(h, s, clamp01(l + delta));
}

/** Задаёт светлоту, сохраняя тон и насыщенность. */
export function withLightness(value: string, lightness: number): string {
  const { h, s } = hexToHsl(value);
  return hslToHex(h, s, clamp01(lightness));
}

/**
 * Целевая светлота каждой роли для светлого и тёмного режима: `[база, размах]`.
 * Размах сохраняет разницу между темами: цвет, который был светлее соседа,
 * останется светлее и после пересчёта.
 */
const ROLE_LIGHTNESS: Record<ThemeMode, Record<keyof ThemeColors, [number, number]>> = {
  light: {
    canvas: [0.945, 0.05],
    surface: [1, 0.03],
    elevated: [1, 0.03],
    ink: [0.13, 0.06],
    muted: [0.46, 0.08],
    line: [0.88, 0.06],
    brand: [0.5, 0.14],
    brandSoft: [0.94, 0.05],
    accent: [0.55, 0.14],
    chatBg: [0.92, 0.06],
    bubbleOut: [0.88, 0.08],
  },
  dark: {
    canvas: [0.1, 0.06],
    surface: [0.14, 0.05],
    elevated: [0.19, 0.05],
    ink: [0.93, 0.06],
    muted: [0.62, 0.08],
    line: [0.24, 0.06],
    brand: [0.62, 0.14],
    brandSoft: [0.22, 0.05],
    accent: [0.68, 0.14],
    chatBg: [0.07, 0.05],
    bubbleOut: [0.3, 0.08],
  },
};

/**
 * Пересчитывает палитру в другой режим — так из светлой темы получается её
 * тёмная версия. Тон и насыщенность каждого цвета сохраняются, меняется только
 * светлота: иначе тёмная версия оказалась бы набором незнакомых цветов.
 */
export function deriveCounterpartColors(colors: ThemeColors, mode: ThemeMode): ThemeColors {
  const targets = ROLE_LIGHTNESS[mode];
  const result = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    const [base, span] = targets[key];
    const { l } = hexToHsl(colors[key]);
    result[key] = withLightness(colors[key], clamp01(base + (l - 0.5) * span));
  }
  return result;
}

/**
 * Пересчитывает палитру градиента в другой режим: тот же тон, подогнанная
 * светлота. Нужна кнопке «сделать парную» — иначе у тёмной версии светлой темы
 * остались бы слепящие цвета.
 */
export function deriveCounterpartPalette(palette: string[], mode: ThemeMode): string[] {
  const [base, span] = mode === 'dark' ? [0.62, 0.14] : [0.5, 0.14];
  return palette.map((color) => {
    const { l } = hexToHsl(color);
    return withLightness(color, clamp01((base as number) + (l - 0.5) * (span as number)));
  });
}

// ---------------------------------------------------------------------------
// Применение
// ---------------------------------------------------------------------------

/** Градиентные цвета темы. Пустая палитра — пара «акцент + второй цвет». */
export function themePalette(theme: Theme): string[] {
  const palette = theme.palette?.filter((color) => isHexColor(color)) ?? [];
  if (palette.length >= THEME_PALETTE_MIN) return palette.slice(0, THEME_PALETTE_MAX);
  // Запасной вариант для тем без палитры и для старых тем из хранилища.
  return [theme.colors.brand, theme.colors.accent];
}

/**
 * Собирает значения CSS-переменных темы. Производные (`--brand-strong`,
 * `--elevated` берётся из палитры) считаются тут, чтобы в теме не было полей,
 * которые человек не понимает.
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  const colors = theme.colors;
  const palette = themePalette(theme);
  return {
    '--canvas': hexToRgbTriplet(colors.canvas),
    '--surface': hexToRgbTriplet(colors.surface),
    '--elevated': hexToRgbTriplet(colors.elevated),
    '--ink': hexToRgbTriplet(colors.ink),
    '--muted': hexToRgbTriplet(colors.muted),
    '--line': hexToRgbTriplet(colors.line),
    '--brand': hexToRgbTriplet(colors.brand),
    '--brand-strong': hexToRgbTriplet(shiftLightness(colors.brand, -0.08)),
    '--brand-soft': hexToRgbTriplet(colors.brandSoft),
    '--accent': hexToRgbTriplet(colors.accent),
    '--chat-bg': hexToRgbTriplet(colors.chatBg),
    '--bubble-out': hexToRgbTriplet(colors.bubbleOut),
    // Палитра градиента. Список одним значением: CSS принимает цвета через
    // запятую прямо в переменной, поэтому `linear-gradient(var(--theme-palette))`
    // не требует отдельного правила на каждое число цветов.
    '--theme-palette': palette.map((color) => `rgb(${hexToRgbTriplet(color)})`).join(', '),
    // Скорость перелива: выключенный перелив — бесконечно долгий цикл, то есть
    // цвета стоят на месте. Так не нужны два разных CSS-правила.
    '--theme-flow': theme.animated ? '16s' : '0s',
    '--app-font': FONT_STACKS[theme.font],
  };
}

/**
 * Вешает тему на документ. Значения ставятся прямо в `style` на `<html>`, а не
 * классом: инлайновое значение перебивает и `:root`, и `:root.dark`, поэтому
 * теме достаточно одного места, где всё сходится.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme.mode === 'dark');
  root.style.colorScheme = theme.mode;
  for (const [name, value] of Object.entries(themeToCssVariables(theme))) {
    root.style.setProperty(name, value);
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute('content', theme.mode === 'dark' ? theme.colors.surface : theme.colors.brand);
}

// ---------------------------------------------------------------------------
// Хранение
// ---------------------------------------------------------------------------

export const THEMES_STORAGE_KEY = 'yargram.themes';
/** Прежний ключ: в нём лежал только режим. Читаем его, чтобы выбор не потерялся. */
const LEGACY_MODE_KEY = 'yargram.theme';

/**
 * Свой набор тем на каждый аккаунт устройства.
 *
 * Устройство помнит несколько аккаунтов, и у каждого может быть свой вкус:
 * один любит тёмную, другой — светлую. Поэтому выбранная тема (и свои темы)
 * хранятся по владельцу, а не одной записью на браузер. Общий ключ оставлен
 * запасным: он же первый выбор на устройстве — до входа мы ещё не знаем, кто
 * придёт, и тема на экране входа берётся именно оттуда.
 */
export function themesStorageKey(ownerId?: string | null): string {
  const owner = ownerId?.trim();
  return owner ? `${THEMES_STORAGE_KEY}.${owner}` : THEMES_STORAGE_KEY;
}

export interface StoredThemes {
  activeId: string;
  custom: Theme[];
}

export function isBuiltInTheme(id: string): boolean {
  return BUILT_IN_THEME_IDS.has(id);
}

export function themeById(id: string, custom: Theme[]): Theme {
  return (
    BUILT_IN_THEMES.find((theme) => theme.id === id) ??
    custom.find((theme) => theme.id === id) ??
    BUILT_IN_THEMES[0]!
  );
}

function sanitizeColors(value: unknown): ThemeColors | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const result = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    const raw = source[key];
    const hex = typeof raw === 'string' ? normalizeHex(raw) : null;
    if (!hex) return null;
    result[key] = hex;
  }
  return result;
}

/**
 * Разбирает тему из неизвестного источника — из хранилища или из чужой ссылки.
 * Всё, что не сходится, отбрасывается целиком: наполовину принятая тема дала бы
 * нечитаемый интерфейс, и человек не понял бы, откуда это.
 */
export function sanitizeTheme(value: unknown): Theme | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim().slice(0, 64) : null;
  const name = typeof source.name === 'string' ? source.name.trim().slice(0, 60) : '';
  const mode = source.mode === 'dark' ? 'dark' : source.mode === 'light' ? 'light' : null;
  const font =
    source.font === 'rounded' || source.font === 'serif' || source.font === 'mono'
      ? source.font
      : source.font === 'system'
        ? 'system'
        : null;
  const colors = sanitizeColors(source.colors);
  if (!id || !name || !mode || !font || !colors) return null;
  const counterpartId =
    typeof source.counterpartId === 'string' && source.counterpartId.trim()
      ? source.counterpartId.trim().slice(0, 64)
      : undefined;
  // Палитру чистим по одному цвету и берём не больше пяти: мусор из чужой
  // ссылки не должен растягивать тему до бесконечности.
  const palette = Array.isArray(source.palette)
    ? source.palette
        .filter((color): color is string => typeof color === 'string')
        .map((color) => normalizeHex(color))
        .filter((color): color is string => color !== null)
        .slice(0, THEME_PALETTE_MAX)
    : [];
  return {
    id,
    name,
    mode,
    font,
    colors,
    ...(palette.length >= THEME_PALETTE_MIN ? { palette } : {}),
    ...(source.animated === true ? { animated: true } : {}),
    ...(counterpartId === undefined ? {} : { counterpartId }),
  };
}

function parseStoredThemes(raw: string | null): StoredThemes | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const source = parsed as Record<string, unknown>;
    const custom = Array.isArray(source.custom)
      ? source.custom
          .map((entry) => sanitizeTheme(entry))
          .filter((theme): theme is Theme => theme !== null)
          // Встроенную тему нельзя подсунуть в список своих: иначе её
          // нельзя было бы удалить, а кнопка «своя» врала бы.
          .filter((theme) => !isBuiltInTheme(theme.id))
      : [];
    const activeId =
      typeof source.activeId === 'string' &&
      (isBuiltInTheme(source.activeId) || custom.some((theme) => theme.id === source.activeId))
        ? source.activeId
        : DEFAULT_LIGHT_THEME_ID;
    return { activeId, custom };
  } catch {
    // Повреждённую запись считаем отсутствующей.
    return null;
  }
}

/**
 * Темы, сохранённые на этом устройстве для владельца.
 *
 * У каждого аккаунта своя запись. Общая остаётся запасной и достаётся
 * аккаунту, который ещё ничего не выбирал, — но только если на устройстве тем
 * вообще не настраивали. Иначе первый же вход утащил бы чужой выбор: у
 * устройства несколько аккаунтов, и они не должны перемешиваться.
 */
export function readStoredThemes(ownerId?: string | null): StoredThemes {
  const owner = ownerId?.trim();
  try {
    if (owner) {
      const raw = localStorage.getItem(themesStorageKey(owner));
      // Запись есть — она и решает: повреждённую чужой не подменяем.
      if (raw) return parseStoredThemes(raw) ?? emptyThemes();
    }
  } catch {
    return emptyThemes();
  }
  try {
    // Голая общая запись — та, что осталась от прежних версий, когда набор
    // был один на всё устройство. Она и есть «до входа ничего не выбирали».
    const shared = localStorage.getItem(THEMES_STORAGE_KEY);
    if (shared) {
      const parsed = parseStoredThemes(shared);
      if (parsed && isUntouched(parsed)) return parsed;
      if (!owner) return parsed ?? emptyThemes();
    }
    const legacy = localStorage.getItem(LEGACY_MODE_KEY);
    return {
      activeId: legacy === 'dark' ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID,
      custom: [],
    };
  } catch {
    return emptyThemes();
  }
}

/** Ничего своего не сделано: выбрана только встроенная тема. */
function isUntouched(state: StoredThemes): boolean {
  return state.custom.length === 0;
}

function emptyThemes(): StoredThemes {
  return { activeId: DEFAULT_LIGHT_THEME_ID, custom: [] };
}

export function writeStoredThemes(state: StoredThemes, ownerId?: string | null): void {
  try {
    const owner = ownerId?.trim();
    // Общая запись — для экрана входа и для прежних версий. Пишем её только
    // когда у человека ничего своего нет: иначе она превратилась бы в свалку
    // чужих наборов, из которой новый аккаунт подхватывает чужой выбор.
    if (!owner || state.custom.length === 0) {
      localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify(state));
    }
    if (owner) localStorage.setItem(themesStorageKey(owner), JSON.stringify(state));
  } catch {
    // Приватный режим или переполненное хранилище: тема просто не переживёт
    // перезагрузку, ломать из-за этого интерфейс незачем.
  }
}

/**
 * Акцент из профиля перекрывает цвет встроенных тем — там его выбирают в
 * «Моём аккаунте». У своей темы цвет задан прямо в ней, и подменять его
 * чужим значением было бы неожиданно.
 */
export function withProfileAccent(theme: Theme, accent: string | undefined): Theme {
  if (!accent || !theme.builtIn) return theme;
  const hex = normalizeHex(accent);
  if (!hex || hex === theme.colors.brand) return theme;
  // Акцент из профиля перекрывает первый цвет палитры: он и есть «акцент
  // темы». Остальные цвета градиента остаются как задумано.
  const palette = theme.palette?.map((color, index) => (index === 0 ? hex : color));
  return {
    ...theme,
    colors: { ...theme.colors, brand: hex },
    ...(palette ? { palette } : {}),
  };
}
