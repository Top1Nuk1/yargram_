import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Link2, Pencil, Plus, Share2, Trash2, X } from 'lucide-react';
import { useTranslation } from '../../hooks/useLanguage';
import {
  COLOR_LABEL_KEYS,
  FONT_LABEL_KEYS,
  THEME_COLOR_KEYS,
  THEME_FILTERS,
  THEME_FILTER_LABEL_KEYS,
  THEME_FONTS,
  THEME_PALETTE_MAX,
  THEME_PALETTE_MIN,
  applyTheme,
  deriveCounterpartColors,
  deriveCounterpartPalette,
  groupThemesByFilter,
  normalizeHex,
  themePalette,
  type Theme,
  type ThemeColors,
  type ThemeFilter,
  type ThemeFont,
} from '../../lib/theme';
import { copyText, extractSharedTheme, themeShareLink } from '../../lib/themeShare';
import { BUILT_IN_WALLPAPERS } from '../../lib/wallpapers';
import { imageTileLabel, type ImageVariant } from '../../lib/yargramImages';

/** Порядок полок в галерее обоев: светлые сверху, тёмные ниже. */
const WALLPAPER_VARIANTS: ImageVariant[] = ['light', 'dark'];

interface ThemesScreenProps {
  themes: Theme[];
  customThemes: Theme[];
  activeTheme: Theme;
  onActivate: (id: string) => void;
  onSave: (theme: Theme) => void;
  onRemove: (id: string) => void;
  /** Добавляет чужую тему и возвращает её — нужно, чтобы показать название. */
  onImport: (theme: Theme) => Theme;
  createId: () => string;
  /**
   * Текущий фон чата — по нему отмечаем активный. Не задан: встроенных обоев
   * не выбрано, чат работает со своим фоном по умолчанию.
   */
  currentWallpaperUrl?: string | null;
  /** Поставить выбранную встроенную картинку как фон чата. */
  onApplyWallpaper: (url: string) => Promise<void> | void;
  /** Снять фон: вернуть чат к стандартному заполнению. */
  onClearWallpaper: () => Promise<void> | void;
  /** Текущий цвет акцента интерфейса (Telegram палитра). */
  currentColor?: string;
  /** Смена цвета акцента всего интерфейса. */
  onChangeAccentColor?: (color: string) => Promise<void> | void;
  /**
   * Стрелка «назад»: вернуться на экран, откуда пришли (список настроек).
   * Не задана — стрелка работает как закрытие.
   */
  onBack?: (() => void) | undefined;
  onClose: () => void;
}

type View = 'list' | 'editor' | 'import' | 'share';

const ACCENT_COLOR_PRESETS = [
  { name: 'Синий', color: '#3390ec' },
  { name: 'Бирюзовый', color: '#28b4a4' },
  { name: 'Зелёный', color: '#4fae4e' },
  { name: 'Оранжевый', color: '#e26c2e' },
  { name: 'Красный', color: '#d14949' },
  { name: 'Фиолетовый', color: '#8559cf' },
  { name: 'Розовый', color: '#d34e87' },
];

/**
 * Экран «Темы».
 *
 * Сверху встроенные наборы, ниже — свои. Свою тему можно собрать с нуля или
 * получить по ссылке. Пока открыт редактор, черновик применяется ко всему
 * интерфейсу сразу: отдельного окошка предпросмотра нет, потому что лучший
 * предпросмотр темы — сам интерфейс. При выходе без сохранения возвращается
 * прежняя тема.
 */
