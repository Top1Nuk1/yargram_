import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_KEY } from '../../lib/i18n';
import { BUILT_IN_THEMES, THEMES_STORAGE_KEY, hexToRgbTriplet } from '../../lib/theme';
import { extractSharedTheme, themeShareLink } from '../../lib/themeShare';
import { useTheme } from '../../hooks/useTheme';
import { BUILT_IN_WALLPAPERS } from '../../lib/wallpapers';
import { ThemesScreen } from './ThemesScreen';

const LIGHT = BUILT_IN_THEMES[0]!;
const EMERALD = BUILT_IN_THEMES[2]!;

const IMPORT_PLACEHOLDER = 'https://example.com/#theme=…';

/** Экран тем живёт на настоящем `useTheme` — так проверяется вся связка целиком. */
function Harness({ onClose, onBack }: { onClose: () => void; onBack?: () => void }) {
  const controls = useTheme();
  // Обои держим здесь же: экран только просит их поставить, а помнит о выборе
  // профиль — в тесте эту роль играет маленькое состояние.
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  return (
    <ThemesScreen
      themes={controls.themes}
      customThemes={controls.customThemes}
      activeTheme={controls.activeTheme}
      onActivate={controls.activate}
      onSave={controls.saveCustom}
      onRemove={controls.removeCustom}
      onImport={controls.importTheme}
      createId={controls.createId}
      currentWallpaperUrl={wallpaperUrl}
      onApplyWallpaper={async (url) => {
        setWallpaperUrl(url);
      }}
      onClearWallpaper={async () => {
        setWallpaperUrl(null);
      }}
      onClose={onClose}
      {...(onBack === undefined ? {} : { onBack })}
    />
  );
}

function renderScreen({ withBack = true }: { withBack?: boolean } = {}) {
  const onClose = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <Harness onClose={onClose} {...(withBack ? { onBack } : {})} />,
  );
  return { ...view, onClose, onBack };
}

/** Строка темы — `div` с ролью кнопки, поэтому ищем по названию и поднимаемся. */
function row(name: string): HTMLElement {
  const element = screen.getByText(name).closest('[role="button"]');
  if (!(element instanceof HTMLElement)) throw new Error(`нет строки темы «${name}»`);
  return element;
}

function storedThemes(): { activeId: string; custom: { id: string; mode: string }[] } {
  return JSON.parse(localStorage.getItem(THEMES_STORAGE_KEY) ?? '{}') as {
    activeId: string;
    custom: { id: string; mode: string }[];
  };
}

beforeEach(() => localStorage.setItem(LANGUAGE_KEY, 'ru'));

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

