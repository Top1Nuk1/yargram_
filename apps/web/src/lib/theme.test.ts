import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEMES,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  THEME_COLOR_KEYS,
  THEMES_STORAGE_KEY,
  applyTheme,
  deriveCounterpartColors,
  groupThemesByFilter,
  hexToRgbTriplet,
  isBuiltInTheme,
  isHexColor,
  normalizeHex,
  readStoredThemes,
  sanitizeTheme,
  shiftLightness,
  themeById,
  themeToCssVariables,
  themesStorageKey,
  withLightness,
  withProfileAccent,
  writeStoredThemes,
  type Theme,
} from './theme';

/** Прежний ключ режима: в нём лежало только `'light' | 'dark'`. */
const LEGACY_MODE_KEY = 'yargram.theme';

const LIGHT = BUILT_IN_THEMES[0]!;
const DARK = BUILT_IN_THEMES[1]!;
const EMERALD = BUILT_IN_THEMES[2]!;

/** Каналы цвета числами — так проверки читаются без магии. */
function channels(value: string): [number, number, number] {
  const [r, g, b] = hexToRgbTriplet(value).split(' ').map(Number);
  return [r ?? 0, g ?? 0, b ?? 0];
}

/** Средняя яркость: для «светлее/темнее» этого достаточно и это независимо от HSL. */
function luminance(value: string): number {
  const [r, g, b] = channels(value);
  return (r + g + b) / 3;
}

function customTheme(patch: Partial<Theme> = {}): Theme {
  return {
    id: 'custom-1',
    name: 'Закат',
    mode: 'dark',
    font: 'serif',
    colors: { ...DARK.colors },
    ...patch,
  };
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe('normalizeHex', () => {
  it('разворачивает короткую запись и приводит к нижнему регистру', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex('  #3390EC  ')).toBe('#3390ec');
  });

  it('отказывается от всего, что не цвет', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#1234567')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('rgb(1,2,3)')).toBeNull();
    expect(isHexColor('красный')).toBe(false);
    expect(isHexColor('#3390ec')).toBe(true);
  });
});

describe('hexToRgbTriplet', () => {
  it('переводит цвет в вид, который читают CSS-переменные', () => {
    expect(hexToRgbTriplet('#3390ec')).toBe('51 144 236');
    expect(hexToRgbTriplet('#fff')).toBe('255 255 255');
    expect(hexToRgbTriplet('#000000')).toBe('0 0 0');
  });

  it('на мусоре отдаёт чёрный, а не NaN', () => {
    expect(hexToRgbTriplet('не цвет')).toBe('0 0 0');
  });
});

describe('светлота', () => {
  it('withLightness ставит заданную светлоту и сохраняет цвет', () => {
    const softened = withLightness('#3390ec', 0.9);
    // Тон остался синим: голубой канал по-прежнему самый сильный.
    const [r, , b] = channels(softened);
    expect(b).toBeGreaterThan(r);
    expect(luminance(softened)).toBeGreaterThan(luminance('#3390ec'));
  });

  it('shiftLightness затемняет акцент, оставляя его узнаваемым', () => {
    const strong = shiftLightness('#3390ec', -0.08);
    const [r, , b] = channels(strong);
    expect(luminance(strong)).toBeLessThan(luminance('#3390ec'));
    expect(b).toBeGreaterThan(r);
  });

  it('не выходит за границы: белый и чёрный остаются собой', () => {
    expect(shiftLightness('#ffffff', 0.5)).toBe('#ffffff');
    expect(shiftLightness('#000000', -0.5)).toBe('#000000');
    expect(withLightness('#3390ec', 2)).toBe(withLightness('#3390ec', 1));
  });
});

describe('deriveCounterpartColors', () => {
  it('пересчитывает все роли палитры и не теряет ни одной', () => {
    const dark = deriveCounterpartColors(LIGHT.colors, 'dark');
    expect(Object.keys(dark).sort()).toEqual([...THEME_COLOR_KEYS].sort());
    for (const key of THEME_COLOR_KEYS) expect(isHexColor(dark[key])).toBe(true);
  });

  it('из светлой темы делает тёмную: фон темнеет, текст светлеет', () => {
    const dark = deriveCounterpartColors(LIGHT.colors, 'dark');
    expect(luminance(dark.canvas)).toBeLessThan(luminance(LIGHT.colors.canvas));
    expect(luminance(dark.ink)).toBeGreaterThan(luminance(LIGHT.colors.ink));
    expect(luminance(dark.ink)).toBeGreaterThan(luminance(dark.canvas));
  });

  it('из тёмной темы делает светлую — то же правило в обратную сторону', () => {
    const light = deriveCounterpartColors(DARK.colors, 'light');
    expect(luminance(light.canvas)).toBeGreaterThan(luminance(DARK.colors.canvas));
    expect(luminance(light.ink)).toBeLessThan(luminance(DARK.colors.ink));
    expect(luminance(light.canvas)).toBeGreaterThan(luminance(light.ink));
  });

  it('сохраняет тон: акцент остаётся того же цвета, меняется только светлота', () => {
    const [r, , b] = channels(deriveCounterpartColors(LIGHT.colors, 'dark').brand);
    expect(b).toBeGreaterThan(r);
  });

  it('детерминирован: одна палитра даёт один результат', () => {
    expect(deriveCounterpartColors(LIGHT.colors, 'dark')).toEqual(
      deriveCounterpartColors(LIGHT.colors, 'dark'),
    );
  });
});

