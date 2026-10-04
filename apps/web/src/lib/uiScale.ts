/**
 * Масштаб интерфейса.
 *
 * Хранится на устройстве, как язык и звук: это свойство экрана, а не
 * аккаунта, поэтому один человек на одном компьютере видит один масштаб
 * независимо от того, под кем вошёл.
 */
const STORAGE_KEY = 'yargram.uiScale';

export const UI_SCALE_MIN = 50;
export const UI_SCALE_MAX = 300;
export const UI_SCALE_DEFAULT = 100;

/** Готовые значения: обычный размер и шаги в обе стороны. */
export const UI_SCALE_PRESETS = [50, 75, 100, 125, 150, 200, 300] as const;

/** Вписывает значение в допустимые пределы и округляет до целого процента. */
export function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) return UI_SCALE_DEFAULT;
  const rounded = Math.round(value);
  if (rounded < UI_SCALE_MIN) return UI_SCALE_MIN;
  if (rounded > UI_SCALE_MAX) return UI_SCALE_MAX;
  return rounded;
}

export function readUiScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return UI_SCALE_DEFAULT;
    return clampUiScale(Number(raw));
  } catch {
    // Приватный режим — работаем в обычном масштабе.
    return UI_SCALE_DEFAULT;
  }
}

export function writeUiScale(scale: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampUiScale(scale)));
  } catch {
    // Не сохранилось — интерфейс просто вернётся к обычному размеру.
  }
}

/**
 * Применяет масштаб к документу.
 *
 * 🔥 Ставим именно CSS-свойство `zoom`, а не `transform: scale`:
 * `transform` лишь растягивает картинку, не пересчитывая раскладку, — появились
 * бы пустые поля и поехавшие модальные окна. `zoom` ведёт себя как зум
 * браузера: пересчитывает размеры, поэтому `100dvh`, `fixed` и переносы строк
 * продолжают работать.
 *
 * Значение 100% — это «как обычно», поэтому свойство снимается совсем, а не
 * ставится в `1`: так в разметке не оставается лишнего.
 */
export function applyUiScale(scale: number): void {
  const clamped = clampUiScale(scale);
  const root = document.documentElement;
  if (clamped === UI_SCALE_DEFAULT) root.style.removeProperty('zoom');
  else root.style.setProperty('zoom', String(clamped / 100));
}