describe('экран тем: список', () => {
  it('показывает встроенные темы и пустой раздел своих', () => {
    renderScreen();

    expect(screen.getByText('Встроенные')).toBeInTheDocument();
    expect(screen.getByText('Мои темы')).toBeInTheDocument();
    for (const name of ['Светлая', 'Тёмная', 'Изумруд', 'Розовая', 'Сепия', 'Полночь']) {
      expect(row(name)).toBeInTheDocument();
    }
    expect(screen.getByText(/Своих тем пока нет/)).toBeInTheDocument();
  });

  it('включает встроенную тему по нажатию на строку', () => {
    renderScreen();

    fireEvent.click(row('Изумруд'));

    expect(storedThemes().activeId).toBe('emerald');
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe(
      hexToRgbTriplet(EMERALD.colors.brand),
    );
  });

  it('у встроенных тем нет кнопок «изменить» и «удалить»', () => {
    renderScreen();
    expect(within(row('Изумруд')).queryByRole('button', { name: 'Удалить' })).toBeNull();
    expect(within(row('Изумруд')).queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('закрывается по Escape, если это верхний экран', () => {
    const { onClose } = renderScreen({ withBack: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('возвращает на список настроек, если пришли оттуда', () => {
    const { onBack, onClose } = renderScreen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('экран тем: фильтр по режиму', () => {
  /**
   * Идентификаторы тем в порядке показа. Читаем по строкам, а не по тексту:
   * заголовки групп «Светлые темы»/«Тёмные темы» мешали бы поиску по названию.
   */
  function themeIdsInOrder(): string[] {
    return screen
      .getAllByRole('button')
      .filter((element) => element.hasAttribute('data-theme-id'))
      .map((element) => element.getAttribute('data-theme-id') ?? '');
  }

  it('по умолчанию показывает и светлые, и тёмные', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Все темы' })).toHaveAttribute('aria-pressed', 'true');
    expect(row('Изумруд')).toBeInTheDocument();
    expect(row('Изумруд (ночь)')).toBeInTheDocument();
  });

  it('«Тёмные» ничего не прячет, но поднимает тёмные наверх', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Тёмные' }));

    // Обе группы на месте — фильтр только меняет порядок.
    expect(screen.getByText('Тёмные темы')).toBeInTheDocument();
    expect(screen.getByText('Светлые темы')).toBeInTheDocument();

    const ids = themeIdsInOrder();
    expect(ids).toContain('emerald');
    expect(ids).toContain('emerald-night');
    // Тёмная версия изумруда выше светлой.
    expect(ids.indexOf('emerald-night')).toBeLessThan(ids.indexOf('emerald'));
    expect(ids.indexOf('dark')).toBeLessThan(ids.indexOf('light'));
  });

  it('«Светлые» поднимает светлые наверх', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Светлые' }));

    const ids = themeIdsInOrder();
    expect(ids.indexOf('emerald')).toBeLessThan(ids.indexOf('emerald-night'));
    expect(ids.indexOf('light')).toBeLessThan(ids.indexOf('dark'));
  });

  it('«Все темы» возвращает привычные разделы', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Тёмные' }));
    fireEvent.click(screen.getByRole('button', { name: 'Все темы' }));

    expect(screen.getByText('Встроенные')).toBeInTheDocument();
    expect(screen.getByText('Мои темы')).toBeInTheDocument();
  });

  it('фильтр не мешает включать темы', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Тёмные' }));
    fireEvent.click(row('Тёмная'));

    expect(storedThemes().activeId).toBe('dark');
  });
});

describe('экран тем: создание своей темы', () => {
  it('сохраняет тему, показывает её в «Моих темах» и включает', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    expect(screen.getByText('Своя тема')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: 'Закат над морем' } });
    fireEvent.click(screen.getByText('Сохранить'));

    expect(row('Закат над морем')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Тема «Закат над морем» включена.');
    expect(storedThemes().activeId.startsWith('custom-')).toBe(true);
    expect(storedThemes().custom).toHaveLength(1);
  });

  it('пустое название заменяется на запасное, а не сохраняется пустым', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Сохранить'));

    expect(row('Моя тема')).toBeInTheDocument();
  });

  it('показывает черновик на живом интерфейсе и возвращает прежнюю тему при выходе', () => {
    renderScreen();
    fireEvent.click(row('Изумруд'));

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Акцент — HEX'), { target: { value: '#ff0000' } });
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe('255 0 0');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByText('Встроенные')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--brand')).toBe(
      hexToRgbTriplet(EMERALD.colors.brand),
    );
  });

  it('меняет цвет из палитры и сохраняет его в теме', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Фон переписки'), { target: { value: '#101820' } });
    fireEvent.click(screen.getByText('Сохранить'));

    expect(document.documentElement.style.getPropertyValue('--chat-bg')).toBe('16 24 32');
  });

  it('переключает шрифт темы', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.click(screen.getByText('Моноширинный'));
    fireEvent.click(screen.getByText('Сохранить'));

    expect(document.documentElement.style.getPropertyValue('--app-font')).toContain('monospace');
  });

  it('делает парную тёмную версию отдельной темой', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: 'Закат над морем' } });
    fireEvent.click(screen.getByText('Сделать тёмную версию'));
    expect(screen.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('Сохранить'));

    expect(storedThemes().custom[0]?.mode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('изменяет свою тему вместо создания второй', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: 'Закат над морем' } });
    fireEvent.click(screen.getByText('Сохранить'));

    fireEvent.click(within(row('Закат над морем')).getByRole('button', { name: 'Изменить' }));
    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: 'Рассвет' } });
    fireEvent.click(screen.getByText('Сохранить'));

    expect(storedThemes().custom).toHaveLength(1);
    expect(row('Рассвет')).toBeInTheDocument();
  });
});

describe('экран тем: удаление', () => {
  it('спрашивает подтверждение и удаляет тему', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: 'Закат над морем' } });
    fireEvent.click(screen.getByText('Сохранить'));

    fireEvent.click(within(row('Закат над морем')).getByRole('button', { name: 'Удалить' }));
    const footer = screen.getByText('Удалить тему «Закат над морем»?').closest('footer');
    expect(footer).not.toBeNull();
    fireEvent.click(within(footer as HTMLElement).getByText('Удалить'));

    expect(storedThemes().custom).toEqual([]);
    expect(screen.getByText(/Своих тем пока нет/)).toBeInTheDocument();
    expect(storedThemes().activeId).toBe(LIGHT.id);
  });

  it('отмена оставляет тему на месте', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Создать тему'));
    fireEvent.change(screen.getByLabelText('Название темы'), { target: { value: 'Закат над морем' } });
    fireEvent.click(screen.getByText('Сохранить'));
    fireEvent.click(within(row('Закат над морем')).getByRole('button', { name: 'Удалить' }));
    fireEvent.click(screen.getByText('Отмена'));

    expect(storedThemes().custom).toHaveLength(1);
    expect(row('Закат над морем')).toBeInTheDocument();
  });
});