describe('themeToCssVariables', () => {
  it('отдаёт все переменные интерфейса и шрифт', () => {
    const variables = themeToCssVariables(LIGHT);
    expect(variables['--brand']).toBe('51 144 236');
    expect(variables['--brand-strong']).not.toBe(variables['--brand']);
    expect(variables['--app-font']).toContain('Inter');
    // Роли + производные (`--brand-strong`) + шрифт + палитра градиента
    // + скорость перелива.
    expect(Object.keys(variables)).toHaveLength(THEME_COLOR_KEYS.length + 4);
  });

  it('шрифт всегда единый системный для всех тем', () => {
    expect(themeToCssVariables({ ...LIGHT, font: 'mono' })['--app-font']).toContain('Inter');
  });

  it('палитра градиента собирается из темы как список цветов', () => {
    const themed = { ...LIGHT, palette: ['#ff0000', '#00ff00', '#0000ff'] };
    const variables = themeToCssVariables(themed);
    expect(variables['--theme-palette']).toBe('rgb(255 0 0), rgb(0 255 0), rgb(0 0 255)');
  });

  it('без палитры градиент строится из акцента и второго цвета', () => {
    const variables = themeToCssVariables(LIGHT);
    expect(variables['--theme-palette']).toBe(
      `rgb(${hexToRgbTriplet(LIGHT.colors.brand)}), rgb(${hexToRgbTriplet(LIGHT.colors.accent)})`,
    );
  });

  it('перелив выключен — скорость нулевая', () => {
    expect(themeToCssVariables(LIGHT)['--theme-flow']).toBe('0s');
    expect(themeToCssVariables({ ...LIGHT, animated: true })['--theme-flow']).not.toBe('0s');
  });
});

describe('applyTheme', () => {
  it('включает тёмный режим классом и ставит переменные прямо на документ', () => {
    applyTheme(DARK);
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--brand')).toBe(hexToRgbTriplet(DARK.colors.brand));
    expect(root.style.getPropertyValue('--chat-bg')).toBe(hexToRgbTriplet(DARK.colors.chatBg));
  });

  it('снимает тёмный режим при возврате к светлой теме', () => {
    applyTheme(DARK);
    applyTheme(LIGHT);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe(
      hexToRgbTriplet(LIGHT.colors.brand),
    );
  });

  it('красит строку браузера: тёмная — панелью, светлая — акцентом', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);

    applyTheme(DARK);
    expect(meta.getAttribute('content')).toBe(DARK.colors.surface);
    applyTheme(LIGHT);
    expect(meta.getAttribute('content')).toBe(LIGHT.colors.brand);
  });

  it('работает и на чужом корне — редактор так показывает черновик', () => {
    const host = document.createElement('div');
    applyTheme(EMERALD, host);
    expect(host.style.getPropertyValue('--brand')).toBe(hexToRgbTriplet(EMERALD.colors.brand));
    expect(host.classList.contains('dark')).toBe(false);
  });
});