export function ThemesScreen({
  themes,
  customThemes,
  activeTheme,
  onActivate,
  onSave,
  onRemove,
  onImport,
  createId,
  currentWallpaperUrl,
  onApplyWallpaper,
  onClearWallpaper,
  currentColor,
  onChangeAccentColor,
  onBack,
  onClose,
}: ThemesScreenProps) {
  const t = useTranslation();
  const [view, setView] = useState<View>('list');
  /** Вкладка основного списка: темы или обои для чата. */
  const [listTab, setListTab] = useState<'themes' | 'wallpapers'>('themes');
  const [draft, setDraft] = useState<Theme | null>(null);
  const [shareTheme, setShareTheme] = useState<Theme | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  /** Фильтр по режиму: «Все» ничего не прячет, «Светлые»/«Тёмные» поднимают
   *  выбранные наверх, а остальные оставляют ниже — так ничего не теряется. */
  const [filter, setFilter] = useState<ThemeFilter>('all');
  /** Что человек набрал в поле HEX, пока строка ещё не стала цветом. */
  const [hexText, setHexText] = useState<Partial<Record<keyof ThemeColors, string>>>({});

  const builtIn = useMemo(() => themes.filter((theme) => theme.builtIn), [themes]);

  /**
   * Группы для показа. Без фильтра — две привычные полки (встроенные и свои);
   * с фильтром — по режимам, и выбранный режим идёт первым.
   */
  const sections = useMemo(() => {
    if (filter === 'all') {
      return [
        { key: 'builtIn' as const, label: t('themes.builtIn'), themes: builtIn },
        { key: 'mine' as const, label: t('themes.mine'), themes: customThemes },
      ];
    }
    return groupThemesByFilter([...builtIn, ...customThemes], filter).map((group) => ({
      key: group.mode,
      label: group.mode === 'dark' ? t('themes.sectionDark') : t('themes.sectionLight'),
      themes: group.themes,
    }));
  }, [filter, builtIn, customThemes, t]);

  const shareLink = useMemo(
    () => (shareTheme ? themeShareLink(shareTheme) : ''),
    [shareTheme],
  );

  const title =
    view === 'editor'
      ? t('themes.editorTitle')
      : view === 'import'
        ? t('themes.import')
        : view === 'share'
          ? t('themes.shareTitle')
          : t('themes.title');

  const leave = onBack ?? onClose;

  /**
   * Живой предпросмотр: черновик надевается на документ, пока открыт редактор.
   * Уборка возвращает включённую тему — иначе выход без сохранения оставил бы
   * интерфейс в цветах, которые человек только примерял.
   */
  useEffect(() => {
    if (view !== 'editor' || !draft) return undefined;
    applyTheme(draft);
    return () => applyTheme(activeTheme);
  }, [view, draft, activeTheme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (view !== 'list') {
        setView('list');
        return;
      }
      leave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, leave]);

  function themeName(theme: Theme): string {
    return theme.nameKey ? t(theme.nameKey) : theme.name;
  }

  function startCreate() {
    setHexText({});
    setDraft({
      id: createId(),
      name: t('themes.newName'),
      mode: activeTheme.mode,
      font: activeTheme.font,
      colors: { ...activeTheme.colors },
      palette: [...themePalette(activeTheme)],
      animated: activeTheme.animated === true,
    });
    setView('editor');
  }

  function startEdit(theme: Theme) {
    setHexText({});
    setDraft({
      id: theme.id,
      name: theme.name,
      mode: theme.mode,
      font: theme.font,
      colors: { ...theme.colors },
      palette: [...themePalette(theme)],
      animated: theme.animated === true,
      ...(theme.counterpartId === undefined ? {} : { counterpartId: theme.counterpartId }),
    });
    setView('editor');
  }

  function setColor(key: keyof ThemeColors, value: string) {
    setDraft((current) => (current ? { ...current, colors: { ...current.colors, [key]: value } } : current));
  }

  /** Цвет градиента по номеру. Палитра всегда приводится к нужной длине. */
  function setPaletteColor(index: number, value: string) {
    setDraft((current) => {
      if (!current) return current;
      const palette = [...themePalette(current)];
      palette[index] = value;
      return { ...current, palette };
    });
  }

  function addPaletteColor() {
    setDraft((current) => {
      if (!current) return current;
      const palette = [...themePalette(current)];
      if (palette.length >= THEME_PALETTE_MAX) return current;
      // Новый цвет — копия последнего: так градиент не «прыгает», а человек
      // сразу видит, что именно он меняет.
      palette.push(palette[palette.length - 1] ?? current.colors.brand);
      return { ...current, palette };
    });
  }

  function removePaletteColor(index: number) {
    setDraft((current) => {
      if (!current) return current;
      const palette = [...themePalette(current)];
      if (palette.length <= THEME_PALETTE_MIN) return current;
      palette.splice(index, 1);
      return { ...current, palette };
    });
  }

  function onHexInput(key: keyof ThemeColors, value: string) {
    setHexText((current) => ({ ...current, [key]: value }));
    const hex = normalizeHex(value);
    if (hex) setColor(key, hex);
  }

  /**
   * Собирает пару к текущей теме: режим меняется на противоположный, а цвета
   * пересчитываются под него. Идентификатор при этом новый — сохранение создаст
   * вторую тему, а не перепишет ту, что человек редактировал. Название остаётся
   * прежним: по нему темы и находят друг друга при переключении солнце/луна.
   */
  function makeCounterpart() {
    setHexText({});
    setDraft((current) => {
      if (!current) return current;
      const mode = current.mode === 'dark' ? 'light' : 'dark';
      return {
        id: createId(),
        name: current.name,
        mode,
        font: current.font,
        colors: deriveCounterpartColors(current.colors, mode),
        // Палитру пересчитываем вместе с палитрой ролей: иначе у тёмной версии
        // светлой темы остались бы слепящие цвета градиента.
        palette: deriveCounterpartPalette(themePalette(current), mode),
        animated: current.animated === true,
      };
    });
  }

  function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim() || t('themes.newName');
    onSave({ ...draft, name });
    setDraft(null);
    setView('list');
    setNotice(t('themes.applied', { name }));
  }

  async function share(theme: Theme) {
    setShareTheme(theme);
    setCopied(false);
    setView('share');
  }

  async function copyLink() {
    const ok = await copyText(shareLink);
    setCopied(ok);
    // Скопировать не вышло (обычно из-за обычного HTTP) — ссылку всё равно
    // видно в поле, её можно выделить руками.
    if (!ok) setNotice(t('themes.copyManual'));
  }

  function runImport() {
    const theme = extractSharedTheme(importText);
    if (!theme) {
      setImportError(t('themes.importInvalid'));
      return;
    }
    const added = onImport(theme);
    onActivate(added.id);
    setImportText('');
    setImportError('');
    setView('list');
    setNotice(t('themes.imported', { name: added.name }));
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid items-end bg-[#171724]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-w-[460px] sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <button
            type="button"
            aria-label={view === 'list' ? (onBack ? t('common.back') : t('modals.close')) : t('common.back')}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => (view === 'list' ? leave() : setView('list'))}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-[-0.02em] text-ink">
            {title}
          </h2>
          {view === 'list' && (
            <button
              type="button"
              aria-label={t('themes.import')}
              title={t('themes.import')}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => {
                setImportText('');
                setImportError('');
                setView('import');
              }}
            >
              <Link2 className="h-5 w-5" />
            </button>
          )}
          {view === 'editor' && (
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-xl px-3 py-2 text-sm font-extrabold text-brand transition hover:bg-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('common.save')}
            </button>
          )}
        </header>

        {notice && (
          <p
            className="border-b border-line/70 bg-brand-soft/50 px-4 py-2 text-xs font-semibold text-ink sm:px-5"
            role="status"
          >
            {notice}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {view === 'list' && (
            <>
              <p className="border-b border-line/70 px-4 py-3 text-xs leading-5 text-muted sm:px-5">
                {listTab === 'wallpapers' ? t('themes.wallpapersHint') : t('themes.listHint')}
              </p>

              {/* Главные вкладки экрана: сами темы и обои для чата. */}
              <div
                className="flex flex-wrap gap-2 border-b border-line/70 px-4 py-3 sm:px-5"
                role="tablist"
                aria-label={t('themes.title')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === 'themes'}
                  onClick={() => setListTab('themes')}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    listTab === 'themes'
                      ? 'bg-brand text-white'
                      : 'border border-line bg-elevated text-muted hover:border-brand/35 hover:text-ink'
                  }`}
                >
                  {t('themes.title')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === 'wallpapers'}
                  onClick={() => setListTab('wallpapers')}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    listTab === 'wallpapers'
                      ? 'bg-brand text-white'
                      : 'border border-line bg-elevated text-muted hover:border-brand/35 hover:text-ink'
                  }`}
                >
                  {t('themes.wallpapersTab')}
                </button>
              </div>

              {listTab === 'wallpapers' ? (
                <div className="px-4 py-4 sm:px-5">
                  {currentWallpaperUrl && (
                    <button
                      type="button"
                      data-wallpaper-clear
                      onClick={() => {
                        void onClearWallpaper();
                        setNotice(t('themes.wallpapersClear'));
                      }}
                      className="mb-4 inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand/35 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      {t('themes.wallpapersClear')}
                    </button>
                  )}
                  {/* Две полки — светлые и тёмные. Тёмная палитра нужна тёмным
                      темам: светлый рисунок на них выглядит серой пеленой, а
                      выбирать приходится глазами, а не по названию цвета. */}
                  {WALLPAPER_VARIANTS.map((variant) => (
                    <div key={variant}>
                      <h3 className="pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-muted">
                        {t(variant === 'dark' ? 'themes.imageDarkGroup' : 'themes.imageLightGroup')}
                      </h3>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {BUILT_IN_WALLPAPERS.filter(
                          (wallpaper) => wallpaper.variant === variant,
                        ).map((wallpaper) => {
                          const active = currentWallpaperUrl === wallpaper.url;
                          const label = imageTileLabel(wallpaper, t);
                          return (
                            <button
                              key={wallpaper.id}
                              type="button"
                              data-wallpaper-id={wallpaper.id}
                              aria-pressed={active}
                              aria-label={label}
                              onClick={() => {
                                void onApplyWallpaper(wallpaper.url);
                                setNotice(t('themes.wallpaperApplied', { name: label }));
                              }}
                              className={`group flex flex-col rounded-xl border bg-elevated p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                active
                                  ? 'border-brand ring-2 ring-brand/35'
                                  : 'border-line hover:border-brand/35'
                              }`}
                            >
                              <span className="relative block overflow-hidden rounded-lg">
                                <img
                                  src={wallpaper.url}
                                  alt=""
                                  className="block aspect-[9/16] w-full object-cover"
                                  loading="lazy"
                                />
                                {active && (
                                  <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-brand text-white">
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                  </span>
                                )}
                              </span>
                              <span className="mt-1.5 px-1 pb-1 text-xs font-semibold text-ink">
                                {label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Выбор цвета интерфейса / акцентного цвета как в Telegram */}
                  <div className="border-b border-line/70 px-4 py-3 sm:px-5">
                    <span className="block text-xs font-bold uppercase tracking-wider text-muted">
                      {t('profile.interfaceColor') ?? 'Цвет интерфейса'}
                    </span>
                    <div className="mt-2.5 flex items-center gap-2.5 overflow-x-auto pb-1">
                      {ACCENT_COLOR_PRESETS.map((preset) => {
                        const isSelected = (currentColor?.toLowerCase() === preset.color.toLowerCase());
                        return (
                          <button
                            key={preset.color}
                            type="button"
                            onClick={() => onChangeAccentColor?.(preset.color)}
                            className={`group relative grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${isSelected ? 'ring-2 ring-offset-2 ring-brand ring-offset-surface' : ''}`}
                            style={{ backgroundColor: preset.color }}
                            title={preset.name}
                            aria-label={preset.name}
                          >
                            {isSelected && <Check className="h-4 w-4 text-white drop-shadow" />}
                          </button>
                        );
                      })}
                      {/* Пользовательский цвет */}
                      <label
                        className="relative grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-canvas transition hover:border-brand/40"
                        title="Выбрать свой цвет"
                      >
                        <Plus className="h-4 w-4 text-muted" />
                        <input
                          type="color"
                          value={currentColor ?? '#3390ec'}
                          onChange={(e) => onChangeAccentColor?.(e.target.value)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Фильтр по режиму. Ничего не прячет: нажали «Тёмные» — они
                      поднялись наверх, светлые остались ниже. */}
                  <div
                    className="flex flex-wrap gap-2 border-b border-line/70 px-4 py-3 sm:px-5"
                    role="group"
                    aria-label={t('themes.filterLabel')}
                  >
                    {THEME_FILTERS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                          filter === value
                            ? 'bg-brand text-white'
                            : 'border border-line bg-elevated text-muted hover:border-brand/35 hover:text-ink'
                        }`}
                      >
                        {t(THEME_FILTER_LABEL_KEYS[value])}
                      </button>
                    ))}
                  </div>

                  {sections.map((section) => (
                    <div key={section.key}>
                      <h3 className="px-4 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-muted sm:px-5">
                        {section.label}
                      </h3>
                      {section.themes.length === 0 ? (
                        <p className="px-4 py-3 text-xs leading-5 text-muted sm:px-5">
                          {t('themes.mineEmpty')}
                        </p>
                      ) : (
                        <ul>
                          {section.themes.map((theme) => (
                            <li key={theme.id}>
                              <ThemeRow
                                theme={theme}
                                name={themeName(theme)}
                                active={theme.id === activeTheme.id}
                                onActivate={() => onActivate(theme.id)}
                                onShare={() => void share(theme)}
                                shareLabel={t('themes.share')}
                                {...(theme.builtIn
                                  ? {}
                                  : {
                                      onEdit: () => startEdit(theme),
                                      editLabel: t('common.edit'),
                                      onDelete: () => setPendingDelete(theme.id),
                                      deleteLabel: t('common.delete'),
                                    })}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
                    <button
                      type="button"
                      onClick={startCreate}
                      className="inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand/35 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t('themes.create')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportText('');
                        setImportError('');
                        setView('import');
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand/35 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                      {t('themes.import')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {view === 'editor' && draft && (
            <div className="pb-2">
              <p className="border-b border-line/70 bg-brand-soft/30 px-4 py-3 text-xs leading-5 text-muted sm:px-5">
                {t('themes.previewHint')}
              </p>

              <div className="border-b border-line/70 px-4 py-3 sm:px-5">
                <label className="block text-xs font-bold uppercase tracking-wide text-muted" htmlFor="theme-name">
                  {t('themes.name')}
                </label>
                <input
                  id="theme-name"
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                  value={draft.name}
                  placeholder={t('themes.newName')}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>

              <div className="border-b border-line/70 px-4 py-3 sm:px-5">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted">
                  {t('themes.mode')}
                </span>
                <div className="mt-2 flex gap-2">
                  {(['light', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={draft.mode === mode}
                      onClick={() => setDraft({ ...draft, mode })}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        draft.mode === mode
                          ? 'bg-brand text-white'
                          : 'border border-line bg-elevated text-ink hover:border-brand/35'
                      }`}
                    >
                      {mode === 'dark' ? t('themes.modeDark') : t('themes.modeLight')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-b border-line/70 px-4 py-3 sm:px-5">
                <span className="block text-xs font-bold uppercase tracking-wide text-muted">
                  {t('themes.font')}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {THEME_FONTS.map((font) => (
                    <button
                      key={font}
                      type="button"
                      aria-pressed={draft.font === font}
                      onClick={() => setDraft({ ...draft, font })}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        draft.font === font
                          ? 'bg-brand text-white'
                          : 'border border-line bg-elevated text-ink hover:border-brand/35'
                      }`}
                    >
                      {t(FONT_LABEL_KEYS[font as ThemeFont])}
                    </button>
                  ))}
                </div>
              </div>

              <h3 className="px-4 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-muted sm:px-5">
                {t('themes.colors')}
              </h3>
              <div className="px-4 sm:px-5">
                {THEME_COLOR_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-3 py-2">
                    <input
                      type="color"
                      aria-label={t(COLOR_LABEL_KEYS[key])}
                      value={draft.colors[key]}
                      onChange={(event) => {
                        setHexText((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                        setColor(key, event.target.value);
                      }}
                      className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {t(COLOR_LABEL_KEYS[key])}
                    </span>
                    <input
                      type="text"
                      aria-label={`${t(COLOR_LABEL_KEYS[key])} — HEX`}
                      spellCheck={false}
                      value={hexText[key] ?? draft.colors[key]}
                      onChange={(event) => onHexInput(key, event.target.value)}
                      onBlur={() =>
                        setHexText((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        })
                      }
                      className="h-8 w-24 shrink-0 rounded-lg border border-line bg-canvas px-2 text-xs text-ink outline-none transition focus:border-brand/60"
                    />
                  </div>
                ))}
              </div>

              {/* Градиент: 2–5 цветов, которые переливаются на обоях и в шапке
                  списка чатов. Живой предпросмотр — сама полоса ниже. */}
              <h3 className="px-4 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-muted sm:px-5">
                {t('themes.gradient')}
              </h3>
              <div className="px-4 sm:px-5">
                <span
                  aria-hidden="true"
                  className="block h-10 w-full rounded-xl border border-line/70"
                  style={{ backgroundImage: `linear-gradient(115deg, ${themePalette(draft).join(', ')})` }}
                />
                <p className="mt-2 text-xs leading-5 text-muted">{t('themes.gradientHint')}</p>

                <div className="mt-3 space-y-2">
                  {themePalette(draft).map((color, index) => (
                    <div key={index} className="flex items-center gap-3 py-1">
                      <input
                        type="color"
                        aria-label={t('themes.gradientColor', { number: index + 1 })}
                        value={color}
                        onChange={(event) => setPaletteColor(index, event.target.value)}
                        className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0.5"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {t('themes.gradientColor', { number: index + 1 })}
                      </span>
                      <button
                        type="button"
                        aria-label={t('themes.gradientRemove', { number: index + 1 })}
                        title={t('themes.gradientRemove', { number: index + 1 })}
                        disabled={themePalette(draft).length <= THEME_PALETTE_MIN}
                        onClick={() => removePaletteColor(index)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addPaletteColor}
                  disabled={themePalette(draft).length >= THEME_PALETTE_MAX}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand/35 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('themes.gradientAdd')}
                </button>

                <label className="mt-3 flex cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={draft.animated === true}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, animated: event.target.checked } : current,
                      )
                    }
                    className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                  />
                  <span className="min-w-0 flex-1 text-sm text-ink">{t('themes.gradientAnimated')}</span>
                </label>
                <p className="text-xs leading-5 text-muted">{t('themes.gradientAnimatedHint')}</p>
              </div>

              <div className="px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={makeCounterpart}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand/35 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {draft.mode === 'dark' ? t('themes.makeLight') : t('themes.makeDark')}
                </button>
                <p className="mt-2 text-xs leading-5 text-muted">{t('themes.makeCounterpartHint')}</p>
              </div>
            </div>
          )}

          {view === 'import' && (
            <div className="px-4 py-4 sm:px-5">
              <p className="text-xs leading-5 text-muted">{t('themes.importHint')}</p>
              <input
                autoFocus
                className="mt-3 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
                value={importText}
                placeholder={t('themes.importPlaceholder')}
                spellCheck={false}
                onChange={(event) => {
                  setImportText(event.target.value);
                  setImportError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runImport();
                }}
              />
              {importError && (
                <p className="mt-2 text-xs font-semibold text-danger" role="alert">
                  {importError}
                </p>
              )}
              <button
                type="button"
                onClick={runImport}
                className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('common.add')}
              </button>
            </div>
          )}

          {view === 'share' && shareTheme && (
            <div className="px-4 py-4 sm:px-5">
              <p className="text-xs leading-5 text-muted">{t('themes.shareHint')}</p>
              <input
                readOnly
                aria-label={t('themes.shareTitle')}
                className="mt-3 h-10 w-full rounded-xl border border-line bg-canvas px-3 text-xs text-ink outline-none focus:border-brand/60"
                value={shareLink}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => void copyLink()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {copied ? t('themes.copied') : t('common.copy')}
              </button>
            </div>
          )}
        </div>

        {pendingDelete && (
          <footer className="flex items-center gap-3 border-t border-line/70 px-4 py-3 sm:px-5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
              {t('themes.deleteConfirm', {
                name: themeName(customThemes.find((theme) => theme.id === pendingDelete) ?? activeTheme),
              })}
            </span>
            <button
              type="button"
              onClick={() => {
                onRemove(pendingDelete);
                setPendingDelete(null);
              }}
              className="rounded-xl bg-danger px-3 py-2 text-xs font-extrabold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              {t('common.delete')}
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink transition hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('common.cancel')}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

/**
 * Строка темы. Это `div` с ролью кнопки, а не `<button>`: внутри лежат свои
 * кнопки (поделиться, изменить, удалить), а вложенная кнопка — недопустимая
 * разметка.
 */
function ThemeRow({
  theme,
  name,
  active,
  onActivate,
  onShare,
  shareLabel,
  onEdit,
  editLabel,
  onDelete,
  deleteLabel,
}: {
  theme: Theme;
  name: string;
  active: boolean;
  onActivate: () => void;
  onShare: () => void;
  shareLabel: string;
  onEdit?: (() => void) | undefined;
  editLabel?: string | undefined;
  onDelete?: (() => void) | undefined;
  deleteLabel?: string | undefined;
}) {
  const t = useTranslation();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      data-theme-id={theme.id}
      data-theme-name={name}
      data-theme-mode={theme.mode}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate();
      }}
      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition sm:px-5 ${
        active ? 'bg-brand-soft/40' : 'hover:bg-brand-soft/25'
      }`}
    >
      <ThemeSwatch theme={theme} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{name}</span>
        <span className="block truncate text-xs text-muted">
          {theme.mode === 'dark' ? t('themes.modeDark') : t('themes.modeLight')}
          {' · '}
          {t(FONT_LABEL_KEYS[theme.font])}
        </span>
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />}
      <button
        type="button"
        aria-label={shareLabel}
        title={shareLabel}
        onClick={(event) => {
          event.stopPropagation();
          onShare();
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </button>
      {onEdit && (
        <button
          type="button"
          aria-label={editLabel}
          title={editLabel}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Миниатюра темы: фон переписки, панель, акцент и строка текста. */
function ThemeSwatch({ theme }: { theme: Theme }) {
  const palette = themePalette(theme);
  return (
    <span
      aria-hidden="true"
      className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-line/70"
      style={{
        backgroundColor: theme.colors.chatBg,
        // Тема с палитрой показывается переливом — так её видно ещё в списке.
        ...(palette.length > 2
          ? { backgroundImage: `linear-gradient(135deg, ${palette.join(', ')})` }
          : {}),
      }}
    >
      <span
        className="absolute left-1 top-1 h-2.5 w-4 rounded-sm"
        style={{ backgroundColor: theme.colors.surface }}
      />
      <span
        className="absolute left-1 top-4 h-1 w-3 rounded-sm"
        style={{ backgroundColor: theme.colors.ink, opacity: 0.45 }}
      />
      <span
        className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full"
        style={{ backgroundColor: theme.colors.brand }}
      />
    </span>
  );
}
