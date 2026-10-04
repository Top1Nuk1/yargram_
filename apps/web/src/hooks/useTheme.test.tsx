import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_THEMES, THEMES_STORAGE_KEY, hexToRgbTriplet, type Theme } from '../lib/theme';
import { useTheme } from './useTheme';

/** Прежний ключ режима — тот, что остался у людей, которые уже выбирали тему. */
const LEGACY_MODE_KEY = 'yargram.theme';

const LIGHT = BUILT_IN_THEMES[0]!;
const DARK = BUILT_IN_THEMES[1]!;

function theme(patch: Partial<Theme> = {}): Theme {
  return {
    id: 'custom-a',
    name: 'Закат',
    mode: 'light',
    font: 'system',
    colors: { ...LIGHT.colors },
    ...patch,
  };
}

function setup(accent?: string, accountId?: string) {
  return renderHook(({ accent: a, accountId: id }: { accent?: string; accountId?: string }) => useTheme(a, id), {
    initialProps: { accent, accountId },
  });
}

function stored(): { activeId: string; custom: Theme[] } {
  return JSON.parse(localStorage.getItem(THEMES_STORAGE_KEY) ?? '{}') as {
    activeId: string;
    custom: Theme[];
  };
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

describe('useTheme: включение темы', () => {
  it('на пустом хранилище включает светлую и надевает её на документ', () => {
    const { result } = setup();
    expect(result.current.theme).toBe('light');
    expect(result.current.activeTheme.id).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe(
      hexToRgbTriplet(LIGHT.colors.brand),
    );
  });

  it('подхватывает прежний выбор тёмного режима', () => {
    localStorage.setItem(LEGACY_MODE_KEY, 'dark');
    const { result } = setup();
    expect(result.current.activeTheme.id).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('включает выбранную встроенную тему', () => {
    const { result } = setup();
    act(() => result.current.activate('emerald'));
    expect(result.current.activeTheme.id).toBe('emerald');
    expect(stored().activeId).toBe('emerald');
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe(
      hexToRgbTriplet(BUILT_IN_THEMES[2]!.colors.brand),
    );
  });

  it('не принимает неизвестный идентификатор: остаётся на прежней теме', () => {
    const { result } = setup();
    act(() => result.current.activate('нет-такой'));
    // Идентификатор запомнился, но показать нечего — падать не должны.
    expect(result.current.activeTheme.id).toBe('light');
  });
});

describe('useTheme: кнопка солнце/луна', () => {
  it('уводит на парную тему и возвращает обратно', () => {
    const { result } = setup();
    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe('dark');
    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe('light');
  });

  it('у каждой встроенной темы пара уводит в свой же набор, а не в общую тему', () => {
    const { result } = setup();
    // Розовая теперь тоже парная: «солнце/луна» ведёт в «Розовую (ночь)»,
    // а не в обычную тёмную — иначе выбор человека терялся бы.
    act(() => result.current.activate('rose'));
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe('rose-night');
    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe('rose');
  });

  it('у своей темы без пары уходит на встроенную другого режима', () => {
    const { result } = setup();
    act(() => result.current.saveCustom(theme({ id: 'custom-solo', name: 'Одиночка', mode: 'light' })));
    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe(DARK.id);
  });

  it('свои светлая и тёмная темы с одним названием становятся парой', () => {
    const { result } = setup();
    act(() => result.current.saveCustom(theme({ id: 'custom-day', mode: 'light' })));
    act(() => result.current.saveCustom(theme({ id: 'custom-night', mode: 'dark' })));

    act(() => result.current.activate('custom-day'));
    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe('custom-night');

    act(() => result.current.toggleTheme());
    expect(result.current.activeTheme.id).toBe('custom-day');
  });
});

describe('useTheme: свои темы', () => {
  it('сохранённая тема попадает в список и сразу включается', () => {
    const { result } = setup();
    act(() => result.current.saveCustom(theme({ name: 'Закат' })));

    expect(result.current.customThemes).toHaveLength(1);
    expect(result.current.activeTheme.name).toBe('Закат');
    expect(result.current.themes).toHaveLength(BUILT_IN_THEMES.length + 1);
    expect(stored().activeId).toBe('custom-a');
  });

  it('повторное сохранение перезаписывает тему, а не плодит двойников', () => {
    const { result } = setup();
    act(() => result.current.saveCustom(theme({ name: 'Закат' })));
    act(() => result.current.saveCustom(theme({ name: 'Рассвет' })));

    expect(result.current.customThemes).toHaveLength(1);
    expect(result.current.activeTheme.name).toBe('Рассвет');
  });

  it('удаление включённой темы возвращает встроенную того же режима', () => {
    const { result } = setup();
    act(() => result.current.saveCustom(theme({ mode: 'dark' })));
    act(() => result.current.removeCustom('custom-a'));

    expect(result.current.customThemes).toEqual([]);
    expect(result.current.activeTheme.id).toBe(DARK.id);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('удаление темы вычищает ссылки на неё у оставшихся', () => {
    const { result } = setup();
    act(() => result.current.saveCustom(theme({ id: 'custom-a', counterpartId: 'custom-b' })));
    act(() => result.current.saveCustom(theme({ id: 'custom-b', mode: 'dark' })));
    act(() => result.current.removeCustom('custom-b'));

    expect(result.current.customThemes).toHaveLength(1);
    // Ссылка на удалённую тему вела бы кнопку солнце/луна в пустоту.
    expect(result.current.customThemes[0]?.counterpartId).toBeUndefined();
  });

  it('чужая тема приезжает с новым идентификатором и включается', () => {
    const { result } = setup();
    let added: Theme | undefined;
    act(() => {
      added = result.current.importTheme(theme({ id: 'custom-чужой', name: 'Закат' }));
    });

    expect(added?.id).not.toBe('custom-чужой');
    expect(result.current.customThemes).toHaveLength(1);
    expect(result.current.activeTheme.id).toBe(added?.id);
    expect(result.current.activeTheme.name).toBe('Закат');
  });

  it('выдаёт идентификаторы, не совпадающие между собой', () => {
    const { result } = setup();
    expect(result.current.createId()).not.toBe(result.current.createId());
  });
});

describe('useTheme: акцент из профиля', () => {
  it('перекрывает акцент встроенной темы', () => {
    const { result } = setup('#ff0000');
    expect(result.current.activeTheme.colors.brand).toBe('#ff0000');
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe('255 0 0');
  });

  it('не подменяет цвет своей темы', () => {
    const { result } = setup('#ff0000');
    act(() => result.current.saveCustom(theme({ colors: { ...LIGHT.colors, brand: '#00ff00' } })));
    expect(result.current.activeTheme.colors.brand).toBe('#00ff00');
  });
});

describe('useTheme: набор тем на каждый аккаунт', () => {
  it('запоминает выбор и возвращает его после перезагрузки', () => {
    const first = setup(undefined, 'user-1');
    act(() => first.result.current.activate('emerald'));
    first.unmount();

    const again = setup(undefined, 'user-1');
    expect(again.result.current.activeTheme.id).toBe('emerald');
  });

  it('переключение аккаунта перечитывает сохранённый набор', () => {
    const { result, rerender } = setup(undefined, 'user-1');
    act(() => result.current.activate('emerald'));

    // У второго аккаунта своя тема — она легла в хранилище раньше.
    localStorage.setItem(
      `${THEMES_STORAGE_KEY}.user-2`,
      JSON.stringify({ activeId: 'rose-night', custom: [] }),
    );
    rerender({ accent: undefined, accountId: 'user-2' });

    expect(result.current.activeTheme.id).toBe('rose-night');
    // Выбор первого аккаунта на месте: наборы не смешиваются.
    expect(JSON.parse(localStorage.getItem(`${THEMES_STORAGE_KEY}.user-1`) ?? '{}').activeId).toBe(
      'emerald',
    );
  });

  it('возврат на прежний аккаунт возвращает его тему', () => {
    const { result, rerender } = setup(undefined, 'user-1');
    act(() => result.current.activate('emerald'));

    localStorage.setItem(
      `${THEMES_STORAGE_KEY}.user-2`,
      JSON.stringify({ activeId: 'rose-night', custom: [] }),
    );
    rerender({ accent: undefined, accountId: 'user-2' });
    expect(result.current.activeTheme.id).toBe('rose-night');

    rerender({ accent: undefined, accountId: 'user-1' });
    expect(result.current.activeTheme.id).toBe('emerald');
  });

  it('свои темы тоже не переезжают к другому аккаунту', () => {
    const { result, rerender } = setup(undefined, 'user-1');
    act(() => result.current.saveCustom(theme({ id: 'custom-1' })));

    rerender({ accent: undefined, accountId: 'user-2' });
    expect(result.current.customThemes).toEqual([]);

    rerender({ accent: undefined, accountId: 'user-1' });
    expect(result.current.customThemes).toHaveLength(1);
  });

  it('без аккаунта (экран входа) работает общая запись', () => {
    const { result } = setup();
    act(() => result.current.activate('midnight'));

    expect(stored().activeId).toBe('midnight');
  });
});