describe('sanitizeTheme', () => {
  it('принимает годную тему и приводит цвета к нижнему регистру', () => {
    const theme = sanitizeTheme({ ...customTheme(), colors: { ...DARK.colors, ink: '#EBF2F8' } });
    expect(theme).not.toBeNull();
    expect(theme?.colors.ink).toBe('#ebf2f8');
    expect(theme?.id).toBe('custom-1');
  });

  it('отбрасывает тему целиком, если хоть один цвет не цвет', () => {
    expect(sanitizeTheme({ ...customTheme(), colors: { ...DARK.colors, line: 'нет' } })).toBeNull();
    const partial: Record<string, string> = { ...DARK.colors };
    delete partial.canvas;
    expect(sanitizeTheme({ ...customTheme(), colors: partial })).toBeNull();
  });

  it('отказывается от незнакомого режима или шрифта', () => {
    expect(sanitizeTheme({ ...customTheme(), mode: 'серый' })).toBeNull();
    expect(sanitizeTheme({ ...customTheme(), font: 'comic' })).toBeNull();
  });

  it('отказывается от темы без названия и без идентификатора', () => {
    expect(sanitizeTheme({ ...customTheme(), name: '   ' })).toBeNull();
    expect(sanitizeTheme({ ...customTheme(), id: '' })).toBeNull();
    expect(sanitizeTheme('строка вместо темы')).toBeNull();
    expect(sanitizeTheme(null)).toBeNull();
  });

  it('обрезает длинные поля, чтобы чужой файл не раздул хранилище', () => {
    const theme = sanitizeTheme({ ...customTheme(), name: 'я'.repeat(200) });
    expect(theme?.name).toHaveLength(60);
  });

  it('не помечает разобранную тему встроенной', () => {
    // Иначе чужую тему нельзя было бы удалить.
    expect(sanitizeTheme({ ...customTheme(), builtIn: true })?.builtIn).toBeUndefined();
  });
});

describe('readStoredThemes', () => {
  it('на пустом хранилище включает светлую тему', () => {
    expect(readStoredThemes()).toEqual({ activeId: DEFAULT_LIGHT_THEME_ID, custom: [] });
  });

  it('подхватывает прежний выбор режима, чтобы он не потерялся', () => {
    localStorage.setItem(LEGACY_MODE_KEY, 'dark');
    expect(readStoredThemes().activeId).toBe(DEFAULT_DARK_THEME_ID);
  });

  it('читает свои темы и включённую тему', () => {
    localStorage.setItem(
      THEMES_STORAGE_KEY,
      JSON.stringify({ activeId: 'custom-1', custom: [customTheme()] }),
    );
    const stored = readStoredThemes();
    expect(stored.activeId).toBe('custom-1');
    expect(stored.custom).toHaveLength(1);
    expect(stored.custom[0]?.name).toBe('Закат');
  });

  it('не пускает встроенную тему в список своих', () => {
    localStorage.setItem(
      THEMES_STORAGE_KEY,
      JSON.stringify({ activeId: DEFAULT_LIGHT_THEME_ID, custom: [{ ...customTheme(), id: 'light' }] }),
    );
    const stored = readStoredThemes();
    expect(stored.custom).toEqual([]);
    expect(stored.activeId).toBe(DEFAULT_LIGHT_THEME_ID);
  });

  it('уводит на светлую тему, если включённая исчезла', () => {
    localStorage.setItem(
      THEMES_STORAGE_KEY,
      JSON.stringify({ activeId: 'custom-нет-такой', custom: [customTheme()] }),
    );
    expect(readStoredThemes().activeId).toBe(DEFAULT_LIGHT_THEME_ID);
  });

  it('переживает испорченное хранилище', () => {
    localStorage.setItem(THEMES_STORAGE_KEY, '{это не json');
    expect(readStoredThemes()).toEqual({ activeId: DEFAULT_LIGHT_THEME_ID, custom: [] });
  });

  it('выбор переживает перезагрузку и уходит в свою запись аккаунта', () => {
    writeStoredThemes({ activeId: 'emerald', custom: [] }, 'user-1');

    expect(readStoredThemes('user-1').activeId).toBe('emerald');
    expect(localStorage.getItem(themesStorageKey('user-1'))).toBeTruthy();
  });

  it('у каждого аккаунта устройства свой набор тем', () => {
    writeStoredThemes({ activeId: 'emerald', custom: [] }, 'user-1');
    writeStoredThemes({ activeId: 'rose-night', custom: [] }, 'user-2');

    expect(readStoredThemes('user-1').activeId).toBe('emerald');
    expect(readStoredThemes('user-2').activeId).toBe('rose-night');
    // Общая запись — для экрана входа, она остаётся от последнего выбора.
    expect(readStoredThemes().activeId).toBe('rose-night');
  });

  it('новый аккаунт начинает с темы, настроенной на устройстве', () => {
    localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify({ activeId: 'emerald', custom: [] }));

    expect(readStoredThemes('совсем-новый').activeId).toBe('emerald');
  });

  it('свои темы из общей записи чужому аккаунту не достаются', () => {
    writeStoredThemes({ activeId: 'custom-1', custom: [customTheme()] }, 'user-1');

    // Общая запись теперь держит только выбор без своих тем.
    expect(readStoredThemes('user-2')).toEqual({ activeId: DEFAULT_LIGHT_THEME_ID, custom: [] });
  });

  it('битая запись аккаунта не подменяется чужой', () => {
    localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify({ activeId: 'emerald', custom: [] }));
    localStorage.setItem(themesStorageKey('user-1'), '{это не json');

    expect(readStoredThemes('user-1').activeId).toBe(DEFAULT_LIGHT_THEME_ID);
  });

  it('своя запись аккаунта важнее общей', () => {
    localStorage.setItem(THEMES_STORAGE_KEY, JSON.stringify({ activeId: 'emerald', custom: [] }));
    writeStoredThemes({ activeId: 'rose-night', custom: [] }, 'user-1');

    expect(readStoredThemes('user-1').activeId).toBe('rose-night');
  });

  it('ключ набора зависит от владельца, а без него — общий', () => {
    expect(themesStorageKey()).toBe(THEMES_STORAGE_KEY);
    expect(themesStorageKey('   ')).toBe(THEMES_STORAGE_KEY);
    expect(themesStorageKey('user-1')).toBe(`${THEMES_STORAGE_KEY}.user-1`);
  });
});

