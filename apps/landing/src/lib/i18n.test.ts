import { describe, expect, it } from 'vitest';
import {
  LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_SHORT,
  LANGUAGE_ENGLISH_LABELS,
  LANGUAGE_LOCALES,
  LANGUAGE_STORAGE_KEY,
  isLanguage,
  resolveContent,
} from './i18n';
import { dictionaries } from './translations';

/**
 * 🔥 Ключи перевода должны совпадать у всех языков до последнего уровня. Если в
 * одном языке забыли поле, `resolveContent` вернёт объект, у которого на этом
 * поле `undefined`, и компонент упадёт в рантайме — причём не в тесте, а у
 * пользователя. Отпечаток формы ловит любое расхождение структуры сразу.
 */
/**
 * 🔥 Отпечаток структуры, без значений: важны только ключи, форма массивов и
 * то, где лежат объекты, а не сами переведённые строки (они в разных языках
 * разные, иначе тест бы сравнивал русский с английским). Функции (`openLabel`)
 * одинаковы во всех словарях — сворачиваем в константу.
 */
function shape(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(shape).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${key}:${shape(obj[key])}`)
      .join(',')}}`;
  }
  if (typeof value === 'function') return 'fn';
  // Примитивы (строки/числа/булевы) заменяем типом — значение не важно.
  return typeof value;
}

describe('i18n лендинга', () => {
  it('знает все шесть языков в правильном порядке', () => {
    expect(LANGUAGES).toEqual(['ru', 'en', 'bg', 'uk', 'be', 'el']);
  });

  it('isLanguage пропускает только известные коды', () => {
    expect(isLanguage('ru')).toBe(true);
    expect(isLanguage('el')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage('')).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage('RU')).toBe(false);
  });

  it('все подписи языка заполнены для каждого кода', () => {
    for (const lang of LANGUAGES) {
      expect(LANGUAGE_LABELS[lang]).toBeTruthy();
      expect(LANGUAGE_ENGLISH_LABELS[lang]).toBeTruthy();
      expect(LANGUAGE_SHORT[lang]).toMatch(/^[A-Z]{2}$/);
      expect(LANGUAGE_LOCALES[lang]).toBeTruthy();
    }
  });

  it('ключ хранилища отделён от приложения', () => {
    expect(LANGUAGE_STORAGE_KEY).toBe('yargram.landing.lang');
  });

  it('словари всех языков совпадают по структуре с русским', () => {
    const base = shape(dictionaries.ru);
    for (const lang of LANGUAGES) {
      expect(shape(dictionaries[lang])).toBe(base);
    }
  });

  it('resolveContent возвращает полный словарь выбранного языка', () => {
    const ru = resolveContent('ru');
    expect(ru.hero.title2).toBe('для тех, кто рядом');
    // Английский — не русский: переключатель действительно меняет контент.
    const en = resolveContent('en');
    expect(en.hero.title2).not.toBe(ru.hero.title2);
    expect(en.nav.features).toBeTruthy();
  });

  it('цепочка фолбэков не ломает существующие языки', () => {
    // Все шесть языков переведены, поэтому resolveContent для каждого
    // возвращает именно его словарь, а не словарь фолбэка.
    for (const lang of LANGUAGES) {
      expect(resolveContent(lang)).toBe(dictionaries[lang]);
    }
  });
});