describe('экран тем: обмен по ссылке', () => {
  it('показывает ссылку с темой внутри', () => {
    renderScreen();

    fireEvent.click(within(row('Изумруд')).getByRole('button', { name: 'Поделиться' }));

    // Заголовок окна назван так же, поэтому берём именно поле ввода.
    const field = screen.getByRole('textbox', { name: 'Ссылка на тему' }) as HTMLInputElement;
    expect(field.value).toContain('#theme=');
    // Ссылка несёт саму тему: по ней её и восстановят.
    expect(extractSharedTheme(field.value)?.colors).toEqual(EMERALD.colors);
  });

  it('добавляет тему из ссылки и включает её', () => {
    renderScreen();
    const link = themeShareLink(
      { ...LIGHT, id: 'custom-1', name: 'Закат над морем', mode: 'dark' },
      'https://example.com',
    );

    fireEvent.click(screen.getByText('Добавить по ссылке'));
    fireEvent.change(screen.getByPlaceholderText(IMPORT_PLACEHOLDER), { target: { value: link } });
    fireEvent.click(screen.getByText('Добавить'));

    expect(row('Закат над морем')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Тема «Закат над морем» добавлена.');
    expect(storedThemes().activeId.startsWith('custom-')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('на мусоре объясняет, что это не ссылка', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Добавить по ссылке'));
    fireEvent.change(screen.getByPlaceholderText(IMPORT_PLACEHOLDER), {
      target: { value: 'просто текст' },
    });
    fireEvent.click(screen.getByText('Добавить'));

    expect(screen.getByRole('alert')).toHaveTextContent('Это не похоже на ссылку с темой.');
    expect(storedThemes().custom).toEqual([]);
  });

  it('возвращает из «Добавить по ссылке» обратно в список', () => {
    renderScreen();

    fireEvent.click(screen.getByText('Добавить по ссылке'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByText('Встроенные')).toBeInTheDocument();
  });
});

describe('экран тем: обои для чата', () => {
  /** Вкладка «Обои» — вторая в шапке списка. */
  function openWallpapers() {
    renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: 'Обои' }));
  }

  function wallpaperButton(id: string): HTMLElement {
    const element = document.querySelector(`[data-wallpaper-id="${id}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`нет обоев «${id}»`);
    return element;
  }

  /** Кнопка «Без обоев»: её текст совпадает с сообщением, поэтому ищем по атрибуту. */
  function clearButton(): HTMLElement | null {
    return document.querySelector('[data-wallpaper-clear]');
  }

  it('во вкладке «Темы» обоев не видно', () => {
    renderScreen();

    expect(screen.getByRole('tab', { name: 'Темы' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-wallpaper-id]')).toBeNull();
  });

  it('показывает все встроенные обои', () => {
    openWallpapers();

    for (const wallpaper of BUILT_IN_WALLPAPERS) {
      expect(wallpaperButton(wallpaper.id)).toBeInTheDocument();
    }
  });

  it('раскладывает обои на светлые и тёмные полки', () => {
    openWallpapers();

    expect(screen.getByText('Светлые')).toBeInTheDocument();
    expect(screen.getByText('Тёмные')).toBeInTheDocument();
    // Тёмная плитка — свой файл, и в названии это видно: цвета у палитр одни и те же.
    expect(wallpaperButton('wallpaper-blue-dark')).toBeInTheDocument();
    expect(screen.getByText('Синие (тёмные)')).toBeInTheDocument();
  });

  it('тёмные обои ставят тёмный файл, а не светлый', () => {
    openWallpapers();

    fireEvent.click(wallpaperButton('wallpaper-sunset-dark'));

    expect(wallpaperButton('wallpaper-sunset-dark')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Обои «Закат (тёмные)» включены.');
    // Светлая плитка того же цвета остаётся невыбранной: это разные картинки.
    expect(wallpaperButton('wallpaper-sunset')).toHaveAttribute('aria-pressed', 'false');
  });

  it('ставит обои по нажатию и отмечает их выбранными', () => {
    openWallpapers();
    const first = BUILT_IN_WALLPAPERS[0]!;

    fireEvent.click(wallpaperButton(first.id));

    expect(wallpaperButton(first.id)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Обои «Синие» включены.');
  });

  it('кнопка «Без обоев» появляется только когда обои стоят', () => {
    openWallpapers();
    expect(clearButton()).toBeNull();

    fireEvent.click(wallpaperButton(BUILT_IN_WALLPAPERS[1]!.id));
    expect(clearButton()).toBeInTheDocument();

    fireEvent.click(clearButton()!);
    expect(clearButton()).toBeNull();
    expect(wallpaperButton(BUILT_IN_WALLPAPERS[1]!.id)).toHaveAttribute('aria-pressed', 'false');
  });

  it('переключение вкладки не сбрасывает уже выбранные обои', () => {
    openWallpapers();
    const first = BUILT_IN_WALLPAPERS[0]!;
    fireEvent.click(wallpaperButton(first.id));

    fireEvent.click(screen.getByRole('tab', { name: 'Темы' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Обои' }));

    expect(wallpaperButton(first.id)).toHaveAttribute('aria-pressed', 'true');
  });
});