describe('themeById', () => {
  it('находит встроенную и свою тему', () => {
    expect(themeById('emerald', []).id).toBe('emerald');
    expect(themeById('custom-1', [customTheme()]).name).toBe('Закат');
  });

  it('на неизвестном идентификаторе отдаёт светлую, а не падает', () => {
    expect(themeById('нет-такой', []).id).toBe(DEFAULT_LIGHT_THEME_ID);
  });

  it('различает встроенные темы по идентификатору', () => {
    expect(isBuiltInTheme('midnight')).toBe(true);
    expect(isBuiltInTheme('custom-1')).toBe(false);
  });

  it('у каждой встроенной темы есть ключ перевода названия', () => {
    for (const theme of BUILT_IN_THEMES) expect(theme.nameKey).toBeTruthy();
  });

  it('у каждой встроенной темы есть пара в другом режиме', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.counterpartId).toBeTruthy();
      const pair = BUILT_IN_THEMES.find((entry) => entry.id === theme.counterpartId);
      expect(pair).toBeDefined();
      // Пара обязана быть другого режима и ссылаться обратно: иначе кнопка
      // солнце/луна либо не переключала бы режим, либо вела в одну сторону.
      expect(pair?.mode).not.toBe(theme.mode);
      expect(pair?.counterpartId).toBe(theme.id);
    }
  });

  it('идентификаторы встроенных тем не повторяются', () => {
    const ids = BUILT_IN_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('groupThemesByFilter', () => {
  const themes = [
    { id: 'a', mode: 'light' as const },
    { id: 'b', mode: 'dark' as const },
    { id: 'c', mode: 'light' as const },
    { id: 'd', mode: 'dark' as const },
  ];

  it('«все» ничего не прячет и не группирует', () => {
    expect(groupThemesByFilter(themes, 'all')).toEqual([]);
  });

  it('выбранный режим идёт первым, второй — следом', () => {
    const dark = groupThemesByFilter(themes, 'dark');
    expect(dark.map((group) => group.mode)).toEqual(['dark', 'light']);
    expect(dark[0]!.themes.map((theme) => theme.id)).toEqual(['b', 'd']);
    expect(dark[1]!.themes.map((theme) => theme.id)).toEqual(['a', 'c']);
  });

  it('сохраняет порядок внутри группы', () => {
    const light = groupThemesByFilter(themes, 'light');
    expect(light[0]!.themes.map((theme) => theme.id)).toEqual(['a', 'c']);
  });

  it('пустую группу не показывает', () => {
    const onlyLight = [{ id: 'a', mode: 'light' as const }];
    expect(groupThemesByFilter(onlyLight, 'dark')).toEqual([
      { mode: 'light', themes: onlyLight },
    ]);
  });
});

describe('withProfileAccent', () => {
  it('акцент из профиля перекрывает цвет встроенной темы', () => {
    const themed = withProfileAccent(LIGHT, '#ff0000');
    expect(themed.colors.brand).toBe('#ff0000');
    // Остальная палитра не тронута.
    expect(themed.colors.surface).toBe(LIGHT.colors.surface);
  });

  it('короткую запись тоже понимает', () => {
    expect(withProfileAccent(LIGHT, '#f00').colors.brand).toBe('#ff0000');
  });

  it('свою тему не подменяет: там цвет задан прямо в теме', () => {
    const mine = customTheme();
    expect(withProfileAccent(mine, '#ff0000')).toBe(mine);
  });

  it('не трогает тему, если акцент пуст, совпадает или не является цветом', () => {
    expect(withProfileAccent(LIGHT, undefined)).toBe(LIGHT);
    expect(withProfileAccent(LIGHT, LIGHT.colors.brand)).toBe(LIGHT);
    expect(withProfileAccent(LIGHT, 'красный')).toBe(LIGHT);
  });
});
