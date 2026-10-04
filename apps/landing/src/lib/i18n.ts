/**
 * Языки лендинга.
 *
 * Совпадают с языками приложения (`apps/web/src/lib/i18n.ts`), чтобы переключатель
 * на сайте и в мессенджере вёл себя одинаково: тот же порядок, те же сокращения
 * и та же политика фолбэков. Иначе человек, открывший сайт на украинском,
 * зашёл бы в приложение — и увидел английский: разнобой мешает и сбивает.
 */
import type { IconName } from '../components/Icon';
import { dictionaries } from './translations';

export type Language = 'ru' | 'en' | 'bg' | 'uk' | 'be' | 'el';

/**
 * 🔥 Порядок — это порядок в переключателе: первым стоит язык по умолчанию,
 * дальше по алфавиту. Менять его стоит одновременно с переводом и тестом —
 * иначе переключатель будет показывать языки вразнобой.
 */
export const LANGUAGES: readonly Language[] = ['ru', 'en', 'bg', 'uk', 'be', 'el'] as const;

/** Название на самом языке: основная подпись в меню переключателя. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
  bg: 'Български',
  uk: 'Українська',
  be: 'Беларуская',
  el: 'Ελληνικά',
};

/**
 * Английское название языка — вторая строка под собственным, как в Telegram.
 * Помогает узнать язык, даже если он написан непривычной азбуку/кириллицей.
 */
export const LANGUAGE_ENGLISH_LABELS: Record<Language, string> = {
  ru: 'Russian',
  en: 'English',
  bg: 'Bulgarian',
  uk: 'Ukrainian',
  be: 'Belarusian',
  el: 'Greek',
};

/**
 * Двухбуквенный код для кнопки: «RU», «EN», «BG»… На лендинге места мало,
 * поэтому в шапке показывается именно он, а полное имя — только в раскрытом меню.
 */
export const LANGUAGE_SHORT: Record<Language, string> = {
  ru: 'RU',
  en: 'EN',
  bg: 'BG',
  uk: 'UK',
  be: 'BE',
  el: 'EL',
};

/**
 * Локаль для `Intl`. Сайт пока не форматирует даты/числа (только текст), но
 * заранее фиксируем, чтобы будущая «дата релиза» не показала «October»
 * у русскоязычного пользователя.
 */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  bg: 'bg-BG',
  uk: 'uk-UA',
  be: 'be-BY',
  el: 'el-GR',
};

/** Ключ в localStorage. Свой, не как у приложения: лендинг и мессенджу могут
 *  разъехаться (например, человек выбрал украинский на сайте, но мессенджу
 *  открывает в английском) — перемешивать настройки незачем. */
export const LANGUAGE_STORAGE_KEY = 'yargram.landing.lang';

/** Шаблон всего переводимого содержимого лендинга. */
export interface LandingContent {
  /** Куда ведут ссылки-якоря в шапке и подвале. */
  nav: {
    features: string;
    updates: string;
    calls: string;
    security: string;
    faq: string;
  };
  /** Тексты вокруг переключателей в правом углу шапки. */
  header: {
    themeLight: string;
    themeDark: string;
    language: string;
    languageHint: string;
    cta: string;
  };
  /** Первый экран, мокап переписки и плавающая плашка звонка. */
  hero: {
    badge: string;
    title1: string;
    title2: string;
    subtitle: string;
    cta: string;
    ctaSecondary: string;
    mock: {
      initial: string;
      name: string;
      online: string;
      typing: string;
      bubbles: ReadonlyArray<{ from: 'me' | 'peer'; text: string }>;
      call: { title: string; subtitle: string };
    };
  };
  /** Четыре цифры под первым экраном: то, что человек хочет знать сразу. */
  stats: ReadonlyArray<{ value: string; label: string }>;
  /** Полоса «что умеет»: шесть карточек с короткими заголовками. */
  highlights: ReadonlyArray<{ icon: IconName; title: string; text: string }>;
  /** Шапка раздела подробных возможностей. */
  features: {
    tag: string;
    title: string;
    intro: string;
  };
  /** Шесть подробных блоков: переписка, медиа, звонки, люди, безопасность, оформление. */
  sections: ReadonlyArray<{ id: string; icon: IconName; title: string; lead: string; items: string[] }>;
  reasonsSection: { tag: string; title: string };
  reasons: ReadonlyArray<{ icon: IconName; title: string; text: string }>;
  /** «Чего пока нет» — короткий честный список. */
  limits: {
    tag: string;
    title: string;
    intro: string;
    items: string[];
  };
  /** Финальный призыв с кнопкой-приглашением в приложение. */
  cta: {
    title: string;
    text: string;
    button: string;
    note: string;
  };
  /** Подвал: логотип + слоган + разделы. */
  footer: {
    tagline: string;
    /** Подпись ссылки на Telegram-канал (используется и в шапке, и в подвале). */
    channel: string;
  };
  /** Карточка выпуска 0.1.0 ЗБТ и план «что дальше». */
  releases: {
    tag: string;
    title: string;
    intro: string;
    version: string;
    /** Канал — это «ЗБТ», «БЕТА», «ALPHA» и т. п. — короткое обозначение стадии. */
    channel: string;
    /** Длинная расшифровка канала — нужна, потому что «ЗБТ» знакомо не всем. */
    channelLong: string;
    /** Текст «Открытие {channelLong}» под версией. */
    openLabel: (channelLong: string) => string;
    date: string;
    summary: string;
    intro1: string;
    intro2: string;
    groups: ReadonlyArray<{ icon: IconName; title: string; items: string[] }>;
    nextTitle: string;
    next: string[];
    tryButton: string;
  };
}

/**
 * Цепочка фолбэков: украинский/белорусский без перевода падают на русский
 * (он ближе всего и грамотнее всего подобран), греческий — на английский
 * (нейтральный и понятный за пределами России). Внутри `translations.ts` для
 * каждой строки могут быть указаны все шесть языков; эта цепочка нужна на
 * случай пропуска отдельных ключей.
 */
const LANGUAGE_FALLBACK: Record<Language, Language> = {
  ru: 'ru',
  en: 'en',
  bg: 'ru',
  uk: 'ru',
  be: 'ru',
  el: 'en',
};

/**
 * Отдаёт словарь для языка с учётом фолбэка. Внешний код может
 * положиться на то, что вернётся полный объект `LandingContent`: ни
 * одна ветка не вернёт `undefined` и не упадёт на пропущенном ключе.
 */
export function resolveContent(language: Language): LandingContent {
  return dictionaries[language] ?? dictionaries[LANGUAGE_FALLBACK[language]] ?? dictionaries.ru;
}

/** Защита от случайной передачи левой строки из localStorage. */
export function isLanguage(value: unknown): value is Language {
  return value === 'ru' || value === 'en' || value === 'bg' || value === 'uk' || value === 'be' || value === 'el';
}