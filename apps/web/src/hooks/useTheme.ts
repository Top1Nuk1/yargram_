import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILT_IN_THEMES,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  applyTheme,
  readStoredThemes,
  themeById,
  withProfileAccent,
  writeStoredThemes,
  type StoredThemes,
  type Theme,
} from '../lib/theme';
import { newThemeId } from '../lib/themeShare';

/**
 * Тема приложения: какая включена, какие человек сделал сам.
 *
 * Режим (светлая/тёмная) больше не отдельная настройка, а свойство темы: раньше
 * их было ровно две, и переключателя хватало. Теперь тем сколько угодно, а
 * кнопка солнце/луна осталась — она уводит на парную тему (`counterpartId`), а
 * если пары нет, на встроенную тему другого режима.
 *
 * @param profileAccent цвет из «Моего аккаунта»: он перекрывает акцент
 *   встроенных тем (у своих тем цвет задан прямо в теме).
 * @param accountId владелец набора. Устройство помнит несколько аккаунтов, и
 *   набор тем у каждого свой: переключение аккаунта перечитывает хранилище.
 *   Пусто — экран входа, там тема общая.
 */
export function useTheme(profileAccent?: string, accountId?: string | null) {
  const owner = accountId?.trim() ?? '';
  const [state, setState] = useState<StoredThemes>(() => readStoredThemes(owner));

  // Аккаунт сменился — берём сохранённый набор нового владельца. Смена
  // происходит прямо во время отрисовки: если её отложить до эффекта, один
  // кадр успел бы записать чужой набор в хранилище нового аккаунта.
  const previousOwner = useRef(owner);
  if (previousOwner.current !== owner) {
    previousOwner.current = owner;
    setState(readStoredThemes(owner));
  }

  const activeTheme = useMemo(
    () => withProfileAccent(themeById(state.activeId, state.custom), profileAccent),
    [state.activeId, state.custom, profileAccent],
  );

  const themes = useMemo(() => [...BUILT_IN_THEMES, ...state.custom], [state.custom]);

  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    writeStoredThemes(state, owner);
  }, [state, owner]);

  const activate = useCallback((id: string) => {
    setState((current) => (current.activeId === id ? current : { ...current, activeId: id }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((current) => {
      const active = themeById(current.activeId, current.custom);
      const declared = active.counterpartId;
      const counterpart =
        // Пара может быть и своей темой, и встроенной.
        (declared ? current.custom.find((theme) => theme.id === declared) : undefined) ??
        (declared ? BUILT_IN_THEMES.find((theme) => theme.id === declared) : undefined) ??
        // Пара не объявлена — ищем свою же тему с тем же названием в другом
        // режиме: так ведут себя темы, сделанные кнопкой «сделать парную».
        current.custom.find(
          (theme) => theme.id !== active.id && theme.name === active.name && theme.mode !== active.mode,
        ) ??
        BUILT_IN_THEMES.find(
          (theme) => theme.id === (active.mode === 'dark' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_DARK_THEME_ID),
        );
      return counterpart ? { ...current, activeId: counterpart.id } : current;
    });
  }, []);

  /** Создаёт или перезаписывает свою тему и сразу включает её. */
  const saveCustom = useCallback((theme: Theme) => {
    setState((current) => {
      const exists = current.custom.some((entry) => entry.id === theme.id);
      return {
        activeId: theme.id,
        custom: exists
          ? current.custom.map((entry) => (entry.id === theme.id ? theme : entry))
          : [...current.custom, theme],
      };
    });
  }, []);

  const removeCustom = useCallback((id: string) => {
    setState((current) => {
      const removed = current.custom.find((theme) => theme.id === id);
      if (!removed) return current;
      return {
        // Удалённая тема не может остаться включённой: уходим на встроенную
        // того же режима, чтобы интерфейс не переключился со светлого на тёмный.
        activeId:
          current.activeId === id
            ? removed.mode === 'dark'
              ? DEFAULT_DARK_THEME_ID
              : DEFAULT_LIGHT_THEME_ID
            : current.activeId,
        // Ссылку на удалённую тему у оставшихся чистим: иначе кнопка
        // солнце/луна вела бы в пустоту.
        custom: current.custom
          .filter((theme) => theme.id !== id)
          .map((theme) => (theme.counterpartId === id ? withoutCounterpart(theme) : theme)),
      };
    });
  }, []);

  /** Добавляет чужую тему. Идентификатор всегда новый: он был чужой. */
  const importTheme = useCallback((theme: Theme): Theme => {
    const imported: Theme = { ...theme, id: newThemeId() };
    setState((current) => ({
      activeId: imported.id,
      custom: [...current.custom, imported],
    }));
    return imported;
  }, []);

  const createId = useCallback(() => newThemeId(), []);

  return {
    /** Режим активной темы — для кнопок солнце/луна. */
    theme: activeTheme.mode,
    activeTheme,
    themes,
    customThemes: state.custom,
    toggleTheme,
    activate,
    saveCustom,
    removeCustom,
    importTheme,
    createId,
  };
}

/** Всё, что нужно экрану тем: список, включённая тема и действия над ними. */
export type ThemeControls = ReturnType<typeof useTheme>;

function withoutCounterpart(theme: Theme): Theme {
  return {
    id: theme.id,
    name: theme.name,
    mode: theme.mode,
    font: theme.font,
    colors: theme.colors,
    ...(theme.nameKey === undefined ? {} : { nameKey: theme.nameKey }),
    ...(theme.palette === undefined ? {} : { palette: theme.palette }),
    ...(theme.animated === undefined ? {} : { animated: theme.animated }),
    ...(theme.builtIn === undefined ? {} : { builtIn: theme.builtIn }),
  };
}
