import { afterEach, describe, expect, it } from 'vitest';
import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_PRESETS,
  applyUiScale,
  clampUiScale,
  readUiScale,
  writeUiScale,
} from './uiScale';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('clampUiScale', () => {
  it('пропускает значение внутри пределов', () => {
    expect(clampUiScale(150)).toBe(150);
  });

  it('не даёт уйти ниже 50%', () => {
    expect(clampUiScale(10)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(-300)).toBe(UI_SCALE_MIN);
  });

  it('не даёт уйти выше 300%', () => {
    expect(clampUiScale(900)).toBe(UI_SCALE_MAX);
  });

  it('округляет до целого процента', () => {
    expect(clampUiScale(137.6)).toBe(138);
  });

  it('бесконечность и NaN заменяет обычным размером', () => {
    expect(clampUiScale(Number.NaN)).toBe(UI_SCALE_DEFAULT);
    expect(clampUiScale(Number.POSITIVE_INFINITY)).toBe(UI_SCALE_DEFAULT);
  });
});

describe('хранение масштаба', () => {
  it('на пустом хранилище — обычный размер', () => {
    expect(readUiScale()).toBe(UI_SCALE_DEFAULT);
  });

  it('сохранённое значение читается обратно', () => {
    writeUiScale(175);
    expect(readUiScale()).toBe(175);
  });

  it('мусор в хранилище не ломает интерфейс', () => {
    localStorage.setItem('yargram.uiScale', 'огромный');
    expect(readUiScale()).toBe(UI_SCALE_DEFAULT);
  });

  it('значение вне пределов обрезается при чтении', () => {
    localStorage.setItem('yargram.uiScale', '5000');
    expect(readUiScale()).toBe(UI_SCALE_MAX);
  });
});

describe('applyUiScale', () => {
  it('ставит CSS-zoom на документ', () => {
    applyUiScale(150);
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.5');
  });

  it('на обычном размере снимает свойство совсем', () => {
    applyUiScale(200);
    applyUiScale(UI_SCALE_DEFAULT);
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('');
  });

  it('уменьшает интерфейс до половины на 50%', () => {
    applyUiScale(UI_SCALE_MIN);
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('0.5');
  });
});

describe('готовые значения', () => {
  it('все лежат внутри допустимых пределов', () => {
    for (const preset of UI_SCALE_PRESETS) {
      expect(preset).toBeGreaterThanOrEqual(UI_SCALE_MIN);
      expect(preset).toBeLessThanOrEqual(UI_SCALE_MAX);
    }
  });

  it('среди готовых есть обычный размер', () => {
    expect(UI_SCALE_PRESETS).toContain(UI_SCALE_DEFAULT);
  });
});
