/**
 * Минимальная локализация без внешних зависимостей.
 *
 * Язык хранится на устройстве (`yargram.lang`) и применяется сразу — как тема.
 * Словари плоские: ключ → строка. В строке можно подставлять значения через
 * `{name}`. Если перевода нет, берём русский, а если нет и его — сам ключ,
 * чтобы пропуск был заметен в интерфейсе, но ничего не падало.
 */

/**
 * Языки интерфейса. `ru` — источник истины: остальные словари от него
 * отталкиваются, и если перевода нет, подставляется русский.
 *
 * Порядок в этом списке — порядок в переключателе и в экране «Язык».
 */
export type Language = 'ru' | 'en' | 'bg' | 'uk' | 'be' | 'el';

export const LANGUAGES: Language[] = ['ru', 'en', 'bg', 'uk', 'be', 'el'];

/** Названия языков показываем на самом языке — так принято в переключателях. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
  bg: 'Български',
  uk: 'Українська',
  be: 'Беларуская',
  el: 'Ελληνικά',
};

/**
 * Английское название языка: в списке оно идёт второй строкой под своим,
 * как в Telegram. Нужно, когда язык называется непривычной письменностью.
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
 * Локаль для `Intl`: даты и числа должны выглядеть на языке интерфейса, а не
 * всегда по-русски. Держим рядом со списком языков — новый язык без строки тут
 * получит русские месяцы и это легко не заметить.
 */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  bg: 'bg-BG',
  uk: 'uk-UA',
  be: 'be-BY',
  el: 'el-GR',
};

/** Короткая подпись для узких мест (плавающая кнопка, компактный список). */
export const LANGUAGE_SHORT: Record<Language, string> = {
  ru: 'RU',
  en: 'EN',
  bg: 'BG',
  uk: 'UK',
  be: 'BE',
  el: 'EL',
};

export const LANGUAGE_KEY = 'yargram.lang';

export type TranslationParams = Record<string, string | number>;

/** Русский словарь — источник истины: все остальные от него отталкиваются. */
const ru: Record<string, string> = {};
/** Английский словарь. */
const en: Record<string, string> = {};
/** Болгарский словарь. */
const bg: Record<string, string> = {};
/** Украинский словарь. */
const uk: Record<string, string> = {};
/** Белорусский словарь. */
const be: Record<string, string> = {};
/** Греческий словарь. */
const el: Record<string, string> = {};

/**
 * Регистрация ключа во всех языках сразу — так словари не разъезжаются.
 *
 * Украинский и белорусский обязательны: они ближайшие к русскому, и без них
 * `ru` протекал бы в эти языки. Греческий — дальше всех, поэтому для него
 * перевода можно не давать: подставится английский (`en`) как нейтральный,
 * а не русский, который в Греции читают реже.
 */
function define(
  key: string,
  translations: {
    ru: string;
    en: string;
    bg: string;
    uk?: string;
    be?: string;
    el?: string;
  },
): void {
  ru[key] = translations.ru;
  en[key] = translations.en;
  bg[key] = translations.bg;
  uk[key] = translations.uk ?? translations.ru;
  be[key] = translations.be ?? translations.ru;
  el[key] = translations.el ?? translations.en;
}

const DICTIONARIES: Record<Language, Record<string, string>> = { ru, en, bg, uk, be, el };

/** Для языков без собственного текста берём этот — он нейтральнее русского. */
const LANGUAGE_FALLBACK: Record<Language, Language> = {
  ru: 'ru',
  en: 'en',
  bg: 'ru',
  uk: 'ru',
  be: 'ru',
  el: 'en',
};

export function isLanguage(value: unknown): value is Language {
  return (
    value === 'ru' ||
    value === 'en' ||
    value === 'bg' ||
    value === 'uk' ||
    value === 'be' ||
    value === 'el'
  );
}

/** Язык с устройства; по умолчанию — русский. */
export function readLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Приватный режим — просто берём значение по умолчанию.
  }
  return 'ru';
}

/** Подставляет `{ключ}` значениями из params. Лишние плейсхолдеры остаются как есть. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Перевод ключа. Поддерживает русскую строку в качестве ключа-фолбэка:
 * если ключ не зарегистрирован, но передан fallback-текст — вернём его для ru.
 */
export function translate(language: Language, key: string, params?: TranslationParams): string {
  const dictionary = DICTIONARIES[language] ?? ru;
  const fallback = DICTIONARIES[LANGUAGE_FALLBACK[language]];
  const template = dictionary[key] ?? fallback[key] ?? ru[key] ?? key;
  return interpolate(template, params);
}

export type TranslateFn = (key: string, params?: TranslationParams) => string;

/** Готовит функцию перевода для конкретного языка. */
export function createTranslator(language: Language): TranslateFn {
  return (key, params) => translate(language, key, params);
}

/**
 * Опознаёт предупреждение владельца (SCAM или FAKE) по началу текста и отдаёт
 * его на языке интерфейса. Сервер посылает предупреждение готовой строкой (у неё
 * своя жизнь: её копируют, сравнивают в тестах, показывают на всех клиентах),
 * поэтому переводим по совпадению, а не подменяем серверный контракт.
 *
 * Если текст не похож на предупреждение (обычное «о себе») — возвращаем как есть.
 */
export function translateScamWarning(text: string, t: TranslateFn): string {
  if (!text) return text;
  // Ведущий ⚠️ и пробелы отрезаем до сравнения: в карточке знак рисуется значком.
  const body = text.replace(/^\s*⚠️?\s*/u, "");
  if (body.startsWith("Внимание: на этот аккаунт")) return t("scam.accountWarning");
  // Отметка FAKE: «выдаёт себя за официальный». 🔥 Групповую фразу проверяем
  // **раньше** аккаунтной: начало у них общее («Внимание: многие жаловались»),
  // и наоборот группа получила бы текст про аккаунт.
  if (body.startsWith("Внимание: многие жаловались") && body.includes("эта группа")) {
    return t("fake.groupWarning");
  }
  if (body.startsWith("Внимание: многие жаловались")) return t("fake.accountWarning");
  // Формулировка менялась («много жаловались» → «часто жаловались»), поэтому
  // сверяемся с обеими — старое предупреждение должно переводиться тоже.
  if (body.startsWith("Внимание: на эту группу")) return t("scam.groupWarning");
  return text;
}

/**
 * Тексты интерфейса. Ключи сгруппированы по экранам, чтобы словарь было легко
 * искать. Порядок: русский / английский / болгарский.
 */

// ---- Общее ----
define('common.cancel', { ru: 'Отмена', en: 'Cancel', bg: 'Отказ', uk: 'Скасувати', be: 'Скасаваць' 
});
define('common.save', { ru: 'Сохранить', en: 'Save', bg: 'Запази', uk: 'Зберегти', be: 'Захаваць' 
});
define('common.close', { ru: 'Закрыть', en: 'Close', bg: 'Затвори', uk: 'Закрити', be: 'Закрыць' 
});
define('common.delete', { ru: 'Удалить', en: 'Delete', bg: 'Изтрий', uk: 'Видалити', be: 'Выдаліць' 
});
define('common.retry', { ru: 'Повторить', en: 'Retry', bg: 'Опитай пак', uk: 'Повторити', be: 'Паўтарыць' 
});
define('common.back', { ru: 'Назад', en: 'Back', bg: 'Назад', uk: 'Назад', be: 'Назад' 
});

// ---- Бренд / логотип ----
define('brand.openSite', {
  ru: 'Открыть сайт Yargram',
  en: 'Open Yargram website',
  bg: 'Отвори сайта на Yargram',
  uk: 'Відкрити сайт Yargram',
  be: 'Адкрыць сайт Yargram',
});
define('common.done', { ru: 'Готово', en: 'Done', bg: 'Готово', uk: 'Готово', be: 'Гатова' 
});
define('common.yes', { ru: 'Да', en: 'Yes', bg: 'Да', uk: 'Так', be: 'Так' 
});
define('common.no', { ru: 'Нет', en: 'No', bg: 'Не', uk: 'Ні', be: 'Не' 
});
define('common.search', { ru: 'Поиск', en: 'Search', bg: 'Търсене', uk: 'Пошук', be: 'Пошук' 
});
define('common.loading', { ru: 'Загрузка…', en: 'Loading…', bg: 'Зареждане…', uk: 'Завантаження…', be: 'Загрузка…' 
});
define('common.copy', { ru: 'Копировать', en: 'Copy', bg: 'Копирай', uk: 'Копіювати', be: 'Капіраваць' 
});
define('common.edit', { ru: 'Изменить', en: 'Edit', bg: 'Редактирай', uk: 'Змінити', be: 'Змяніць' 
});
define('common.remove', { ru: 'Убрать', en: 'Remove', bg: 'Премахни', uk: 'Прибрати', be: 'Прыбраць' 
});
define('common.add', { ru: 'Добавить', en: 'Add', bg: 'Добави', uk: 'Додати', be: 'Дадаць' 
});
define('common.send', { ru: 'Отправить', en: 'Send', bg: 'Изпрати', uk: 'Надіслати', be: 'Адправіць' 
});
define('common.today', { ru: 'Сегодня', en: 'Today', bg: 'Днес', uk: 'Сьогодні', be: 'Сёння' 
});
define('common.yesterday', { ru: 'Вчера', en: 'Yesterday', bg: 'Вчера', uk: 'Учора', be: 'Учора' 
});
define('common.you', { ru: 'Вы', en: 'You', bg: 'Вие', uk: 'Ви', be: 'Вы' 
});

// ---- Язык ----
define('language.title', { ru: 'Язык', en: 'Language', bg: 'Език', uk: 'Мова', be: 'Мова' 
});
define('language.description', {
  ru: 'Язык интерфейса. Применяется сразу на этом устройстве.',
  en: 'Interface language. Applies instantly on this device.',
  bg: 'Език на интерфейса. Прилага се веднага на това устройство.',
  uk: 'Мова інтерфейсу. Застосовується відразу на цьому пристрої.',
  be: 'Мова інтэрфейсу. Ужываецца адразу на гэтым прыладзе.',
});
// --- Экран «Язык» (как в Telegram) ----------------------------------------
define('langScreen.showTranslate', {
  ru: 'Показать кнопку «Перевести»',
  en: 'Show “Translate” button',
  bg: 'Покажи бутон „Преведи“',
  uk: 'Показати кнопку «Перевести»',
  be: 'Паказаць кнопку «Перевести»',
});
define('langScreen.showTranslateHint', {
  ru: 'Кнопка «Перевести» появится в меню действий для сообщений, содержащих текст.',
  en: 'The “Translate” button appears in the action menu for messages that contain text.',
  bg: 'Бутонът „Преведи“ се появява в менюто с действия за съобщения, съдържащи текст.',
  uk: 'Кнопка «Перекласти» з’явиться у меню дій для повідомлень, що містять текст.',
  be: 'Кнопка «Перакласці» з’явіцца ў меню дзеянняў для паведамленняў, якія ўтрымліваюць тэкст.',
});
define('langScreen.translateChats', {
  ru: 'Переводить чаты целиком',
  en: 'Translate entire chats',
  bg: 'Превеждай цели чатове',
  uk: 'Перекладати чати повністю',
  be: 'Перекладати Чаты повністю',
});
define('langScreen.translateChatsHint', {
  ru: 'Переводить целиком — настройка Premium.',
  en: 'Translating entire chats is a Premium feature.',
  bg: 'Превеждането на цели чатове е Premium функция.',
  uk: 'Перекладати повністю — налаштування Premium.',
  be: 'Перакладаць цалкам — наладка Premium.',
});
define('langScreen.doNotTranslate', {
  ru: 'Не переводить',
  en: 'Do not translate',
  bg: 'Не превеждай',
  uk: 'Не перекладати',
  be: 'Не перакладаць',
});
define('langScreen.searchPlaceholder', {
  ru: 'Поиск',
  en: 'Search',
  bg: 'Търсене',
  uk: 'Пошук',
  be: 'Пошук',
});
define('langScreen.selected', {
  ru: 'Выбранный язык',
  en: 'Selected language',
  bg: 'Избран език',
  uk: 'Вибрана мова',
  be: 'Выбраная Мова',
});
define('langScreen.premium', {
  ru: 'Premium',
  en: 'Premium',
  bg: 'Premium',
  uk: 'Premium',
  be: 'Premium',
});
define('langScreen.ok', { ru: 'ОК', en: 'OK', bg: 'ОК', uk: 'ОК', be: 'ОК' 
});
define('langScreen.off', { ru: 'Выкл.', en: 'Off', bg: 'Изкл.', uk: 'Вимк.', be: 'Выкл.' 
});

// ---- Тема ----
define('theme.dark', { ru: 'Тёмная тема', en: 'Dark theme', bg: 'Тъмна тема', uk: 'Темна Тема', be: 'Цёмная тэма' 
});
define('theme.light', { ru: 'Светлая тема', en: 'Light theme', bg: 'Светла тема', uk: 'Світла Тема', be: 'Светлая тэма' 
});

// ---- Подключение ----
define('app.connecting', { ru: 'Подключаемся к Yargram…', en: 'Connecting to Yargram…', bg: 'Свързване с Yargram…', uk: 'Подключаемся до Yargram…', be: 'Подключаемся да Yargram…' 
});
define('app.retryConnection', { ru: 'Повторить подключение', en: 'Retry connection', bg: 'Опитай връзката пак', uk: 'Повторити підключення', be: 'Паўтарыць Падключэнне' 
});
define('app.logout', { ru: 'Выйти из аккаунта', en: 'Log out', bg: 'Изход от профила', uk: 'Вийти з Акаунта', be: 'Выйсці з Акаўнта' 
});
define('app.sessionExpired', { ru: 'Сессия завершилась. Войдите снова.', en: 'Session expired. Please sign in again.', bg: 'Сесията изтече. Влезте отново.', uk: 'Сессия завершилась. Увійдіть знову.', be: 'Сессия завершилась. Увайдзіце зноў.' 
});
define('app.loggedOut', { ru: 'Вы вышли из аккаунта.', en: 'You have logged out.', bg: 'Излязохте от профила.', uk: 'Ви вийшли з Акаунта.', be: 'Вы выйшлі з Акаўнта.' 
});
define('app.accountUnavailable', {
  ru: 'Предыдущий аккаунт больше недоступен. Открываем другой.',
  en: 'The previous account is no longer available. Opening another one.',
  bg: 'Предишният профил вече не е достъпен. Отваряме друг.',
  uk: 'Попередній Акаунт більше недоступний. Відкриваємо інший.',
  be: 'Предыдущий Акаўнт больш недаступны. Открываем іншы.',
});
define('app.serverUnreachable', {
  ru: 'Не удалось подключиться к серверу. Проверьте Radmin VPN и повторите попытку.',
  en: 'Could not reach the server. Check Radmin VPN and try again.',
  bg: 'Неуспешна връзка със сървъра. Проверете Radmin VPN и опитайте пак.',
  uk: 'Не вдалося подключиться до серверу. Перевірте Radmin VPN і повторіть спробу.',
  be: 'Не ўдалося подключиться да серверу. Праверце Radmin VPN і паўтарыце попытку.',
});
define('app.addAccountNotice', {
  ru: 'Войдите в другой аккаунт — текущий останется доступен в переключателе.',
  en: 'Sign in to another account — the current one stays available in the switcher.',
  bg: 'Влезте в друг профил — текущият ще остане в превключвателя.',
  uk: 'Увійдіть у інший Акаунт — текущий останется доступен у переключателе.',
  be: 'Увайдзіце у іншы Акаўнт — текущий останется доступен у переключателе.',
});

// ---- Вход и регистрация ----
define('auth.welcomeBack', { ru: 'С возвращением', en: 'Welcome back', bg: 'Добре дошли отново', uk: 'З возвращением', be: 'З возвращением' 
});
define('auth.createAccountTitle', { ru: 'Создайте аккаунт', en: 'Create an account', bg: 'Създайте профил', uk: 'Створіть Акаунт', be: 'Стварыце Акаўнт' 
});
define('auth.loginSubtitle', {
  ru: 'Войдите, чтобы продолжить общение',
  en: 'Sign in to continue chatting',
  bg: 'Влезте, за да продължите чата',
  uk: 'Увійдіть, щоб Продовжити спілкування',
  be: 'Увайдзіце, каб Працягнуць размовы',
});
define('auth.registerSubtitle', {
  ru: 'Пара минут — и можно писать друзьям',
  en: 'A couple of minutes and you can message your friends',
  bg: 'Няколко минути и можете да пишете на приятели',
  uk: 'Пара хвилин — і можна писать друзьям',
  be: 'Пара хвілін — і можна писать друзьям',
});
define('auth.invalidEmail', { ru: 'Введите корректный email', en: 'Enter a valid email', bg: 'Въведете валиден имейл', uk: 'Введіть коректний email', be: 'Увядзіце корректный email' 
});
define('auth.shortPassword', {
  ru: 'Пароль должен содержать не менее 8 символов',
  en: 'The password must be at least 8 characters',
  bg: 'Паролата трябва да е поне 8 знака',
  uk: 'Пароль повинен містити не менше 8 символов',
  be: 'Пароль павінен змяшчаць не менш 8 символов',
});
define('auth.shortName', {
  ru: 'Укажите имя длиной не менее 2 символов',
  en: 'Enter a name of at least 2 characters',
  bg: 'Въведете име от поне 2 знака',
  uk: 'Укажіть Ім’я длиной не менше 2 символов',
  be: 'Укажыце Імя длиной не менш 2 символов',
});
define('auth.usernameRule', {
  ru: 'Username: 3–32 символа, латиница, цифры или _',
  en: 'Username: 3–32 characters, Latin letters, digits or _',
  bg: 'Потребителско име: 3–32 знака, латиница, цифри или _',
  uk: 'Username: 3–32 символа, латиница, цифри або _',
  be: 'Username: 3–32 символа, латиница, цифры або _',
});
define('auth.failed', {
  ru: 'Не удалось выполнить вход. Попробуйте ещё раз.',
  en: 'Sign-in failed. Please try again.',
  bg: 'Неуспешен вход. Опитайте отново.',
  uk: 'Не вдалося виконати Вхід. Спробуйте ще раз.',
  be: 'Не ўдалося выканаць Уваход. Паспрабуйце яшчэ раз.',
});
define('auth.toggleLight', { ru: 'Включить светлую тему', en: 'Switch to light theme', bg: 'Включи светла тема', uk: 'Увімкнути світлу тему', be: 'Уключыць светлую тэму' 
});
define('auth.toggleDark', { ru: 'Включить тёмную тему', en: 'Switch to dark theme', bg: 'Включи тъмна тема', uk: 'Увімкнути темну тему', be: 'Уключыць цёмную тэму' 
});
define('auth.screenLabel', { ru: 'Вход в Yargram', en: 'Sign in to Yargram', bg: 'Вход в Yargram', uk: 'Вхід у Yargram', be: 'Уваход у Yargram' 
});
define('auth.backToApp', { ru: 'Вернуться в Yargram', en: 'Back to Yargram', bg: 'Обратно към Yargram', uk: 'Повернутися у Yargram', be: 'Вярнуцца у Yargram' 
});
define('auth.tablistLabel', { ru: 'Авторизация', en: 'Authentication', bg: 'Удостоверяване', uk: 'Авторизація', be: 'Аўтарызацыя' 
});
define('auth.loginTab', { ru: 'Вход', en: 'Sign in', bg: 'Вход', uk: 'Вхід', be: 'Уваход' 
});
define('auth.registerTab', { ru: 'Регистрация', en: 'Sign up', bg: 'Регистрация', uk: 'Реєстрація', be: 'Рэгістрацыя' 
});
define('auth.nameLabel', { ru: 'Имя', en: 'Name', bg: 'Име', uk: 'Ім’я', be: 'Імя' 
});
define('auth.namePlaceholder', { ru: 'Как вас называть?', en: 'What should we call you?', bg: 'Как да ви наричаме?', uk: 'Як вас називати?', be: 'Як вас называць?' 
});
define('auth.usernameOptional', { ru: '(необязательно)', en: '(optional)', bg: '(незадължително)', uk: '(необов’язково)', be: '(неабавязкова)' 
});
define('auth.passwordLabel', { ru: 'Пароль', en: 'Password', bg: 'Парола', uk: 'Пароль', be: 'Пароль' 
});
define('auth.passwordPlaceholder', { ru: 'Минимум 8 символов', en: 'At least 8 characters', bg: 'Поне 8 знака', uk: 'Минимум 8 символов', be: 'Минимум 8 символов' 
});
define('auth.showPassword', { ru: 'Показать пароль', en: 'Show password', bg: 'Покажи паролата', uk: 'Показати Пароль', be: 'Паказаць Пароль' 
});
define('auth.hidePassword', { ru: 'Скрыть пароль', en: 'Hide password', bg: 'Скрий паролата', uk: 'Сховати Пароль', be: 'Схаваць Пароль' 
});
define('auth.loginButton', { ru: 'Войти в Yargram', en: 'Sign in to Yargram', bg: 'Влезте в Yargram', uk: 'Увійти у Yargram', be: 'Увайсці у Yargram' 
});
define('auth.registerButton', { ru: 'Создать аккаунт', en: 'Create account', bg: 'Създай профил', uk: 'Створити Акаунт', be: 'Стварыць Акаўнт' 
});
define('auth.terms', {
  ru: 'Продолжая, вы соглашаетесь бережно относиться к собеседникам.',
  en: 'By continuing, you agree to treat others with care.',
  bg: 'Продължавайки, се съгласявате да се отнасяте с грижа към събеседниците.',
  uk: 'Продовжуючи, ви погоджуєтеся дбайливо ставитися до співрозмовників.',
  be: 'Працягваючы, вы пагаджаецеся беражна ставіцца да суразмоўцаў.',
});
// Соглашение живёт на отдельной странице лендинга (`/terms`), а не внутри
// приложения: документ должен иметь свой адрес, который можно процитировать.
define('auth.termsLink', {
  ru: 'Пользовательское соглашение',
  en: 'User agreement',
  bg: 'Потребителско споразумение',
  uk: 'Угода користувача',
  be: 'Карыстальніцкае дагавор',
});

// ---- Код подтверждения из письма ----
define('auth.codeTitle', { ru: 'Код из письма', en: 'Email code', bg: 'Код от имейл', uk: 'Код з листа', be: 'Код з ліста' 
});
define('auth.codeSentHint', { ru: 'Мы отправили код на {email}', en: 'We sent a code to {email}', bg: 'Изпратихме код на {email}', uk: 'Ми надіслали код на {email}', be: 'Мы адправілі код на {email}' 
});
define('auth.codeLabel', { ru: 'Код', en: 'Code', bg: 'Код', uk: 'Код', be: 'Код' 
});
define('auth.codePlaceholder', { ru: 'Шесть цифр', en: 'Six digits', bg: 'Шест цифри', uk: 'Шість цифр', be: 'Шэсць лічбаў' 
});
define('auth.codeSubmit', { ru: 'Подтвердить', en: 'Confirm', bg: 'Потвърди', uk: 'Підтвердити', be: 'Пацвердзіць' 
});
define('auth.codeResend', { ru: 'Отправить заново', en: 'Send again', bg: 'Изпрати отново', uk: 'Надіслати знову', be: 'Адправіць зноў' 
});
define('auth.codeResent', { ru: 'Код отправлен заново', en: 'A new code was sent', bg: 'Изпратен е нов код', uk: 'Код надіслано знову', be: 'Код адпраўлены зноў' 
});
define('auth.codeExpires', { ru: 'Код действует {minutes} мин', en: 'The code expires in {minutes} min', bg: 'Кодът важи {minutes} мин', uk: 'Код діє {minutes} хв', be: 'Код дзейнічае {minutes} хв' 
});
define('auth.codeSpamHint', { ru: 'Не пришло? Проверьте папку «Спам» — письмо иногда попадает туда.', en: 'Nothing yet? Check your spam folder — the email sometimes lands there.', bg: 'Не е пристигнал? Проверете папката „Спам“ — понякога писмото попада там.', uk: 'Не надійшов? Перевірте папку «Спам» — лист іноді потрапляє туди.', be: 'Не прыйшоў? Праверце папку «Спам» — ліст часам трапляе туды.'
});
define('auth.codeDeadlineHint', { ru: 'Не введёте код за это время — регистрация отменится, и почту с ником можно будет занять заново.', en: 'If the code is not entered in time, the registration is cancelled and the email and username become free again.', bg: 'Ако не въведете кода навреме, регистрацията се отменя и имейлът с ника се освобождават.', uk: 'Не введете код за цей час — реєстрація скасується, і пошту з ніком можна буде зайняти заново.', be: 'Не ўвядзеце код за гэты час — рэгістрацыя адмяняецца, і пошту з нікам можна будзе заняць нанова.'
});
define('auth.codeBack', { ru: 'Изменить почту', en: 'Change email', bg: 'Смени имейла', uk: 'Змінити пошту', be: 'Змяніць пошту' 
});define('auth.codeSixDigits', { ru: 'Код — это шесть цифр из письма', en: 'The code is six digits from the email', bg: 'Кодът е шест цифри от имейла', uk: 'Код — це шість цифр з листа', be: 'Код — гэта шэсць лічбаў з ліста' 
});
define('auth.forgotPassword', { ru: 'Забыли пароль?', en: 'Forgot your password?', bg: 'Забравили паролата?', uk: 'Забули пароль?', be: 'Забылі пароль?' 
});
define('auth.resetTitle', { ru: 'Сброс пароля', en: 'Reset password', bg: 'Възстановяване на паролата', uk: 'Скидання пароля', be: 'Скідванне пароля' 
});
define('auth.resetSubtitle', { ru: 'Укажите почту — пришлём код для сброса пароля.', en: 'Enter your email and we will send a reset code.', bg: 'Посочете имейла — ще изпратим код.', uk: 'Вкажіть пошту — надішлемо код для скидання.', be: 'Укажыце пошту — дашлем код для скідання.' 
});
define('auth.resetSubmit', { ru: 'Отправить код', en: 'Send code', bg: 'Изпрати код', uk: 'Надіслати код', be: 'Адправіць код' 
});
define('auth.newPasswordLabel', { ru: 'Новый пароль', en: 'New password', bg: 'Нова парола', uk: 'Новий пароль', be: 'Новы пароль' 
});
define('auth.resetConfirm', { ru: 'Сменить пароль', en: 'Set new password', bg: 'Задай нова парола', uk: 'Змінити пароль', be: 'Змяніць пароль' 
});
define('auth.backToLogin', { ru: 'Вернуться ко входу', en: 'Back to sign in', bg: 'Обратно към входа', uk: 'Повернутися до входу', be: 'Вярнуцца да ўваходу' 
});

// ---- Знакомство (онбординг) ----
define('onboarding.ariaLabel', { ru: 'Знакомство с Yargram', en: 'Getting to know Yargram', bg: 'Запознанство с Yargram', uk: 'Знайомство з Yargram', be: 'Знаёмства з Yargram' 
});
define('onboarding.skip', { ru: 'Пропустить', en: 'Skip', bg: 'Пропусни', uk: 'Пропустити', be: 'Прапусціць' 
});
define('onboarding.start', { ru: 'Начать', en: 'Get started', bg: 'Започни', uk: 'Почати', be: 'Пачаць' 
});
define('onboarding.next', { ru: 'Далее', en: 'Next', bg: 'Напред', uk: 'Далі', be: 'Далей' 
});
define('onboarding.slidesLabel', { ru: 'Слайды', en: 'Slides', bg: 'Слайдове', uk: 'Слайди', be: 'Слайды' 
});
define('onboarding.slideAria', { ru: 'Слайд {index}: {title}', en: 'Slide {index}: {title}', bg: 'Слайд {index}: {title}', uk: 'Слайд {index}: {title}', be: 'Слайд {index}: {title}' 
});
define('onboarding.s1.title', { ru: 'Добро пожаловать в Yargram', en: 'Welcome to Yargram', bg: 'Добре дошли в Yargram', uk: 'Добро пожаловать у Yargram', be: 'Добро пожаловать у Yargram' 
});
define('onboarding.s1.text', {
  ru: 'Быстрый и простой мессенджер для своих. Скачивать и устанавливать ничего не нужно — открыли ссылку в браузере и общаетесь.',
  en: 'A fast and simple messenger for your circle. Nothing to download or install — just open the link in a browser and chat.',
  bg: 'Бърз и прост месинджър за своите. Нищо не се сваля или инсталира — отваряте връзката в браузъра и общувате.',
  uk: 'Швидкий і простий месенджер для своих. Завантажувати і встановлювати нічого не потрібно — відкрили посилання у браузері і спілкуєтеся.',
  be: 'Быстрый і просты месенджар для своих. Спампоўваць і устанаўліваць нічога не трэба — адкрылі спасылку у браўзеры і размаўляеце.',
});
define('onboarding.s2.title', { ru: 'Личные переписки', en: 'Private chats', bg: 'Лични разговори', uk: 'Особисті переписки', be: 'Личные переписки' 
});
define('onboarding.s2.text', {
  ru: 'Отвечайте, редактируйте и удаляйте сообщения, ставьте реакции, ищите по истории и закрепляйте важное.',
  en: 'Reply, edit and delete messages, add reactions, search the history and pin what matters.',
  bg: 'Отговаряйте, редактирайте и изтривайте съобщения, слагайте реакции, търсете в историята и закачайте важното.',
  uk: 'Отвечайте, редактируйте і удаляйте Повідомлення, ставьте реакции, ищите по истории і закрепляйте важне.',
  be: 'Отвечайте, редактируйте і удаляйте Паведамленне, ставьте реакции, ищите па истории і закрепляйте важное.',
});
define('onboarding.s3.title', { ru: 'Фото, файлы и голосовые', en: 'Photos, files and voice', bg: 'Снимки, файлове и гласови', uk: 'Фото, Файли і голосові', be: 'Фото, Файлы і голосовые' 
});
define('onboarding.s3.text', {
  ru: 'Отправляйте фотографии до 20 МБ и файлы до 100 МБ, записывайте голосовые сообщения и видеокружки.',
  en: 'Send photos up to 20 MB and files up to 100 MB, record voice messages and video circles.',
  bg: 'Изпращайте снимки до 20 МБ и файлове до 100 МБ, записвайте гласови съобщения и видеокръгчета.',
  uk: 'Отправляйте Фотографії до 20 МБ і Файли до 100 МБ, записуйте Голосові повідомлення і видеокружки.',
  be: 'Отправляйте Фотаздымкі да 20 МБ і Файлы да 100 МБ, записывайте Галасавыя Паведамленне і видеокружки.',
});
define('onboarding.s4.title', { ru: 'Группы и роли', en: 'Groups and roles', bg: 'Групи и роли', uk: 'Групи і Ролі', be: 'Групы і Ролі' 
});
define('onboarding.s4.text', {
  ru: 'Собирайте группы, выдавайте права участникам, ставьте теги и назначайте администраторов.',
  en: 'Create groups, grant permissions to members, add tags and appoint admins.',
  bg: 'Създавайте групи, давайте права на участниците, слагайте тагове и назначавайте администратори.',
  uk: 'Собирайте Групи, видавайте Права учасникам, ставьте теги і назначайте администраторов.',
  be: 'Собирайте Групы, выдавайте Правы удзельнікам, ставьте теги і назначайте администраторов.',
});
define('onboarding.s5.title', { ru: 'Звонки и экран', en: 'Calls and screen sharing', bg: 'Обаждания и екран', uk: 'Дзвінки і екран', be: 'Званкі і экран' 
});
define('onboarding.s5.text', {
  ru: 'Аудио- и видеозвонки, демонстрация экрана, выбор устройств и громкость собеседника — прямо в браузере.',
  en: 'Audio and video calls, screen sharing, device selection and peer volume — right in the browser.',
  bg: 'Аудио и видео разговори, споделяне на екран, избор на устройства и сила на звука — направо в браузъра.',
  uk: 'Аудіо- і видеозвонки, демонстрация екрана, Вибір пристроїв і Гучність співрозмовника — прямо у браузері.',
  be: 'Аўдыё- і видеозвонки, демонстрация экрана, Выбар прылад і Гучнасць суразмоўцы — прямо у браўзеры.',
});
define('onboarding.s6.title', { ru: 'Свои настройки', en: 'Your own settings', bg: 'Свои настройки', uk: 'Свої Налаштування', be: 'Свае Налады' 
});
define('onboarding.s6.text', {
  ru: 'Светлая и тёмная тема, акцентный цвет, обои чата, папки, черновики и уведомления — всё под себя.',
  en: 'Light and dark theme, accent color, chat wallpaper, folders, drafts and notifications — all your way.',
  bg: 'Светла и тъмна тема, акцентен цвят, тапет на чата, папки, чернови и известия — всичко по ваш вкус.',
  uk: 'Светла і Темна Тема, акцентний Колір, Шпалери чата, Папки, черновики і Сповіщення — Усе під собі.',
  be: 'Светлая і Цёмная тэма, акцентный Колер, Шпалеры чата, Папкі, черновики і Апавяшчэнні — Усё пад сябе.',
});

// ---- Значки и статусы аккаунта ----
define('badge.yargramTooltip', {
  ru: 'Подтверждён представителями Yargram',
  en: 'Verified by Yargram representatives',
  bg: 'Потвърдено от представители на Yargram',
  uk: 'Підтверджено представителями Yargram',
  be: 'Пацверджана представителями Yargram',
});
define('badge.yargramAria', { ru: 'Значок Yargram', en: 'Yargram badge', bg: 'Значка Yargram', uk: 'Значок Yargram', be: 'Значок Yargram' 
});
define('badge.verifiedAria', { ru: 'Подтверждено', en: 'Verified', bg: 'Потвърдено', uk: 'Подтверждено', be: 'Подтверждено' 
});
define('badge.verifiedAccount', { ru: 'Подтверждённый аккаунт', en: 'Verified account', bg: 'Потвърден профил', uk: 'Підтверджений Акаунт', be: 'Подтверждённый Акаўнт' 
});
define('badge.verifiedGroup', { ru: 'Подтверждённая группа', en: 'Verified group', bg: 'Потвърдена група', uk: 'Подтверждённа Група', be: 'Подтверждённая Група' 
});
define('badge.scamAccountAria', {
  ru: 'Отметка SCAM: аккаунт помечен как мошеннический',
  en: 'SCAM mark: the account is flagged as fraudulent',
  bg: 'Отбелязка SCAM: профилът е отбелязан като измамен',
  uk: 'Позначка SCAM: Акаунт помечен як мошеннический',
  be: 'Адзнака SCAM: Акаўнт помечен як мошеннический',
});
define('badge.scamGroupAria', {
  ru: 'Отметка SCAM: группа помечена как мошенническая',
  en: 'SCAM mark: the group is flagged as fraudulent',
  bg: 'Отбелязка SCAM: групата е отбелязана като измамна',
  uk: 'Позначка SCAM: Група помечена як мошенническа',
  be: 'Адзнака SCAM: Група помечена як мошенническая',
});
define('badge.scamTitle', { ru: 'Мошенник', en: 'Scammer', bg: 'Измамник', uk: 'Мошенник', be: 'Мошенник' 
});
define('badge.fakeAccountAria', {
  ru: 'Отметка FAKE: аккаунт выдаёт себя за официальный',
  en: 'FAKE mark: the account impersonates an official one',
  bg: 'Отбелязка FAKE: профилът се представя за официален',
  uk: 'Позначка FAKE: акаунт видає себе за офіційний',
  be: 'Адзнака FAKE: акаунт выдае сябе за афіцыйны',
});
define('badge.fakeGroupAria', {
  ru: 'Отметка FAKE: группа выдаёт себя за официальную',
  en: 'FAKE mark: the group impersonates an official one',
  bg: 'Отбелязка FAKE: групата се представя за официална',
  uk: 'Позначка FAKE: Група видає себе за офіційну',
  be: 'Адзнака FAKE: Група выдае сябе за афіцыйную',
});
define('badge.fakeTitle', {
  ru: 'Выдаёт себя за официальный',
  en: 'Impersonates an official account',
  bg: 'Представя се за официален',
  uk: 'Видає себе за офіційний',
  be: 'Выдае сябе за афіцыйны',
});
define('badge.frozenAria', { ru: 'Аккаунт заморожен', en: 'Account frozen', bg: 'Профилът е замразен', uk: 'Акаунт заморожен', be: 'Акаўнт заморожен' 
});
define('badge.botAria', {  ru: 'Служебный аккаунт бота',
  en: 'Service bot account',
  bg: 'Служебен профил на бот',
  uk: 'Службовий акаунт бота',
  be: 'Службовы акаўнт бота',
});
// Сервер отдаёт предупреждение о мошенничестве готовым русским текстом (см.
// SCAM_BIO_WARNING в models.ts). Локализуем его на клиенте по совпадению:
// так сервер остаётся единственным источником правды, а защита от копирования
// (scamGuard) продолжает работать. ⚠️ отрезается в карточке — здесь без него.
define('scam.accountWarning', {
  ru: 'Внимание: на этот аккаунт часто жаловались в связи с мошенничеством или попытками выдать себя за официальный аккаунт. Будьте осторожны, особенно если у Вас попросят денег.',
  en: 'Warning: this account has been frequently reported for fraud or for impersonating an official account. Be careful, especially if you are asked for money.',
  bg: 'Внимание: този профил е често докладван за измама или за опити да се представи за официален профил. Бъдете внимателни, особено ако ви поискат пари.',
  uk: 'Внимание: на цей Акаунт часто жаловались у зв’язку з мошенничеством або спробами видати собі за офіційний Акаунт. Будьте обережні, особенно якщо у Вас попросят денег.',
  be: 'Внимание: на гэты Акаўнт часто жаловались у сувязі з мошенничеством або попытками выдать сябе за официальный Акаўнт. Будзьце асцярожныя, особенно калі у Вас попросят денег.',
});
define('scam.groupWarning', {
  ru: 'Внимание: на эту группу часто жаловались в связи с мошенничеством или попытками выдать себя за официальную группу. Будьте осторожны, особенно если у Вас попросят денег.',
  en: 'Warning: this group has been frequently reported for fraud or for impersonating an official group. Be careful, especially if you are asked for money.',
  bg: 'Внимание: тази група е често докладвана за измама или за опити да се представи за официална група. Бъдете внимателни, особено ако ви поискат пари.',
  uk: 'Внимание: на цю групу часто жаловались у зв’язку з мошенничеством або спробами видати собі за официальную групу. Будьте обережні, особенно якщо у Вас попросят денег.',
  be: 'Внимание: на гэтую групу часто жаловались у сувязі з мошенничеством або попытками выдать сябе за официальную групу. Будзьце асцярожныя, особенно калі у Вас попросят денег.',
});
// Отметка FAKE: сервер отдаёт русский текст (FAKE_BIO_WARNING в models.ts),
// клиент узнаёт его по началу фразы и переводит. ⚠️ здесь уже отрезан.
define('fake.accountWarning', {
  ru: 'Внимание: многие жаловались, что этот аккаунт выдаёт себя за официальный.',
  en: 'Warning: many users have reported that this account impersonates an official one.',
  bg: 'Внимание: мнозина се оплакаха, че този профил се представя за официален.',
  uk: 'Увага: багато хто скаржився, що цей акаунт видає себе за офіційний.',
  be: 'Увага: многія скардзіліся, што гэты акаунт выдае сябе за афіцыйны.',
});
// То же для группы: FAKE_GROUP_WARNING в models.ts. Фраза отличается от
// аккаунтной только хвостом («этот аккаунт» / «эта группа»), поэтому клиент
// сверяет её отдельно, иначе группа получила бы текст про аккаунт.
define('fake.groupWarning', {
  ru: 'Внимание: многие жаловались, что эта группа выдаёт себя за официальную.',
  en: 'Warning: many users have reported that this group impersonates an official one.',
  bg: 'Внимание: мнозина се оплакаха, че тази група се представя за официална.',
  uk: 'Увага: багато хто скаржився, що ця група видає себе за офіційну.',
  be: 'Увага: многія скардзіліся, што гэтая група выдае сябе за афіцыйную.',
});
define('presence.online', { ru: 'В сети', en: 'Online', bg: 'На линия', uk: 'У мережі', be: 'У сетцы' 
});
define('presence.offline', { ru: 'Не в сети', en: 'Offline', bg: 'Извън линия', uk: 'Не у мережі', be: 'Не ў сетцы' 
});
// У бота присутствия нет: он не «в сети» и не «был(а) недавно» — он просто бот.
define('presence.bot', { ru: 'бот', en: 'bot', bg: 'бот', uk: 'бот', be: 'бот' 
});
// Подписи «был(а) …» — собираются в formatLastSeen из lib/presence.ts.
define('presence.unknown', { ru: 'Статус неизвестен', en: 'Status unknown', bg: 'Статусът е неизвестен', uk: 'Статус неизвестен', be: 'Статус неизвестен' 
});
define('presence.onlineShort', { ru: 'В сети', en: 'Online', bg: 'На линия', uk: 'У мережі', be: 'У сетцы' 
});
define('presence.wasRecently', { ru: 'Был(а) недавно', en: 'Last seen recently', bg: 'Беше наскоро', uk: 'Був(ла) Нещодавно', be: 'Быў(ла) Нядаўна' 
});
define('presence.wasWeek', { ru: 'Был(а) на прошлой неделе', en: 'Last seen last week', bg: 'Беше миналата седмица', uk: 'Був(ла) на прошлой неделе', be: 'Быў(ла) на прошлой неделе' 
});
define('presence.wasMonth', { ru: 'Был(а) в прошлом месяце', en: 'Last seen last month', bg: 'Беше миналия месец', uk: 'Був(ла) у прошлом месяце', be: 'Быў(ла) у прошлом месяце' 
});
define('presence.wasLongAgo', { ru: 'Был(а) давно', en: 'Last seen a long time ago', bg: 'Беше отдавна', uk: 'Був(ла) Давно', be: 'Быў(ла) Давно' 
});
define('presence.wasJustNow', { ru: 'Был(а) только что', en: 'Last seen just now', bg: 'Беше току-що', uk: 'Був(ла) тільки що', be: 'Быў(ла) толькі што' 
});
define('presence.wasTodayAt', {
  ru: 'Был(а) в {time}',
  en: 'Last seen at {time}',
  bg: 'Беше в {time}',
  uk: 'Був(ла) у {time}',
  be: 'Быў(ла) у {time}',
});
define('presence.wasYesterdayAt', {
  ru: 'Был(а) вчера в {time}',
  en: 'Last seen yesterday at {time}',
  bg: 'Беше вчера в {time}',
  uk: 'Був(ла) Учора у {time}',
  be: 'Быў(ла) Учора у {time}',
});
define('presence.wasDateAt', {
  ru: 'Был(а) {date} в {time}',
  en: 'Last seen on {date} at {time}',
  bg: 'Беше на {date} в {time}',
  uk: 'Був(ла) {date} у {time}',
  be: 'Быў(ла) {date} у {time}',
});
// Группы в списке участников: «В сети», «Недавно», «Давно».
define('presence.bucketOnline', { ru: 'В сети', en: 'Online', bg: 'На линия', uk: 'У мережі', be: 'У сетцы' 
});
define('presence.bucketRecent', { ru: 'Недавно', en: 'Recently', bg: 'Наскоро', uk: 'Нещодавно', be: 'Нядаўна' 
});
define('presence.bucketWeek', { ru: 'На прошлой неделе', en: 'Last week', bg: 'Миналата седмица', uk: 'На прошлой неделе', be: 'На прошлой неделе' 
});
define('presence.bucketMonth', { ru: 'В прошлом месяце', en: 'Last month', bg: 'Миналия месец', uk: 'У прошлом месяце', be: 'У прошлом месяце' 
});
define('presence.bucketLongAgo', { ru: 'Давно', en: 'A long time ago', bg: 'Отдавна', uk: 'Давно', be: 'Давно' 
});
define('deleted.account', { ru: 'Удалённый аккаунт', en: 'Deleted account', bg: 'Изтрит профил', uk: 'Видалений акаунт', be: 'Выдалены акаўнт' 
});

// ---- Общие загрузки ----
define('loading.dialogs', { ru: 'Загрузка диалогов', en: 'Loading chats', bg: 'Зареждане на разговори', uk: 'Завантаження діалогів', be: 'Загрузка дыялогаў' 
});
define('loading.messages', { ru: 'Загрузка сообщений', en: 'Loading messages', bg: 'Зареждане на съобщения', uk: 'Завантаження Повідомлень', be: 'Загрузка Паведамленняў' 
});
define('error.somethingWrong', { ru: 'Что-то пошло не так', en: 'Something went wrong', bg: 'Нещо се обърка', uk: 'Щось пошло не так', be: 'Што-то пошло не так' 
});

// ---- Боковое меню ----
define('sidebar.menuLabel', { ru: 'Меню', en: 'Menu', bg: 'Меню', uk: 'Меню', be: 'Меню' 
});
define('sidebar.collapse', { ru: 'Свернуть', en: 'Collapse', bg: 'Свий', uk: 'Згорнути', be: 'Згарнуць' 
});
define('sidebar.closeMenu', { ru: 'Закрыть меню', en: 'Close menu', bg: 'Затвори менюто', uk: 'Закрити меню', be: 'Закрыць меню' 
});
define('sidebar.online', { ru: 'в сети', en: 'online', bg: 'на линия', uk: 'у мережі', be: 'у сетцы' 
});
define('sidebar.offline', { ru: 'не в сети', en: 'offline', bg: 'извън линия', uk: 'Не у мережі', be: 'Не ў сетцы' 
});
define('sidebar.activeAccount', { ru: 'Активный аккаунт', en: 'Active account', bg: 'Активен профил', uk: 'Активний Акаунт', be: 'Активный Акаўнт' 
});
define('sidebar.logoutAccount', {
  ru: 'Выйти из аккаунта {name}',
  en: 'Log out of {name}',
  bg: 'Изход от профила {name}',
  uk: 'Вийти з Акаунта {name}',
  be: 'Выйсці з Акаўнта {name}',
});
define('sidebar.logoutAccountShort', { ru: 'Выйти из аккаунта', en: 'Log out', bg: 'Изход от профила', uk: 'Вийти з Акаунта', be: 'Выйсці з Акаўнта' 
});
define('sidebar.addAccount', { ru: 'Добавить аккаунт', en: 'Add account', bg: 'Добави профил', uk: 'Додати Акаунт', be: 'Дадаць Акаўнт' 
});
define('sidebar.accountLimit', { ru: 'Предел устройства — {limit} аккаунта. Значок Yargram или галочка поднимают его до 4, у владельца предела нет.', en: 'This device is limited to {limit} accounts. The Yargram badge or a checkmark raises it to 4; owners have no limit.', bg: 'Устройството е ограничено до {limit} акаунта. Значката Yargram или отметката го вдигат до 4, собственикът няма ограничение.', uk: 'Пристрій обмежено {limit} акаунтами. Значок Yargram або галочка піднімають межу до 4, у власника межі немає.', be: 'Прылада абмежавана {limit} акаўнтамі. Значок Yargram або галачка падымаюць мяжу да 4, у ўладальніка мяжы няма.' 
});
define('sidebar.mainMenu', { ru: 'Главное меню', en: 'Main menu', bg: 'Главно меню', uk: 'Главне меню', be: 'Главное меню' 
});
define('sidebar.myProfile', { ru: 'Мой профиль', en: 'My profile', bg: 'Моят профил', uk: 'Мой Профіль', be: 'Мой Профіль' 
});
define('sidebar.friends', { ru: 'Друзья', en: 'Friends', bg: 'Приятели', uk: 'Друзі', be: 'Сябры' 
});
define('sidebar.createGroup', { ru: 'Создать группу', en: 'Create group', bg: 'Създай група', uk: 'Створити групу', be: 'Стварыць групу' 
});
define('sidebar.createChannel', { ru: 'Создать канал', en: 'Create channel', bg: 'Създай канал', uk: 'Створити Канал', be: 'Стварыць Канал' 
});
define('sidebar.blocked', { ru: 'Заблокированные', en: 'Blocked users', bg: 'Блокирани', uk: 'Заблоковані', be: 'Заблакаваныя' 
});
// Вкладки списка бесед: «Чаты» и «Архив».
define('sidebar.chats', { ru: 'Чаты', en: 'Chats', bg: 'Разговори', uk: 'Чати', be: 'Чаты' 
});
define('sidebar.filterAll', { ru: 'Все', en: 'All', bg: 'Всички', uk: 'Всі', be: 'Усе' 
});
define('sidebar.filterDirect', { ru: 'Личные', en: 'Direct', bg: 'Лични', uk: 'Особисті', be: 'Асабістыя' 
});
define('sidebar.filterGroups', { ru: 'Группы', en: 'Groups', bg: 'Групи', uk: 'Групи', be: 'Групы' 
});
define('sidebar.filterUnread', { ru: 'Непрочитанные', en: 'Unread', bg: 'Непрочетени', uk: 'Непрочитані', be: 'Непрачытаныя' 
});
define('sidebar.pinChat', { ru: 'Закрепить чат', en: 'Pin chat', bg: 'Закачи разговор', uk: 'Закріпити чат', be: 'Замацаваць чат' 
});
define('sidebar.unpinChat', { ru: 'Открепить чат', en: 'Unpin chat', bg: 'Откачи разговор', uk: 'Відкріпити чат', be: 'Адмацаваць чат' 
});
define('sidebar.pinnedLimit', { ru: 'Можно закрепить не более 5 чатов', en: 'You can pin up to 5 chats', bg: 'Можете да закачите до 5 разговора', uk: 'Можна закріпити щонайбільше 5 чатів', be: 'Можна замацаваць не больш за 5 чатаў' 
});
define('sidebar.archive', { ru: 'Архив', en: 'Archive', bg: 'Архив', uk: 'Архів', be: 'Архіў' 
});
define('sidebar.calls', { ru: 'Звонки', en: 'Calls', bg: 'Обаждания', uk: 'Дзвінки', be: 'Званкі' 
});
define('sidebar.favorites', { ru: 'Избранное', en: 'Saved messages', bg: 'Запазени', uk: 'Обране', be: 'Выбранае' 
});
define('sidebar.notes', { ru: 'Заметки', en: 'Notes', bg: 'Бележки', uk: 'Заметки', be: 'Заметки' 
});
define('sidebar.settings', { ru: 'Настройки', en: 'Settings', bg: 'Настройки', uk: 'Налаштування', be: 'Налады' 
});
define('sidebar.admin', { ru: 'Админ-панель', en: 'Admin panel', bg: 'Админ панел', uk: 'Адмін-панель', be: 'Адмін-панэль' 
});
define('sidebar.support', { ru: 'Поддержка', en: 'Support', bg: 'Поддръжка', uk: 'Підтримка', be: 'Падтрымка' 
});
define('sidebar.nightMode', { ru: 'Ночной режим', en: 'Night mode', bg: 'Нощен режим', uk: 'Нічний режим', be: 'Начны рэжым' 
});
define('sidebar.logout', { ru: 'Выйти', en: 'Log out', bg: 'Изход', uk: 'Вийти', be: 'Выйсці' 
});
define('sidebar.about', { ru: 'О программе', en: 'About', bg: 'Относно', uk: 'Про програму', be: 'Пра праграму' 
});
define('sidebar.betaTip', { ru: 'Закрытое бета-тестирование', en: 'Closed beta testing', bg: 'Затворено бета тестване', uk: 'Закрите бета-тестирование', be: 'Закрытое бета-тестирование' 
});
define('sidebar.version', { ru: 'Версия {version} {channel}', en: 'Version {version} {channel}', bg: 'Версия {version} {channel}', uk: 'Версія {version} {channel}', be: 'Версія {version} {channel}' 
});
define('sidebar.sectionLater', { ru: 'Этот раздел появится позже.', en: 'This section will appear later.', bg: 'Този раздел ще се появи по-късно.', uk: 'Цей раздел появится позже.', be: 'Гэты раздел появится позже.' 
});

// ---- Модальные окна ----
define('modals.close', { ru: 'Закрыть', en: 'Close', bg: 'Затвори', uk: 'Закрити', be: 'Закрыць' 
});
define('modals.forwardMessage', { ru: 'Переслать сообщение', en: 'Forward message', bg: 'Препрати съобщение', uk: 'Переслати Повідомлення', be: 'Пераслаць Паведамленне' 
});
define('modals.findDialog', { ru: 'Найти диалог', en: 'Find chat', bg: 'Търси чат', uk: 'Знайти диалог', be: 'Знайсці диалог' 
});
define('modals.directDialog', { ru: 'Личный диалог', en: 'Direct chat', bg: 'Личен чат', uk: 'Особистий диалог', be: 'Личный диалог' 
});
define('modals.noSuitableDialogs', { ru: 'Подходящих диалогов нет.', en: 'No suitable chats.', bg: 'Няма подходящи чатове.', uk: 'Подходящих діалогів Ні.', be: 'Подходящих дыялогаў Не.' 
});
define('modals.forwardFailed', { ru: 'Не удалось переслать сообщение.', en: 'Could not forward the message.', bg: 'Съобщението не можа да бъде препратено.', uk: 'Не вдалося Переслати Повідомлення.', be: 'Не ўдалося Пераслаць Паведамленне.' 
});
define('modals.favoritesTitle', { ru: 'Избранные сообщения', en: 'Saved messages', bg: 'Запазени съобщения', uk: 'Обрані Повідомлення', be: 'Выбраныя Паведамленне' 
});
define('modals.favoritesSubtitle', { ru: 'Сохранённые сообщения доступны после перезапуска', en: 'Saved messages stay available after restart', bg: 'Запазените съобщения са налични и след рестартиране', uk: 'Збережені Повідомлення доступні после перезапуска', be: 'Сохранённые Паведамленне доступны после перезапуска' 
});
define('modals.favoritesEmpty', { ru: 'Здесь пока пусто', en: 'Nothing here yet', bg: 'Тук все още е празно', uk: 'Тут пока пусто', be: 'Тут пока пусто' 
});
define('modals.favoritesEmptyHint', { ru: 'Добавьте сообщение через меню действий.', en: 'Add a message from the actions menu.', bg: 'Добавете съобщение от менюто с действия.', uk: 'Додайте Повідомлення через меню действий.', be: 'Дадайце Паведамленне через меню действий.' 
});
define('modals.favoritesLoadFailed', { ru: 'Не удалось загрузить избранное.', en: 'Could not load saved messages.', bg: 'Запазените съобщения не можаха да се заредят.', uk: 'Не вдалося Завантажити Обране.', be: 'Не ўдалося Загрузіць Выбранае.' 
});
define('modals.you', { ru: 'Вы', en: 'You', bg: 'Вие', uk: 'Ви', be: 'Вы' 
});
define('modals.peer', { ru: 'Собеседник', en: 'Contact', bg: 'Събеседник', uk: 'Співрозмовник', be: 'Суразмоўца' 
});
define('modals.reportSpam', { ru: 'Спам', en: 'Spam', bg: 'Спам', uk: 'Спам', be: 'Спам' 
});
define('modals.reportAbuse', { ru: 'Оскорбления', en: 'Abuse', bg: 'Обиди', uk: 'Образи', be: 'Абразы' 
});
define('modals.reportFraud', { ru: 'Мошенничество', en: 'Fraud', bg: 'Измама', uk: 'Шахрайство', be: 'Махлярства' 
});
define('modals.reportOther', { ru: 'Другое', en: 'Other', bg: 'Друго', uk: 'Інше', be: 'Іншае' 
});
define('modals.profileTitle', { ru: 'Профиль', en: 'Profile', bg: 'Профил', uk: 'Профіль', be: 'Профіль' 
});
define('modals.statusLabel', { ru: 'Статус', en: 'Status', bg: 'Статус', uk: 'Статус', be: 'Статус' 
});
define('modals.online', { ru: 'В сети', en: 'Online', bg: 'На линия', uk: 'У мережі', be: 'У сетцы' 
});
define('modals.offline', { ru: 'Не в сети', en: 'Offline', bg: 'Извън линия', uk: 'Не у мережі', be: 'Не ў сетцы' 
});
define('modals.yargramSince', { ru: 'В Yargram с', en: 'On Yargram since', bg: 'В Yargram от', uk: 'У Yargram з', be: 'У Yargram з' 
});
define('modals.dateUnknown', { ru: 'Дата неизвестна', en: 'Date unknown', bg: 'Неизвестна дата', uk: 'Дата неизвестна', be: 'Дата неизвестна' 
});
define('modals.write', { ru: 'Написать', en: 'Message', bg: 'Напиши', uk: 'Написать', be: 'Написать' 
});
define('modals.call', { ru: 'Позвонить', en: 'Call', bg: 'Обади се', uk: 'Позвонить', be: 'Позвонить' 
});
define('modals.video', { ru: 'Видео', en: 'Video', bg: 'Видео', uk: 'Відео', be: 'Відэа' 
});
define('modals.unblock', { ru: 'Разблокировать', en: 'Unblock', bg: 'Отблокирай', uk: 'Розблокувати', be: 'Разблакаваць' 
});
define('modals.block', { ru: 'Заблокировать', en: 'Block', bg: 'Блокирай', uk: 'Заблокувати', be: 'Заблакаваць' 
});
define('modals.report', { ru: 'Пожаловаться', en: 'Report', bg: 'Сигнализирай', uk: 'Поскаржитися', be: 'Паскардзіцца' 
});
define('modals.reportReason', { ru: 'Причина жалобы', en: 'Report reason', bg: 'Причина за сигнала', uk: 'Причина Скарги', be: 'Прычына Скаргі' 
});
define('modals.describeProblem', { ru: 'Опишите проблему', en: 'Describe the problem', bg: 'Опишете проблема', uk: 'Опишіть проблему', be: 'Апішыце проблему' 
});
define('modals.submitReport', { ru: 'Отправить жалобу', en: 'Submit report', bg: 'Изпрати сигнала', uk: 'Надіслати жалобу', be: 'Адправіць жалобу' 
});
define('modals.confirmBlock', { ru: 'Заблокировать @{name}? Он не сможет писать и звонить вам.', en: 'Block @{name}? They will not be able to message or call you.', bg: 'Да блокирам ли @{name}? Той няма да може да пише и да ви се обажда.', uk: 'Заблокувати @{name}? Він не зможе писать і звонить вам.', be: 'Заблакаваць @{name}? Ён не зможа писать і звонить вам.' 
});
define('modals.userBlocked', { ru: 'Пользователь заблокирован.', en: 'User blocked.', bg: 'Потребителят е блокиран.', uk: 'Користувач Заблоковано.', be: 'Карыстальнік Заблакавана.' 
});
define('modals.userUnblocked', { ru: 'Пользователь разблокирован.', en: 'User unblocked.', bg: 'Потребителят е отблокиран.', uk: 'Користувач разблокирован.', be: 'Карыстальнік разблокирован.' 
});
define('modals.blockChangeFailed', { ru: 'Не удалось изменить блокировку.', en: 'Could not change the block.', bg: 'Блокирането не можа да бъде променено.', uk: 'Не вдалося Змінити блокуванну.', be: 'Не ўдалося Змяніць блакаванну.' 
});
define('modals.reportSent', { ru: 'Жалоба отправлена и сохранена.', en: 'Report submitted and saved.', bg: 'Сигналът е изпратен и запазен.', uk: 'Скарга отправлена і сохранена.', be: 'Скарга отправлена і сохранена.' 
});
define('modals.reportFailed', { ru: 'Не удалось отправить жалобу.', en: 'Could not submit the report.', bg: 'Сигналът не можа да бъде изпратен.', uk: 'Не вдалося Надіслати жалобу.', be: 'Не ўдалося Адправіць жалобу.' 
});
define('modals.blockedUsersTitle', { ru: 'Заблокированные', en: 'Blocked users', bg: 'Блокирани', uk: 'Заблоковані', be: 'Заблакаваныя' 
});
define('modals.blockedUsersSubtitle', { ru: 'Эти пользователи не могут писать и звонить вам', en: 'These users cannot message or call you', bg: 'Тези потребители не могат да пишат и да ви се обаждат', uk: 'Ці Користувачі не можуть писать і звонить вам', be: 'Гэтыя Карыстальнікі не могуць писать і звонить вам' 
});
define('modals.listLoadFailed', { ru: 'Не удалось загрузить список.', en: 'Could not load the list.', bg: 'Списъкът не можа да бъде зареден.', uk: 'Не вдалося Завантажити список.', be: 'Не ўдалося Загрузіць спіс.' 
});
define('modals.unblockFailed', { ru: 'Не удалось разблокировать.', en: 'Could not unblock.', bg: 'Не можа да се отблокира.', uk: 'Не вдалося Розблокувати.', be: 'Не ўдалося Разблакаваць.' 
});
define('modals.blockedUsersEmpty', { ru: 'Список пуст', en: 'The list is empty', bg: 'Списъкът е празен', uk: 'Список пуст', be: 'Спіс пуст' 
});

// ---- Друзья ----
define('friends.title', { ru: 'Друзья', en: 'Friends', bg: 'Приятели', uk: 'Друзі', be: 'Сябры' 
});
define('friends.subtitle', { ru: 'Друзья и заявки — всё хранится на сервере', en: 'Friends and requests — all stored on the server', bg: 'Приятели и заявки — всичко се пази на сървъра', uk: 'Друзі і Заявки — Усе хранится на сервере', be: 'Сябры і Заяўкі — Усё хранится на сервере' 
});
define('friends.incomingSection', { ru: 'Заявки — {count}', en: 'Requests — {count}', bg: 'Заявки — {count}', uk: 'Заявки — {count}', be: 'Заяўкі — {count}' 
});
define('friends.friendsSection', { ru: 'Мои друзья — {count}', en: 'My friends — {count}', bg: 'Моите приятели — {count}', uk: 'Мои Друзі — {count}', be: 'Мои Сябры — {count}' 
});
define('friends.outgoingSection', { ru: 'Отправленные — {count}', en: 'Sent — {count}', bg: 'Изпратени — {count}', uk: 'Надіслані — {count}', be: 'Отправленные — {count}' 
});
define('friends.wantsToAddYou', { ru: 'хочет добавить вас в друзья', en: 'wants to add you as a friend', bg: 'иска да ви добави като приятел', uk: 'хоче Додати вас у Друзі', be: 'хоча Дадаць вас у Сябры' 
});
define('friends.accept', { ru: 'Принять', en: 'Accept', bg: 'Приеми', uk: 'Прийняти', be: 'Прыняць' 
});
define('friends.decline', { ru: 'Отклонить', en: 'Decline', bg: 'Откажи', uk: 'Відхилити', be: 'Адхіліць' 
});
define('friends.remove', { ru: 'Удалить {name} из друзей', en: 'Remove {name} from friends', bg: 'Премахни {name} от приятели', uk: 'Видалити {name} з Друзів', be: 'Выдаліць {name} з Сяброў' 
});
define('friends.confirmRemove', { ru: 'Удалить {name} из друзей?', en: 'Remove {name} from friends?', bg: 'Да премахна ли {name} от приятели?', uk: 'Видалити {name} з Друзів?', be: 'Выдаліць {name} з Сяброў?' 
});
define('friends.removed', { ru: '{name} больше не в друзьях.', en: '{name} is no longer a friend.', bg: '{name} вече не е приятел.', uk: '{name} більше не у друзьях.', be: '{name} больш не у друзьях.' 
});
define('friends.accepted', { ru: 'Теперь вы друзья с {name}.', en: 'You and {name} are now friends.', bg: 'Вие и {name} вече сте приятели.', uk: 'Тепер Ви друзі з {name}.', be: 'Цяпер Вы сябры з {name}.' 
});
define('friends.requestSent', { ru: 'заявка отправлена', en: 'request sent', bg: 'заявката е изпратена', uk: 'Заявку надіслано', be: 'Заяўка адпраўлена' 
});
define('friends.cancelRequest', { ru: 'Отменить заявку', en: 'Cancel request', bg: 'Отмени заявката', uk: 'Скасувати Заявку', be: 'Скасаваць Заяўку' 
});
define('friends.noUsername', { ru: 'без @username', en: 'no @username', bg: 'без @username', uk: 'без @username', be: 'без @username' 
});
define('friends.loadFailed', { ru: 'Не удалось загрузить друзей.', en: 'Could not load friends.', bg: 'Приятелите не можаха да се заредят.', uk: 'Не вдалося Завантажити Друзів.', be: 'Не ўдалося Загрузіць Сяброў.' 
});
define('friends.actionFailed', { ru: 'Не удалось выполнить действие.', en: 'Could not complete the action.', bg: 'Действието не можа да бъде изпълнено.', uk: 'Не вдалося виконати действие.', be: 'Не ўдалося выканаць действие.' 
});
define('friends.empty', { ru: 'Пока никого нет', en: 'Nobody here yet', bg: 'Още никой няма', uk: 'Пока нікого Ні', be: 'Пока нікога Не' 
});
define('friends.emptyHint', { ru: 'Найдите человека по @username в поиске диалогов и добавьте его в друзья.', en: 'Find someone by @username in the chat search and add them as a friend.', bg: 'Намерете човек по @username в търсенето на чатове и го добавете като приятел.', uk: 'Знайдіть человека по @username у поиске діалогів і додайте його у Друзі.', be: 'Знайдзіце человека па @username у поиске дыялогаў і дадайце яго у Сябры.' 
});
define('friends.addHint', { ru: 'Добавить в друзья можно из профиля человека.', en: 'You can add a friend from their profile.', bg: 'Можете да добавите приятел от профила му.', uk: 'Додати у друзі можна з профиля человека.', be: 'Дадаць у сябры можна з профиля человека.' 
});
define('friends.addButton', { ru: 'Добавить в друзья', en: 'Add friend', bg: 'Добави приятел', uk: 'Додати у друзі', be: 'Дадаць у сябры' 
});
define('friends.requestSentButton', { ru: 'Заявка отправлена', en: 'Request sent', bg: 'Заявката е изпратена', uk: 'Заявку надіслано', be: 'Заяўка адпраўлена' 
});
define('friends.acceptButton', { ru: 'Принять заявку', en: 'Accept request', bg: 'Приеми заявката', uk: 'Прийняти Заявку', be: 'Прыняць Заяўку' 
});
define('friends.inFriends', { ru: 'Вы друзья', en: 'You are friends', bg: 'Вие сте приятели', uk: 'Ви друзі', be: 'Вы сябры' 
});
define('friends.removeButton', { ru: 'Удалить из друзей', en: 'Remove friend', bg: 'Премахни от приятели', uk: 'Видалити з друзів', be: 'Выдаліць з сяброў' 
});
define('friends.addFailed', { ru: 'Не удалось отправить заявку.', en: 'Could not send the request.', bg: 'Заявката не можа да бъде изпратена.', uk: 'Не вдалося Надіслати Заявку.', be: 'Не ўдалося Адправіць Заяўку.' 
});
define('friends.requestSentNotice', { ru: 'Заявка отправлена.', en: 'Request sent.', bg: 'Заявката е изпратена.', uk: 'Заявку надіслано.', be: 'Заяўка адпраўлена.' 
});
define('friends.acceptedNotice', { ru: 'Заявка принята.', en: 'Request accepted.', bg: 'Заявката е приета.', uk: 'Заявка принята.', be: 'Заяўка принята.' 
});
define('modals.notesTitle', { ru: 'Избранные заметки', en: 'Saved notes', bg: 'Запазени бележки', uk: 'Обрані заметки', be: 'Выбраныя заметки' 
});
define('modals.newNotePlaceholder', { ru: 'Новая заметка...', en: 'New note...', bg: 'Нова бележка...', uk: 'Нова заметка...', be: 'Новая заметка...' 
});
define('modals.add', { ru: 'Добавить', en: 'Add', bg: 'Добави', uk: 'Додати', be: 'Дадаць' 
});
define('modals.delete', { ru: 'Удалить', en: 'Delete', bg: 'Изтрий', uk: 'Видалити', be: 'Выдаліць' 
});
define('modals.notesLoadFailed', { ru: 'Не удалось загрузить заметки.', en: 'Could not load notes.', bg: 'Бележките не можаха да се заредят.', uk: 'Не вдалося Завантажити заметки.', be: 'Не ўдалося Загрузіць заметки.' 
});
define('modals.noteCreateFailed', { ru: 'Не удалось создать заметку.', en: 'Could not create the note.', bg: 'Бележката не можа да бъде създадена.', uk: 'Не вдалося Створити заметку.', be: 'Не ўдалося Стварыць заметку.' 
});
define('modals.noteUpdateFailed', { ru: 'Не удалось обновить заметку.', en: 'Could not update the note.', bg: 'Бележката не можа да бъде обновена.', uk: 'Не вдалося Оновити заметку.', be: 'Не ўдалося Абнавіць заметку.' 
});
define('modals.noteDeleteFailed', { ru: 'Не удалось удалить заметку.', en: 'Could not delete the note.', bg: 'Бележката не можа да бъде изтрита.', uk: 'Не вдалося Видалити заметку.', be: 'Не ўдалося Выдаліць заметку.' 
});
define('modals.newChat', { ru: 'Новый диалог', en: 'New chat', bg: 'Нов чат', uk: 'Новий диалог', be: 'Новы диалог' 
});
define('modals.searchSubtitle', { ru: 'Найдите человека по его @username — основному или дополнительному', en: 'Find someone by their @username — primary or additional', bg: 'Намерете човек по неговия @username — основен или допълнителен', uk: 'Знайдіть человека по його @username — основному або дополнительному', be: 'Знайдзіце человека па яго @username — основному або дополнительному' 
});
define('modals.searchUsersLabel', { ru: 'Поиск пользователей', en: 'Search users', bg: 'Търсене на потребители', uk: 'Пошук користувачей', be: 'Пошук карыстальнікей' 
});
define('modals.searchExample', { ru: 'Например, @top1nuk1', en: 'For example, @top1nuk1', bg: 'Например, @top1nuk1', uk: 'Наприклад, @top1nuk1', be: 'Напрыклад, @top1nuk1' 
});
define('modals.whoToFind', { ru: 'Кого найдём?', en: 'Who are we looking for?', bg: 'Кого да търсим?', uk: 'Кого найдём?', be: 'Каго найдём?' 
});
define('modals.enterThreeChars', { ru: 'Введите хотя бы три символа username.', en: 'Enter at least three characters of the username.', bg: 'Въведете поне три символа от username.', uk: 'Введіть хотя б три символа username.', be: 'Увядзіце хотя б три символа username.' 
});
define('modals.searching', { ru: 'Ищем людей…', en: 'Searching for people…', bg: 'Търсим хора…', uk: 'Ищем людей…', be: 'Ищем людей…' 
});
define('modals.searchFailed', { ru: 'Не удалось выполнить поиск.', en: 'Search failed.', bg: 'Търсенето не бе успешно.', uk: 'Не вдалося виконати Пошук.', be: 'Не ўдалося выканаць Пошук.' 
});
define('modals.noResults', { ru: 'Никого не нашли', en: 'Nothing found', bg: 'Нищо не е намерено', uk: 'Нікого не нашли', be: 'Нікога не нашли' 
});
define('modals.noResultsHint', { ru: 'Проверьте запрос или попробуйте другой username.', en: 'Check the query or try another username.', bg: 'Проверете заявката или опитайте друг username.', uk: 'Перевірте запит або спробуйте інший username.', be: 'Праверце запыт або паспрабуйце іншы username.' 
});
define('modals.foundUsers', { ru: 'Найденные пользователи', en: 'Found users', bg: 'Намерени потребители', uk: 'Знайдені Користувачі', be: 'Найденные Карыстальнікі' 
});
define('modals.createChatFailed', { ru: 'Не удалось создать диалог.', en: 'Could not create the chat.', bg: 'Чатът не можа да бъде създаден.', uk: 'Не вдалося Створити диалог.', be: 'Не ўдалося Стварыць диалог.' 
});
define('modals.scheduledTitle', { ru: 'Запланированные сообщения', en: 'Scheduled messages', bg: 'Планирани съобщения', uk: 'Заплановані Повідомлення', be: 'Запланаваныя Паведамленне' 
});
define('modals.scheduledShort', { ru: 'Запланированные', en: 'Scheduled', bg: 'Планирани', uk: 'Заплановані', be: 'Запланаваныя' 
});
define('modals.scheduledEmpty', { ru: 'Пока нет запланированных сообщений.', en: 'No scheduled messages yet.', bg: 'Още няма планирани съобщения.', uk: 'Пока Ні Запланованих повідомлень.', be: 'Пока Не Запланаваных паведамленняў.' 
});
define('modals.file', { ru: '📎 Файл', en: '📎 File', bg: '📎 Файл', uk: '📎 Файл', be: '📎 Файл' 
});
define('modals.cancelScheduled', { ru: 'Отменить', en: 'Cancel', bg: 'Отказ', uk: 'Скасувати', be: 'Скасаваць' 
});
define('modals.dialog', { ru: 'Диалог', en: 'Chat', bg: 'Чат', uk: 'Диалог', be: 'Диалог' 
});
define('modals.scheduledPending', { ru: 'Ожидает отправки', en: 'Waiting to be sent', bg: 'Изчаква изпращане', uk: 'Очікує надсиланни', be: 'Чакае адпраўки' 
});
define('modals.scheduledSending', { ru: 'Отправляется…', en: 'Sending…', bg: 'Изпраща се…', uk: 'Надсилається…', be: 'Адпраўляецца…' 
});
define('modals.scheduledSent', { ru: 'Отправлено', en: 'Sent', bg: 'Изпратено', uk: 'Надіслано', be: 'Адпраўлена' 
});
define('modals.scheduledFailed', { ru: 'Не удалось отправить', en: 'Could not send', bg: 'Неуспешно изпращане', uk: 'Не вдалося Надіслати', be: 'Не ўдалося Адправіць' 
});
define('modals.scheduledCancelled', { ru: 'Отменено', en: 'Cancelled', bg: 'Отказано', uk: 'Скасовано', be: 'Скасавана' 
});
define('modals.emojiPickerLabel', { ru: 'Выбор эмодзи', en: 'Emoji picker', bg: 'Избор на емоджи', uk: 'Вибір емодзі', be: 'Выбар эмодзи' 
});
define('modals.reactionPickerLabel', { ru: 'Выбор реакции', en: 'Reaction picker', bg: 'Избор на реакция', uk: 'Вибір реакции', be: 'Выбар реакции' 
});
define('modals.selectEmoji', { ru: 'Выбрать {emoji}', en: 'Select {emoji}', bg: 'Избери {emoji}', uk: 'Вибрати {emoji}', be: 'Выбраць {emoji}' 
});

// ---- Профиль ----
// Экран переработан под Telegram-стиль «Информация»: одна страница без табов,
// строка списка с иконкой слева и значением справа. Поля без серверной модели
// («Номер телефона», «Личный канал», «Автоматизация чатов») помечены «скоро».
define('profile.infoTitle', { ru: 'Информация', en: 'Information', bg: 'Информация', uk: 'Інформація', be: 'Інфармацыя' 
});
define('profile.soonBadge', { ru: 'скоро', en: 'soon', bg: 'скоро', uk: 'скоро', be: 'скора' 
});
define('profile.phoneLabel', { ru: 'Номер телефона', en: 'Phone number', bg: 'Телефонен номер', uk: 'Номер Телефону', be: 'Нумар тэлефона' 
});
define('profile.phoneComingSoon', {
  ru: 'Номер появится позже.',
  en: 'The phone number will appear later.',
  bg: 'Номерът ще се появи по-късно.',
  uk: 'Номер з’явиться пізніше.',
  be: 'Нумар з’явіцца пазней.',
});
define('profile.usernameHintFull', {
  ru: 'С помощью имени пользователя другие люди смогут связаться с вами, не зная вашего телефона.',
  en: 'Other people can use your username to reach you without knowing your phone number.',
  bg: 'С помощта на потребителското име други хора ще могат да се свържат с вас, без да знаят телефона ви.',
  uk: 'За допомогою імені користувача інші зможуть зв’язатися з вами, не знаючи вашого телефону.',
  be: 'З дапамогай імені карыстальніка іншыя змогуць звязацца з вамі, не ведаючы вашага тэлефона.',
});
define('profile.personalChannelLabel', { ru: 'Личный канал', en: 'Personal channel', bg: 'Личен канал', uk: 'Особистий Канал', be: 'Асабісты канал' 
});
define('profile.personalChannelComingSoon', {
  ru: 'Привязка канала появится позже.',
  en: 'Linking a channel will appear later.',
  bg: 'Свързването на канала ще се появи по-късно.',
  uk: 'Прив’язка каналу з’явиться пізніше.',
  be: 'Прывязка канала з’явіцца пазней.',
});
define('profile.chatAutomationLabel', { ru: 'Автоматизация чатов', en: 'Chat automation', bg: 'Автоматизация на чатове', uk: 'Автоматизація чатів', be: 'Аўтаматызацыя чатаў' 
});
define('profile.chatAutomationNew', { ru: 'новое', en: 'new', bg: 'ново', uk: 'нове', be: 'новае' 
});
define('profile.chatAutomationOff', { ru: 'Выкл.', en: 'Off', bg: 'Изкл.', uk: 'Вимк.', be: 'Выкл.' 
});
define('profile.chatAutomationComingSoon', {
  ru: 'Автоматизация чатов появится позже.',
  en: 'Chat automation will appear later.',
  bg: 'Автоматизацията на чатове ще се появи по-късно.',
  uk: 'Автоматизація чатів з’явиться пізніше.',
  be: 'Аўтаматызацыя чатаў з’явіцца пазней.',
});
define('profile.interfaceColor', { ru: 'Цвет интерфейса', en: 'Interface color', bg: 'Цвят на интерфейса', uk: 'Колір інтерфейсу', be: 'Колер інтэрфейсу' 
});
define('profile.interfaceColorHint', {
  ru: 'Акцент встроенных тем: кнопки, ссылки, выделение. У своих тем цвет задан прямо в теме — см. «Темы» в настройках.',
  en: 'The accent of the built-in themes: buttons, links, highlights. Your own themes set their own colour — see “Themes” in Settings.',
  bg: 'Акцентът на вградените теми: бутони, връзки, открояване. Своите теми задават свой цвят — вижте „Теми“ в настройките.',
  uk: 'Акцент вбудованих тем: кнопки, посилання, виділення. Власні теми задають свій колір — див. «Теми» в налаштуваннях.',
  be: 'Акцэнт убудаваных тэм: кнопкі, спасылкі, выдзяленне. Свае тэмы задаюць свой колер — гл. «Тэмы» ў наладах.',
});
define('profile.bioHint', {
  ru: 'Любые подробности: возраст, род занятий или город.',
  en: 'Any details: age, occupation, or city.',
  bg: 'Подробности: възраст, професия или град.',
  uk: 'Будь-які подробиці: вік, рід занять або місто.',
  be: 'Любыя падрабязнасці: узрост, род заняткаў або горад.',
});
define('profile.birthdayHintFull', {
  ru: 'В настройках можно выбрать, кто будет видеть ваш день рождения.',
  en: 'You can choose in settings who will see your birthday.',
  bg: 'В настройките можете да изберете кой ще вижда рождения ви ден.',
  uk: 'У налаштуваннях можна вибрати, хто бачитиме ваш день народження.',
  be: 'У наладах можна выбраць, хто будзе бачыць ваш дзень нараджэння.',
});
define('profile.changePhoto', { ru: 'Изменить фото', en: 'Change photo', bg: 'Смени снимката', uk: 'Змінити Фото', be: 'Змяніць Фота' 
});
define('profile.setPhoto', { ru: 'Установить фото', en: 'Set photo', bg: 'Постави снимка', uk: 'Поставити Фото', be: 'Паставіць Фота' 
});
define('profile.bannerUrlLabel', { ru: 'Ссылка на баннер', en: 'Banner link', bg: 'Връзка към банер', uk: 'Посилання на банер', be: 'Спасылка на банер' 
});
define('profile.bannerUrlPlaceholder', { ru: 'https://example.com/banner.jpg', en: 'https://example.com/banner.jpg', bg: 'https://example.com/banner.jpg', uk: 'https://example.com/banner.jpg', be: 'https://example.com/banner.jpg' 
});
define('profile.bannerUrlHint', { ru: 'Вставьте прямую ссылку на картинку — баннер обновится сразу.', en: 'Paste a direct link to an image — the banner updates at once.', bg: 'Поставете пряка връзка към изображение — банерът се обновява веднага.', uk: 'Вставте пряме посилання на картинку — банер оновиться одразу.', be: 'Уставце прамую спасылку на карцінку — банер абновіцца адразу.' 
});
define('profile.bannerUrlInvalid', { ru: 'Ссылка на баннер должна начинаться с http:// или https://', en: 'The banner link must start with http:// or https://', bg: 'Връзката към банера трябва да започва с http:// или https://', uk: 'Посилання на банер має починатися з http:// або https://', be: 'Спасылка на банер мае пачынацца з http:// або https://' 
});
define('profile.wallpaperUpload', { ru: 'Загрузить картинку, GIF или видео', en: 'Upload image, GIF or video', bg: 'Качи снимка, GIF или видео', uk: 'Завантажити картинку, GIF або відео', be: 'Загрузіць карцінку, GIF або відэа' 
});
define('profile.wallpaperBadType', { ru: 'Фон должен быть картинкой (JPG, PNG, WebP), GIF или видео (MP4, WebM).', en: 'The background must be an image (JPG, PNG, WebP), a GIF or a video (MP4, WebM).', bg: 'Фонът трябва да е изображение (JPG, PNG, WebP), GIF или видео (MP4, WebM).', uk: 'Фон має бути картинкою (JPG, PNG, WebP), GIF або відео (MP4, WebM).', be: 'Фон мае быць карцінкай (JPG, PNG, WebP), GIF або відэа (MP4, WebM).' 
});
define('profile.wallpaperTooLarge', { ru: 'Размер фона не должен превышать 50 МБ.', en: 'The background must not exceed 50 MB.', bg: 'Фонът не трябва да надвишава 50 МБ.', uk: 'Розмір фону не має перевищувати 50 МБ.', be: 'Памер фону не мае перавышаць 50 МБ.' 
});
define('profile.changePhotoAria', {
  ru: 'Изменить фото профиля',
  en: 'Change profile photo',
  bg: 'Смяна на профилната снимка',
  uk: 'Змінити Фото профілю',
  be: 'Змяніць фота профілю',
});
define('profile.uploadPhoto', { ru: 'Загрузить фото', en: 'Upload photo', bg: 'Качи снимка', uk: 'Завантажити Фото', be: 'Загрузіць Фота' 
});
define('profile.yourAccount', { ru: 'Ваш аккаунт', en: 'Your account', bg: 'Вашият профил', uk: 'Ваш Акаунт', be: 'Ваш Акаўнт' 
});
define('profile.defaultUsername', { ru: 'username', en: 'username', bg: 'username', uk: 'username', be: 'username' 
});
define('profile.frozenNotice', {
  ru: 'Аккаунт заморожен — профиль доступен только для просмотра, изменения недоступны.',
  en: 'The account is frozen — the profile is view-only and cannot be changed.',
  bg: 'Профилът е замразен — достъпен само за преглед, промени не са възможни.',
  uk: 'Акаунт заморожен — Профіль доступен тільки для перегляда, Зміни недоступні.',
  be: 'Акаўнт заморожен — Профіль доступен толькі для прагляда, Змены недоступны.',
});
define('profile.uploadHint', { ru: 'JPG, PNG или WebP · до 10 МБ', en: 'JPG, PNG or WebP · up to 10 MB', bg: 'JPG, PNG или WebP · до 10 МБ', uk: 'JPG, PNG або WebP · до 10 МБ', be: 'JPG, PNG або WebP · да 10 МБ' 
});
define('profile.uploadingAvatar', { ru: 'Загрузка аватара: {percent}%', en: 'Uploading avatar: {percent}%', bg: 'Качване на аватар: {percent}%', uk: 'Завантаження аватара: {percent}%', be: 'Загрузка аватара: {percent}%' 
});
define('profile.badAvatarType', {
  ru: 'Аватар должен быть в формате JPG, PNG или WebP.',
  en: 'The avatar must be a JPG, PNG or WebP file.',
  bg: 'Аватарът трябва да е във формат JPG, PNG или WebP.',
  uk: 'Аватар повинен бути у формате JPG, PNG або WebP.',
  be: 'Аватар павінен быць у формате JPG, PNG або WebP.',
});
define('profile.avatarTooLarge', {
  ru: 'Размер аватара не должен превышать 10 МБ.',
  en: 'The avatar must not exceed 10 MB.',
  bg: 'Аватарът не трябва да надвишава 10 МБ.',
  uk: 'Размер аватара не повинен перевищувати 10 МБ.',
  be: 'Размер аватара не павінен превышать 10 МБ.',
});
define('profile.avatarUploadFailed', {
  ru: 'Не удалось загрузить аватар.',
  en: 'Could not upload the avatar.',
  bg: 'Аватарът не беше качен.',
  uk: 'Не вдалося Завантажити Аватар.',
  be: 'Не ўдалося Загрузіць Аватар.',
});
define('profile.avatarDeleteFailed', {
  ru: 'Не удалось удалить аватар.',
  en: 'Could not delete the avatar.',
  bg: 'Аватарът не беше изтрит.',
  uk: 'Не вдалося Видалити Аватар.',
  be: 'Не ўдалося Выдаліць Аватар.',
});
define('profile.personalData', { ru: 'Личные данные', en: 'Personal details', bg: 'Лични данни', uk: 'Особисті дані', be: 'Личные данные' 
});
define('profile.nameLabel', { ru: 'Имя', en: 'Name', bg: 'Име', uk: 'Ім’я', be: 'Імя' 
});
define('profile.usernameLabel', { ru: 'Username', en: 'Username', bg: 'Потребителско име', uk: 'Username', be: 'Username' 
});
define('profile.usernamePlaceholder', { ru: 'top1nuk1', en: 'top1nuk1', bg: 'top1nuk1', uk: 'top1nuk1', be: 'top1nuk1' 
});
define('profile.usernameHint', {
  ru: 'По этому адресу вас смогут найти: @{handle} · регистр не важен',
  en: 'People can find you at this address: @{handle} · case-insensitive',
  bg: 'На този адрес могат да ви намерят: @{handle} · без значение от регистъра',
  uk: 'По цьому адресу вас смогут Знайти: @{handle} · регистр не важен',
  be: 'Па этому адресу вас смогут Знайсці: @{handle} · регистр не важен',
});
define('profile.bioLabel', { ru: 'О себе', en: 'About', bg: 'Относно', uk: 'Про собі', be: 'Пра сябе' 
});
define('profile.bioPlaceholder', { ru: 'Пара слов о себе', en: 'A few words about yourself', bg: 'Няколко думи за себе си', uk: 'Пара слов Про собі', be: 'Пара слов Пра сябе' 
});
define('profile.scamBioNotice', {
  ru: 'На аккаунте стоит отметка SCAM: описание заменено предупреждением о мошенничестве и не редактируется, пока владелец Yargram не снимет отметку.',
  en: 'This account is marked SCAM: the bio is replaced with a fraud warning and cannot be edited until the Yargram owner removes the mark.',
  bg: 'Профилът е отбелязан със SCAM: описанието е заменено с предупреждение за измама и не може да се редактира, докато собственикът на Yargram не махне отметката.',
  uk: 'На аккаунте стоит Позначка SCAM: Опис заменено попередженнем про мошенничестве і не редактируется, пока власник Yargram не снимет позначку.',
  be: 'На аккаунте стоит Адзнака SCAM: Апісанне заменено папярэджаннем пра мошенничестве і не редактируется, пока Уладальнік Yargram не снимет отметку.',
});
define('profile.fakeBioNotice', {
  ru: 'На аккаунте стоит отметка FAKE: описание заменено предупреждением о подделке под официальный аккаунт и не редактируется, пока владелец Yargram не снимет отметку.',
  en: 'This account is marked FAKE: the bio is replaced with an impersonation warning and cannot be edited until the Yargram owner removes the mark.',
  bg: 'Профилът е отбелязан със FAKE: описанието е заменено с предупреждение за представяне за официален профил и не може да се редактира, докато собственикът на Yargram не махне отметката.',
  uk: 'На акаунті стоїть позначка FAKE: опис замінено попередженням про підробку під офіційний акаунт і не редагується, поки власник Yargram не зніме позначку.',
  be: 'На акаўнце стаіць адзнака FAKE: апісанне заменена папярэджаннем пра падробку пад афіцыйны акаўнт і не рэдагуецца, пакуль уладальнік Yargram не здыме адзнаку.',
});
define('profile.birthdayLabel', { ru: 'День рождения', en: 'Birthday', bg: 'Рожден ден', uk: 'День народження', be: 'Дзень народження' 
});
define('profile.day', { ru: 'День', en: 'Day', bg: 'Ден', uk: 'День', be: 'Дзень' 
});
define('profile.month', { ru: 'Месяц', en: 'Month', bg: 'Месец', uk: 'Місяць', be: 'Месяц' 
});
define('profile.year', { ru: 'Год', en: 'Year', bg: 'Година', uk: 'Год', be: 'Год' 
});
define('profile.noYear', { ru: 'Без года', en: 'No year', bg: 'Без година', uk: 'Без года', be: 'Без года' 
});
define('profile.birthdayHint', {
  ru: 'День рождения видят другие в вашем профиле. Год можно не указывать — тогда возраст не показывается.',
  en: 'Others see your birthday in your profile. The year is optional — then your age is not shown.',
  bg: 'Другите виждат рождения ден в профила ви. Годината е незадължителна — тогава възрастта не се показва.',
  uk: 'День народження видят інші у вашем профілі. Год можна не вказувати — тогда возраст не показується.',
  be: 'Дзень народження видят іншыя у вашем профілі. Год можна не указывать — тогда возраст не показывается.',
});
define('profile.removeBirthday', { ru: 'Убрать', en: 'Remove', bg: 'Премахни', uk: 'Прибрати', be: 'Прыбраць' 
});
define('profile.showLastSeen', { ru: 'Показывать время посещения', en: 'Show last seen time', bg: 'Показвай последно видян', uk: 'Показувати Година посещения', be: 'Паказваць Час посещения' 
});
define('profile.showLastSeenHint', {
  ru: 'Когда выключено, другие видят только приблизительный период. Статус «В сети» также скрыт.',
  en: 'When off, others only see an approximate period. The “Online” status is hidden as well.',
  bg: 'Когато е изключено, другите виждат само приблизителен период. Статусът „На линия“ също е скрит.',
  uk: 'Коли Вимкнено, інші видят тільки приблизний период. Статус «У мережі» також приховано.',
  be: 'Калі Выключана, іншыя видят толькі приблизительный период. Статус «У сетцы» таксама скрыт.',
});
define('profile.themeColor', { ru: 'Тема (цвет)', en: 'Theme (color)', bg: 'Тема (цвят)', uk: 'Тема (Колір)', be: 'Тэма (Колер)' 
});
define('profile.wallpaperLabel', { ru: 'Фоновый рисунок (URL)', en: 'Background image (URL)', bg: 'Фоново изображение (URL)', uk: 'Фоновий рисунок (URL)', be: 'Фоновый рисунок (URL)' 
});
define('profile.wallpaperPlaceholder', {
  ru: 'https://example.com/wallpaper.jpg',
  en: 'https://example.com/wallpaper.jpg',
  bg: 'https://example.com/wallpaper.jpg',
  uk: 'https://example.com/wallpaper.jpg',
  be: 'https://example.com/wallpaper.jpg',
});
define('profile.wallpaperHint', {
  ru: 'Оставьте пустым, чтобы вернуть стандартный фон. Можно картинку, GIF или видео — видео идёт по кругу.',
  en: 'Leave empty to restore the default background. An image, a GIF or a video all work — video loops on its own.',
  bg: 'Оставете празно, за да върнете фона по подразбиране. Може картинка, GIF или видео — видеото се върти само.',
  uk: 'Залиште порожнім, щоб повернути стандартний фон. Можна картинку, GIF або відео — відео йде по колу.',
  be: 'Пакіньце пустым, каб вярнуць стандартны фон. Можна карцінку, GIF або відэа — відэа ідзе па крузе.',
});
define('profile.bannerLabel', { ru: 'Баннер профиля', en: 'Profile banner', bg: 'Банер на профила', uk: 'Банер профиля', be: 'Банер профиля' 
});
define('profile.bannerColor', { ru: 'Цвет баннера', en: 'Banner color', bg: 'Цвят на банера', uk: 'Колір баннера', be: 'Колер баннера' 
});
define('profile.bannerNoColor', { ru: 'Без заливки', en: 'No fill', bg: 'Без запълване', uk: 'Без заливки', be: 'Без заливки' 
});
define('profile.bannerUpload', { ru: 'Загрузить фото', en: 'Upload photo', bg: 'Качи снимка', uk: 'Завантажити фото', be: 'Загрузіць фото' 
});
define('profile.bannerReplace', { ru: 'Заменить фото', en: 'Replace photo', bg: 'Смени снимката', uk: 'Заменить фото', be: 'Заменить фото' 
});
define('profile.bannerRemovePhoto', { ru: 'Убрать фото', en: 'Remove photo', bg: 'Премахни снимката', uk: 'Прибрати фото', be: 'Прыбраць фото' 
});
define('profile.bannerHint', {
  ru: 'Фото перекрывает цвет. Можно картинку, GIF или видео — видео идёт по кругу. Оставьте без заливки — баннер возьмёт фон темы.',
  en: 'A photo overrides the color. An image, a GIF or a video all work — video loops on its own. With no fill, the banner falls back to the theme background.',
  bg: 'Снимката покрива цвета. Може снимка, GIF или видео — видеото се върти само. Без запълване банерът използва фона на темата.',
  uk: 'Фото перекриває колір. Можна картинку, GIF або відео — відео йде по колу. Залиште без заливки — банер візьме фон теми.',
  be: 'Фота перекрывае колер. Можна карцінку, GIF або відэа — відэа ідзе па крузе. Пакіньце без заліўкі — банер возьме фон тэмы.',
});
define('profile.badBannerType', {
  ru: 'Нужна картинка (JPG, PNG, WebP, GIF) или видео (MP4, WebM).',
  en: 'An image (JPG, PNG, WebP, GIF) or a video (MP4, WebM) is required.',
  bg: 'Нужна е картинка (JPG, PNG, WebP, GIF) или видео (MP4, WebM).',
  uk: 'Потрібна картинка (JPG, PNG, WebP, GIF) або відео (MP4, WebM).',
  be: 'Патрэбна карцінка (JPG, PNG, WebP, GIF) або відэа (MP4, WebM).',
});
// ---- Знак приложения Yargram ----
define('profile.appBadgeLabel', { ru: 'Знак приложения', en: 'Application badge', bg: 'Знак на приложението', uk: 'Знак приложения', be: 'Знак приложения' 
});
define('profile.appBadgeHint', {
  ru: 'Отдельное приложение Yargram может поставить себе значок «Yargram» — тот же, что владелец выдаёт вручную.',
  en: 'A standalone Yargram application can set the «Yargram» icon on itself — the same one the owner grants by hand.',
  bg: 'Отделното приложение Yargram може да си постави иконата «Yargram» — същата, която собственикът дава ръчно.',
  uk: 'Отдельне Застосунок Yargram може поставити собі Значок «Yargram» — той же, що власник видає вручную.',
  be: 'Отдельное Праграма Yargram можа паставіць сабе Значок «Yargram» — той же, што Уладальнік выдаёт вручную.',
});
define('profile.appBadgeSet', { ru: 'Поставить значок', en: 'Set the icon', bg: 'Постави иконата', uk: 'Поставити Значок', be: 'Паставіць Значок' 
});
define('profile.appBadgeRemove', { ru: 'Снять значок', en: 'Remove the icon', bg: 'Премахни иконата', uk: 'Зняти Значок', be: 'Зняць Значок' 
});
define('profile.appBadgeHow', {
  ru: 'Значок ставится от имени приложения: человек его себе выдать не может, а сервер пускает только аккаунт, помеченный приложением.',
  en: 'The icon is set on behalf of the application: a person cannot grant it to themselves, and the server only lets through an account marked as an application.',
  bg: 'Иконата се поставя от името на приложението: човек не може да си я даде сам, а сървърът допуска само профил, отбелязан като приложение.',
  uk: 'Значок ставится від Імені приложения: человек його собі видати не може, а Сервер пускает тільки Акаунт, позначений приложением.',
  be: 'Значок ставится ад Імя приложения: человек яго сабе выдать не можа, а Сервер пускает толькі Акаўнт, помеченный приложением.',
});
define('profile.appBadgeOwnerOnly', {
  ru: 'Значок «Yargram» ставит только само приложение — его выдаёт владелец в админ-панели.',
  en: 'The «Yargram» icon can only be set by an application itself — otherwise the owner grants it in the admin panel.',
  bg: 'Иконата «Yargram» се поставя само от приложението — иначе собственикът я дава в админ панела.',
  uk: 'Значок «Yargram» ставит тільки само Застосунок — його видає власник у Адмін-панели.',
  be: 'Значок «Yargram» ставит толькі само Праграма — яго выдаёт Уладальнік у Адмін-панели.',
});
define('profile.appBadgeFailed', {
  ru: 'Не удалось изменить значок приложения.',
  en: 'Could not change the application badge.',
  bg: 'Знакът на приложението не можа да бъде променен.',
  uk: 'Не вдалося Змінити Значок приложения.',
  be: 'Не ўдалося Змяніць Значок приложения.',
});
define('profile.bannerTooLarge', {
  ru: 'Фото баннера слишком большое (максимум 50 МБ).',
  en: 'The banner image is too large (50 MB maximum).',
  bg: 'Снимката за банер е твърде голяма (максимум 50 МБ).',
  uk: 'Фото баннера занадто больше (максимум 50 МБ).',
  be: 'Фото баннера занадта большое (максімум 50 МБ).',
});
define('profile.bannerUploadFailed', {
  ru: 'Не удалось загрузить фото баннера.',
  en: 'Failed to upload the banner image.',
  bg: 'Снимката за банер не се качи.',
  uk: 'Не вдалося Завантажити фото баннера.',
  be: 'Не ўдалося Загрузіць фото баннера.',
});
define('profile.bannerDeleteFailed', {
  ru: 'Не удалось убрать фото баннера.',
  en: 'Failed to remove the banner image.',
  bg: 'Снимката за банер не се премахна.',
  uk: 'Не вдалося Прибрати фото баннера.',
  be: 'Не ўдалося Прыбраць фото баннера.',
});
define('profile.uploadingBanner', { ru: 'Загрузка баннера: {percent}%', en: 'Uploading banner: {percent}%', bg: 'Качване на банер: {percent}%', uk: 'Завантаження баннера: {percent}%', be: 'Загрузка баннера: {percent}%' 
});
define('profile.messageSounds', { ru: 'Звуки сообщений', en: 'Message sounds', bg: 'Звуци на съобщенията', uk: 'Звуки Повідомлень', be: 'Гукі Паведамленняў' 
});
define('profile.browserNotifications', { ru: 'Уведомления браузера', en: 'Browser notifications', bg: 'Известия от браузъра', uk: 'Сповіщення браузера', be: 'Апавяшчэнні браузера' 
});
define('profile.notifGranted', {
  ru: 'Включены. Новые сообщения появятся, когда вкладка неактивна.',
  en: 'Enabled. New messages will appear when the tab is inactive.',
  bg: 'Включени. Новите съобщения ще се показват, когато разделът е неактивен.',
  uk: 'Увімкнено. Нові Повідомлення з’являться, коли вкладка неактивна.',
  be: 'Уключана. Новыя Паведамленне з’явяцца, калі вкладка неактивна.',
});
define('profile.notifDenied', {
  ru: 'Заблокированы браузером. Разрешите уведомления в настройках сайта.',
  en: 'Blocked by the browser. Allow notifications in the site settings.',
  bg: 'Блокирани от браузъра. Разрешете известията в настройките на сайта.',
  uk: 'Заблоковано браузером. Дозвольте сповіщення у налаштуваннях сайту.',
  be: 'Заблокированы браўзерам. Дазвольце Апавяшчэнні у наладках сайта.',
});
define('profile.notifUnsupported', {
  ru: 'Этот браузер не поддерживает уведомления.',
  en: 'This browser does not support notifications.',
  bg: 'Този браузър не поддържа известия.',
  uk: 'Цей браузер не поддерживает Сповіщення.',
  be: 'Гэты браузер не поддерживает Апавяшчэнні.',
});
define('profile.notifDefault', {
  ru: 'Получайте уведомления о новых сообщениях вне вкладки.',
  en: 'Get notified about new messages outside the tab.',
  bg: 'Получавайте известия за нови съобщения извън раздела.',
  uk: 'Получайте Сповіщення про нових повідомленнях вне вкладки.',
  be: 'Получайте Апавяшчэнні пра новых паведамленнях вне вкладки.',
});
define('profile.enableNotifications', { ru: 'Включить уведомления', en: 'Enable notifications', bg: 'Включи известията', uk: 'Увімкнути Сповіщення', be: 'Уключыць Апавяшчэнні' 
});
define('profile.deviceSettingsHint', {
  ru: 'Эти настройки применяются сразу на этом устройстве.',
  en: 'These settings apply right away on this device.',
  bg: 'Тези настройки се прилагат веднага на това устройство.',
  uk: 'Ці налаштування застосовуються відразу на цьому пристрої.',
  be: 'Гэтыя Налады ужываюцца адразу на гэтым прыладзе.',
});
define('profile.nameEmpty', { ru: 'Имя не может быть пустым.', en: 'The name cannot be empty.', bg: 'Името не може да е празно.', uk: 'Ім’я не може бути порожнім.', be: 'Імя не можа быць пустым.' 
});
define('profile.usernameInvalid', {
  ru: 'Username: 3–32 символа, латиница, цифры или _.',
  en: 'Username: 3–32 characters, Latin letters, digits or _.',
  bg: 'Потребителско име: 3–32 знака, латиница, цифри или _.',
  uk: 'Username: 3–32 символа, латиница, цифри або _.',
  be: 'Username: 3–32 символа, латиница, цифры або _.',
});
define('profile.wallpaperInvalid', {
  // Фоном годится и внешняя ссылка, и адрес своего файла (`/api/uploads/…`),
  // и готовая картинка приложения (`/wallpapers/…`) — прежняя подсказка про
  // «только http» сама путала: своя же загрузка под неё не подходила.
  ru: 'Фоном можно поставить ссылку https://… или адрес загруженного файла.',
  en: 'A background must be an https://… link or the address of an uploaded file.',
  bg: 'За фон може да послужи връзка https://… или адрес на качен файл.',
  uk: 'Фоном можна поставити посилання https://… або адресу завантаженого файлу.',
  be: 'Фонам можна паставіць спасылку https://… або адрас загружанага файла.',
});
define('profile.saveFailed', {
  ru: 'Не удалось сохранить профиль.',
  en: 'Could not save the profile.',
  bg: 'Профилът не беше запазен.',
  uk: 'Не вдалося Зберегти Профіль.',
  be: 'Не ўдалося Захаваць Профіль.',
});

// ---- Профиль: лист пользователя ----
define('profile.sheetLabel', { ru: 'Профиль', en: 'Profile', bg: 'Профил', uk: 'Профіль', be: 'Профіль' 
});
define('profile.editTooltip', {
  ru: 'Аккаунт заморожен — профиль доступен только для просмотра',
  en: 'The account is frozen — the profile is view-only',
  bg: 'Профилът е замразен — достъпен само за преглед',
  uk: 'Акаунт заморожен — Профіль доступен тільки для перегляда',
  be: 'Акаўнт заморожен — Профіль доступен толькі для прагляда',
});
define('profile.online', { ru: 'в сети', en: 'online', bg: 'на линия', uk: 'у мережі', be: 'у сетцы' 
});
define('profile.actionChat', { ru: 'Чат', en: 'Chat', bg: 'Чат', uk: 'Чат', be: 'Чат' 
});
define('profile.actionAudio', { ru: 'Звук', en: 'Voice', bg: 'Звук', uk: 'Звук', be: 'Гук' 
});
define('profile.actionVideo', { ru: 'Звонок', en: 'Call', bg: 'Обаждане', uk: 'Дзвінок', be: 'Званок' 
});
define('profile.actionMore', { ru: 'Ещё', en: 'More', bg: 'Още', uk: 'Ще', be: 'Яшчэ' 
});
define('profile.usernameFieldHint', { ru: 'Имя пользователя', en: 'Username', bg: 'Потребителско име', uk: 'Ім’я користувача', be: 'Імя карыстальніка' 
});
define('profile.alsoKnownAs', { ru: 'а также', en: 'also', bg: 'също', uk: 'а також', be: 'а таксама' 
});
define('profile.verifiedNotice', {
  ru: 'Этот аккаунт подтверждён представителями Yargram.',
  en: 'This account is verified by Yargram representatives.',
  bg: 'Този профил е потвърден от представители на Yargram.',
  uk: 'Цей Акаунт Підтверджено представителями Yargram.',
  be: 'Гэты Акаўнт Пацверджана представителями Yargram.',
});
define('profile.birthdaySavedHint', {
  ru: 'Дата сохраняется сразу. Год можно не указывать — тогда возраст не виден.',
  en: 'The date is saved instantly. The year is optional — then your age is not shown.',
  bg: 'Датата се запазва веднага. Годината е незадължителна — тогава възрастта не се вижда.',
  uk: 'Дата сохраняется відразу. Год можна не вказувати — тогда возраст не виден.',
  be: 'Дата сохраняется адразу. Год можна не указывать — тогда возраст не виден.',
});
define('profile.saving', { ru: 'Сохраняем…', en: 'Saving…', bg: 'Запазваме…', uk: 'Зберігаємо…', be: 'Захоўваем…' 
});
define('profile.birthdayNotSet', { ru: 'День рождения не указан', en: 'Birthday not specified', bg: 'Рожден ден не е посочен', uk: 'День народження не указан', be: 'Дзень народження не указан' 
});
define('profile.yearsOld', { ru: '{age} {unit}', en: '{age} {unit}', bg: '{age} {unit}', uk: '{age} {unit}', be: '{age} {unit}' 
});
define('profile.ownerSection', { ru: 'Владелец', en: 'Owner', bg: 'Собственик', uk: 'Власник', be: 'Уладальнік' 
});
define('profile.restoreAccount', { ru: 'Вернуть аккаунт', en: 'Restore account', bg: 'Върни профила', uk: 'Повернути Акаунт', be: 'Вярнуць Акаўнт' 
});
define('profile.freezeAccount', { ru: 'Заморозить аккаунт', en: 'Freeze account', bg: 'Замрази профила', uk: 'Заморозити Акаунт', be: 'Заморозіць Акаўнт' 
});
define('profile.unfreezeAccount', { ru: 'Разморозить аккаунт', en: 'Unfreeze account', bg: 'Размрази профила', uk: 'Розморозити Акаунт', be: 'Размарозіць Акаўнт' 
});
define('profile.setScam', { ru: 'Выдать отметку SCAM', en: 'Set SCAM mark', bg: 'Постави отметка SCAM', uk: 'Видати позначку SCAM', be: 'Выдать отметку SCAM' 
});
define('profile.clearScam', { ru: 'Снять отметку SCAM', en: 'Clear SCAM mark', bg: 'Махни отметката SCAM', uk: 'Зняти позначку SCAM', be: 'Зняць отметку SCAM' 
});
define('profile.setFake', { ru: 'Выдать отметку FAKE', en: 'Set FAKE mark', bg: 'Постави отметка FAKE', uk: 'Видати позначку FAKE', be: 'Выдаць адзнаку FAKE' 
});
define('profile.clearFake', { ru: 'Снять отметку FAKE', en: 'Clear FAKE mark', bg: 'Махни отметката FAKE', uk: 'Зняти позначку FAKE', be: 'Зняць адзнаку FAKE' 
});
define('profile.deleteAccount', { ru: 'Удалить аккаунт', en: 'Delete account', bg: 'Изтрий профила', uk: 'Видалити Акаунт', be: 'Выдаліць Акаўнт' 
});
define('profile.block', { ru: 'Заблокировать', en: 'Block', bg: 'Блокирай', uk: 'Заблокувати', be: 'Заблакаваць' 
});
define('profile.unblock', { ru: 'Разблокировать', en: 'Unblock', bg: 'Отблокирай', uk: 'Розблокувати', be: 'Разблакаваць' 
});
define('profile.report', { ru: 'Пожаловаться', en: 'Report', bg: 'Докладвай', uk: 'Поскаржитися', be: 'Паскардзіцца' 
});
define('profile.editProfile', { ru: 'Изменить профиль', en: 'Edit profile', bg: 'Редактирай профила', uk: 'Змінити Профіль', be: 'Змяніць Профіль' 
});
define('profile.frozenViewOnly', {
  ru: 'Аккаунт заморожен — профиль доступен только для просмотра.',
  en: 'The account is frozen — the profile is view-only.',
  bg: 'Профилът е замразен — достъпен само за преглед.',
  uk: 'Акаунт заморожен — Профіль доступен тільки для перегляда.',
  be: 'Акаўнт заморожен — Профіль доступен толькі для прагляда.',
});
define('profile.reportReason', { ru: 'Причина жалобы', en: 'Report reason', bg: 'Причина за докладване', uk: 'Причина Скарги', be: 'Прычына Скаргі' 
});
define('profile.reportPlaceholder', { ru: 'Опишите проблему', en: 'Describe the problem', bg: 'Опишете проблема', uk: 'Опишіть проблему', be: 'Апішыце проблему' 
});
define('profile.sendReport', { ru: 'Отправить жалобу', en: 'Send report', bg: 'Изпрати доклад', uk: 'Надіслати жалобу', be: 'Адправіць жалобу' 
});
define('profile.reasonSpam', { ru: 'Спам', en: 'Spam', bg: 'Спам', uk: 'Спам', be: 'Спам' 
});
define('profile.reasonAbuse', { ru: 'Оскорбления', en: 'Abuse', bg: 'Обиди', uk: 'Образи', be: 'Абразы' 
});
define('profile.reasonFraud', { ru: 'Мошенничество', en: 'Fraud', bg: 'Измама', uk: 'Шахрайство', be: 'Махлярства' 
});
define('profile.reasonOther', { ru: 'Другое', en: 'Other', bg: 'Друго', uk: 'Інше', be: 'Іншае' 
});
define('profile.confirmBlock', {
  ru: 'Заблокировать {handle}? Он не сможет писать и звонить вам.',
  en: 'Block {handle}? They will not be able to message or call you.',
  bg: 'Да блокирате {handle}? Няма да може да ви пише и да ви се обажда.',
  uk: 'Заблокувати {handle}? Він не зможе писать і звонить вам.',
  be: 'Заблакаваць {handle}? Ён не зможа писать і звонить вам.',
});
define('profile.blocked', { ru: 'Пользователь заблокирован.', en: 'The user has been blocked.', bg: 'Потребителят е блокиран.', uk: 'Користувач Заблоковано.', be: 'Карыстальнік Заблакавана.' 
});
define('profile.unblocked', { ru: 'Пользователь разблокирован.', en: 'The user has been unblocked.', bg: 'Потребителят е отблокиран.', uk: 'Користувач разблокирован.', be: 'Карыстальнік разблокирован.' 
});
define('profile.blockFailed', {
  ru: 'Не удалось изменить блокировку.',
  en: 'Could not change the block status.',
  bg: 'Блокирането не беше променено.',
  uk: 'Не вдалося Змінити блокуванну.',
  be: 'Не ўдалося Змяніць блакаванну.',
});
define('profile.confirmFreeze', {
  ru: 'Заморозить аккаунт {handle}? Он не сможет войти и писать.',
  en: 'Freeze the account {handle}? They will not be able to sign in or message.',
  bg: 'Да замразите профила {handle}? Няма да може да влезе и да пише.',
  uk: 'Заморозити Акаунт {handle}? Він не зможе Увійти і писать.',
  be: 'Заморозіць Акаўнт {handle}? Ён не зможа Увайсці і писать.',
});
define('profile.frozen', { ru: 'Аккаунт заморожен.', en: 'The account has been frozen.', bg: 'Профилът е замразен.', uk: 'Акаунт заморожен.', be: 'Акаўнт заморожен.' 
});
define('profile.unfrozen', { ru: 'Аккаунт разморожен.', en: 'The account has been unfrozen.', bg: 'Профилът е размразен.', uk: 'Акаунт разморожен.', be: 'Акаўнт разморожен.' 
});
define('profile.freezeFailed', {
  ru: 'Не удалось изменить статус аккаунта.',
  en: 'Could not change the account status.',
  bg: 'Статусът на профила не беше променен.',
  uk: 'Не вдалося Змінити статус Акаунта.',
  be: 'Не ўдалося Змяніць статус Акаўнта.',
});
define('profile.confirmScam', {
  ru: 'Пометить аккаунт {handle} как SCAM? Описание заменится предупреждением о мошенничестве, и менять его человек больше не сможет.',
  en: 'Mark the account {handle} as SCAM? The bio will be replaced with a fraud warning and can no longer be edited.',
  bg: 'Да отбележите профила {handle} като SCAM? Описанието ще бъде заменено с предупреждение за измама и вече няма да може да се редактира.',
  uk: 'Пометить Акаунт {handle} як SCAM? Опис заменится попередженнем про мошенничестве, і менять його человек більше не зможе.',
  be: 'Пометить Акаўнт {handle} як SCAM? Апісанне заменится папярэджаннем пра мошенничестве, і менять яго человек больш не зможа.',
});
define('profile.scamSet', { ru: 'Аккаунт помечен как SCAM.', en: 'The account has been marked as SCAM.', bg: 'Профилът е отбелязан като SCAM.', uk: 'Акаунт помечен як SCAM.', be: 'Акаўнт помечен як SCAM.' 
});
define('profile.scamCleared', {
  ru: 'Отметка SCAM снята, описание вернулось.',
  en: 'The SCAM mark has been cleared and the bio restored.',
  bg: 'Отметката SCAM е махната, описанието е върнато.',
  uk: 'Позначка SCAM снята, Опис вернулось.',
  be: 'Адзнака SCAM снята, Апісанне вернулось.',
});
define('profile.scamFailed', {
  ru: 'Не удалось изменить отметку SCAM.',
  en: 'Could not change the SCAM mark.',
  bg: 'Отметката SCAM не беше променена.',
  uk: 'Не вдалося Змінити позначку SCAM.',
  be: 'Не ўдалося Змяніць отметку SCAM.',
});
define('profile.confirmFake', {
  ru: 'Пометить аккаунт {handle} как FAKE? Описание заменится предупреждением о подделке под официальный аккаунт, и менять его человек больше не сможет.',
  en: 'Mark the account {handle} as FAKE? The bio will be replaced with an impersonation warning and can no longer be edited.',
  bg: 'Да отбележите профила {handle} като FAKE? Описанието ще бъде заменено с предупреждение за представяне за официален профил и вече няма да може да се редактира.',
  uk: 'Помітити акаунт {handle} як FAKE? Опис заміниться попередженням про підробку під офіційний акаунт, і змінити його людина більше не зможе.',
  be: 'Пазначыць акаўнт {handle} як FAKE? Апісанне заменіцца папярэджаннем пра падробку пад афіцыйны акаўнт, і змяніць яго чалавек больш не зможа.',
});
define('profile.fakeSet', { ru: 'Аккаунт помечен как FAKE.', en: 'The account has been marked as FAKE.', bg: 'Профилът е отбелязан като FAKE.', uk: 'Акаунт позначено як FAKE.', be: 'Акаўнт пазначаны як FAKE.' 
});
define('profile.fakeCleared', {
  ru: 'Отметка FAKE снята, описание вернулось.',
  en: 'The FAKE mark has been cleared and the bio restored.',
  bg: 'Отметката FAKE е махната, описанието е върнато.',
  uk: 'Позначку FAKE знято, опис повернувся.',
  be: 'Адзнаку FAKE знята, апісанне вярнулася.',
});
define('profile.fakeFailed', {
  ru: 'Не удалось изменить отметку FAKE.',
  en: 'Could not change the FAKE mark.',
  bg: 'Отметката FAKE не беше променена.',
  uk: 'Не вдалося змінити позначку FAKE.',
  be: 'Не ўдалося змяніць адзнаку FAKE.',
});
define('profile.setBot', { ru: 'Выдать отметку BOT', en: 'Set BOT mark', bg: 'Постави отметка BOT', uk: 'Видати позначку BOT', be: 'Выдаць адзнаку BOT'
});
define('profile.clearBot', { ru: 'Снять отметку BOT', en: 'Clear BOT mark', bg: 'Махни отметката BOT', uk: 'Зняти позначку BOT', be: 'Зняць адзнаку BOT'
});
define('profile.confirmBot', {
  ru: 'Пометить аккаунт {handle} ботом? Войти в него больше нельзя, а письма для входа и сброса пароля перестанут работать. Снять метку можно здесь же.',
  en: 'Mark the account {handle} as a bot? Nobody will be able to sign in, and sign-in and password-reset emails will stop working. The label can be removed here as well.',
  bg: 'Да отбележим ли {handle} като бот? Влизането в този профил ще стане невъзможно, а писмата за вход и смяна на парола ще спрат да работят. Отметката може да се свали оттук.',
  uk: 'Позначити акаунт {handle} ботом? Увійти в нього більше не можна, а листи для входу та скидання пароля перестануть працювати. Зняти позначку можна тут же.',
  be: 'Пазначыць акаўнт {handle} ботам? Увайсці ў яго больш нельга, а лісты для ўваходу і скідання пароля перастануць працаваць. Зняць пазначку можна тут жа.',
});
define('profile.botSet', {
  ru: 'Отметка BOT выдана: войти в этот аккаунт нельзя.',
  en: 'The BOT mark has been set: nobody can sign in to this account.',
  bg: 'Отметката BOT е поставена: влизането в този профил е невъзможно.',
  uk: 'Позначку BOT видано: увійти в цей акаунт не можна.',
  be: 'Адзнака BOT выдадзена: увайсці ў гэты акаўнт нельга.',
});
define('profile.botCleared', {
  ru: 'Отметка BOT снята, вход в аккаунт снова открыт.',
  en: 'The BOT mark has been cleared: sign-in works again.',
  bg: 'Отметката BOT е махната, влизането отново работи.',
  uk: 'Позначку BOT знято, вхід в акаунт знову відкрито.',
  be: 'Адзнака BOT знята, уваход у акаўнт зноў адкрыты.',
});
define('profile.botFailed', {
  ru: 'Не удалось изменить отметку BOT.',
  en: 'Could not change the BOT mark.',
  bg: 'Отметката BOT не беше променена.',
  uk: 'Не вдалося змінити позначку BOT.',
  be: 'Не ўдалося змяніць адзнаку BOT.',
});
define('profile.accountRestored', { ru: 'Аккаунт возвращён.', en: 'The account has been restored.', bg: 'Профилът е върнат.', uk: 'Акаунт возвращён.', be: 'Акаўнт возвращён.' 
});
define('profile.restoreFailed', {
  ru: 'Не удалось вернуть аккаунт.',
  en: 'Could not restore the account.',
  bg: 'Профилът не беше върнат.',
  uk: 'Не вдалося повернути Акаунт.',
  be: 'Не ўдалося вярнуць Акаўнт.',
});
define('profile.confirmDelete', {
  ru: 'Удалить аккаунт {handle}? Его почта и ник останутся занятыми, а историю переписки собеседники сохранят.',
  en: 'Delete the account {handle}? Their email and username will stay taken, and peers will keep the chat history.',
  bg: 'Да изтриете профила {handle}? Имейлът и потребителското име ще останат заети, а събеседниците ще запазят историята на разговорите.',
  uk: 'Видалити Акаунт {handle}? Його Пошта і Нік останутся зайнятими, а историю переписки співрозмовники сохранят.',
  be: 'Выдаліць Акаўнт {handle}? Яго Пошта і Нік останутся занятыми, а историю переписки собеседники сохранят.',
});
define('profile.deleteFailed', {
  ru: 'Не удалось удалить аккаунт.',
  en: 'Could not delete the account.',
  bg: 'Профилът не беше изтрит.',
  uk: 'Не вдалося Видалити Акаунт.',
  be: 'Не ўдалося Выдаліць Акаўнт.',
});
define('profile.reportSent', {
  ru: 'Жалоба отправлена и сохранена.',
  en: 'The report has been sent and saved.',
  bg: 'Докладът е изпратен и запазен.',
  uk: 'Скарга отправлена і сохранена.',
  be: 'Скарга отправлена і сохранена.',
});
define('profile.reportFailed', {
  ru: 'Не удалось отправить жалобу.',
  en: 'Could not send the report.',
  bg: 'Докладът не беше изпратен.',
  uk: 'Не вдалося Надіслати жалобу.',
  be: 'Не ўдалося Адправіць жалобу.',
});
define('profile.usernameCopied', { ru: 'Юзернейм скопирован.', en: 'Username copied.', bg: 'Потребителското име е копирано.', uk: 'Юзернейм скопирован.', be: 'Юзернэйм скопирован.' 
});
define('profile.copyFailed', { ru: 'Не удалось скопировать.', en: 'Could not copy.', bg: 'Копирането не беше успешно.', uk: 'Не вдалося скопировать.', be: 'Не ўдалося скопировать.' 
});
define('profile.birthdaySaved', { ru: 'День рождения сохранён.', en: 'Birthday saved.', bg: 'Рожденият ден е запазен.', uk: 'День народження Збережено.', be: 'Дзень народження Захавана.' 
});
define('profile.birthdaySaveFailed', {
  ru: 'Не удалось сохранить день рождения.',
  en: 'Could not save the birthday.',
  bg: 'Рожденият ден не беше запазен.',
  uk: 'Не вдалося Зберегти День народження.',
  be: 'Не ўдалося Захаваць Дзень народження.',
});
define('profile.birthdayRemoved', { ru: 'День рождения убран.', en: 'Birthday removed.', bg: 'Рожденият ден е премахнат.', uk: 'День народження убран.', be: 'Дзень народження убран.' 
});
define('profile.birthdayRemoveFailed', {
  ru: 'Не удалось убрать день рождения.',
  en: 'Could not remove the birthday.',
  bg: 'Рожденият ден не беше премахнат.',
  uk: 'Не вдалося Прибрати День народження.',
  be: 'Не ўдалося Прыбраць Дзень народження.',
});

// ---- Профиль: счётчики медиа ----
define('profile.mediaPhoto1', { ru: 'фотография', en: 'photo', bg: 'снимка', uk: 'Фотографія', be: 'Фотаздымак' 
});
define('profile.mediaPhoto2', { ru: 'фотографии', en: 'photos', bg: 'снимки', uk: 'Фотографії', be: 'Фотаздымкі' 
});
define('profile.mediaPhoto5', { ru: 'фотографий', en: 'photos', bg: 'снимки', uk: 'фотографий', be: 'фотографий' 
});
define('profile.mediaVideo1', { ru: 'видео', en: 'video', bg: 'видео', uk: 'Відео', be: 'Відэа' 
});
define('profile.mediaVideo2', { ru: 'видео', en: 'videos', bg: 'видеа', uk: 'Відео', be: 'Відэа' 
});
define('profile.mediaVideo5', { ru: 'видео', en: 'videos', bg: 'видеа', uk: 'Відео', be: 'Відэа' 
});
define('profile.mediaVoice1', { ru: 'голосовое сообщение', en: 'voice message', bg: 'гласово съобщение', uk: 'голосове Повідомлення', be: 'голосовое Паведамленне' 
});
define('profile.mediaVoice2', { ru: 'голосовых сообщения', en: 'voice messages', bg: 'гласови съобщения', uk: 'голосових Повідомлення', be: 'голосовых Паведамленне' 
});
define('profile.mediaVoice5', { ru: 'голосовых сообщений', en: 'voice messages', bg: 'гласови съобщения', uk: 'голосових Повідомлень', be: 'голосовых Паведамленняў' 
});
define('profile.mediaCircle1', { ru: 'видеосообщение', en: 'video message', bg: 'видео съобщение', uk: 'видеосообщение', be: 'видеосообщение' 
});
define('profile.mediaCircle2', { ru: 'видеосообщения', en: 'video messages', bg: 'видео съобщения', uk: 'видеосообщения', be: 'видеосообщения' 
});
define('profile.mediaCircle5', { ru: 'видеосообщений', en: 'video messages', bg: 'видео съобщения', uk: 'видеосообщений', be: 'видеосообщений' 
});
define('profile.mediaFile1', { ru: 'файл', en: 'file', bg: 'файл', uk: 'Файл', be: 'Файл' 
});
define('profile.mediaFile2', { ru: 'файла', en: 'files', bg: 'файла', uk: 'Файлу', be: 'Файла' 
});
define('profile.mediaFile5', { ru: 'файлов', en: 'files', bg: 'файла', uk: 'файлов', be: 'файлов' 
});
define('profile.mediaAudio1', { ru: 'аудиофайл', en: 'audio file', bg: 'аудио файл', uk: 'аудиофайл', be: 'аудиофайл' 
});
define('profile.mediaAudio2', { ru: 'аудиофайла', en: 'audio files', bg: 'аудио файла', uk: 'аудиофайла', be: 'аудиофайла' 
});
define('profile.mediaAudio5', { ru: 'аудиофайлов', en: 'audio files', bg: 'аудио файла', uk: 'аудиофайлов', be: 'аудиофайлов' 
});
define('profile.mediaLink1', { ru: 'ссылка', en: 'link', bg: 'връзка', uk: 'Посилання', be: 'Спасылка' 
});
define('profile.mediaLink2', { ru: 'ссылки', en: 'links', bg: 'връзки', uk: 'Посилання', be: 'Спасылка' 
});
define('profile.mediaLink5', { ru: 'ссылок', en: 'links', bg: 'връзки', uk: 'ссилок', be: 'ссылок' 
});
define('profile.mediaGif1', { ru: 'GIF', en: 'GIF', bg: 'GIF', uk: 'GIF', be: 'GIF' 
});
define('profile.mediaGif2', { ru: 'GIF', en: 'GIF', bg: 'GIF', uk: 'GIF', be: 'GIF' 
});
define('profile.mediaGif5', { ru: 'GIF', en: 'GIF', bg: 'GIF', uk: 'GIF', be: 'GIF' 
});
define('profile.years1', { ru: 'год', en: 'year', bg: 'година', uk: 'год', be: 'год' 
});
define('profile.years2', { ru: 'года', en: 'years', bg: 'години', uk: 'года', be: 'года' 
});
define('profile.years5', { ru: 'лет', en: 'years', bg: 'години', uk: 'лет', be: 'лет' 
});

// ---- Звонки ----
define('calls.incomingCall', { ru: 'Входящий звонок', en: 'Incoming call', bg: 'Входящо обаждане', uk: 'Вхідний дзвінок', be: 'Уваходны званок' 
});
define('calls.outgoingCall', { ru: 'Вызываем…', en: 'Calling…', bg: 'Звъним…', uk: 'Викликаємо…', be: 'Выклікаем…' 
});
define('calls.connecting', { ru: 'Соединяем…', en: 'Connecting…', bg: 'Свързваме…', uk: 'З’єднуємо…', be: 'Злучаем…' 
});
define('calls.active', { ru: 'Звонок идёт', en: 'Call in progress', bg: 'Обаждането е активно', uk: 'Дзвінок триває', be: 'Званок ідзе' 
});
define('calls.qualityUnknown', { ru: 'Проверяем связь', en: 'Checking connection', bg: 'Проверяваме връзката', uk: 'Перевіряємо зв’язок', be: 'Правяраем сувязь' 
});
define('calls.qualityExcellent', { ru: 'Отличная связь', en: 'Excellent connection', bg: 'Отлична връзка', uk: 'Відмінний зв’язок', be: 'Выдатная сувязь' 
});
define('calls.qualityGood', { ru: 'Хорошая связь', en: 'Good connection', bg: 'Добра връзка', uk: 'Хороший зв’язок', be: 'Добрая сувязь' 
});
define('calls.qualityPoor', { ru: 'Слабая связь', en: 'Poor connection', bg: 'Слаба връзка', uk: 'Слабкий зв’язок', be: 'Слабая сувязь' 
});
define('calls.systemDevice', { ru: 'Системное устройство', en: 'System device', bg: 'Системно устройство', uk: 'Системна Пристрій', be: 'Сістэмная Прылада' 
});
define('calls.microphone', { ru: 'Микрофон', en: 'Microphone', bg: 'Микрофон', uk: 'Мікрофон', be: 'Мікрофон' 
});
define('calls.camera', { ru: 'Камера', en: 'Camera', bg: 'Камера', uk: 'Камера', be: 'Камера' 
});
define('calls.speakers', { ru: 'Динамики', en: 'Speakers', bg: 'Високоговорители', uk: 'Динаміки', be: 'Дынамікі' 
});
define('calls.inviteParticipant', { ru: 'Пригласить участника', en: 'Invite a participant', bg: 'Покани участник', uk: 'Запросити учасника', be: 'Запрасіць удзельніка' 
});
define('calls.inviteToCall', { ru: 'Пригласить в звонок', en: 'Invite to the call', bg: 'Покани в обаждането', uk: 'Запросити у дзвінок', be: 'Запрасіць у званок' 
});
define('calls.searchUser', { ru: 'Поиск пользователя', en: 'Search for a user', bg: 'Търсене на потребител', uk: 'Пошук користувача', be: 'Пошук карыстальніка' 
});
define('calls.searchPlaceholder', { ru: 'Имя или @username…', en: 'Name or @username…', bg: 'Име или @username…', uk: 'Ім’я або @username…', be: 'Імя або @username…' 
});
define('calls.usersSearchFailed', { ru: 'Не удалось найти пользователей.', en: 'Could not search for users.', bg: 'Търсенето на потребители не беше успешно.', uk: 'Не вдалося Знайти користувачей.', be: 'Не ўдалося Знайсці карыстальнікей.' 
});
define('calls.noUsersFound', { ru: 'Никого не найдено', en: 'No one found', bg: 'Никой не е намерен', uk: 'Нікого не Знайдено', be: 'Нікога не знойдзена' 
});
define('calls.ask', { ru: 'Позвать', en: 'Ask', bg: 'Покани', uk: 'Покликати', be: 'Паклікаць' 
});
define('calls.pictureInPicture', { ru: 'Картинка в картинке', en: 'Picture in picture', bg: 'Картина в картина', uk: 'Картинка у картинке', be: 'Картинка у картинке' 
});
define('calls.openSeparateWindow', { ru: 'Открыть в отдельном окне', en: 'Open in a separate window', bg: 'Отвори в отделен прозорец', uk: 'Відкрити у отдельном окне', be: 'Адкрыць у отдельном окне' 
});
define('calls.openVideoSeparateWindow', { ru: 'Открыть видео в отдельном окне', en: 'Open the video in a separate window', bg: 'Отвори видеото в отделен прозорец', uk: 'Відкрити Відео у отдельном окне', be: 'Адкрыць Відэа у отдельном окне' 
});
define('calls.expandCall', { ru: 'Развернуть звонок', en: 'Expand the call', bg: 'Разгъни обаждането', uk: 'Розгорнути дзвінок', be: 'Разгарнуць званок' 
});
define('calls.minimizeCall', { ru: 'Свернуть звонок в окно', en: 'Minimize the call to a window', bg: 'Свий обаждането в прозорец', uk: 'Згорнути дзвінок у окно', be: 'Згарнуць званок у окно' 
});
define('calls.minimizeHint', { ru: 'Свернуть в окно — чат останется доступен', en: 'Minimize to a window — the chat stays available', bg: 'Свий в прозорец — чатът остава достъпен', uk: 'Згорнути у окно — Чат останется доступен', be: 'Згарнуць у окно — Чат останется доступен' 
});
define('calls.endCall', { ru: 'Завершить звонок', en: 'End call', bg: 'Край на обаждането', uk: 'Завершити дзвінок', be: 'Завяршыць званок' 
});
define('calls.callUnavailable', { ru: 'Звонок недоступен', en: 'Call unavailable', bg: 'Обаждането е недостъпно', uk: 'Дзвінок недоступний', be: 'Званок недаступны' 
});
define('calls.invitation', { ru: 'Приглашение в звонок', en: 'Call invitation', bg: 'Покана за обаждане', uk: 'Запрошення у дзвінок', be: 'Запрашэнне у званок' 
});
define('calls.participantCount', { ru: '{count} участника', en: '{count} participants', bg: '{count} участника', uk: '{count} учасника', be: '{count} удзельніка' 
});
define('calls.incoming', { ru: 'Входящий', en: 'Incoming', bg: 'Входящ', uk: 'Вхідний', be: 'Уваходны' 
});
define('calls.outgoing', { ru: 'Исходящий', en: 'Outgoing', bg: 'Изходящ', uk: 'Вихідний', be: 'Выходны' 
});
define('calls.videoCallType', { ru: 'видеозвонок', en: 'video call', bg: 'видео разговор', uk: 'відеоздзвінок', be: 'відэазванок' 
});
define('calls.audioCallType', { ru: 'аудиозвонок', en: 'audio call', bg: 'аудио разговор', uk: 'аудіодзвінок', be: 'аўдыязванок' 
});
define('calls.peerSharingScreen', { ru: 'Собеседник показывает экран', en: 'The peer is sharing their screen', bg: 'Събеседникът споделя екран', uk: 'Співрозмовник Показує екран', be: 'Суразмоўца Паказвае экран' 
});
define('calls.microphoneOff', { ru: 'Микрофон выключен', en: 'Microphone is off', bg: 'Микрофонът е изключен', uk: 'Мікрофон вимкен', be: 'Мікрофон выключен' 
});
define('calls.yourScreen', { ru: 'Ваш экран', en: 'Your screen', bg: 'Вашият екран', uk: 'Ваш екран', be: 'Ваш экран' 
});
define('calls.settings', { ru: 'Настройки звонка', en: 'Call settings', bg: 'Настройки на обаждането', uk: 'Налаштування дзвінка', be: 'Налады званка' 
});
define('calls.settingsSaved', { ru: 'Сохраняются для следующих звонков', en: 'Saved for future calls', bg: 'Запазват се за следващите обаждания', uk: 'Сохраняются для следующих дзвінків', be: 'Сохраняются для следующих званкоў' 
});
define('calls.closeSettings', { ru: 'Закрыть настройки', en: 'Close settings', bg: 'Затвори настройките', uk: 'Закрити Налаштування', be: 'Закрыць Налады' 
});
define('calls.videoQuality', { ru: 'Качество видео', en: 'Video quality', bg: 'Качество на видеото', uk: 'Якість Відео', be: 'Якасць Відэа' 
});
define('calls.qualityDataSaver', { ru: 'Экономия трафика (360p)', en: 'Data saver (360p)', bg: 'Икономия на трафик (360p)', uk: 'Економія трафіку (360p)', be: 'Эканомія трафіку (360p)' 
});
define('calls.qualityStandard', { ru: 'Стандартное (540p)', en: 'Standard (540p)', bg: 'Стандартно (540p)', uk: 'Стандартне (540p)', be: 'Стандартнае (540p)' 
});
define('calls.qualityHigh', { ru: 'Высокое (720p)', en: 'High (720p)', bg: 'Високо (720p)', uk: 'Висока (720p)', be: 'Высокае (720p)' 
});
define('calls.autoCamera', { ru: 'Камера при видеозвонке', en: 'Camera in video calls', bg: 'Камера при видео разговор', uk: 'Камера при видеозвонке', be: 'Камера пры видеозвонке' 
});
define('calls.noiseSuppression', { ru: 'Шумоподавление', en: 'Noise suppression', bg: 'Потискане на шума', uk: 'Шумозаглушення', be: 'Шумазаглушэнне' 
});
define('calls.echoCancellation', { ru: 'Эхоподавление', en: 'Echo cancellation', bg: 'Потискане на ехото', uk: 'Ехозаглушення', be: 'Эхазаглушэнне' 
});
define('calls.peerVolume', { ru: 'Громкость собеседника', en: 'Peer volume', bg: 'Сила на звука на събеседника', uk: 'Гучність співрозмовника', be: 'Гучнасць суразмоўцы' 
});
define('calls.joinCall', { ru: 'Войти в звонок', en: 'Join call', bg: 'Влез в обаждането', uk: 'Увійти у дзвінок', be: 'Увайсці у званок' 
});
define('calls.accept', { ru: 'Принять', en: 'Accept', bg: 'Приеми', uk: 'Прийняти', be: 'Прыняць' 
});
define('calls.decline', { ru: 'Отклонить', en: 'Decline', bg: 'Откажи', uk: 'Відхилити', be: 'Адхіліць' 
});
define('calls.muteMicrophone', { ru: 'Выключить микрофон', en: 'Mute microphone', bg: 'Заглуши микрофона', uk: 'Вимкнути Мікрофон', be: 'Выключыць Мікрофон' 
});
define('calls.unmuteMicrophone', { ru: 'Включить микрофон', en: 'Unmute microphone', bg: 'Включи микрофона', uk: 'Увімкнути Мікрофон', be: 'Уключыць Мікрофон' 
});
define('calls.turnCameraOff', { ru: 'Выключить камеру', en: 'Turn off camera', bg: 'Изключи камерата', uk: 'Вимкнути камеру', be: 'Выключыць камеру' 
});
define('calls.turnCameraOn', { ru: 'Включить камеру', en: 'Turn on camera', bg: 'Включи камерата', uk: 'Увімкнути камеру', be: 'Уключыць камеру' 
});
define('calls.stopScreenShare', { ru: 'Остановить демонстрацию', en: 'Stop screen sharing', bg: 'Спри споделянето на екран', uk: 'Зупинити демонстрацію', be: 'Спыніць дэманстрацыю' 
});
define('calls.shareScreen', { ru: 'Показать экран', en: 'Share screen', bg: 'Сподели екран', uk: 'Показати екран', be: 'Паказаць экран' 
});
define('calls.secureContextHintPrefix', {
  ru: 'Камера и микрофон работают только на защищённом соединении. Откройте адрес',
  en: 'The camera and microphone only work over a secure connection. Open the address',
  bg: 'Камерата и микрофонът работят само през защитена връзка. Отворете адреса',
  uk: 'Камера і Мікрофон працюють тільки на захищеному з’єднанні. Откройте адрес',
  be: 'Камера і Мікрофон працуюць толькі на абароненым злучэнні. Откройте адрес',
});
define('calls.secureContextHintSuffix', {
  ru: '— скачивать и устанавливать ничего не нужно.',
  en: '— there is nothing to download or install.',
  bg: '— нищо не трябва да се изтегля или инсталира.',
  uk: '— завантажувати і встановлювати нічого не потрібно.',
  be: '— спампоўваць і устанаўліваць нічога не трэба.',
});
define('calls.secureContextError', {
  ru: 'Для камеры и микрофона откройте защищённую версию: https://{host}:3443. Скачивать ничего не нужно — просто добавьте адрес в браузере.',
  en: 'For the camera and microphone, open the secure version: https://{host}:3443. There is nothing to download — just add the address in your browser.',
  bg: 'За камерата и микрофона отворете защитената версия: https://{host}:3443. Нищо не трябва да се изтегля — просто добавете адреса в браузъра.',
  uk: 'Для камери і микрофона откройте захищену версію: https://{host}:3443. Завантажувати нічого не потрібно — просто додайте адрес у браузері.',
  be: 'Для камеры і микрофона откройте абароненую версію: https://{host}:3443. Спампоўваць нічога не трэба — проста дадайце адрес у браўзеры.',
});
define('calls.noAnswer', { ru: 'Собеседник не ответил на звонок.', en: 'The peer did not answer the call.', bg: 'Събеседникът не отговори на обаждането.', uk: 'Співрозмовник не відповів на дзвінок.', be: 'Суразмоўца не адказаў на званок.' 
});
define('calls.noAudioTrack', { ru: 'Браузер не предоставил аудиодорожку микрофона.', en: 'The browser did not provide a microphone audio track.', bg: 'Браузърът не предостави аудио пътека от микрофона.', uk: 'Браузер не надав аудіодоріжку микрофона.', be: 'Браузер не даў аўдыядарожку микрофона.' 
});
define('calls.noVideoTrack', { ru: 'Браузер не предоставил видеодорожку камеры.', en: 'The browser did not provide a camera video track.', bg: 'Браузърът не предостави видео пътека от камерата.', uk: 'Браузер не надав відеодоріжку камери.', be: 'Браузер не даў відэадарожку камеры.' 
});
define('calls.networkRouteFailed', { ru: 'Не удалось использовать один из сетевых маршрутов. Пробуем другие…', en: 'One of the network routes failed. Trying others…', bg: 'Един от мрежовите маршрути се провали. Опитваме други…', uk: 'Не вдалося использовать один з мережевих маршрутов. Пробуем інші…', be: 'Не ўдалося использовать один з сетевых маршрутов. Пробуем іншыя…' 
});
define('calls.connectionRestarting', { ru: 'Связь прервалась — перезапускаем соединение…', en: 'The connection dropped — restarting it…', bg: 'Връзката прекъсна — рестартираме я…', uk: 'Зв’язок перервався — перезапускаємо З’єднання…', be: 'Сувязь перарвалася — перазапускаем Злучэнне…' 
});
define('calls.connectionLost', { ru: 'Звонок завершён из-за потери соединения.', en: 'The call ended because the connection was lost.', bg: 'Обаждането приключи заради загубена връзка.', uk: 'Дзвінок Завершено з-за втрати з’єднання.', be: 'Званок Завершана з-за страты злучэння.' 
});
define('calls.participantConnectionFailed', { ru: 'Не удалось установить связь с одним из участников.', en: 'Could not connect to one of the participants.', bg: 'Не успяхме да се свържем с един от участниците.', uk: 'Не вдалося установить зв’язок з одним з Учасників.', be: 'Не ўдалося установить сувязь з одним з Удзельнікаў.' 
});
define('calls.noRealtimeConnection', { ru: 'Нет realtime-соединения с сервером. Повторите через несколько секунд.', en: 'No realtime connection to the server. Try again in a few seconds.', bg: 'Няма връзка в реално време със сървъра. Опитайте отново след няколко секунди.', uk: 'Ні realtime-з’єднання з сервером. Повторіть через кілька Секунд.', be: 'Не realtime-злучэння з сервером. Паўтарыце через некалькі Секунд.' 
});
define('calls.mediaConnectionFailed', { ru: 'Не удалось создать медиасоединение.', en: 'Could not create the media connection.', bg: 'Медийната връзка не беше създадена.', uk: 'Не вдалося Створити медиасоединение.', be: 'Не ўдалося Стварыць медиасоединение.' 
});
define('calls.realtimeLostBeforeCall', { ru: 'Realtime-соединение потеряно до начала звонка.', en: 'The realtime connection was lost before the call started.', bg: 'Връзката в реално време се загуби преди началото на обаждането.', uk: 'Realtime-З’єднання втрачено до начала дзвінка.', be: 'Realtime-Злучэнне страчана да начала званка.' 
});
define('calls.callStartFailed', { ru: 'Не удалось начать звонок.', en: 'Could not start the call.', bg: 'Обаждането не започна.', uk: 'Не вдалося Почати дзвінок.', be: 'Не ўдалося Пачаць званок.' 
});
define('calls.realtimeLostOnAccept', { ru: 'Realtime-соединение потеряно при принятии звонка.', en: 'The realtime connection was lost while accepting the call.', bg: 'Връзката в реално време се загуби при приемането на обаждането.', uk: 'Realtime-З’єднання втрачено при прийнятті дзвінка.', be: 'Realtime-Злучэнне страчана пры прыняцці званка.' 
});
define('calls.acceptFailed', { ru: 'Не удалось принять звонок.', en: 'Could not accept the call.', bg: 'Обаждането не беше прието.', uk: 'Не вдалося Прийняти дзвінок.', be: 'Не ўдалося Прыняць званок.' 
});
define('calls.realtimeLostOnJoin', { ru: 'Realtime-соединение потеряно при входе в звонок.', en: 'The realtime connection was lost while joining the call.', bg: 'Връзката в реално време се загуби при влизането в обаждането.', uk: 'Realtime-З’єднання втрачено при вході у дзвінок.', be: 'Realtime-Злучэнне страчана пры уваходзе у званок.' 
});
define('calls.joinFailed', { ru: 'Не удалось войти в звонок.', en: 'Could not join the call.', bg: 'Не успяхме да влезем в обаждането.', uk: 'Не вдалося Увійти у дзвінок.', be: 'Не ўдалося Увайсці у званок.' 
});
define('calls.inviteOnlyActive', { ru: 'Приглашать участников можно во время активного звонка.', en: 'You can invite participants during an active call.', bg: 'Можете да каните участници по време на активно обаждане.', uk: 'Запрошувати Учасників можна у Година активного дзвінка.', be: 'Запрашаць Удзельнікаў можна у Час актыўнага званка.' 
});
define('calls.switchCameraFailed', { ru: 'Не удалось переключить камеру.', en: 'Could not switch the camera.', bg: 'Камерата не беше превключена.', uk: 'Не вдалося переключити камеру.', be: 'Не ўдалося пераключыць камеру.' 
});
define('calls.backToCameraFailed', { ru: 'Не удалось вернуться к камере.', en: 'Could not switch back to the camera.', bg: 'Не успяхме да се върнем към камерата.', uk: 'Не вдалося Повернутися до камере.', be: 'Не ўдалося Вярнуцца да камере.' 
});
define('calls.screenShareUnavailable', { ru: 'Демонстрация экрана недоступна. Откройте Yargram по HTTPS в современном браузере.', en: 'Screen sharing is unavailable. Open Yargram over HTTPS in a modern browser.', bg: 'Споделянето на екран е недостъпно. Отворете Yargram през HTTPS в съвременен браузър.', uk: 'Демонстрация екрана недоступна. Откройте Yargram по HTTPS у сучасному браузері.', be: 'Демонстрация экрана недаступная. Откройте Yargram па HTTPS у сучасным браўзеры.' 
});
define('calls.noDisplayTrack', { ru: 'Браузер не предоставил изображение экрана.', en: 'The browser did not provide a screen image.', bg: 'Браузърът не предостави изображение от екрана.', uk: 'Браузер не надав Зображення екрана.', be: 'Браузер не даў Выява экрана.' 
});
define('calls.screenShareStartFailed', { ru: 'Не удалось начать демонстрацию экрана.', en: 'Could not start screen sharing.', bg: 'Споделянето на екран не започна.', uk: 'Не вдалося Почати демонстрацію екрана.', be: 'Не ўдалося Пачаць дэманстрацыю экрана.' 
});
define('calls.applySettingsFailed', { ru: 'Не удалось применить настройки звонка.', en: 'Could not apply the call settings.', bg: 'Настройките на обаждането не бяха приложени.', uk: 'Не вдалося застосувати Налаштування дзвінка.', be: 'Не ўдалося ужыць Налады званка.' 
});
define('calls.realtimeLostEnded', { ru: 'Realtime-соединение с сервером потеряно. Звонок завершён.', en: 'The realtime connection to the server was lost. The call has ended.', bg: 'Връзката в реално време със сървъра се загуби. Обаждането приключи.', uk: 'Realtime-З’єднання з сервером втрачено. Дзвінок Завершено.', be: 'Realtime-Злучэнне з сервером страчана. Званок Завершана.' 
});
define('calls.joinNewParticipantFailed', { ru: 'Не удалось установить связь с новым участником.', en: 'Could not connect to the new participant.', bg: 'Не успяхме да се свържем с новия участник.', uk: 'Не вдалося установить зв’язок з новим учасником.', be: 'Не ўдалося установить сувязь з новым удзельніком.' 
});
define('calls.participantConnectFailed', { ru: 'Не удалось установить соединение с участником.', en: 'Could not establish a connection with the participant.', bg: 'Не успяхме да установим връзка с участника.', uk: 'Не вдалося установить З’єднання з учасником.', be: 'Не ўдалося установить Злучэнне з удзельніком.' 
});
define('calls.callConnectFailed', { ru: 'Не удалось установить соединение звонка.', en: 'Could not establish the call connection.', bg: 'Връзката на обаждането не беше установена.', uk: 'Не вдалося установить З’єднання дзвінка.', be: 'Не ўдалося установить Злучэнне званка.' 
});
define('calls.callEnded', { ru: 'Звонок завершён.', en: 'The call has ended.', bg: 'Обаждането приключи.', uk: 'Дзвінок Завершено.', be: 'Званок Завершана.' 
});
define('calls.signalingError', { ru: 'Ошибка сигнализации звонка.', en: 'Call signaling error.', bg: 'Грешка в сигнализацията на обаждането.', uk: 'Помилка сигнализации дзвінка.', be: 'Памылка сигнализации званка.' 
});
define('calls.participantFallback', { ru: 'Участник', en: 'Participant', bg: 'Участник', uk: 'Учасник', be: 'Удзельнік' 
});

// ---- Админ-панель ----
define('admin.actionFailed', { ru: 'Не удалось выполнить действие', en: 'Could not perform the action', bg: 'Действието не беше изпълнено', uk: 'Не вдалося виконати действие', be: 'Не ўдалося выканаць действие' 
});
define('admin.ownerOnly', { ru: 'Только владелец', en: 'Owner only', bg: 'Само собственик', uk: 'Тільки власник', be: 'Толькі Уладальнік' 
});
define('admin.title', { ru: 'Админ-панель', en: 'Admin panel', bg: 'Админ панел', uk: 'Адмін-панель', be: 'Адмін-панэль' 
});
define('admin.intro', {
  ru: 'Галочка, значок Yargram и отметка SCAM — для аккаунта и для группы. У группы они выдаются самой группе, а не её создателю, поэтому предупреждение говорит о группе.',
  en: 'The check mark, the Yargram badge and the SCAM mark apply to both accounts and groups. For a group they are granted to the group itself rather than its creator, so the warning speaks about the group.',
  bg: 'Отметката, значка Yargram и отметката SCAM се отнасят и за профил, и за група. При група те се дават на самата група, а не на създателя ѝ, затова предупреждението говори за групата.',
  uk: 'Галочка, Значок Yargram і Позначка SCAM — для Акаунта і для Групи. У Групи вони видаються самой Групі, а не її создателю, тому попередженне говорит про Групі.',
  be: 'Галочка, Значок Yargram і Адзнака SCAM — для Акаўнта і для Групы. У Групы яны выдаются самой Групе, а не яе создателю, поэтому папярэджанне говорит пра Групе.',
});
define('admin.modeLabel', { ru: 'Что администрируем', en: 'What to administer', bg: 'Какво администрираме', uk: 'Що адмініструємо', be: 'Што адмініструем' 
});
define('admin.overview', { ru: 'Всего в Yargram', en: 'Total in Yargram', bg: 'Общо в Yargram', uk: 'Всього в Yargram', be: 'Усяго ў Yargram' 
});
define('admin.accountsTotal', { ru: 'Аккаунтов', en: 'Accounts', bg: 'Профила', uk: 'Акаунтів', be: 'Акаўнтаў' 
});
define('admin.groupsTotal', { ru: 'Групп', en: 'Groups', bg: 'Групи', uk: 'Груп', be: 'Груп' 
});
define('admin.overviewHint', {
  ru: 'Аккаунты считаются вместе с удалёнными — удаление мягкое, и запись остаётся в базе, пока заняты почта и ник.',
  en: 'Accounts are counted together with deleted ones: deletion is soft, so the record stays in the database while its email and username are taken.',
  bg: 'Профилите се броят заедно с изтритите — изтриването е меко и записът остава в базата, докато имейлът и името са заети.',
  uk: 'Акаунти рахуються разом з Видалено — видалення м’яке, і запис залишається в базі, поки зайняті пошта і Нік.',
  be: 'Акаўнты лічацца разам з Выдалена — выдаленне мяккае, і запіс застаецца ў базе, пакуль занятыя пошта і Нік.',
});
define('admin.statsFailed', { ru: 'Не удалось посчитать', en: 'Could not count', bg: 'Не можа да се преброи', uk: 'Не вдалося порахувати', be: 'Не ўдалося палічыць' 
});
define('admin.accountsToggle', { ru: 'Показать список аккаунтов', en: 'Show the account list', bg: 'Покажи списъка с профили', uk: 'Показати список Акаунтів', be: 'Паказаць спіс Акаўнтаў' 
});
define('admin.accountsHide', { ru: 'Скрыть список аккаунтов', en: 'Hide the account list', bg: 'Скрий списъка с профили', uk: 'Сховати список Акаунтів', be: 'Схаваць спіс Акаўнтаў' 
});
define('admin.accountsSearchPlaceholder', { ru: 'ник, @юзернейм или почта', en: 'name, @username or email', bg: 'име, @потребителско име или имейл', uk: 'Нік, @юзернейм або пошта', be: 'Нік, @юзернэйм або пошта' 
});
define('admin.filterAll', { ru: 'Все', en: 'All', bg: 'Всички', uk: 'Усі', be: 'Усе' 
});
define('admin.filterActive', { ru: 'Активные', en: 'Active', bg: 'Активни', uk: 'Активні', be: 'Актыўныя' 
});
define('admin.filterFrozen', { ru: 'Замороженные', en: 'Frozen', bg: 'Замразени', uk: 'Заморожені', be: 'Замороженыя' 
});
define('admin.filterDeleted', { ru: 'Удалённые', en: 'Deleted', bg: 'Изтрити', uk: 'Видалені', be: 'Выдаленыя' 
});
define('admin.filterStateLabel', { ru: 'Состояние', en: 'State', bg: 'Състояние', uk: 'Стан', be: 'Стан' 
});
define('admin.filterMarksLabel', { ru: 'Знаки', en: 'Marks', bg: 'Отметки', uk: 'Позначки', be: 'Адзнакі' 
});
define('admin.filterScopeLabel', { ru: 'Искать в', en: 'Search in', bg: 'Търси в', uk: 'Шукати в', be: 'Шукаць у' 
});
define('admin.markVerified', { ru: 'С галочкой', en: 'Verified', bg: 'С отметка', uk: 'З галочкою', be: 'З галочкаю' 
});
define('admin.markBadge', { ru: 'Со значком Yargram', en: 'With the Yargram badge', bg: 'Със значка Yargram', uk: 'З значком Yargram', be: 'З значком Yargram' 
});
define('admin.markScam', { ru: 'SCAM', en: 'SCAM', bg: 'SCAM', uk: 'SCAM', be: 'SCAM' 
});
define('admin.markFake', { ru: 'FAKE', en: 'FAKE', bg: 'FAKE', uk: 'FAKE', be: 'FAKE' 
});
define('admin.markOwner', { ru: 'Владельцы', en: 'Owners', bg: 'Собственици', uk: 'Власники', be: 'Уладальнікі' 
});
// Метка бота ищется тем же отбором, что и остальные знаки владельца.
define('admin.markBot', { ru: 'BOT', en: 'BOT', bg: 'BOT', uk: 'BOT', be: 'BOT' 
});
define('admin.scopeAny', { ru: 'Везде', en: 'Everywhere', bg: 'Навсякъде', uk: 'Скрізь', be: 'Усюды' 
});
define('admin.scopeName', { ru: 'По нику', en: 'By name', bg: 'По име', uk: 'За Нік', be: 'Па Нік' 
});
define('admin.scopeHandle', { ru: 'По @юзернейму', en: 'By @username', bg: 'По @име', uk: 'За @юзернеймом', be: 'Па @юзернэйму' 
});
define('admin.filtersReset', { ru: 'Сбросить фильтры', en: 'Reset the filters', bg: 'Изчисти филтрите', uk: 'Скинути фільтри', be: 'Скінуць фільтры' 
});
define('admin.accountsFound', { ru: 'Найдено: {count}', en: 'Found: {count}', bg: 'Намерени: {count}', uk: 'Знайдено: {count}', be: 'Знойдзена: {count}' 
});
define('admin.accountsEmpty', { ru: 'Никого не найдено.', en: 'Nobody was found.', bg: 'Никой не е намерен.', uk: 'Нікого Не знайдено.', be: 'Нікога Не Знойдзена.' 
});
define('admin.accountsFailed', { ru: 'Не удалось загрузить список аккаунтов.', en: 'Could not load the account list.', bg: 'Списъкът с профили не се зареди.', uk: 'Не вдалося завантажити список Акаунтів.', be: 'Не ўдалося загрузіць спіс Акаўнтаў.' 
});
define('admin.accountsLoading', { ru: 'Загружаем список…', en: 'Loading the list…', bg: 'Списъкът се зарежда…', uk: 'Завантажуємо список…', be: 'Загружаем спіс…' 
});
define('admin.createdAt', { ru: 'создан {date}', en: 'created {date}', bg: 'създаден {date}', uk: 'створено {date}', be: 'створаны {date}' 
});
define('admin.deletedAt', { ru: 'удалён {date}', en: 'deleted {date}', bg: 'изтрит {date}', uk: 'Видалено {date}', be: 'Выдалена {date}' 
});
define('admin.lastSeenAt', { ru: 'заходил {date}', en: 'last seen {date}', bg: 'влизал {date}', uk: 'Заходив {date}', be: 'Заходзіў {date}' 
});
define('admin.frozenAt', { ru: 'заморожен', en: 'frozen', bg: 'замразен', uk: 'Заморожено', be: 'Заморожена' 
});
define('admin.ownerMark', { ru: 'владелец', en: 'owner', bg: 'собственик', uk: 'власник', be: 'Уладальнік' 
});
define('admin.allUsernames', { ru: 'Все юзернеймы', en: 'All usernames', bg: 'Всички потребителски имена', uk: 'Усі юзернейми', be: 'Усе юзернэймы' 
});
define('admin.moreHandles', { ru: 'ещё {count}', en: '{count} more', bg: 'още {count}', uk: 'ще {count}', be: 'яшчэ {count}' 
});
define('admin.lessHandles', { ru: 'свернуть', en: 'show less', bg: 'свий', uk: 'Згорнути', be: 'Згарнуць' 
});
define('admin.accountsHint', {
  ru: 'Нажмите на аккаунт, чтобы открыть его карточку выше. Удалённые и замороженные показаны настоящим ником — их запись ещё жива.',
  en: 'Tap an account to open its card above. Deleted and frozen ones are shown with their real name — their record is still alive.',
  bg: 'Натиснете профил, за да отворите картата му по-горе. Изтритите и замразените са показани с истинското си име — записът им е жив.',
  uk: 'Натисніть на Акаунт, щоб відкрити його Картку вище. Видалені і заморожені показані справжнім Нік — їх запис ще живий.',
  be: 'Націсніце на Акаўнт, каб адкрыць яго Картку вышэй. Выдаленыя і замороженыя паказаны сапраўдным Нік — іх запіс яшчэ жывы.',
});
define('admin.account', { ru: 'Аккаунт', en: 'Account', bg: 'Профил', uk: 'Акаунт', be: 'Акаўнт' 
});
define('admin.group', { ru: 'Группа', en: 'Group', bg: 'Група', uk: 'Група', be: 'Група' 
});
define('admin.bot', { ru: 'Боты', en: 'Bots', bg: 'Ботове', uk: 'Боти', be: 'Боты' 
});
define('admin.botsIntro', {
  ru: 'Служебные аккаунты Yargram. Такой аккаунт не человек: рядом с именем у него горит метка BOT, а войти в него нельзя — пароля у него нет.',
  en: 'Yargram service accounts. Such an account is not a person: it carries the BOT label next to its name, and nobody can sign in to it — it has no password.',
  bg: 'Служебни профили на Yargram. Такъв профил не е човек: до името му стои отметка BOT, а влизане в него е невъзможно — той няма парола.',
  uk: 'Службові акаунти Yargram. Такий акаунт не людина: поруч з іменем у нього горить метка BOT, а увійти в нього не можна — пароля в нього немає.',
  be: 'Службовыя акаўнты Yargram. Такі акаўнт не чалавек: побач з імем у яго гарыць метка BOT, а ўвайсці ў яго нельга — пароля ў яго няма.',
});
define('admin.botsListLabel', { ru: 'Служебные боты', en: 'Service bots', bg: 'Служебни ботове', uk: 'Службові боти', be: 'Службовыя боты' 
});
define('admin.botsLoading', { ru: 'Загружаем список…', en: 'Loading the list…', bg: 'Списъкът се зарежда…', uk: 'Завантажуємо список…', be: 'Загружаем спіс…' 
});
define('admin.botsFailed', { ru: 'Не удалось загрузить список ботов.', en: 'Could not load the bot list.', bg: 'Списъкът с ботове не се зареди.', uk: 'Не вдалося завантажити список ботів.', be: 'Не ўдалося загрузіць спіс ботаў.' 
});
define('admin.botsEmpty', { ru: 'Служебных ботов пока нет.', en: 'There are no service bots yet.', bg: 'Още няма служебни ботове.', uk: 'Службових ботів поки немає.', be: 'Службовых ботаў пакуль няма.' 
});
define('admin.botUsernameLabel', { ru: 'Кому поставить метку BOT', en: 'Who to mark as a bot', bg: 'Кого да отбележим като бот', uk: 'Кому поставити метку BOT', be: 'Каму паставіць метку BOT' 
});
define('admin.botStateOn', { ru: 'Метка BOT стоит: войти в этот аккаунт нельзя.', en: 'The BOT label is set: nobody can sign in to this account.', bg: 'Отметката BOT е поставена: влизане в този профил е невъзможно.', uk: 'Метка BOT стоїть: увійти в цей акаунт не можна.', be: 'Метка BOT стаіць: увайсці ў гэты акаўнт нельга.' 
});
define('admin.botStateOff', { ru: 'Обычный аккаунт: вход по паролю работает.', en: 'A regular account: signing in with a password works.', bg: 'Обикновен профил: влизането с парола работи.', uk: 'Звичайний акаунт: вхід за паролем працює.', be: 'Звычайны акаўнт: уваход па паролі працуе.' 
});
define('admin.botSet', { ru: 'Поставить BOT', en: 'Set BOT', bg: 'Постави BOT', uk: 'Поставити BOT', be: 'Паставіць BOT' 
});
define('admin.botClear', { ru: 'Снять BOT', en: 'Clear BOT', bg: 'Махни BOT', uk: 'Зняти BOT', be: 'Зняць BOT' 
});
define('admin.botSetDone', { ru: 'Аккаунт {handle} помечен ботом. Войти в него больше нельзя.', en: '{handle} is now marked as a bot. Nobody can sign in to it anymore.', bg: 'Профилът {handle} е отбелязан като бот. Влизане в него вече е невъзможно.', uk: 'Акаунт {handle} позначений ботом. Увійти в нього більше не можна.', be: 'Акаўнт {handle} пазначаны ботам. Увайсці ў яго больш нельга.' 
});
define('admin.botClearedDone', { ru: 'С аккаунта {handle} метка бота снята.', en: 'The bot label has been removed from {handle}.', bg: 'Отметката бот е свалена от профила {handle}.', uk: 'З акаунта {handle} метку бота знято.', be: 'З акаўнта {handle} метка бота знята.' 
});
define('admin.confirmBot', {
  ru: 'Пометить {handle} ботом? Войти в этот аккаунт больше нельзя, а письма для входа и сброса пароля перестанут работать. Снять метку можно здесь же.',
  en: 'Mark {handle} as a bot? Nobody will be able to sign in to this account, and sign-in and password-reset emails will stop working. The label can be removed here as well.',
  bg: 'Да отбележим ли {handle} като бот? Влизането в този профил ще стане невъзможно, а писмата за вход и смяна на парола ще спрат да работят. Отметката може да се свали оттук.',
  uk: 'Позначити {handle} ботом? Увійти в цей акаунт більше не можна, а листи для входу та скидання пароля перестануть працювати. Зняти метку можна тут же.',
  be: 'Пазначыць {handle} ботам? Увайсці ў гэты акаўнт больш нельга, а лісты для ўваходу і скіду пароля перастануць працаваць. Зняць метку можна тут жа.',
});
define('admin.botWarning', {
  ru: 'Своему аккаунту метку поставить нельзя: снять её было бы уже некому. Метка не стирает аккаунт и не удаляет переписку — она только закрывает вход.',
  en: 'You cannot mark your own account: there would be nobody left to remove the label. The label does not erase the account or the chats — it only closes the sign-in.',
  bg: 'На собствения си профил не можете да поставите отметка: нямаше да остане кой да я свали. Отметката не изтрива профила и разговорите — само затваря влизането.',
  uk: 'Своєму акаунту метку поставити не можна: зняти її було б уже нікому. Метка не стирає акаунт і не видаляє переписку — вона лише закриває вхід.',
  be: 'Свайму акаўнту метку паставіць нельга: зняць яе было б ужо некаму. Метка не сцірае акаўнт і не выдаляе перапіску — яна толькі закрывае ўваход.',
});
define('admin.groupLabel', { ru: 'Группа', en: 'Group', bg: 'Група', uk: 'Група', be: 'Група' 
});
define('admin.groupPlaceholder', { ru: 'название, ссылка-приглашение или id', en: 'name, invite link or id', bg: 'име, връзка за покана или id', uk: 'Назва, Посилання-запрошення або id', be: 'Назва, Спасылка-Запрашэнне або id' 
});
define('admin.findGroups', { ru: 'Найти группы', en: 'Find groups', bg: 'Намери групи', uk: 'Знайти Групи', be: 'Знайсці Групы' 
});
define('admin.emptyQueryHint', { ru: 'Пустой запрос покажет первые группы.', en: 'An empty query shows the first groups.', bg: 'Празна заявка показва първите групи.', uk: 'Пустой запит покаже перші Групи.', be: 'Пустой запыт пакажа першыя Групы.' 
});
define('admin.memberCount', { ru: '{count} участн.', en: '{count} members', bg: '{count} члена', uk: '{count} участн.', be: '{count} участн.' 
});
define('admin.markSummary', {
  ru: 'галочка {verified}, значок {badge}, отметка SCAM {scam}, отметка FAKE {fake}',
  en: 'check mark {verified}, badge {badge}, SCAM mark {scam}, FAKE mark {fake}',
  bg: 'отметка {verified}, значка {badge}, отметка SCAM {scam}, отметка FAKE {fake}',
  uk: 'Галочка {verified}, Значок {badge}, Позначка SCAM {scam}, Позначка FAKE {fake}',
  be: 'Галочка {verified}, Значок {badge}, Адзнака SCAM {scam}, Адзнака FAKE {fake}',
});
define('admin.yes', { ru: 'есть', en: 'yes', bg: 'има', uk: 'є', be: 'ёсць' 
});
define('admin.no', { ru: 'нет', en: 'no', bg: 'няма', uk: 'Ні', be: 'Не' 
});
define('admin.frozenSuffix', { ru: ', аккаунт заморожен', en: ', the account is frozen', bg: ', профилът е замразен', uk: ', Акаунт заморожен', be: ', Акаўнт заморожен' 
});
define('admin.deletedSuffix', { ru: ', аккаунт удалён', en: ', the account is deleted', bg: ', профилът е изтрит', uk: ', Акаунт Видалено', be: ', Акаўнт Выдалена' 
});
define('admin.groupLink', { ru: 'ссылка: {code}', en: 'link: {code}', bg: 'връзка: {code}', uk: 'Посилання: {code}', be: 'Спасылка: {code}' 
});
define('admin.verify', { ru: 'Подтвердить (галочка)', en: 'Verify (check mark)', bg: 'Потвърди (отметка)', uk: 'Підтвердити (Галочка)', be: 'Пацвердзіць (Галочка)' 
});
define('admin.removeVerify', { ru: 'Снять галочку', en: 'Remove the check mark', bg: 'Махни отметката', uk: 'Зняти галочку', be: 'Зняць галочку' 
});
define('admin.badgeYargram', { ru: 'Значок Yargram', en: 'Yargram badge', bg: 'Значка Yargram', uk: 'Значок Yargram', be: 'Значок Yargram' 
});
define('admin.removeBadgeYargram', { ru: 'Снять значок Yargram', en: 'Remove the Yargram badge', bg: 'Махни значката Yargram', uk: 'Зняти Значок Yargram', be: 'Зняць Значок Yargram' 
});
define('admin.setScam', { ru: 'Выдать отметку SCAM', en: 'Apply the SCAM mark', bg: 'Постави отметка SCAM', uk: 'Видати позначку SCAM', be: 'Выдать отметку SCAM' 
});
define('admin.clearScam', { ru: 'Снять отметку SCAM', en: 'Remove the SCAM mark', bg: 'Махни отметката SCAM', uk: 'Зняти позначку SCAM', be: 'Зняць отметку SCAM' 
});
define('admin.setFake', { ru: 'Выдать отметку FAKE', en: 'Apply the FAKE mark', bg: 'Постави отметка FAKE', uk: 'Видати позначку FAKE', be: 'Выдаць адзнаку FAKE' 
});
define('admin.clearFake', { ru: 'Снять отметку FAKE', en: 'Remove the FAKE mark', bg: 'Махни отметката FAKE', uk: 'Зняти позначку FAKE', be: 'Зняць адзнаку FAKE' 
});
define('admin.confirmFake', {
  ru: 'Пометить аккаунт {handle} как FAKE? Рядом с именем появится отметка, а описание заменится предупреждением о подделке под официальный аккаунт — менять его человек больше не сможет.',
  en: 'Mark the account {handle} as FAKE? A mark will appear next to the name and the description will be replaced with an impersonation warning — the person will no longer be able to change it.',
  bg: 'Да отбележите профила {handle} като FAKE? До името ще се появи отметка, а описанието ще бъде заменено с предупреждение за представяне за официален профил — човекът вече няма да може да го променя.',
  uk: 'Помітити акаунт {handle} як FAKE? Поруч з іменем з’явиться позначка, а опис заміниться попередженням про підробку під офіційний акаунт — змінити його людина більше не зможе.',
  be: 'Пазначыць акаунт {handle} як FAKE? Побач з імем з’явіцца адзнака, а апісанне заменіцца папярэджаннем пра падробку пад афіцыйны акаунт — змяніць яго чалавек больш не зможа.',
});
define('admin.fakeSet', { ru: 'Аккаунт {handle} помечен как FAKE.', en: 'The account {handle} has been marked as FAKE.', bg: 'Профилът {handle} е отбелязан като FAKE.', uk: 'Акаунт {handle} позначено як FAKE.', be: 'Акаунт {handle} пазначаны як FAKE.' 
});
define('admin.fakeCleared', { ru: 'Отметка FAKE с аккаунта {handle} снята.', en: 'The FAKE mark has been removed from {handle}.', bg: 'Отметката FAKE е махната от {handle}.', uk: 'Позначку FAKE з акаунта {handle} знято.', be: 'Адзнаку FAKE з акаунта {handle} знята.' 
});
define('admin.groupScamNote', {
  ru: 'Отметка SCAM у группы работает как у аккаунта: группа остаётся рабочей и писать в неё можно, но рядом с названием горит красная рамка, а описание заменяется предупреждением и не меняется, пока отметку не снимут.',
  en: 'The SCAM mark on a group works just like on an account: the group stays usable and can still be written to, but a red frame lights up next to its name and the description is replaced with a warning that cannot be changed until the mark is removed.',
  bg: 'Отметката SCAM при група работи както при профил: групата остава работеща и може да се пише в нея, но до името ѝ свети червена рамка, а описанието се заменя с предупреждение и не се променя, докато отметката не бъде махната.',
  uk: 'Позначка SCAM у Групи працює як у Акаунта: Група остаётся рабочей і писать у неї можна, але поруч з назвем горит красна рамка, а Опис заменяется попередженнем і не меняется, пока позначку не снимут.',
  be: 'Адзнака SCAM у Групы працуе як у Акаўнта: Група остаётся рабочей і писать у яе можна, але побач з назвем горит красная рамка, а Апісанне заменяется папярэджаннем і не меняется, пока отметку не снимут.',
});
define('admin.verifyGrantedGroup', { ru: 'Галочка выдана группе.', en: 'The check mark has been granted to the group.', bg: 'Отметката е дадена на групата.', uk: 'Галочка видана Групі.', be: 'Галочка выдана Групе.' 
});
define('admin.verifyRemoved', { ru: 'Галочка снята.', en: 'The check mark has been removed.', bg: 'Отметката е махната.', uk: 'Галочка снята.', be: 'Галочка снята.' 
});
define('admin.badgeGrantedGroup', { ru: 'Значок Yargram выдан группе.', en: 'The Yargram badge has been granted to the group.', bg: 'Значката Yargram е дадена на групата.', uk: 'Значок Yargram виданий Групі.', be: 'Значок Yargram выдан Групе.' 
});
define('admin.badgeRemoved', { ru: 'Значок Yargram снят.', en: 'The Yargram badge has been removed.', bg: 'Значката Yargram е махната.', uk: 'Значок Yargram снят.', be: 'Значок Yargram снят.' 
});
define('admin.groupScamSet', { ru: 'Группа «{title}» помечена как SCAM.', en: 'The group “{title}” has been marked as SCAM.', bg: 'Групата „{title}“ е отбелязана като SCAM.', uk: 'Група «{title}» помечена як SCAM.', be: 'Група «{title}» помечена як SCAM.' 
});
define('admin.groupScamCleared', { ru: 'Отметка SCAM снята, описание группы вернулось.', en: 'The SCAM mark has been cleared and the group description restored.', bg: 'Отметката SCAM е махната и описанието на групата е върнато.', uk: 'Позначка SCAM снята, Опис Групи вернулось.', be: 'Адзнака SCAM снята, Апісанне Групы вернулось.' 
});
define('admin.groupFakeSet', { ru: 'Группа «{title}» помечена как FAKE.', en: 'The group “{title}” has been marked as FAKE.', bg: 'Групата „{title}“ е отбелязана като FAKE.', uk: 'Група «{title}» помечена як FAKE.', be: 'Група «{title}» помечена як FAKE.' 
});
define('admin.groupFakeCleared', { ru: 'Отметка FAKE снята, описание группы вернулось.', en: 'The FAKE mark has been cleared and the group description restored.', bg: 'Отметката FAKE е махната и описанието на групата е върнато.', uk: 'Позначка FAKE снята, Опис Групи вернулось.', be: 'Адзнака FAKE снята, Апісанне Групы вернулось.' 
});
define('admin.confirmGroupScam', {
  ru: 'Пометить группу «{title}» как SCAM? Рядом с названием появится красная отметка, а описание заменится предупреждением о мошенничестве — менять его группа больше не сможет.',
  en: 'Mark the group “{title}” as SCAM? A red mark will appear next to its name and the description will be replaced with a fraud warning — the group will no longer be able to change it.',
  bg: 'Да отбележите групата „{title}“ като SCAM? До името ѝ ще се появи червена отметка, а описанието ще бъде заменено с предупреждение за измама — групата вече няма да може да го променя.',
  uk: 'Пометить групу «{title}» як SCAM? Поруч з назвем появится красна Позначка, а Опис заменится попередженнем про мошенничестве — менять його Група більше не зможе.',
  be: 'Пометить групу «{title}» як SCAM? Побач з назвем появится красная Адзнака, а Апісанне заменится папярэджаннем пра мошенничестве — менять яго Група больш не зможа.',
});
define('admin.accountUsernameLabel', { ru: 'Юзернейм аккаунта', en: 'Account username', bg: 'Потребителско име на профила', uk: 'Юзернейм Акаунта', be: 'Юзернэйм Акаўнта' 
});
define('admin.usernamePlaceholder', { ru: 'например: top1nuk1', en: 'for example: top1nuk1', bg: 'например: top1nuk1', uk: 'Наприклад: top1nuk1', be: 'Напрыклад: top1nuk1' 
});
define('admin.showState', { ru: 'Показать состояние', en: 'Show state', bg: 'Покажи състоянието', uk: 'Показати состояние', be: 'Паказаць состояние' 
});
define('admin.useOwnUsername', { ru: 'Подставить свой ник', en: 'Use my username', bg: 'Използвай моето име', uk: 'Підставити свій Нік', be: 'Падставіць свой Нік' 
});
define('admin.noAliases', { ru: 'Дополнительных юзернеймов нет.', en: 'There are no additional usernames.', bg: 'Няма допълнителни потребителски имена.', uk: 'Додаткових юзернеймов Ні.', be: 'Дополнительных юзернеймов Не.' 
});
define('admin.removeAlias', { ru: 'убрать', en: 'remove', bg: 'махни', uk: 'Прибрати', be: 'Прыбраць' 
});
define('admin.aliasRemoved', { ru: 'Юзернейм @{alias} удалён.', en: 'The username @{alias} has been removed.', bg: 'Потребителското име @{alias} е премахнато.', uk: 'Юзернейм @{alias} Видалено.', be: 'Юзернэйм @{alias} Выдалена.' 
});
define('admin.verifyGranted', { ru: 'Галочка выдана.', en: 'The check mark has been granted.', bg: 'Отметката е дадена.', uk: 'Галочка видана.', be: 'Галочка выдана.' 
});
define('admin.badgeGranted', { ru: 'Значок Yargram выдан.', en: 'The Yargram badge has been granted.', bg: 'Значката Yargram е дадена.', uk: 'Значок Yargram виданий.', be: 'Значок Yargram выдан.' 
});
define('admin.unassignAdmin', { ru: 'Снять права админа', en: 'Revoke admin rights', bg: 'Отнеми правата на админ', uk: 'Зняти Права админа', be: 'Зняць Правы админа' 
});
define('admin.adminRightsRevoked', { ru: 'Права администратора сняты.', en: 'The administrator rights have been revoked.', bg: 'Правата на администратор са отнети.', uk: 'Права адміністратора зняті.', be: 'Правы адміністратара сняты.' 
});
define('admin.aliasesAssigned', { ru: 'Юзернеймы аккаунта: {aliases}.', en: 'Account usernames: {aliases}.', bg: 'Потребителски имена на профила: {aliases}.', uk: 'Юзернейми Акаунта: {aliases}.', be: 'Юзернеймы Акаўнта: {aliases}.' 
});
define('admin.aliasesCleared', { ru: 'Доп. юзернеймы очищены.', en: 'The additional usernames have been cleared.', bg: 'Допълнителните потребителски имена са изчистени.', uk: 'Доп. юзернейми очищено.', be: 'Доп. юзернеймы ачышчаны.' 
});
define('admin.clearAliases', { ru: 'Очистить доп. юзернеймы', en: 'Clear additional usernames', bg: 'Изчисти допълнителните имена', uk: 'Очистити доп. юзернейми', be: 'Ачысціць доп. юзернеймы' 
});
define('admin.aliasesLabel', { ru: 'Дополнительные юзернеймы', en: 'Additional usernames', bg: 'Допълнителни потребителски имена', uk: 'Додаткові юзернейми', be: 'Дадатковыя юзернеймы' 
});
define('admin.aliasesPlaceholder', { ru: 'добавить через запятую: kotik, second_name', en: 'add separated by commas: kotik, second_name', bg: 'добавете със запетая: kotik, second_name', uk: 'Додати через кому: kotik, second_name', be: 'Дадаць через коску: kotik, second_name' 
});
define('admin.aliasAdd', { ru: 'Добавить', en: 'Add', bg: 'Добави', uk: 'Додати', be: 'Дадаць' 
});
define('admin.freeze', { ru: 'Заморозить аккаунт', en: 'Freeze the account', bg: 'Замрази профила', uk: 'Заморозити Акаунт', be: 'Заморозіць Акаўнт' 
});
define('admin.unfreeze', { ru: 'Разморозить аккаунт', en: 'Unfreeze the account', bg: 'Размрази профила', uk: 'Розморозити Акаунт', be: 'Размарозіць Акаўнт' 
});
define('admin.restoreAccount', { ru: 'Вернуть аккаунт', en: 'Restore the account', bg: 'Върни профила', uk: 'Повернути Акаунт', be: 'Вярнуць Акаўнт' 
});
define('admin.deleteAccount', { ru: 'Удалить аккаунт', en: 'Delete the account', bg: 'Изтрий профила', uk: 'Видалити Акаунт', be: 'Выдаліць Акаўнт' 
});
define('admin.accountNotes', {
  ru: 'Заморозка закрывает вход: человек сможет читать переписку, но не писать, и написать ему тоже никто не сможет. Отметка SCAM оставляет аккаунт рабочим, но рядом с именем горит красная рамка, а описание заменяется предупреждением о мошенничестве. Удаление оставляет историю переписки собеседникам, но почта и ник остаются занятыми — аккаунт можно вернуть.',
  en: 'Freezing blocks sign-in: the person can read chats but not write, and no one can write to them either. The SCAM mark keeps the account usable, but a red frame lights up next to the name and the description is replaced with a fraud warning. Deletion leaves the chat history with the peers, but the email and username stay taken — the account can be restored.',
  bg: 'Замразяването блокира влизането: човекът може да чете разговорите, но не и да пише, и никой не може да му пише. Отметката SCAM оставя профила работещ, но до името свети червена рамка, а описанието се заменя с предупреждение за измама. Изтриването оставя историята на разговорите у събеседниците, но имейлът и потребителското име остават заети — профилът може да бъде върнат.',
  uk: 'Заморозка закриває Вхід: человек зможе читать переписку, але не писать, і написать ему теж Ніхто не зможе. Позначка SCAM оставляет Акаунт рабочим, але поруч з именем горит красна рамка, а Опис заменяется попередженнем про мошенничестве. Удаление оставляет историю переписки співрозмовників, але Пошта і Нік остаются зайнятими — Акаунт можна повернути.',
  be: 'Заморозка закрывает Уваход: человек зможа читать переписку, але не писать, і написать ему таксама Ніхто не зможа. Адзнака SCAM оставляет Акаўнт рабочим, але побач з именем горит красная рамка, а Апісанне заменяется папярэджаннем пра мошенничестве. Удаление оставляет историю переписки суразмоўцаў, але Пошта і Нік остаются занятыми — Акаўнт можна вярнуць.',
});
define('admin.selfNote', {
  ru: 'Себя тоже можно администрировать: дополнительные юзернеймы назначаются и своему аккаунту, кроме прав администратора.',
  en: 'You can administer yourself too: additional usernames can be assigned to your own account, except for administrator rights.',
  bg: 'Можете да администрирате и себе си: допълнителни потребителски имена се задават и на собствения ви профил, с изключение на правата на администратор.',
  uk: 'Собі теж можна администрировать: Додаткові юзернейми призначаються і своему аккаунту, кроме прав адміністратора.',
  be: 'Сябе таксама можна администрировать: Дадатковыя юзернеймы прызначаюцца і своему аккаунту, кроме прав адміністратара.',
});
define('admin.noUsername', { ru: 'Укажите юзернейм', en: 'Enter a username', bg: 'Въведете потребителско име', uk: 'Укажіть Юзернейм', be: 'Укажыце Юзернэйм' 
});
define('admin.userNotFound', { ru: 'Пользователь @{name} не найден', en: 'User @{name} was not found', bg: 'Потребителят @{name} не е намерен', uk: 'Користувач @{name} Не знайдено', be: 'Карыстальнік @{name} Не Знойдзена' 
});
define('admin.groupsNotFound', { ru: 'Группы не найдены', en: 'No groups found', bg: 'Няма намерени групи', uk: 'Групи не знайдені', be: 'Групы не найдены' 
});
define('admin.selectGroupFirst', { ru: 'Сначала найдите и выберите группу', en: 'Find and select a group first', bg: 'Първо намерете и изберете група', uk: 'Спочатку знайдіть і виберіть групу', be: 'Спачатку знайдзіце і выберыце групу' 
});
define('admin.confirmFreeze', {
  ru: 'Заморозить аккаунт {handle}? Он не сможет войти и писать, пока вы не разморозите его.',
  en: 'Freeze the account {handle}? They will not be able to sign in or message until you unfreeze it.',
  bg: 'Да замразите профила {handle}? Няма да може да влезе и да пише, докато не го размразите.',
  uk: 'Заморозити Акаунт {handle}? Він не зможе Увійти і писать, пока ви не разморозите його.',
  be: 'Заморозіць Акаўнт {handle}? Ён не зможа Увайсці і писать, пока вы не разморозите яго.',
});
define('admin.accountFrozen', { ru: 'Аккаунт {handle} заморожен.', en: 'The account {handle} has been frozen.', bg: 'Профилът {handle} е замразен.', uk: 'Акаунт {handle} заморожен.', be: 'Акаўнт {handle} заморожен.' 
});
define('admin.accountUnfrozen', { ru: 'Аккаунт {handle} разморожен.', en: 'The account {handle} has been unfrozen.', bg: 'Профилът {handle} е размразен.', uk: 'Акаунт {handle} разморожен.', be: 'Акаўнт {handle} разморожен.' 
});
define('admin.confirmScam', {
  ru: 'Пометить аккаунт {handle} как SCAM? Рядом с именем появится красная отметка, а описание заменится предупреждением о мошенничестве — менять его человек больше не сможет.',
  en: 'Mark the account {handle} as SCAM? A red mark will appear next to the name and the description will be replaced with a fraud warning — the person will no longer be able to change it.',
  bg: 'Да отбележите профила {handle} като SCAM? До името ще се появи червена отметка, а описанието ще бъде заменено с предупреждение за измама — човекът вече няма да може да го променя.',
  uk: 'Пометить Акаунт {handle} як SCAM? Поруч з именем появится красна Позначка, а Опис заменится попередженнем про мошенничестве — менять його человек більше не зможе.',
  be: 'Пометить Акаўнт {handle} як SCAM? Побач з именем появится красная Адзнака, а Апісанне заменится папярэджаннем пра мошенничестве — менять яго человек больш не зможа.',
});
define('admin.scamSet', { ru: 'Аккаунт {handle} помечен как SCAM.', en: 'The account {handle} has been marked as SCAM.', bg: 'Профилът {handle} е отбелязан като SCAM.', uk: 'Акаунт {handle} помечен як SCAM.', be: 'Акаўнт {handle} помечен як SCAM.' 
});
define('admin.scamCleared', { ru: 'Отметка SCAM с аккаунта {handle} снята, описание вернулось.', en: 'The SCAM mark has been removed from the account {handle} and the description restored.', bg: 'Отметката SCAM е махната от профила {handle} и описанието е върнато.', uk: 'Позначка SCAM з Акаунта {handle} снята, Опис вернулось.', be: 'Адзнака SCAM з Акаўнта {handle} снята, Апісанне вернулось.' 
});
define('admin.confirmDelete', {
  ru: 'Удалить аккаунт {handle}? Его почта и ник останутся занятыми, а историю переписки собеседники сохранят.',
  en: 'Delete the account {handle}? Their email and username will stay taken, and the peers will keep the chat history.',
  bg: 'Да изтриете профила {handle}? Имейлът и потребителското име ще останат заети, а събеседниците ще запазят историята на разговорите.',
  uk: 'Видалити Акаунт {handle}? Його Пошта і Нік останутся зайнятими, а историю переписки співрозмовники сохранят.',
  be: 'Выдаліць Акаўнт {handle}? Яго Пошта і Нік останутся занятыми, а историю переписки собеседники сохранят.',
});
define('admin.accountDeleted', { ru: 'Аккаунт {handle} удалён.', en: 'The account {handle} has been deleted.', bg: 'Профилът {handle} е изтрит.', uk: 'Акаунт {handle} Видалено.', be: 'Акаўнт {handle} Выдалена.' 
});
define('admin.accountRestored', { ru: 'Аккаунт возвращён.', en: 'The account has been restored.', bg: 'Профилът е върнат.', uk: 'Акаунт возвращён.', be: 'Акаўнт возвращён.' 
});

// ---- Группы ----
define('groups.panelLabel', { ru: 'Группа {title}', en: 'Group {title}', bg: 'Група {title}', uk: 'Група {title}', be: 'Група {title}' 
});
define('groups.about', { ru: 'О группе', en: 'About group', bg: 'За групата', uk: 'Про Групі', be: 'Пра Групе' 
});
define('groups.editInfo', { ru: 'Изменить информацию', en: 'Edit info', bg: 'Редактирай информацията', uk: 'Змінити информацию', be: 'Змяніць информацию' 
});
define('groups.titlePlaceholder', { ru: 'Название группы', en: 'Group name', bg: 'Име на групата', uk: 'Назва групи', be: 'Назва групы' 
});
define('groups.descriptionPlaceholder', { ru: 'Описание', en: 'Description', bg: 'Описание', uk: 'Опис', be: 'Апісанне' 
});
define('groups.scamNotice', {
  ru: 'На группе стоит отметка SCAM: описание заменено предупреждением о мошенничестве и не редактируется, пока владелец Yargram не снимет отметку.',
  en: 'This group is marked as SCAM: the description has been replaced with a fraud warning and cannot be edited until the Yargram owner clears the mark.',
  bg: 'Групата е отбелязана като SCAM: описанието е заменено с предупреждение за измама и не може да се редактира, докато собственикът на Yargram не махне отметката.',
  uk: 'На Групі стоит Позначка SCAM: Опис заменено попередженнем про мошенничестве і не редактируется, пока власник Yargram не снимет позначку.',
  be: 'На Групе стоит Адзнака SCAM: Апісанне заменено папярэджаннем пра мошенничестве і не редактируется, пока Уладальнік Yargram не снимет отметку.',
});
define('groups.fakeNotice', {
  ru: 'На группе стоит отметка FAKE: группа выдаёт себя за официальную, описание заменено предупреждением и не редактируется, пока владелец Yargram не снимет отметку.',
  en: 'This group is marked as FAKE: it impersonates an official one, the description has been replaced with a warning and cannot be edited until the Yargram owner clears the mark.',
  bg: 'Групата е отбелязана като FAKE: тя се представя за официална, описанието е заменено с предупреждение и не може да се редактира, докато собственикът на Yargram не махне отметката.',
  uk: 'На Групі стоит Позначка FAKE: Група видає себе за офіційну, Опис заменено попередженнем і не редактируется, пока власник Yargram не снимет позначку.',
  be: 'На Групе стоит Адзнака FAKE: Група выдае сябе за афіцыйную, Апісанне заменено папярэджаннем і не редактируется, пока Уладальнік Yargram не снимет адзнаку.',
});
define('groups.inviteLink', { ru: 'Ссылка-приглашение', en: 'Invite link', bg: 'Връзка за покана', uk: 'Посилання-запрошення', be: 'Спасылка-Запрашэнне' 
});
define('groups.copied', { ru: 'Скопировано', en: 'Copied', bg: 'Копирано', uk: 'Скопійовано', be: 'Скапіравана' 
});
define('groups.copyLink', { ru: 'Скопировать ссылку', en: 'Copy link', bg: 'Копирай връзката', uk: 'Скопировать посилання', be: 'Скопировать спасылку' 
});
define('groups.regenerateLink', { ru: 'Перевыпустить ссылку', en: 'Regenerate link', bg: 'Издай нова връзка', uk: 'Перевипустити посилання', be: 'Перавыпусціць спасылку' 
});
define('groups.linkUnavailable', { ru: 'Ссылка недоступна', en: 'Link unavailable', bg: 'Връзката не е налична', uk: 'Посилання недоступна', be: 'Спасылка недаступная' 
});
define('groups.addMembers', { ru: 'Добавить участников', en: 'Add members', bg: 'Добави участници', uk: 'Додати Учасників', be: 'Дадаць Удзельнікаў' 
});
define('groups.sectionsLabel', { ru: 'Разделы группы', en: 'Group sections', bg: 'Раздели на групата', uk: 'Розділи Групи', be: 'Раздзелы Групы' 
});
define('groups.tabMembers', { ru: 'Участники', en: 'Members', bg: 'Участници', uk: 'Учасники', be: 'Удзельнікі' 
});
define('groups.tabRights', { ru: 'Права', en: 'Permissions', bg: 'Права', uk: 'Права', be: 'Правы' 
});
define('groups.tabHistory', { ru: 'История', en: 'History', bg: 'История', uk: 'Історія', be: 'Гісторыя' 
});
define('groups.searchMembers', { ru: 'Поиск участников', en: 'Search members', bg: 'Търсене на участници', uk: 'Пошук Учасників', be: 'Пошук Удзельнікаў' 
});
define('groups.nobodyFound', { ru: 'Никого не найдено.', en: 'No one found.', bg: 'Никой не е намерен.', uk: 'Нікого не Знайдено.', be: 'Нікога не знойдзена.' 
});
define('groups.youSuffix', { ru: '(вы)', en: '(you)', bg: '(вие)', uk: '(ви)', be: '(вы)' 
});
define('groups.mutedSuffix', { ru: ' · заглушён', en: ' · muted', bg: ' · заглушен', uk: ' · заглушён', be: ' · заглушён' 
});
define('groups.rightsHintManage', {
  ru: 'Что разрешено обычным участникам. Права администратора настраиваются отдельно — в меню участника.',
  en: 'What regular members are allowed to do. Admin rights are configured separately, in the member menu.',
  bg: 'Какво е разрешено на обикновените участници. Правата на администратор се настройват отделно — в менюто на участника.',
  uk: 'Що Дозволено звичайним учасникам. Права адміністратора налаштовуються окремо — у меню учасника.',
  be: 'Што Дазволена звычайным удзельнікам. Правы адміністратара наладжваюцца асобна — у меню удзельніка.',
});
define('groups.rightsHintRead', {
  ru: 'Что разрешено обычным участникам этой группы.',
  en: 'What regular members of this group are allowed to do.',
  bg: 'Какво е разрешено на обикновените участници в тази група.',
  uk: 'Що Дозволено звичайним учасникам цієї Групи.',
  be: 'Што Дазволена звычайным удзельнікам гэтай Групы.',
});
define('groups.allowMembers', { ru: '{permission}: разрешено участникам.', en: '{permission}: allowed for members.', bg: '{permission}: разрешено за участниците.', uk: '{permission}: Дозволено учасникам.', be: '{permission}: Дазволена удзельнікам.' 
});
define('groups.denyMembers', { ru: '{permission}: запрещено участникам.', en: '{permission}: denied for members.', bg: '{permission}: забранено за участниците.', uk: '{permission}: Заборонено учасникам.', be: '{permission}: Забаронена удзельнікам.' 
});
define('groups.allowOne', { ru: '{permission}: разрешено.', en: '{permission}: allowed.', bg: '{permission}: разрешено.', uk: '{permission}: Дозволено.', be: '{permission}: Дазволена.' 
});
define('groups.denyOne', { ru: '{permission}: запрещено.', en: '{permission}: denied.', bg: '{permission}: забранено.', uk: '{permission}: Заборонено.', be: '{permission}: Забаронена.' 
});
define('groups.noChangesYet', { ru: 'Изменений пока не было.', en: 'No changes yet.', bg: 'Още няма промени.', uk: 'Змін пока не було.', be: 'Змен пока не было.' 
});
define('groups.ownerCannotLeave', {
  ru: 'Вы владелец группы — выйти можно, только передав её другому участнику.',
  en: 'You own this group — you can only leave after transferring it to another member.',
  bg: 'Вие сте собственик на групата — можете да излезете само след като я прехвърлите на друг участник.',
  uk: 'Ви власник Групи — Вийти можна, тільки передав її другому учаснику.',
  be: 'Вы Уладальнік Групы — Выйсці можна, толькі передав яе другому удзельніку.',
});
define('groups.leave', { ru: 'Выйти из группы', en: 'Leave group', bg: 'Напусни групата', uk: 'Вийти з Групи', be: 'Выйсці з Групы' 
});
define('groups.whoToAdd', { ru: 'Кого добавить в группу', en: 'Who to add to the group', bg: 'Кого да добавите в групата', uk: 'Кого Додати у групу', be: 'Каго Дадаць у групу' 
});
define('groups.memberFallback', { ru: 'Пользователь', en: 'User', bg: 'Потребител', uk: 'Користувач', be: 'Карыстальнік' 
});
define('groups.count1', { ru: '{count} участник', en: '{count} member', bg: '{count} участник', uk: '{count} Учасник', be: '{count} Удзельнік' 
});
define('groups.count2', { ru: '{count} участника', en: '{count} members', bg: '{count} участници', uk: '{count} учасника', be: '{count} удзельніка' 
});
define('groups.count5', { ru: '{count} участников', en: '{count} members', bg: '{count} участници', uk: '{count} Учасників', be: '{count} Удзельнікаў' 
});
define('groups.createTitle', { ru: 'Новая группа', en: 'New group', bg: 'Нова група', uk: 'Нова Група', be: 'Новая Група' 
});
define('groups.createSubtitle', {
  ru: 'Название и участников можно менять потом — в любой момент',
  en: 'You can change the name and members later, at any time',
  bg: 'Името и участниците може да промените по-късно — по всяко време',
  uk: 'Назва і Учасників можна менять потім — у Будь-який момент',
  be: 'Назва і Удзельнікаў можна менять потым — у Любы момент',
});
define('groups.uploadPhoto', { ru: 'Загрузить фото группы', en: 'Upload group photo', bg: 'Качи снимка на групата', uk: 'Завантажити фото Групи', be: 'Загрузіць фото Групы' 
});
define('groups.replace', { ru: 'Заменить', en: 'Replace', bg: 'Замени', uk: 'Заменить', be: 'Заменить' 
});
define('groups.photo', { ru: 'Фото', en: 'Photo', bg: 'Снимка', uk: 'Фото', be: 'Фото' 
});
define('groups.descriptionGroupLabel', { ru: 'Описание группы', en: 'Group description', bg: 'Описание на групата', uk: 'Опис Групи', be: 'Апісанне Групы' 
});
define('groups.descriptionOptional', { ru: 'Описание (необязательно)', en: 'Description (optional)', bg: 'Описание (по избор)', uk: 'Опис (необов’язково)', be: 'Апісанне (неабавязкова)' 
});
define('groups.removeFromGroup', { ru: 'Убрать из группы', en: 'Remove from group', bg: 'Премахни от групата', uk: 'Прибрати з Групи', be: 'Прыбраць з Групы' 
});
define('groups.addByUsername', { ru: 'Добавить участников по @username', en: 'Add members by @username', bg: 'Добави участници по @username', uk: 'Додати Учасників по @username', be: 'Дадаць Удзельнікаў па @username' 
});
define('groups.selectedCount', { ru: 'Выбрано: {count}', en: 'Selected: {count}', bg: 'Избрани: {count}', uk: 'Вибрано: {count}', be: 'Выбрана: {count}' 
});
define('groups.canCreateAlone', { ru: 'Можно создать и одному', en: 'You can create it on your own too', bg: 'Може да създадете и сам', uk: 'Можна Створити і одному', be: 'Можна Стварыць і одному' 
});
define('groups.create', { ru: 'Создать группу', en: 'Create group', bg: 'Създай група', uk: 'Створити групу', be: 'Стварыць групу' 
});
define('groups.titleRequired', { ru: 'У группы должно быть название.', en: 'The group needs a name.', bg: 'Групата трябва да има име.', uk: 'У Групи повинно бути Назва.', be: 'У Групы павінна быць Назва.' 
});
define('groups.avatarFailed', { ru: 'Не удалось загрузить фото.', en: 'Could not upload the photo.', bg: 'Снимката не беше качена.', uk: 'Не вдалося Завантажити фото.', be: 'Не ўдалося Загрузіць фото.' 
});
define('groups.createFailed', { ru: 'Не удалось создать группу.', en: 'Could not create the group.', bg: 'Групата не беше създадена.', uk: 'Не вдалося Створити групу.', be: 'Не ўдалося Стварыць групу.' 
});
define('groups.loadFailed', { ru: 'Не удалось загрузить группу.', en: 'Could not load the group.', bg: 'Групата не беше заредена.', uk: 'Не вдалося Завантажити групу.', be: 'Не ўдалося Загрузіць групу.' 
});
define('groups.actionFailed', { ru: 'Не удалось выполнить действие.', en: 'Could not complete the action.', bg: 'Действието не беше изпълнено.', uk: 'Не вдалося виконати действие.', be: 'Не ўдалося выканаць действие.' 
});
define('groups.infoSaved', { ru: 'Информация о группе обновлена.', en: 'Group info updated.', bg: 'Информацията за групата е обновена.', uk: 'Інформація про Групі оновлено.', be: 'Інфармацыя пра Групе абноўлена.' 
});
define('groups.copyFailed', { ru: 'Не удалось скопировать ссылку. Скопируйте её вручную.', en: 'Could not copy the link. Copy it manually.', bg: 'Връзката не беше копирана. Копирайте я ръчно.', uk: 'Не вдалося скопировать посилання. Скопируйте її вручную.', be: 'Не ўдалося скопировать спасылку. Скопируйте яе вручную.' 
});
define('groups.linkRegenerated', { ru: 'Старая ссылка больше не работает.', en: 'The old link no longer works.', bg: 'Старата връзка вече не работи.', uk: 'Старе Посилання більше не працює.', be: 'Старая Спасылка больш не працуе.' 
});
define('groups.nowAdmin', { ru: '{name} теперь администратор.', en: '{name} is now an administrator.', bg: '{name} вече е администратор.', uk: '{name} тепер Адміністратор.', be: '{name} цяпер Адміністратар.' 
});
define('groups.rightsUpdated', { ru: 'Права {name} обновлены.', en: "{name}'s rights have been updated.", bg: 'Правата на {name} са обновени.', uk: 'Права {name} оновлено.', be: 'Правы {name} абноўлены.' 
});
define('groups.noLongerAdmin', { ru: '{name} больше не администратор.', en: '{name} is no longer an administrator.', bg: '{name} вече не е администратор.', uk: '{name} більше не Адміністратор.', be: '{name} больш не Адміністратар.' 
});
define('groups.tagSaved', { ru: 'Тег «{tag}» сохранён.', en: 'The tag “{tag}” has been saved.', bg: 'Етикетът „{tag}“ е запазен.', uk: 'Тег «{tag}» Збережено.', be: 'Тег «{tag}» Захавана.' 
});
define('groups.tagCleared', { ru: 'Тег снят.', en: 'The tag has been cleared.', bg: 'Етикетът е премахнат.', uk: 'Тег снят.', be: 'Тег снят.' 
});
define('groups.mutedForever', { ru: '{name} заглушен(а) бессрочно.', en: '{name} has been muted indefinitely.', bg: '{name} е заглушен(а) за неопределено време.', uk: '{name} заглушен(а) бессрочно.', be: '{name} заглушен(а) бессрочно.' 
});
define('groups.mutedFor', { ru: '{name} заглушен(а) на {count} ч.', en: '{name} has been muted for {count} h.', bg: '{name} е заглушен(а) за {count} ч.', uk: '{name} заглушен(а) на {count} ч.', be: '{name} заглушен(а) на {count} ч.' 
});
define('groups.unmuted', { ru: 'С {name} снят мьют.', en: '{name} has been unmuted.', bg: 'Заглушаването на {name} е премахнато.', uk: 'З {name} снят Мут.', be: 'З {name} снят Мут.' 
});
define('groups.memberRemoved', { ru: '{name} удалён(а) из группы.', en: '{name} has been removed from the group.', bg: '{name} е премахнат(а) от групата.', uk: '{name} Видалено(а) з Групи.', be: '{name} Выдалена(а) з Групы.' 
});
define('groups.membersAdded', { ru: 'Участники добавлены.', en: 'Members added.', bg: 'Участниците са добавени.', uk: 'Учасники додані.', be: 'Удзельнікі добавлены.' 
});
define('groups.leaveFailed', { ru: 'Не удалось выйти из группы.', en: 'Could not leave the group.', bg: 'Не успяхте да напуснете групата.', uk: 'Не вдалося Вийти з Групи.', be: 'Не ўдалося Выйсці з Групы.' 
});
define('groups.searchHint', { ru: 'Найти человека по @username', en: 'Find a person by @username', bg: 'Намерете човек по @username', uk: 'Знайти человека по @username', be: 'Знайсці человека па @username' 
});
define('groups.searchMinChars', { ru: 'Введите хотя бы три символа username.', en: 'Enter at least three characters of the username.', bg: 'Въведете поне три символа от потребителското име.', uk: 'Введіть хотя б три символа username.', be: 'Увядзіце хотя б три символа username.' 
});
define('groups.searchFailed', { ru: 'Не удалось выполнить поиск.', en: 'The search could not be completed.', bg: 'Търсенето не беше изпълнено.', uk: 'Не вдалося виконати Пошук.', be: 'Не ўдалося выканаць Пошук.' 
});
define('groups.allAlreadyInGroup', { ru: 'Все найденные уже в группе.', en: 'Everyone found is already in the group.', bg: 'Всички намерени вече са в групата.', uk: 'Усі знайдені вже у Групі.', be: 'Усё найденные ужо у Групе.' 
});
define('groups.nobodyMatched', { ru: 'Никого не нашли.', en: 'We did not find anyone.', bg: 'Не намерихме никого.', uk: 'Нікого не нашли.', be: 'Нікога не нашли.' 
});
define('groups.foundUsers', { ru: 'Найденные пользователи', en: 'Found users', bg: 'Намерени потребители', uk: 'Знайдені Користувачі', be: 'Найденные Карыстальнікі' 
});
define('groups.tagTooltip', { ru: 'Тег: {tag}', en: 'Tag: {tag}', bg: 'Етикет: {tag}', uk: 'Тег: {tag}', be: 'Тег: {tag}' 
});
define('groups.memberDialogTitle', { ru: 'Участник', en: 'Member', bg: 'Участник', uk: 'Учасник', be: 'Удзельнік' 
});
define('groups.removeFromGroupLong', { ru: 'Удалить из группы', en: 'Remove from group', bg: 'Премахни от групата', uk: 'Видалити з Групи', be: 'Выдаліць з Групы' 
});
define('groups.onlineNow', { ru: 'в сети', en: 'online', bg: 'на линия', uk: 'у мережі', be: 'у сетцы' 
});
define('groups.recently', { ru: 'был(а) недавно', en: 'last seen recently', bg: 'беше наскоро', uk: 'був(ла) Нещодавно', be: 'быў(ла) Нядаўна' 
});
define('groups.adminRights', { ru: 'Права администратора', en: 'Admin rights', bg: 'Права на администратор', uk: 'Права адміністратора', be: 'Правы адміністратара' 
});
define('groups.makeAdmin', { ru: 'Назначить администратором', en: 'Make administrator', bg: 'Направи администратор', uk: 'Призначити администратором', be: 'Прызначыць администратором' 
});
define('groups.configure', { ru: 'Настроить', en: 'Configure', bg: 'Настрой', uk: 'Налаштувати', be: 'Наладаваць' 
});
define('groups.changeMemberTag', { ru: 'Изменить тег участника', en: "Change the member's tag", bg: 'Промени етикета на участника', uk: 'Змінити тег учасника', be: 'Змяніць тег удзельніка' 
});
define('groups.noTag', { ru: 'без тега', en: 'no tag', bg: 'без етикет', uk: 'без тега', be: 'без тега' 
});
define('groups.memberPermissions', { ru: 'Разрешения участника', en: 'Member permissions', bg: 'Разрешения на участника', uk: 'Дозволи учасника', be: 'Дазволы удзельніка' 
});
define('groups.mute', { ru: 'Мьют', en: 'Mute', bg: 'Заглушаване', uk: 'Мут', be: 'Мут' 
});
define('groups.unmute', { ru: 'Снять мьют', en: 'Unmute', bg: 'Отстрани заглушаването', uk: 'Зняти Мут', be: 'Зняць Мут' 
});
define('groups.mutedStatus', { ru: 'Заглушён · {until}', en: 'Muted · {until}', bg: 'Заглушен · {until}', uk: 'Заглушён · {until}', be: 'Заглушён · {until}' 
});
define('groups.manageHint', {
  ru: 'Управлять участниками могут владелец и администраторы группы.',
  en: 'Only the group owner and administrators can manage members.',
  bg: 'Само собственикът и администраторите на групата могат да управляват участниците.',
  uk: 'Управлять учасниками можуть власник і адміністратори Групи.',
  be: 'Управлять удзельніками могуць Уладальнік і администраторы Групы.',
});
define('groups.addAdminTitle', { ru: 'Добавить администратора', en: 'Add an administrator', bg: 'Добави администратор', uk: 'Додати адміністратора', be: 'Дадаць адміністратара' 
});
define('groups.adminCapabilitiesHint', {
  ru: 'Возможности администратора включаются по отдельности.',
  en: 'Administrator capabilities are enabled individually.',
  bg: 'Възможностите на администратора се включват поотделно.',
  uk: 'Можливості адміністратора вмикаються по отдельности.',
  be: 'Магчымасці адміністратара уключаюцца па отдельности.',
});
define('groups.demoteAdmin', { ru: 'Снять администратора', en: 'Remove administrator', bg: 'Премахни администратор', uk: 'Зняти адміністратора', be: 'Зняць адміністратара' 
});
define('groups.adminCapabilities', { ru: 'Возможности администратора:', en: 'Administrator capabilities:', bg: 'Възможности на администратора:', uk: 'Можливості адміністратора:', be: 'Магчымасці адміністратара:' 
});
define('groups.adminCanAddAdmins', {
  ru: 'Этот администратор сможет назначать новых администраторов.',
  en: 'This administrator will be able to appoint new administrators.',
  bg: 'Този администратор ще може да назначава нови администратори.',
  uk: 'Цей Адміністратор зможе призначати нових администраторов.',
  be: 'Гэты Адміністратар зможа прызначаць новых администраторов.',
});
define('groups.adminCannotAddAdmins', {
  ru: 'Этот администратор не сможет добавлять новых администраторов.',
  en: 'This administrator will not be able to add new administrators.',
  bg: 'Този администратор няма да може да добавя нови администратори.',
  uk: 'Цей Адміністратор не зможе добавлять нових администраторов.',
  be: 'Гэты Адміністратар не зможа добавлять новых администраторов.',
});
define('groups.tagPreview', { ru: 'Как это выглядит', en: 'How it looks', bg: 'Как изглежда', uk: 'Як це виглядає', be: 'Як гэта выглядит' 
});
define('groups.memberTagLabel', { ru: 'Тег участника', en: 'Member tag', bg: 'Етикет на участника', uk: 'Тег учасника', be: 'Тег удзельніка' 
});
define('groups.tagExample', { ru: 'Например, #смирнёха', en: 'For example, #smirnyoha', bg: 'Например, #смирнёха', uk: 'Наприклад, #смирнёха', be: 'Напрыклад, #смирнёха' 
});
define('groups.tagHelp', {
  ru: 'Вы можете указать тег, который будет отображаться рядом с именем. Цвет подписи зависит от роли: у владельца фиолетовый, у администратора зелёный, у участника серый. Пустое поле снимает тег.',
  en: 'You can set a tag to be shown next to the name. Its colour depends on the role: purple for the owner, green for an administrator, grey for a member. An empty field clears the tag.',
  bg: 'Можете да зададете етикет, който ще се показва до името. Цветът зависи от ролята: лилав за собственика, зелен за администратор, сив за участник. Празното поле премахва етикета.',
  uk: 'Ви можете указать тег, який буде отображаться поруч з именем. Колір подписи зависит від Ролі: у владельца фіолетовий, у адміністратора зелений, у учасника сірий. Пусте поле снимает тег.',
  be: 'Вы можете указать тег, который будзе отображаться побач з именем. Колер подписи зависит ад Ролі: у владельца фиолетовый, у адміністратара зелёный, у удзельніка серый. Пустое поле снимает тег.',
});
define('groups.mute1h', { ru: '1 час', en: '1 hour', bg: '1 час', uk: '1 Година', be: '1 Час' 
});
define('groups.mute8h', { ru: '8 часов', en: '8 hours', bg: '8 часа', uk: '8 годин', be: '8 гадзін' 
});
define('groups.mute1d', { ru: '1 день', en: '1 day', bg: '1 ден', uk: '1 День', be: '1 Дзень' 
});
define('groups.mute1w', { ru: '1 неделя', en: '1 week', bg: '1 седмица', uk: '1 Тиждень', be: '1 Тыдзень' 
});
define('groups.muteForever', { ru: 'Навсегда', en: 'Forever', bg: 'Завинаги', uk: 'Назавжди', be: 'Назаўжды' 
});
define('groups.menuProfile', { ru: 'Показать профиль', en: 'View profile', bg: 'Покажи профила', uk: 'Показати Профіль', be: 'Паказаць Профіль' 
});
define('groups.menuRestrict', { ru: 'Ограничить пользователя', en: 'Restrict the user', bg: 'Ограничи потребителя', uk: 'Обмежити користувача', be: 'Абмежаваць карыстальніка' 
});
define('groups.menuLabel', { ru: 'Действия с участником {name}', en: 'Actions for member {name}', bg: 'Действия с участник {name}', uk: 'Дії з учасником {name}', be: 'Дзеянні з удзельніком {name}' 
});

// ---- Опросы ----
define('polls.newPoll', { ru: 'Новый опрос', en: 'New poll', bg: 'Нова анкета', uk: 'Новий Опитування', be: 'Новы Апытанне' 
});
define('polls.question', { ru: 'Вопрос', en: 'Question', bg: 'Въпрос', uk: 'Питання', be: 'Пытанні' 
});
define('polls.questionText', { ru: 'Текст вопроса', en: 'Question text', bg: 'Текст на въпроса', uk: 'Текст вопроса', be: 'Тэкст вопроса' 
});
define('polls.insertEmoji', { ru: 'Вставить значок', en: 'Insert emoji', bg: 'Вмъкни емоджи', uk: 'Вставити Значок', be: 'Уставіць Значок' 
});
define('polls.descriptionLabel', { ru: 'Описание', en: 'Description', bg: 'Описание', uk: 'Опис', be: 'Апісанне' 
});
define('polls.descriptionPlaceholder', { ru: 'Описание (необязательно)', en: 'Description (optional)', bg: 'Описание (по избор)', uk: 'Опис (необов’язково)', be: 'Апісанне (неабавязкова)' 
});
define('polls.answerOptions', { ru: 'Варианты ответа', en: 'Answer options', bg: 'Опции за отговор', uk: 'Варіанти ответа', be: 'Варыянты ответа' 
});
define('polls.addAnswer', { ru: 'Добавить ответ…', en: 'Add an answer…', bg: 'Добави отговор…', uk: 'Додати Відповідь…', be: 'Дадаць Адказ…' 
});
define('polls.optionNumber', { ru: 'Вариант {number}', en: 'Option {number}', bg: 'Опция {number}', uk: 'Варіант {number}', be: 'Варыянт {number}' 
});
define('polls.correctAnswerNumber', { ru: 'Правильный ответ: вариант {number}', en: 'Correct answer: option {number}', bg: 'Правилен отговор: опция {number}', uk: 'Правильний Відповідь: Варіант {number}', be: 'Правільны Адказ: Варыянт {number}' 
});
define('polls.deleteOption', { ru: 'Удалить вариант {number}', en: 'Delete option {number}', bg: 'Изтрий опция {number}', uk: 'Видалити Варіант {number}', be: 'Выдаліць Варыянт {number}' 
});
define('polls.optionsLeft', { ru: 'Можно добавить ещё {count} вариантов ответа.', en: 'You can still add {count} more answer options.', bg: 'Можете да добавите още {count} опции за отговор.', uk: 'Можна Додати ще {count} варіантів ответа.', be: 'Можна Дадаць яшчэ {count} варыянтаў ответа.' 
});
define('polls.settings', { ru: 'Настройки', en: 'Settings', bg: 'Настройки', uk: 'Налаштування', be: 'Налады' 
});
define('polls.showNames', { ru: 'Имена участников', en: 'Member names', bg: 'Имена на участниците', uk: 'Імена Учасників', be: 'Імёны Удзельнікаў' 
});
define('polls.showNamesHint', { ru: 'Рядом с ответами отображаются имена всех голосовавших.', en: 'The names of everyone who voted are shown next to the answers.', bg: 'До отговорите се показват имената на всички гласували.', uk: 'Поруч з ответами відображаються імена всіх тих, хто голосував.', be: 'Побач з ответами адлюстроўваюцца імёны усіх тых, хто галасаваў.' 
});
define('polls.multiple', { ru: 'Несколько ответов', en: 'Multiple answers', bg: 'Няколко отговора', uk: 'Кілька ответов', be: 'Некалькі ответов' 
});
define('polls.multipleHint', { ru: 'Участники могут выбрать более одного варианта ответа.', en: 'Members can choose more than one answer option.', bg: 'Участниците могат да изберат повече от една опция за отговор.', uk: 'Учасники можуть Вибрати більше одного варіанта ответа.', be: 'Удзельнікі могуць Выбраць больш одного варыянта ответа.' 
});
define('polls.addOptions', { ru: 'Добавление вариантов', en: 'Adding options', bg: 'Добавяне на опции', uk: 'Додавання варіантів', be: 'Даданне варыянтаў' 
});
define('polls.addOptionsHint', { ru: 'Участники могут предлагать новые варианты.', en: 'Members can suggest new options.', bg: 'Участниците могат да предлагат нови опции.', uk: 'Учасники можуть предлагать Нові Варіанти.', be: 'Удзельнікі могуць предлагать Новыя Варыянты.' 
});
define('polls.changeVote', { ru: 'Изменение ответа', en: 'Changing the answer', bg: 'Промяна на отговора', uk: 'Зміна ответа', be: 'Змяненне ответа' 
});
define('polls.changeVoteHint', { ru: 'Участники могут изменить выбранный ответ.', en: 'Members can change the answer they chose.', bg: 'Участниците могат да променят избрания отговор.', uk: 'Учасники можуть Змінити вибраний Відповідь.', be: 'Удзельнікі могуць Змяніць выбранный Адказ.' 
});
define('polls.shuffle', { ru: 'Случайный порядок', en: 'Random order', bg: 'Случаен ред', uk: 'Випадковий Порядок', be: 'Выпадковы Парадак' 
});
define('polls.shuffleHint', { ru: 'Ответы отображаются у всех участников в случайном порядке.', en: 'Answers are shown to all members in a random order.', bg: 'Отговорите се показват на всички участници в случаен ред.', uk: 'Відповіді відображаються у всіх Учасників у случайном порядке.', be: 'Адказы адлюстроўваюцца у усіх Удзельнікаў у случайном порядке.' 
});
define('polls.quiz', { ru: 'Правильный ответ', en: 'Correct answer', bg: 'Правилен отговор', uk: 'Правильний Відповідь', be: 'Правільны Адказ' 
});
define('polls.quizHint', { ru: 'Отметьте один или несколько правильных вариантов.', en: 'Mark one or more correct options.', bg: 'Отбележете един или няколко правилни отговора.', uk: 'Позначте один або кілька правильних варіантів.', be: 'Адзначце один або некалькі правильных варыянтаў.' 
});
define('polls.deadline', { ru: 'Ограничение срока', en: 'Time limit', bg: 'Ограничение на срока', uk: 'Обмеження терміну', be: 'Абмежаванне тэрміну' 
});
define('polls.deadlineHint', { ru: 'Опрос автоматически завершится в заданное время.', en: 'The poll will close automatically at the set time.', bg: 'Анкетата ще приключи автоматично в зададеното време.', uk: 'Опитування автоматически завершится у заданне Година.', be: 'Апытанне автоматически завершится у заданное Час.' 
});
define('polls.duration1h', { ru: '1 час', en: '1 hour', bg: '1 час', uk: '1 Година', be: '1 Час' 
});
define('polls.duration3h', { ru: '3 часа', en: '3 hours', bg: '3 часа', uk: '3 години', be: '3 гадзіны' 
});
define('polls.duration8h', { ru: '8 часов', en: '8 hours', bg: '8 часа', uk: '8 годин', be: '8 гадзін' 
});
define('polls.duration1d', { ru: '1 день', en: '1 day', bg: '1 ден', uk: '1 День', be: '1 Дзень' 
});
define('polls.duration3d', { ru: '3 дня', en: '3 days', bg: '3 дни', uk: '3 дні', be: '3 дні' 
});
define('polls.durationForever', { ru: 'Навсегда', en: 'Forever', bg: 'Завинаги', uk: 'Назавжди', be: 'Назаўжды' 
});
define('polls.durationOther', { ru: 'Другое', en: 'Other', bg: 'Друго', uk: 'Інше', be: 'Іншае' 
});
define('polls.closesIn', { ru: 'Опрос автоматически завершится через {duration}.', en: 'The poll will close automatically in {duration}.', bg: 'Анкетата ще приключи автоматично след {duration}.', uk: 'Опитування автоматически завершится через {duration}.', be: 'Апытанне автоматически завершится через {duration}.' 
});
define('polls.hours1', { ru: '{count} час', en: '{count} hour', bg: '{count} час', uk: '{count} Година', be: '{count} Час' 
});
define('polls.hours2', { ru: '{count} часа', en: '{count} hours', bg: '{count} часа', uk: '{count} години', be: '{count} гадзіны' 
});
define('polls.hours5', { ru: '{count} часов', en: '{count} hours', bg: '{count} часа', uk: '{count} годин', be: '{count} гадзін' 
});
define('polls.days1', { ru: '{count} день', en: '{count} day', bg: '{count} ден', uk: '{count} День', be: '{count} Дзень' 
});
define('polls.days2', { ru: '{count} дня', en: '{count} days', bg: '{count} дни', uk: '{count} дні', be: '{count} дні' 
});
define('polls.days5', { ru: '{count} дней', en: '{count} days', bg: '{count} дни', uk: '{count} днів', be: '{count} дзён' 
});
define('polls.pollEnd', { ru: 'Завершение опроса', en: 'Poll ends', bg: 'Край на анкетата', uk: 'Завершення Опитування', be: 'Завяршэнне Апытанне' 
});
define('polls.endDate', { ru: 'Дата завершения', en: 'End date', bg: 'Дата на приключване', uk: 'Дата завершения', be: 'Дата завершения' 
});
define('polls.at', { ru: 'в', en: 'at', bg: 'в', uk: 'у', be: 'у' 
});
define('polls.endTime', { ru: 'Время завершения', en: 'End time', bg: 'Час на приключване', uk: 'Година завершения', be: 'Час завершения' 
});
define('polls.create', { ru: 'Создать', en: 'Create', bg: 'Създай', uk: 'Створити', be: 'Стварыць' 
});
define('polls.voterFallback', { ru: 'Участник', en: 'Member', bg: 'Участник', uk: 'Учасник', be: 'Удзельнік' 
});
define('polls.myOption', { ru: 'Свой вариант', en: 'Your own option', bg: 'Своя опция', uk: 'Свій Варіант', be: 'Свой Варыянт' 
});
define('polls.myOptionAria', { ru: 'Свой вариант ответа', en: 'Your own answer option', bg: 'Своя опция за отговор', uk: 'Свій Варіант ответа', be: 'Свой Варыянт ответа' 
});
define('polls.addOption', { ru: 'Добавить вариант', en: 'Add an option', bg: 'Добави опция', uk: 'Додати Варіант', be: 'Дадаць Варыянт' 
});
define('polls.closed', { ru: 'Опрос завершён · ', en: 'Poll closed · ', bg: 'Анкетата е приключена · ', uk: 'Опитування Завершено · ', be: 'Апытанне Завершана · ' 
});
define('polls.votedCount', { ru: 'Проголосовало: {count}', en: 'Voted: {count}', bg: 'Гласували: {count}', uk: 'Проголосовало: {count}', be: 'Проголосовало: {count}' 
});
define('polls.hideNames', { ru: 'Скрыть имена', en: 'Hide names', bg: 'Скрий имената', uk: 'Сховати імена', be: 'Схаваць імёны' 
});
define('polls.showNamesAction', { ru: 'Показать имена', en: 'Show names', bg: 'Покажи имената', uk: 'Показати імена', be: 'Паказаць імёны' 
});
define('polls.correctAnswerMarked', { ru: 'Правильный ответ отмечен галочкой', en: 'The correct answer is marked with a checkmark', bg: 'Правилният отговор е отбелязан с отметка', uk: 'Правильний Відповідь отмечен галочкой', be: 'Правільны Адказ отмечен галочкой' 
});
define('polls.stop', { ru: 'Остановить опрос', en: 'Stop the poll', bg: 'Спри анкетата', uk: 'Зупинити Опитування', be: 'Спыніць Апытанне' 
});
define('polls.answerLocked', { ru: 'Ответ отправлен — изменить его нельзя.', en: 'Your answer has been submitted and cannot be changed.', bg: 'Отговорът е изпратен — не може да бъде променен.', uk: 'Відповідь отправлен — Змінити його не можна.', be: 'Адказ отправлен — Змяніць яго нельга.' 
});

// ---- Реакции, закреплённые, системные сообщения ----
define('extras.removeReaction', { ru: 'Убрать реакцию', en: 'Remove reaction', bg: 'Премахни реакцията', uk: 'Прибрати реакцію', be: 'Прыбраць рэакцыю' 
});
define('extras.addReaction', { ru: 'Поставить реакцию', en: 'Add reaction', bg: 'Добави реакция', uk: 'Поставити реакцію', be: 'Паставіць рэакцыю' 
});
define('extras.addReactionAria', { ru: 'Добавить реакцию', en: 'Add reaction', bg: 'Добави реакция', uk: 'Додати реакцію', be: 'Дадаць рэакцыю' 
}); 

// ---- Стикеры, наборы и гифки ----
define('stickers.pickerLabel', { ru: 'Стикеры и гифки', en: 'Stickers and GIFs', bg: 'Стикери и GIF-та', uk: 'Стікери та GIF-ки', be: 'Сцікера і GIF-і' });
define('stickers.tabStickers', { ru: 'Стикеры', en: 'Stickers', bg: 'Стикери', uk: 'Стікери', be: 'Сцікеры' });
define('stickers.tabGifs', { ru: 'Гифки', en: 'GIFs', bg: 'GIF-та', uk: 'GIF-ки', be: 'GIF-і' });
define('stickers.favorites', { ru: 'Избранное', en: 'Favorites', bg: 'Любими', uk: 'Обране', be: 'Абранае' });
define('stickers.recent', { ru: 'Недавние', en: 'Recent', bg: 'Наскорошни', uk: 'Нещодавні', be: 'Нядаўнія' });
define('stickers.addFavorite', { ru: 'В избранное', en: 'Add to favorites', bg: 'Добави в любими', uk: 'В обране', be: 'У абранае' });
define('stickers.removeFavorite', { ru: 'Убрать из избранного', en: 'Remove from favorites', bg: 'Махни от любими', uk: 'Прибрати з обраного', be: 'Прыбраць з абранага' });
define('stickers.managePacks', { ru: 'Мои стикеры', en: 'My stickers', bg: 'Моите стикери', uk: 'Мої стікери', be: 'Мае стікеры' });
define('stickers.close', { ru: 'Закрыть', en: 'Close', bg: 'Затвори', uk: 'Закрити', be: 'Закрыць' });
define('stickers.back', { ru: 'Назад', en: 'Back', bg: 'Назад', uk: 'Назад', be: 'Назад' });
define('stickers.sendSticker', { ru: 'Отправить стикер', en: 'Send sticker', bg: 'Изпрати стикер', uk: 'Надіслати стікер', be: 'Даслаць стікер' });
define('stickers.sendGif', { ru: 'Отправить гифку', en: 'Send GIF', bg: 'Изпрати GIF', uk: 'Надіслати GIF', be: 'Даслаць GIF' });
define('stickers.noRecent', {
  ru: 'Здесь появятся стикеры, которые вы отправляли. Выберите любой в наборе — и он запомнится.',
  en: 'Stickers you send will show up here. Pick one from any pack and it will be remembered.',
  bg: 'Тук ще се появят стикерите, които сте изпращали. Изберете такъв от комплект и той ще бъде запомнен.',
  uk: 'Тут з’являтимуться стікери, які ви надсилали. Оберіть будь-який із набору — і він запам’ятається.',
  be: 'Тут будуць з’яўляцца стікеры, якія вы дасылалі. Абярыце адзін з набору — і ён запомніцца.',
});
define('stickers.noGifs', {
  ru: 'Гифок пока нет. Загрузите фото или короткое видео — они останутся в библиотеке.',
  en: 'No GIFs yet. Upload a photo or a short video — they stay in your library.',
  bg: 'Все още няма GIF-та. Качете снимка или кратко видео — те остават в библиотеката.',
  uk: 'GIF-ків ще немає. Завантажте фото або коротке відео — вони залишаться у бібліотеці.',
  be: 'GIF-ў пакуль няма. Загрузіце фота або кароткае відэа — яны застануцца ў бібліятэцы.',
});
define('stickers.packEmpty', {
  ru: 'В наборе «{title}» пока пусто. Добавьте стикеры в разделе «Мои стикеры».',
  en: 'The “{title}” pack is empty for now. Add stickers in “My stickers”.',
  bg: 'Комплектът „{title}“ все още е празен. Добавете стикери в „Моите стикери“.',
  uk: 'Набір «{title}» поки що порожній. Додайте стікери в розділі «Мої стікери».',
  be: 'Набор «{title}» пакуль пусты. Дадайце стікеры ў раздзеле «Мае стікеры».',
});
define('stickers.packCount', {
  ru: '{count} из 200',
  en: '{count} of 200',
  bg: '{count} от 200',
  uk: '{count} з 200',
  be: '{count} з 200',
});
define('stickers.packFull', {
  ru: 'В наборе уже 200 стикеров — это предел.',
  en: 'The pack already holds 200 stickers — that is the limit.',
  bg: 'Комплектът вече съдържа 200 стикера — това е границата.',
  uk: 'У наборі вже 200 стікерів — це межа.',
  be: 'У наборы ўжо 200 стікераў — гэта мяжа.',
});
define('stickers.newPack', { ru: 'Новый набор', en: 'New pack', bg: 'Нов комплект', uk: 'Новий набір', be: 'Новы набор' });
define('stickers.create', { ru: 'Создать', en: 'Create', bg: 'Създай', uk: 'Створити', be: 'Стварыць' });
define('stickers.cancel', { ru: 'Отмена', en: 'Cancel', bg: 'Отказ', uk: 'Скасувати', be: 'Скасаваць' });
define('stickers.packTitlePlaceholder', { ru: 'Название набора', en: 'Pack name', bg: 'Име на комплекта', uk: 'Назва набору', be: 'Назва набору' });
define('stickers.packEmoji', { ru: 'Значок набора', en: 'Pack icon', bg: 'Значка на комплекта', uk: 'Значок набору', be: 'Значок набору' });
define('stickers.myPacks', { ru: 'Мои наборы', en: 'My packs', bg: 'Моите комплекти', uk: 'Мої набори', be: 'Мае наборы' });
define('stickers.noOwnPacks', {
  ru: 'Наборов пока нет. Создайте первый — и стикеры можно будет складывать в него по одному.',
  en: 'No packs yet. Create the first one — then you can add stickers to it one by one.',
  bg: 'Все още няма комплекти. Създайте първия — и стикерите може да се слагат в него един по един.',
  uk: 'Наборів ще немає. Створіть перший — і стікери можна буде додавати до нього по одному.',
  be: 'Набораў пакуль няма. Стварыце першы — і стікеры можна будзе дадаваць у яго па адным.',
});
define('stickers.addStickers', { ru: 'Добавить стикеры', en: 'Add stickers', bg: 'Добави стикери', uk: 'Додати стікери', be: 'Дадаць стікеры' });
define('stickers.removeSticker', { ru: 'Убрать стикер', en: 'Remove sticker', bg: 'Махни стикера', uk: 'Прибрати стікер', be: 'Прыбраць стікер' });
define('stickers.deletePack', { ru: 'Удалить набор', en: 'Delete pack', bg: 'Изтрий комплекта', uk: 'Видалити набір', be: 'Выдаліць набор' });
define('stickers.deletePackConfirm', {
  ru: 'Удалить набор «{title}» вместе со стикерами?',
  en: 'Delete the “{title}” pack with all its stickers?',
  bg: 'Да изтрием ли комплекта „{title}“ заедно със стикерите?',
  uk: 'Видалити набір «{title}» разом зі стікерами?',
  be: 'Выдаліць набор «{title}» разам са сцікерамі?',
});
define('stickers.gifLibrary', { ru: 'Мои гифки', en: 'My GIFs', bg: 'Моите GIF-та', uk: 'Мої GIF-ки', be: 'Мае GIF-і' });
define('stickers.addGifs', { ru: 'Загрузить фото или видео', en: 'Upload photo or video', bg: 'Качи снимка или видео', uk: 'Завантажити фото або відео', be: 'Загрузіць фота або відэа' });
define('stickers.gifHint', {
  ru: 'Загруженное отправляется много раз и без звука. Сейчас {count} из {limit}.',
  en: 'What you upload can be sent as many times as you like, without sound. Now {count} of {limit}.',
  bg: 'Каченото се изпраща много пъти и без звук. Сега {count} от {limit}.',
  uk: 'Завантажене можна надсилати скільки завгодно раз і без звуку. Зараз {count} з {limit}.',
  be: 'Загружанае можна дасылаць колькі захочаце раз і без гуку. Зараз {count} з {limit}.',
});
define('stickers.gifLimit', {
  ru: 'В библиотеке уже {limit} гифок — освободите место, чтобы добавить новые.',
  en: 'Your library already holds {limit} GIFs — free up space to add more.',
  bg: 'В библиотеката вече има {limit} GIF-та — освободете място за нови.',
  uk: 'У бібліотеці вже {limit} GIF-ків — звільніть місце для нових.',
  be: 'У бібліятэцы ўжо {limit} GIF-ў — вызвабіце месца для новых.',
});
define('stickers.packInChat', {
  ru: 'Набор «{title}»',
  en: 'Pack “{title}”',
  bg: 'Комплект „{title}“',
  uk: 'Набір «{title}»',
  be: 'Набор «{title}»',
});
define('stickers.packSharedNotice', {
  ru: 'Набор «{title}» добавлен в ваши стикеры',
  en: 'Pack “{title}” added to your stickers',
  bg: 'Комплектът „{title}“ е добавен във вашите стикери',
  uk: 'Набір «{title}» додано до ваших стікерів',
  be: 'Набор «{title}» дададзены да вашых стікераў',
});
define('stickers.sharePack', { ru: 'Прислать набор', en: 'Share pack', bg: 'Изпрати комплекта', uk: 'Надіслати набір', be: 'Даслаць набор' });
define('stickers.removePack', { ru: 'Убрать набор', en: 'Remove pack', bg: 'Махни комплекта', uk: 'Прибрати набір', be: 'Прыбраць набор' });
define('stickers.saveSticker', {
  ru: 'Сохранить в мои стикеры',
  en: 'Save to my stickers',
  bg: 'Запази в моите стикери',
  uk: 'Зберегти в мої стікери',
  be: 'Захаваць у мае стікеры',
});
define('stickers.packTitleLabel', {
  ru: 'Набор стикеров',
  en: 'Sticker pack',
  bg: 'Комплект стикери',
  uk: 'Набір стікерів',
  be: 'Набор стікераў',
});
define('stickers.packRemoved', {
  ru: 'Набор «{title}» убран из ваших стикеров',
  en: 'Pack “{title}” removed from your stickers',
  bg: 'Комплектът „{title}“ е махнат от вашите стикери',
  uk: 'Набір «{title}» прибрано з ваших стікерів',
  be: 'Набор «{title}» прыбраны з вашых стікераў',
});
define('stickers.packActionFailed', {
  ru: 'Не удалось изменить набор',
  en: 'Could not change the pack',
  bg: 'Комплектът не се промени',
  uk: 'Не вдалося змінити набір',
  be: 'Не ўдалося змяніць набор',
});
define('stickers.stickerSaved', {
  ru: 'Стикер сохранён в набор «{title}»',
  en: 'Sticker saved to “{title}”',
  bg: 'Стикерът е запазен в „{title}“',
  uk: 'Стікер збережено в набір «{title}»',
  be: 'Сцікер захаваны ў набор «{title}»',
});
define('stickers.stickerSaveFailed', {
  ru: 'Не удалось сохранить стикер',
  en: 'Could not save the sticker',
  bg: 'Стикерът не се запази',
  uk: 'Не вдалося зберегти стікер',
  be: 'Не ўдалося захаваць стікер',
});
define('stickers.needOwnPackFirst', {
  ru: 'Сначала создайте свой набор',
  en: 'Create your own pack first',
  bg: 'Първо си направете свой комплект',
  uk: 'Спершу створіть свій набір',
  be: 'Спачатку стварыце свой набор',
});
define('stickers.stickerButton', {
  ru: 'Стикеры',
  en: 'Stickers',
  bg: 'Стикери',
  uk: 'Стікери',
  be: 'Сцікеры',
});
define('stickers.sharePickChat', {
  ru: 'Кому прислать набор',
  en: 'Send the pack to',
  bg: 'На кого да изпратиш комплекта',
  uk: 'Кому надіслати набір',
  be: 'Каму даслаць набор',
});
define('stickers.shareNeedsChat', {
  ru: 'Сначала начните хотя бы один чат',
  en: 'Start at least one chat first',
  bg: 'Първо започнете поне един чат',
  uk: 'Спершу почніть хоча б один чат',
  be: 'Спачатку пачніце хоць адзін чат',
});
define('stickers.packLimitHint', {
  ru: 'В наборе не больше 200 стикеров.',
  en: 'A pack holds at most 200 stickers.',
  bg: 'В комплекта има най-много 200 стикера.',
  uk: 'У наборі не більше 200 стікерів.',
  be: 'У наборы не больш за 200 стікераў.',
});
define('extras.pinnedMessages', {
  ru: 'Закреплённые сообщения · {index} из {total}',
  en: 'Pinned messages · {index} of {total}',
  bg: 'Закачени съобщения · {index} от {total}',
  uk: 'Закріплені Повідомлення · {index} з {total}',
  be: 'Замацаваныя Паведамленне · {index} з {total}',
});
define('extras.attachment', { ru: 'Вложение', en: 'Attachment', bg: 'Прикачен файл', uk: 'Вкладення', be: 'Укладанне' 
});
define('extras.nextPinned', { ru: 'Следующее закреплённое сообщение', en: 'Next pinned message', bg: 'Следващо закачено съобщение', uk: 'Наступне закріплене Повідомлення', be: 'Наступнае замацаванае Паведамленне' 
});
define('extras.unpin', { ru: 'Открепить сообщение', en: 'Unpin message', bg: 'Откачи съобщение', uk: 'Відкріпити Повідомлення', be: 'Адмацаваць Паведамленне' 
});
define('extras.undockEmoji', { ru: 'Открепить панель', en: 'Undock panel', bg: 'Откачи панела', uk: 'Відкріпити панель', be: 'Адмацаваць панэль' 
});
define('extras.dockEmoji', { ru: 'Закрепить панель справа', en: 'Dock panel to the right', bg: 'Закачи панела вдясно', uk: 'Закріпити панель праворуч', be: 'Замацаваць панэль справа' 
});
define('extras.unpinConfirmTitle', { ru: 'Открепить сообщение?', en: 'Unpin message?', bg: 'Откачане на съобщение?', uk: 'Відкріпити повідомлення?', be: 'Адмацаваць паведамленне?' 
});
define('extras.unpinConfirmHint', { ru: 'Вы уверены, что хотите открепить это сообщение для всех участников?', en: 'Are you sure you want to unpin this message for all participants?', bg: 'Сигурни ли сте, че искате да откачите това съобщение за всички?', uk: 'Ви впевнені, що хочете відкріпити це повідомлення для всіх учасників?', be: 'Ці ўпэўненыя вы, што хочаце адмацаваць гэта паведамленне для ўсіх удзельнікаў?' 
});
define('msgr.readAt', { ru: 'Прочитано', en: 'Read', bg: 'Прочетено', uk: 'Прочитано', be: 'Прачытана' 
});
define('extras.systemEvent', { ru: 'Системное событие', en: 'System event', bg: 'Системно събитие', uk: 'Системна подія', be: 'Сістэмная падзея' 
});
define('extras.youCalled', { ru: 'Вы позвонили', en: 'You called', bg: 'Вие се обадихте', uk: 'Ви зателефонували', be: 'Вы пазванілі' 
});
define('extras.incomingAudioDone', { ru: 'Входящий аудиозвонок завершён', en: 'Incoming audio call ended', bg: 'Входящо аудио обаждане приключи', uk: 'Вхідний аудіодзвінок Завершено', be: 'Уваходны аўдыязванок Завершана' 
});
define('extras.incomingVideoDone', { ru: 'Входящий видеозвонок завершён', en: 'Incoming video call ended', bg: 'Входящо видео обаждане приключи', uk: 'Вхідний відеоздзвінок Завершено', be: 'Уваходны відэазванок Завершана' 
});
define('extras.callDeclined', { ru: 'Звонок отклонён', en: 'Call declined', bg: 'Обаждането е отказано', uk: 'Дзвінок відхилено', be: 'Званок адхілены' 
});
define('extras.youDeclined', { ru: 'Вы отклонили звонок', en: 'You declined the call', bg: 'Вие отказахте обаждането', uk: 'Ви відхилили дзвінок', be: 'Вы адхілілі званок' 
});
define('extras.youTriedToCall', { ru: 'Вы пытались позвонить', en: 'You tried to call', bg: 'Опитахте се да се обадите', uk: 'Ви намагалися позвонить', be: 'Вы спрабавалі позвонить' 
});
define('extras.missedCall', { ru: 'Пропущенный звонок', en: 'Missed call', bg: 'Пропуснато обаждане', uk: 'Пропущений дзвінок', be: 'Прапушчаны званок' 
});
define('extras.unanswered', { ru: 'Не отвечено', en: 'No answer', bg: 'Без отговор', uk: 'Не відповіді', be: 'Не адказана' 
});
define('extras.duration', { ru: 'Длительность: {value}', en: 'Duration: {value}', bg: 'Продължителност: {value}', uk: 'Тривалість: {value}', be: 'Працягласць: {value}' 
});

// ---- Вложения и просмотр медиа ----
define('attach.selectedFiles', { ru: 'Выбранные файлы', en: 'Selected files', bg: 'Избрани файлове', uk: 'Вибрані Файли', be: 'Выбраныя Файлы' 
});
define('attach.retryUpload', { ru: 'Повторить загрузку {name}', en: 'Retry upload of {name}', bg: 'Опитай качването на {name} пак', uk: 'Повторити завантаженну {name}', be: 'Паўтарыць загрузку {name}' 
});
define('attach.removeFile', { ru: 'Убрать {name}', en: 'Remove {name}', bg: 'Премахни {name}', uk: 'Прибрати {name}', be: 'Прыбраць {name}' 
});
define('attach.playFailed', {
  ru: 'Не удалось воспроизвести. Попробуйте ещё раз.',
  en: 'Playback failed. Please try again.',
  bg: 'Възпроизвеждането не успя. Опитайте отново.',
  uk: 'Не вдалося відтворити. Спробуйте ще раз.',
  be: 'Не ўдалося прайграць. Паспрабуйце яшчэ раз.',
});
define('attach.photoViewer', { ru: 'Просмотр фотографии', en: 'Photo viewer', bg: 'Преглед на снимка', uk: 'Перегляд Фотографії', be: 'Прагляд Фотаздымкі' 
});
define('attach.uploading', { ru: 'Загрузка {percent}%', en: 'Uploading {percent}%', bg: 'Качване {percent}%', uk: 'Завантаження {percent}%', be: 'Загрузка {percent}%' 
});
define('attach.uploadError', { ru: 'Ошибка загрузки', en: 'Upload failed', bg: 'Неуспешно качване', uk: 'Помилка завантаженни', be: 'Памылка загрузки' 
});
define('attach.openFile', { ru: 'Открыть {name}', en: 'Open {name}', bg: 'Отвори {name}', uk: 'Відкрити {name}', be: 'Адкрыць {name}' 
});
define('attach.downloadFile', { ru: 'Скачать {name}', en: 'Download {name}', bg: 'Свали {name}', uk: 'Завантажити {name}', be: 'Загрузіць {name}' 
});
define('attach.videoMessage', { ru: 'Видеосообщение: {name}', en: 'Video message: {name}', bg: 'Видео съобщение: {name}', uk: 'Видеосообщение: {name}', be: 'Видеосообщение: {name}' 
});
define('attach.playVideoCircle', { ru: 'Воспроизвести видеокружок', en: 'Play video circle', bg: 'Пусни видеокръгчето', uk: 'Відтворити Відеокружечок', be: 'Прайграць Відэакружок' 
});
define('attach.pauseVideoCircle', { ru: 'Остановить видеокружок', en: 'Pause video circle', bg: 'Спри видеокръгчето', uk: 'Зупинити Відеокружечок', be: 'Спыніць Відэакружок' 
});
define('attach.playVoice', { ru: 'Слушать голосовое сообщение', en: 'Play voice message', bg: 'Пусни гласовото съобщение', uk: 'Слухати голосове Повідомлення', be: 'Слухаць голосовое Паведамленне' 
});
define('attach.pauseVoice', { ru: 'Остановить голосовое сообщение', en: 'Pause voice message', bg: 'Спри гласовото съобщение', uk: 'Зупинити голосове Повідомлення', be: 'Спыніць голосовое Паведамленне' 
});
define('attach.seekVoice', { ru: 'Перемотка голосового сообщения', en: 'Seek voice message', bg: 'Превъртане на гласовото съобщение', uk: 'Перемотка голосового Повідомлення', be: 'Перемотка голосового Паведамленне' 
});
define('attach.playbackSpeed', {
  ru: 'Скорость {speed}',
  en: 'Speed {speed}',
  bg: 'Скорост {speed}',
  uk: 'Швидкість {speed}',
  be: 'Хуткасць {speed}',
});
define('attach.downloadPhoto', { ru: 'Скачать фотографию', en: 'Download photo', bg: 'Свали снимката', uk: 'Завантажити фотографию', be: 'Загрузіць фотографию' 
});
define('attach.previousPhoto', { ru: 'Предыдущее фото', en: 'Previous photo', bg: 'Предишна снимка', uk: 'Попереднє фото', be: 'Папярэдняе фото' 
});
define('attach.nextPhoto', { ru: 'Следующее фото', en: 'Next photo', bg: 'Следваща снимка', uk: 'Наступне фото', be: 'Наступнае фото' 
});
define('attach.zoomOut', { ru: 'Уменьшить', en: 'Zoom out', bg: 'Намали', uk: 'Зменшити', be: 'Паменшыць' 
});
define('attach.zoomIn', { ru: 'Увеличить', en: 'Zoom in', bg: 'Увеличи', uk: 'Збільшити', be: 'Павялічыць' 
});
define('attach.photoCounter', {
  ru: '{index} из {total}',
  en: '{index} of {total}',
  bg: '{index} от {total}',
  uk: '{index} з {total}',
  be: '{index} з {total}',
});

// ---- Переписка (основной экран) ----
define('msgr.loadDialogsFailed', { ru: 'Не удалось загрузить диалоги.', en: 'Could not load chats.', bg: 'Разговорите не можаха да се заредят.', uk: 'Не вдалося Завантажити диалоги.', be: 'Не ўдалося Загрузіць диалоги.' 
});
define('msgr.newMessage', { ru: 'Новое сообщение в Yargram', en: 'New message in Yargram', bg: 'Ново съобщение в Yargram', uk: 'Нове Повідомлення у Yargram', be: 'Новае Паведамленне у Yargram' 
});
define('msgr.loadMessagesFailed', { ru: 'Не удалось загрузить сообщения.', en: 'Could not load messages.', bg: 'Съобщенията не можаха да се заредят.', uk: 'Не вдалося Завантажити Повідомлення.', be: 'Не ўдалося Загрузіць Паведамленне.' 
});
define('msgr.searchFailed', { ru: 'Не удалось выполнить поиск.', en: 'Search failed.', bg: 'Търсенето не успя.', uk: 'Не вдалося виконати Пошук.', be: 'Не ўдалося выканаць Пошук.' 
});
define('msgr.openFavoritesFailed', { ru: 'Не удалось открыть Избранное.', en: 'Could not open Saved messages.', bg: 'Запазените не можаха да се отворят.', uk: 'Не вдалося Відкрити Обране.', be: 'Не ўдалося Адкрыць Выбранае.' 
});
define('msgr.joinedGroup', { ru: 'Вы вступили в группу «{title}».', en: 'You joined the group “{title}”.', bg: 'Присъединихте се към групата „{title}“.', uk: 'Ви вступили у групу «{title}».', be: 'Вы уступілі у групу «{title}».' 
});
define('msgr.inviteInvalid', { ru: 'Ссылка-приглашение недействительна.', en: 'The invite link is invalid.', bg: 'Връзката покана е невалидна.', uk: 'Посилання-запрошення недействительна.', be: 'Спасылка-Запрашэнне недействительна.' 
});
define('msgr.openDialogFailed', { ru: 'Не удалось открыть диалог.', en: 'Could not open the chat.', bg: 'Разговорът не можа да се отвори.', uk: 'Не вдалося Відкрити диалог.', be: 'Не ўдалося Адкрыць диалог.' 
});
define('msgr.openSupportFailed', { ru: 'Не удалось открыть поддержку.', en: 'Could not open support.', bg: 'Поддръжката не можа да се отвори.', uk: 'Не вдалося відкрити підтримку.', be: 'Не ўдалося адкрыць падтрымку.' 
});
define('msgr.supportActionFailed', { ru: 'Не удалось выполнить действие.', en: 'Could not perform the action.', bg: 'Действието не можа да се изпълни.', uk: 'Не вдалося виконати дію.', be: 'Не ўдалося выканаць дзеянне.' 
});
// Кнопка под пустой перепиской с ботом: пока её не нажать, бот молчит.
// Слово пишется заглавными буквами средствами вёрстки, а не в переводе.
define('msgr.botStart', { ru: 'Старт', en: 'Start', bg: 'Старт', uk: 'Старт', be: 'Старт' 
});
define('msgr.leftGroup', { ru: 'Вы вышли из группы.', en: 'You left the group.', bg: 'Напуснахте групата.', uk: 'Ви вийшли з Групи.', be: 'Вы выйшлі з Групы.' 
});
define('msgr.uploadFailed', { ru: 'Не удалось загрузить файл.', en: 'File upload failed.', bg: 'Файлът не можа да се качи.', uk: 'Не вдалося Завантажити Файл.', be: 'Не ўдалося Загрузіць Файл.' 
});
define('msgr.tooManyFiles', { ru: 'К одному сообщению можно прикрепить не более 10 файлов.', en: 'You can attach at most 10 files to one message.', bg: 'Към едно съобщение можете да прикачите най-много 10 файла.', uk: 'До одному повідомлення можна Прикріпити не більше 10 файлов.', be: 'Да одному Паведамленне можна Прымацаваць не больш 10 файлов.' 
});
define('msgr.extraFilesSkipped', { ru: 'Лишние файлы не добавлены: максимум 10 вложений.', en: 'Extra files were skipped: 10 attachments max.', bg: 'Излишните файлове бяха пропуснати: максимум 10 прикачени.', uk: 'Зайві Файли не додані: максимум 10 вкладень.', be: 'Лішнія Файлы не добавлены: максімум 10 укладанняў.' 
});
define('msgr.editMessageFailed', { ru: 'Не удалось изменить сообщение.', en: 'Could not edit the message.', bg: 'Съобщението не можа да се редактира.', uk: 'Не вдалося Змінити Повідомлення.', be: 'Не ўдалося Змяніць Паведамленне.' 
});
define('msgr.waitUpload', { ru: 'Дождитесь окончания загрузки файлов.', en: 'Wait for the files to finish uploading.', bg: 'Изчакайте качването на файловете да приключи.', uk: 'Дочекайтеся завершення завантаженни файлов.', be: 'Дачакайцеся заканчэння загрузки файлов.' 
});
define('msgr.retryOrRemoveFiles', { ru: 'Повторите загрузку неудачных файлов или удалите их.', en: 'Retry the failed uploads or remove them.', bg: 'Опитайте качването на неуспешните файлове пак или ги премахнете.', uk: 'Повторіть завантаженну невдалих файлов або удалите їх.', be: 'Паўтарыце загрузку неудачных файлов або удалите іх.' 
});
define('msgr.messageNotSent', { ru: 'Сообщение не отправлено.', en: 'The message was not sent.', bg: 'Съобщението не е изпратено.', uk: 'Повідомлення не Надіслано.', be: 'Паведамленне не Адпраўлена.' 
});
define('msgr.resendFailed', { ru: 'Повторная отправка не удалась.', en: 'Resending failed.', bg: 'Повторното изпращане не успя.', uk: 'Повторна Надсилання не удалась.', be: 'Паўторная Адпраўка не удалась.' 
});
define('msgr.pinChangeFailed', { ru: 'Не удалось изменить закреплённое сообщение.', en: 'Could not change the pinned message.', bg: 'Закаченото съобщение не можа да се промени.', uk: 'Не вдалося Змінити закріплене Повідомлення.', be: 'Не ўдалося Змяніць замацаванае Паведамленне.' 
});
define('msgr.pollCreateFailed', { ru: 'Не удалось создать опрос.', en: 'Could not create the poll.', bg: 'Анкетата не можа да се създаде.', uk: 'Не вдалося Створити Опитування.', be: 'Не ўдалося Стварыць Апытанне.' 
});
define('msgr.reactionFailed', { ru: 'Не удалось изменить реакцию.', en: 'Could not change the reaction.', bg: 'Реакцията не можа да се промени.', uk: 'Не вдалося Змінити реакцію.', be: 'Не ўдалося Змяніць рэакцыю.' 
});
define('msgr.removedFromFavorites', { ru: 'Удалено из Избранного.', en: 'Removed from Saved messages.', bg: 'Премахнато от Запазени.', uk: 'Видалено з Избранного.', be: 'Выдалена з Избранного.' 
});
define('msgr.addedToFavorites', { ru: 'Добавлено в Избранное.', en: 'Added to Saved messages.', bg: 'Добавено в Запазени.', uk: 'Добавлено у Обране.', be: 'Добавлено у Выбранае.' 
});
define('msgr.favoriteFailed', { ru: 'Не удалось изменить Избранное.', en: 'Could not update Saved messages.', bg: 'Запазените не можаха да се обновят.', uk: 'Не вдалося Змінити Обране.', be: 'Не ўдалося Змяніць Выбранае.' 
});
define('msgr.noTextToCopy', { ru: 'В этом сообщении нет текста для копирования.', en: 'This message has no text to copy.', bg: 'Това съобщение няма текст за копиране.', uk: 'У цьому повідомленни Ні текста для копирования.', be: 'У гэтым паведамленни Не текста для копирования.' 
});
define('msgr.textCopied', { ru: 'Текст скопирован.', en: 'Text copied.', bg: 'Текстът е копиран.', uk: 'Текст скопирован.', be: 'Тэкст скопирован.' 
});
define('msgr.copyFailed', { ru: 'Не удалось скопировать текст.', en: 'Could not copy the text.', bg: 'Текстът не можа да се копира.', uk: 'Не вдалося скопировать текст.', be: 'Не ўдалося скопировать тэкст.' 
});
define('msgr.folderCreated', { ru: 'Папка «{name}» создана.', en: 'Folder “{name}” created.', bg: 'Папката „{name}“ е създадена.', uk: 'Папка «{name}» Створено.', be: 'Папка «{name}» Створана.' 
});
define('msgr.folderCreateFailed', { ru: 'Не удалось создать папку.', en: 'Could not create the folder.', bg: 'Папката не можа да се създаде.', uk: 'Не вдалося Створити Папку.', be: 'Не ўдалося Стварыць Папку.' 
});
define('msgr.dialogRemovedFromFolder', { ru: 'Диалог убран из папки «{name}».', en: 'Chat removed from the folder “{name}”.', bg: 'Разговорът е премахнат от папката „{name}“.', uk: 'Диалог убран з Папки «{name}».', be: 'Диалог убран з Папкі «{name}».' 
});
define('msgr.dialogAddedToFolder', { ru: 'Диалог добавлен в папку «{name}».', en: 'Chat added to the folder “{name}”.', bg: 'Разговорът е добавен в папката „{name}“.', uk: 'Диалог Додано у Папку «{name}».', be: 'Диалог Дададзена у Папку «{name}».' 
});
define('msgr.folderUpdateFailed', { ru: 'Не удалось обновить папку.', en: 'Could not update the folder.', bg: 'Папката не можа да се обнови.', uk: 'Не вдалося Оновити Папку.', be: 'Не ўдалося Абнавіць Папку.' 
});
define('msgr.folderRenamed', { ru: 'Папка переименована в «{name}».', en: 'Folder renamed to “{name}”.', bg: 'Папката е преименувана на „{name}“.', uk: 'Папка переименована у «{name}».', be: 'Папка переименована у «{name}».' 
});
define('msgr.folderRenameFailed', { ru: 'Не удалось переименовать папку.', en: 'Could not rename the folder.', bg: 'Папката не можа да се преименува.', uk: 'Не вдалося перейменувати Папку.', be: 'Не ўдалося перайменаваць Папку.' 
});
define('msgr.folderDeleted', { ru: 'Папка «{name}» удалена.', en: 'Folder “{name}” deleted.', bg: 'Папката „{name}“ е изтрита.', uk: 'Папка «{name}» удалена.', be: 'Папка «{name}» удалена.' 
});
define('msgr.folderDeleteFailed', { ru: 'Не удалось удалить папку.', en: 'Could not delete the folder.', bg: 'Папката не можа да се изтрие.', uk: 'Не вдалося Видалити Папку.', be: 'Не ўдалося Выдаліць Папку.' 
});
define('msgr.onlyNewCanSchedule', { ru: 'Отложить можно только новое сообщение.', en: 'Only a new message can be scheduled.', bg: 'Само ново съобщение може да се планира.', uk: 'Відкласти можна тільки Нове Повідомлення.', be: 'Адкласці можна толькі Новае Паведамленне.' 
});
define('msgr.writeToSchedule', { ru: 'Напишите сообщение, которое нужно отложить.', en: 'Write the message you want to schedule.', bg: 'Напишете съобщението, което искате да планирате.', uk: 'Напишіть Повідомлення, которе потрібно відкласти.', be: 'Напішыце Паведамленне, которое трэба адкласці.' 
});
define('msgr.scheduledFor', { ru: 'Сообщение отправится {time}.', en: 'The message will be sent {time}.', bg: 'Съобщението ще се изпрати {time}.', uk: 'Повідомлення отправится {time}.', be: 'Паведамленне отправится {time}.' 
});
define('msgr.scheduleFailed', { ru: 'Не удалось запланировать сообщение.', en: 'Could not schedule the message.', bg: 'Съобщението не можа да се планира.', uk: 'Не вдалося запланувати Повідомлення.', be: 'Не ўдалося запланаваць Паведамленне.' 
});
define('msgr.scheduledCancelled', { ru: 'Отложенное сообщение отменено.', en: 'The scheduled message was cancelled.', bg: 'Планираното съобщение е отменено.', uk: 'Відкладене Повідомлення скасовано.', be: 'Адкладзенае Паведамленне скасавана.' 
});
define('msgr.scheduleCancelFailed', { ru: 'Не удалось отменить сообщение.', en: 'Could not cancel the message.', bg: 'Съобщението не можа да се отмени.', uk: 'Не вдалося Скасувати Повідомлення.', be: 'Не ўдалося Скасаваць Паведамленне.' 
});
define('msgr.dialogSettingsFailed', { ru: 'Не удалось изменить настройки диалога.', en: 'Could not change the chat settings.', bg: 'Настройките на разговора не можаха да се променят.', uk: 'Не вдалося Змінити Налаштування диалога.', be: 'Не ўдалося Змяніць Налады диалога.' 
});
define('msgr.notificationsOffForever', { ru: 'Уведомления отключены навсегда.', en: 'Notifications are off forever.', bg: 'Известията са изключени завинаги.', uk: 'Сповіщення Вимкнено Назавжди.', be: 'Апавяшчэнні Выключана Назаўжды.' 
});
define('msgr.notificationsOffTemp', { ru: 'Уведомления временно отключены.', en: 'Notifications are temporarily off.', bg: 'Известията са временно изключени.', uk: 'Сповіщення временно Вимкнено.', be: 'Апавяшчэнні временно Выключана.' 
});
define('msgr.notificationsOn', { ru: 'Уведомления включены.', en: 'Notifications are on.', bg: 'Известията са включени.', uk: 'Сповіщення Увімкнено.', be: 'Апавяшчэнні Уключана.' 
});
define('msgr.confirmDeleteMessage', { ru: 'Удалить это сообщение у обоих участников?', en: 'Delete this message for both participants?', bg: 'Да се изтрие ли това съобщение и за двамата участници?', uk: 'Видалити це Повідомлення у обоих Учасників?', be: 'Выдаліць гэта Паведамленне у обоих Удзельнікаў?' 
});
define('msgr.deleteMessageFailed', { ru: 'Не удалось удалить сообщение.', en: 'Could not delete the message.', bg: 'Съобщението не можа да се изтрие.', uk: 'Не вдалося Видалити Повідомлення.', be: 'Не ўдалося Выдаліць Паведамленне.' 
});
define('msgr.voiceHttpsOnly', {
  ru: 'Запись голоса доступна по HTTPS-адресу (порт 3443) в современном браузере.',
  en: 'Voice recording is available over HTTPS (port 3443) in a modern browser.',
  bg: 'Записът на глас е достъпен по HTTPS адрес (порт 3443) в съвременен браузър.',
  uk: 'Запис голосу доступна по HTTPS-адресу (порт 3443) у сучасному браузері.',
  be: 'Запіс голасу даступна па HTTPS-адресу (порт 3443) у сучасным браўзеры.',
});
define('msgr.recordSizeLimit', { ru: 'Запись остановлена: достигнут предел размера файла.', en: 'Recording stopped: file size limit reached.', bg: 'Записът е спрян: достигнат е лимитът за размер на файла.', uk: 'Запис зупинено: досягнуто межа розміру Файлу.', be: 'Запіс спынена: дасягнутая мяжа размеру Файла.' 
});
define('msgr.recordStartFailed', { ru: 'Не удалось начать запись. Проверьте доступ к микрофону и камере.', en: 'Could not start recording. Check access to the microphone and camera.', bg: 'Записът не можа да започне. Проверете достъпа до микрофона и камерата.', uk: 'Не вдалося Почати запис. Перевірте Доступ до микрофону і камере.', be: 'Не ўдалося Пачаць запіс. Праверце Доступ да микрофону і камере.' 
});
define('msgr.recordTooBig', { ru: 'Запись превышает 100 МБ. Попробуйте более короткую запись.', en: 'The recording exceeds 100 MB. Try a shorter one.', bg: 'Записът надвишава 100 МБ. Опитайте с по-кратък запис.', uk: 'Запис перевищує 100 МБ. Спробуйте більше короткий запис.', be: 'Запіс перавышае 100 МБ. Паспрабуйце больш кароткі запіс.' 
});
define('msgr.recordTooShort', { ru: 'Запись слишком короткая — повторите.', en: 'The recording is too short — try again.', bg: 'Записът е твърде кратък — опитайте пак.', uk: 'Запис занадто короткий — повторіть.', be: 'Запіс занадта кароткі — паўтарыце.' 
});
define('msgr.recordingCancelled', { ru: 'Запись отменена: вы перешли в другой чат. Запишите заново.', en: 'Recording cancelled: you switched to another chat. Record again.', bg: 'Записът е отменен: преминахте в друг чат. Запишете отново.', uk: 'Запис отменена: ви перейшли у інший Чат. Запишіть заново.', be: 'Запіс отменена: вы перайшлі у іншы Чат. Запішыце заново.' 
});
define('msgr.videoCircleName', { ru: 'Видеокружок', en: 'Video circle', bg: 'Видеокръгче', uk: 'Відеокружечок', be: 'Відэакружок' 
});
define('msgr.voiceMessageName', { ru: 'Голосовое сообщение', en: 'Voice message', bg: 'Гласово съобщение', uk: 'Голосове Повідомлення', be: 'Голосовое Паведамленне' 
});
define('msgr.voiceNotSent', { ru: 'Голосовое сообщение не отправлено.', en: 'The voice message was not sent.', bg: 'Гласовото съобщение не е изпратено.', uk: 'Голосове Повідомлення не Надіслано.', be: 'Голосовое Паведамленне не Адпраўлена.' 
});
define('msgr.dropToAttach', { ru: 'Отпустите, чтобы прикрепить', en: 'Drop to attach', bg: 'Пуснете, за да прикачите', uk: 'Відпустіть, щоб Прикріпити', be: 'Адпусціце, каб Прымацаваць' 
});
define('msgr.dropHint', { ru: 'Файлы добавятся к сообщению', en: 'Files will be added to the message', bg: 'Файловете ще се добавят към съобщението', uk: 'Файли добавятся до повідомлення', be: 'Файлы добавятся да Паведамленне' 
});
define('msgr.dialogListAria', { ru: 'Список диалогов', en: 'Chat list', bg: 'Списък с разговори', uk: 'Список діалогів', be: 'Спіс дыялогаў' 
});
define('msgr.searchDialogs', { ru: 'Поиск по диалогам', en: 'Search chats', bg: 'Търсене в разговори', uk: 'Пошук по диалогам', be: 'Пошук па диалогам' 
});
define('msgr.clearSearch', { ru: 'Очистить поиск', en: 'Clear search', bg: 'Изчисти търсенето', uk: 'Очистити Пошук', be: 'Ачысціць Пошук' 
});
define('msgr.newDialog', { ru: 'Новый диалог', en: 'New chat', bg: 'Нов разговор', uk: 'Новий диалог', be: 'Новы диалог' 
});
define('msgr.createFolder', { ru: 'Создать папку', en: 'Create folder', bg: 'Създай папка', uk: 'Створити Папку', be: 'Стварыць Папку' 
});
define('msgr.folderNamePlaceholder', { ru: 'Название папки', en: 'Folder name', bg: 'Име на папката', uk: 'Назва Папки', be: 'Назва Папкі' 
});
define('msgr.saveFolder', { ru: 'Сохранить папку', en: 'Save folder', bg: 'Запази папката', uk: 'Зберегти Папку', be: 'Захаваць Папку' 
});
define('msgr.startConversation', { ru: 'Начните разговор', en: 'Start a conversation', bg: 'Започнете разговор', uk: 'Почніть розмову', be: 'Пачніце размову' 
});
define('msgr.startConversationHint', { ru: 'Найдите участника Yargram и отправьте первое сообщение.', en: 'Find a Yargram member and send the first message.', bg: 'Намерете участник в Yargram и изпратете първото съобщение.', uk: 'Знайдіть учасника Yargram і надішліть Перше Повідомлення.', be: 'Знайдзіце удзельніка Yargram і адпраўце Першае Паведамленне.' 
});
define('msgr.archiveEmpty', { ru: 'Архив пуст', en: 'The archive is empty', bg: 'Архивът е празен', uk: 'Архів пуст', be: 'Архіў пуст' 
});
define('msgr.nothingFound', { ru: 'Ничего не найдено', en: 'Nothing found', bg: 'Нищо не е намерено', uk: 'Нічого не знайдено', be: 'Нічого не знойдзена' 
});
define('msgr.archiveEmptyHint', { ru: 'Архивированные диалоги появятся здесь.', en: 'Archived chats will appear here.', bg: 'Архивираните разговори ще се появят тук.', uk: 'Архівовані диалоги з’являться тут.', be: 'Архіваваныя диалоги з’явяцца тут.' 
});
define('msgr.changeQueryHint', { ru: 'Попробуйте изменить запрос.', en: 'Try changing your query.', bg: 'Опитайте да промените заявката.', uk: 'Спробуйте Змінити запит.', be: 'Паспрабуйце Змяніць запыт.' 
});
define('msgr.unreadCount', { ru: '{count} непрочитанных', en: '{count} unread', bg: '{count} непрочетени', uk: '{count} Непрочитаних', be: '{count} Непрачытаных' 
});
define('msgr.connected', { ru: 'На связи', en: 'Connected', bg: 'Свързан', uk: 'На зв’язку', be: 'На сувязі' 
});
define('msgr.connecting', { ru: 'Подключение…', en: 'Connecting…', bg: 'Свързване…', uk: 'Підключення…', be: 'Падключэнне…' 
});
define('msgr.noRealtime', { ru: 'Нет realtime-связи', en: 'No realtime connection', bg: 'Няма връзка в реално време', uk: 'Ні realtime-зв’язку', be: 'Не realtime-сувязі' 
});
define('msgr.correspondence', { ru: 'Переписка', en: 'Chat', bg: 'Разговор', uk: 'Листування', be: 'Перапіска' 
});
define('msgr.yourMessages', { ru: 'Ваши сообщения', en: 'Your messages', bg: 'Вашите съобщения', uk: 'Ваші Повідомлення', be: 'Вашы Паведамленне' 
});
define('msgr.chooseDialogHint', { ru: 'Выберите диалог слева или найдите человека, которому хотите написать.', en: 'Pick a chat on the left or find someone to write to.', bg: 'Изберете разговор вляво или намерете човек, на когото да пишете.', uk: 'Виберіть диалог ліворуч або знайдіть человека, которому хочете написать.', be: 'Выберыце диалог злева або знайдзіце человека, которому хочаце написать.' 
});
define('msgr.backToDialogs', { ru: 'Назад к диалогам', en: 'Back to chats', bg: 'Обратно към разговорите', uk: 'Назад до диалогам', be: 'Назад да диалогам' 
});
define('msgr.groupInfo', { ru: 'Информация о группе', en: 'Group info', bg: 'Информация за групата', uk: 'Інформація про Групі', be: 'Інфармацыя пра Групе' 
});
define('msgr.openPeerProfile', { ru: 'Открыть профиль собеседника', en: 'Open the peer’s profile', bg: 'Отвори профила на събеседника', uk: 'Відкрити Профіль співрозмовника', be: 'Адкрыць Профіль суразмоўцы' 
});
define('msgr.yourSpace', { ru: 'Ваше личное пространство', en: 'Your personal space', bg: 'Вашето лично пространство', uk: 'Ваше особисте простір', be: 'Ваша асабістая прастора' 
});
define('msgr.typing', { ru: 'Печатает…', en: 'Typing…', bg: 'Пише…', uk: 'Друкує…', be: 'Друкуе…' 
});
define('msgr.selfNotes', { ru: 'Сообщения и файлы для себя', en: 'Messages and files for yourself', bg: 'Съобщения и файлове за себе си', uk: 'Повідомлення і Файли для собі', be: 'Паведамленне і Файлы для сябе' 
});
define('msgr.privateDialog', { ru: 'Личный диалог', en: 'Private chat', bg: 'Личен разговор', uk: 'Особистий диалог', be: 'Личный диалог' 
});
define('msgr.searchInChat', { ru: 'Поиск в чате', en: 'Search in chat', bg: 'Търсене в чата', uk: 'Пошук у чате', be: 'Пошук у чате' 
});
define('msgr.audioCall', { ru: 'Аудиозвонок', en: 'Audio call', bg: 'Аудио обаждане', uk: 'Аудіодзвінок', be: 'Аўдыязванок' 
});
define('msgr.videoCall', { ru: 'Видеозвонок', en: 'Video call', bg: 'Видео обаждане', uk: 'Відеоздзвінок', be: 'Відэазванок' 
});
define('msgr.dialogSettings', { ru: 'Настройки диалога', en: 'Chat settings', bg: 'Настройки на разговора', uk: 'Налаштування диалога', be: 'Налады диалога' 
});
define('msgr.returnFromArchive', { ru: 'Вернуть из архива', en: 'Unarchive', bg: 'Върни от архива', uk: 'Повернути з архіву', be: 'Вярнуць з архіва' 
});
define('msgr.archive', { ru: 'Архивировать', en: 'Archive', bg: 'Архивирай', uk: 'Архівувати', be: 'Архіваваць' 
});
define('msgr.dialogReturnedFromArchive', { ru: 'Диалог возвращён из архива.', en: 'Chat unarchived.', bg: 'Разговорът е върнат от архива.', uk: 'Диалог возвращён з архіву.', be: 'Диалог возвращён з архіва.' 
});
define('msgr.dialogArchived', { ru: 'Диалог перемещён в архив.', en: 'Chat archived.', bg: 'Разговорът е архивиран.', uk: 'Диалог переміщено у Архів.', be: 'Диалог перамешчаны у Архіў.' 
});
define('msgr.disableNotifications', { ru: 'Отключить уведомления', en: 'Turn off notifications', bg: 'Изключи известията', uk: 'Вимкнути Сповіщення', be: 'Адключыць Апавяшчэнні' 
});
define('msgr.mute1Hour', { ru: 'На 1 час', en: 'For 1 hour', bg: 'За 1 час', uk: 'На 1 Година', be: 'На 1 Час' 
});
define('msgr.mute8Hours', { ru: 'На 8 часов', en: 'For 8 hours', bg: 'За 8 часа', uk: 'На 8 годин', be: 'На 8 гадзін' 
});
define('msgr.mute1Day', { ru: 'На 1 день', en: 'For 1 day', bg: 'За 1 ден', uk: 'На 1 День', be: 'На 1 Дзень' 
});
define('msgr.folders', { ru: 'Папки', en: 'Folders', bg: 'Папки', uk: 'Папки', be: 'Папкі' 
});
define('msgr.createFolderHint', { ru: 'Создайте папку кнопкой + в списке диалогов.', en: 'Create a folder with the + button in the chat list.', bg: 'Създайте папка с бутона + в списъка с разговори.', uk: 'Створіть Папку кнопкою + у списке діалогів.', be: 'Стварыце Папку кнопкай + у списке дыялогаў.' 
});
define('msgr.saveName', { ru: 'Сохранить название', en: 'Save name', bg: 'Запази името', uk: 'Зберегти Назва', be: 'Захаваць Назва' 
});
define('msgr.confirmFolderDelete', { ru: 'Нажмите ещё раз для удаления', en: 'Press again to delete', bg: 'Натиснете пак, за да изтриете', uk: 'Натисніть ще раз для видалення', be: 'Націсніце яшчэ раз для выдалення' 
});
define('msgr.deleteFolder', { ru: 'Удалить папку', en: 'Delete folder', bg: 'Изтрий папката', uk: 'Видалити Папку', be: 'Выдаліць Папку' 
});
define('msgr.searchMessages', { ru: 'Поиск по сообщениям', en: 'Search messages', bg: 'Търсене в съобщенията', uk: 'Пошук по повідомленням', be: 'Пошук па паведамленням' 
});
define('msgr.searchPrev', {
  ru: 'Предыдущее совпадение',
  en: 'Previous match',
  bg: 'Предишно съвпадение',
  uk: 'Попередній збіг',
  be: 'Папярэдняе супадзенне',
});
define('msgr.searchNext', {
  ru: 'Следующее совпадение',
  en: 'Next match',
  bg: 'Следващо съвпадение',
  uk: 'Наступний збіг',
  be: 'Наступнае супадзенне',
});
define('msgr.searchCounter', {
  ru: '{index} из {total}',
  en: '{index} of {total}',
  bg: '{index} от {total}',
  uk: '{index} з {total}',
  be: '{index} з {total}',
});
define('msgr.searchNoMatches', {
  ru: 'Нет совпадений',
  en: 'No matches',
  bg: 'Няма съвпадения',
  uk: 'Немає збігів',
  be: 'Няма супадзенняў',
});
define('msgr.closeSearch', { ru: 'Закрыть поиск', en: 'Close search', bg: 'Затвори търсенето', uk: 'Закрити Пошук', be: 'Закрыць Пошук' 
});
define('msgr.dialogCreated', { ru: 'Диалог создан', en: 'Chat created', bg: 'Разговорът е създаден', uk: 'Диалог створено', be: 'Диалог створаны' 
});
define('msgr.dialogCreatedHint', { ru: 'Напишите первое сообщение — оно появится здесь мгновенно.', en: 'Write the first message — it will appear here instantly.', bg: 'Напишете първото съобщение — то ще се появи тук веднага.', uk: 'Напишіть Перше Повідомлення — воно появится тут миттєво.', be: 'Напішыце Першае Паведамленне — яно появится тут імгненна.' 
});
define('msgr.openProfileOf', { ru: 'Открыть профиль {name}', en: 'Open {name}’s profile', bg: 'Отвори профила на {name}', uk: 'Відкрити Профіль {name}', be: 'Адкрыць Профіль {name}' 
});
define('msgr.userFallback', { ru: 'Пользователь', en: 'User', bg: 'Потребител', uk: 'Користувач', be: 'Карыстальнік' 
});
define('msgr.messageActions', { ru: 'Действия с сообщением', en: 'Message actions', bg: 'Действия със съобщението', uk: 'Дії з повідомленням', be: 'Дзеянні з паведамленнем' 
});
define('msgr.removeFromFavorites', { ru: 'Убрать из Избранного', en: 'Remove from Saved', bg: 'Премахни от Запазени', uk: 'Прибрати з Избранного', be: 'Прыбраць з Избранного' 
});
define('msgr.toFavorites', { ru: 'В Избранное', en: 'Save', bg: 'Запази', uk: 'У Обране', be: 'У Выбранае' 
});
define('msgr.unpin', { ru: 'Открепить', en: 'Unpin', bg: 'Откачи', uk: 'Відкріпити', be: 'Адмацаваць' 
});
define('msgr.pin', { ru: 'Закрепить', en: 'Pin', bg: 'Закачи', uk: 'Закріпити', be: 'Замацаваць' 
});
define('msgr.peerFallback', { ru: 'Собеседник', en: 'Contact', bg: 'Събеседник', uk: 'Співрозмовник', be: 'Суразмоўца' 
});
define('msgr.forwardedFrom', { ru: 'Переслано от', en: 'Forwarded from', bg: 'Препратено от', uk: 'Переслано від', be: 'Пераслана ад' 
});
define('msgr.forwardedFromUser', { ru: 'пользователя', en: 'user', bg: 'потребител', uk: 'користувача', be: 'карыстальніка' 
});
define('msgr.voteFailed', { ru: 'Не удалось проголосовать.', en: 'Could not vote.', bg: 'Гласуването не успя.', uk: 'Не вдалося проголосовать.', be: 'Не ўдалося проголосовать.' 
});
define('msgr.addOptionFailed', { ru: 'Не удалось добавить вариант.', en: 'Could not add the option.', bg: 'Опцията не можа да се добави.', uk: 'Не вдалося Додати Варіант.', be: 'Не ўдалося Дадаць Варыянт.' 
});
define('msgr.stopPollFailed', { ru: 'Не удалось остановить опрос.', en: 'Could not stop the poll.', bg: 'Анкетата не можа да се спре.', uk: 'Не вдалося зупинити Опитування.', be: 'Не ўдалося спыніць Апытанне.' 
});
define('msgr.edited', { ru: 'изменено · ', en: 'edited · ', bg: 'редактирано · ', uk: 'Змінено · ', be: 'Зменена · ' 
});
define('msgr.notSent', { ru: 'Не отправлено', en: 'Not sent', bg: 'Не е изпратено', uk: 'Не Надіслано', be: 'Не Адпраўлена' 
});
define('msgr.inFavorites', { ru: 'В Избранном', en: 'Saved', bg: 'Запазено', uk: 'У Избранном', be: 'У Избранном' 
});
define('msgr.read', { ru: 'Прочитано', en: 'Read', bg: 'Прочетено', uk: 'Прочитано', be: 'Прачытана' 
});
define('msgr.sent', { ru: 'Отправлено', en: 'Sent', bg: 'Изпратено', uk: 'Надіслано', be: 'Адпраўлена' 
});
define('msgr.videoCirclePreview', { ru: 'Предпросмотр видеокружка', en: 'Video circle preview', bg: 'Преглед на видеокръгче', uk: 'Попередній перегляд відеокружечка', be: 'Прадпрагляд відэакружка' 
});
define('msgr.recordingVideoCircle', { ru: 'Идёт запись видеокружка', en: 'Recording a video circle', bg: 'Записва се видеокръгче', uk: 'Триває запис відеокружечка', be: 'Ідзе запіс відэакружка' 
});
define('msgr.recordingVoice', { ru: 'Идёт запись голосового сообщения', en: 'Recording a voice message', bg: 'Записва се гласово съобщение', uk: 'Триває запис голосового Повідомлення', be: 'Ідзе запіс голосового Паведамленне' 
});
define('msgr.stopAndSend', { ru: 'Остановить запись и отправить', en: 'Stop recording and send', bg: 'Спри записа и изпрати', uk: 'Зупинити запис і Надіслати', be: 'Спыніць запіс і Адправіць' 
});
define('msgr.cancelRecording', { ru: 'Отменить запись', en: 'Cancel recording', bg: 'Отмени записа', uk: 'Скасувати запис', be: 'Скасаваць запіс' 
});
define('msgr.editingMessage', { ru: 'Изменение сообщения', en: 'Editing message', bg: 'Редактиране на съобщение', uk: 'Зміна Повідомлення', be: 'Змяненне Паведамленне' 
});
define('msgr.replyingTo', { ru: 'Ответ на сообщение', en: 'Reply to message', bg: 'Отговор на съобщение', uk: 'Відповідь на Повідомлення', be: 'Адказ на Паведамленне' 
});
define('msgr.cancel', { ru: 'Отменить', en: 'Cancel', bg: 'Отмени', uk: 'Скасувати', be: 'Скасаваць' 
});
define('msgr.groupWriteForbiddenUntil', { ru: 'В этой группе вам запрещено писать {until}.', en: 'You are not allowed to write in this group {until}.', bg: 'В тази група не можете да пишете {until}.', uk: 'У цієї Групі вам Заборонено писать {until}.', be: 'У гэтай Групе вам Забаронена писать {until}.' 
});
define('msgr.groupWriteForbidden', { ru: 'В этой группе вам запрещено писать. Права выдаёт владелец группы.', en: 'You are not allowed to write in this group. The group owner grants rights.', bg: 'В тази група не можете да пишете. Правата се дават от собственика на групата.', uk: 'У цієї Групі вам Заборонено писать. Права видає власник Групи.', be: 'У гэтай Групе вам Забаронена писать. Правы выдаёт Уладальнік Групы.' 
});
define('msgr.createPoll', { ru: 'Создать опрос', en: 'Create poll', bg: 'Създай анкета', uk: 'Створити Опитування', be: 'Стварыць Апытанне' 
});
define('msgr.attachMedia', { ru: 'Прикрепить фото или файл', en: 'Attach photo or file', bg: 'Прикачи снимка или файл', uk: 'Прикріпити фото або Файл', be: 'Прымацаваць фото або Файл' 
});
define('msgr.mediaForbidden', { ru: 'В этой группе запрещены медиа', en: 'Media are forbidden in this group', bg: 'Медиите са забранени в тази група', uk: 'У цієї Групі заборонені Медіа', be: 'У гэтай Групе забаронены Медыя' 
});
define('msgr.stopRecording', { ru: 'Остановить запись', en: 'Stop recording', bg: 'Спри записа', uk: 'Зупинити запис', be: 'Спыніць запіс' 
});
define('msgr.waitingDevice', { ru: 'Ожидание доступа к устройству', en: 'Waiting for device access', bg: 'Изчакване на достъп до устройството', uk: 'Очікування доступу до пристрою', be: 'Чаканне доступу да прыладзе' 
});
define('msgr.recordVideoCircle', { ru: 'Записать видеокружок', en: 'Record a video circle', bg: 'Запиши видеокръгче', uk: 'Записати Відеокружечок', be: 'Запісаць Відэакружок' 
});
define('msgr.voiceMessage', { ru: 'Голосовое сообщение', en: 'Voice message', bg: 'Гласово съобщение', uk: 'Голосове Повідомлення', be: 'Голосовое Паведамленне' 
});
define('msgr.switchToVideoCircle', { ru: 'Переключить на видеокружок', en: 'Switch to video circle', bg: 'Превключи на видеокръгче', uk: 'Переключити на Відеокружечок', be: 'Пераключыць на Відэакружок' 
});
define('msgr.switchToVoice', { ru: 'Переключить на голосовое сообщение', en: 'Switch to voice message', bg: 'Превключи на гласово съобщение', uk: 'Переключити на голосове Повідомлення', be: 'Пераключыць на голосовое Паведамленне' 
});
define('msgr.addEmoji', { ru: 'Добавить эмодзи', en: 'Add emoji', bg: 'Добави емоджи', uk: 'Додати емодзі', be: 'Дадаць эмодзи' 
});
define('msgr.sendLater', { ru: 'Отправить позже', en: 'Send later', bg: 'Изпрати по-късно', uk: 'Надіслати позже', be: 'Адправіць позже' 
});
define('msgr.messageLabel', { ru: 'Сообщение', en: 'Message', bg: 'Съобщение', uk: 'Повідомлення', be: 'Паведамленне' 
});
define('msgr.linksForbidden', { ru: 'В этой группе запрещены ссылки', en: 'Links are forbidden in this group', bg: 'Връзките са забранени в тази група', uk: 'У цієї Групі заборонені Посилання', be: 'У гэтай Групе забаронены Спасылка' 
});
define('msgr.sendingUnavailable', { ru: 'Отправка недоступна', en: 'Sending is unavailable', bg: 'Изпращането не е достъпно', uk: 'Надсилання недоступна', be: 'Адпраўка недаступная' 
});
define('msgr.editMessagePlaceholder', { ru: 'Измените сообщение…', en: 'Edit the message…', bg: 'Редактирайте съобщението…', uk: 'Змініть Повідомлення…', be: 'Змяніце Паведамленне…' 
});
define('msgr.replyPlaceholder', { ru: 'Напишите ответ…', en: 'Write a reply…', bg: 'Напишете отговор…', uk: 'Напишіть Відповідь…', be: 'Напішыце Адказ…' 
});
define('msgr.messagePlaceholder', { ru: 'Сообщение…', en: 'Message…', bg: 'Съобщение…', uk: 'Повідомлення…', be: 'Паведамленне…' 
});
define('msgr.sendMessage', { ru: 'Отправить сообщение', en: 'Send message', bg: 'Изпрати съобщение', uk: 'Надіслати Повідомлення', be: 'Адправіць Паведамленне' 
});
define('msgr.moreLater', { ru: 'Дополнительные действия появятся позже.', en: 'More actions will appear later.', bg: 'Още действия ще се появят по-късно.', uk: 'Додаткові дії з’являться позже.', be: 'Дадатковыя дзеянні з’явяцца позже.' 
});
define('msgr.messageForwarded', { ru: 'Сообщение переслано.', en: 'Message forwarded.', bg: 'Съобщението е препратено.', uk: 'Повідомлення переслано.', be: 'Паведамленне пераслана.' 
});
define('msgr.schedule', { ru: 'Запланировать', en: 'Schedule', bg: 'Планирай', uk: 'Запланувати', be: 'Запланаваць' 
});
define('msgr.peerProfile', { ru: 'Профиль собеседника', en: 'Peer’s profile', bg: 'Профил на събеседника', uk: 'Профіль співрозмовника', be: 'Профіль суразмоўцы' 
});
define('msgr.enableNotifications', { ru: 'Включить уведомления', en: 'Turn on notifications', bg: 'Включи известията', uk: 'Увімкнути Сповіщення', be: 'Уключыць Апавяшчэнні' 
});
define('msgr.forever', { ru: 'Навсегда', en: 'Forever', bg: 'Завинаги', uk: 'Назавжди', be: 'Назаўжды' 
});
define('msgr.folderMenuTooltip', { ru: 'Меню папки', en: 'Folder menu', bg: 'Меню на папката', uk: 'Меню Папки', be: 'Меню Папкі' 
});
define('msgr.folderTitle', { ru: 'Папка «{name}»', en: 'Folder “{name}”', bg: 'Папка „{name}“', uk: 'Папка «{name}»', be: 'Папка «{name}»' 
});
define('msgr.renameFolder', { ru: 'Переименовать папку', en: 'Rename folder', bg: 'Преименувай папката', uk: 'Перейменувати Папку', be: 'Перайменаваць Папку' 
});
define('msgr.reaction', { ru: 'Реакция', en: 'Reaction', bg: 'Реакция', uk: 'Реакция', be: 'Реакция' 
});
define('msgr.reply', { ru: 'Ответить', en: 'Reply', bg: 'Отговори', uk: 'Відповісти', be: 'Адказаць' 
});
define('msgr.forward', { ru: 'Переслать', en: 'Forward', bg: 'Препрати', uk: 'Переслати', be: 'Пераслаць' 
});
define('msgr.deleteForBoth', { ru: 'Удалить у обоих', en: 'Delete for both', bg: 'Изтрий за двамата', uk: 'Видалити у обоих', be: 'Выдаліць у обоих' 
});
define('msgr.originalDeleted', { ru: 'Исходное сообщение удалено', en: 'The original message was deleted', bg: 'Оригиналното съобщение е изтрито', uk: 'Вихідне Повідомлення видалено', be: 'Выходнае Паведамленне выдалена' 
});
define('msgr.retrySend', { ru: 'Повторить отправку', en: 'Resend', bg: 'Изпрати пак', uk: 'Повторити надсиланну', be: 'Паўтарыць адпраўку' 
});
define('msgr.communicationBlocked', { ru: 'Общение заблокировано. Разблокируйте пользователя в его профиле.', en: 'Communication is blocked. Unblock the user in their profile.', bg: 'Общуването е блокирано. Отблокирайте потребителя в профила му.', uk: 'Спілкування заблоковано. Розблокуйте користувача у його профілі.', be: 'Размовы заблакавана. Разблакуйце карыстальніка у яго профілі.' 
});
define('msgr.frozenViewOnlyLong', { ru: 'Аккаунт заморожен — доступен только просмотр. Отправка сообщений, звонки и изменения недоступны.', en: 'The account is frozen — view only. Sending messages, calls and changes are unavailable.', bg: 'Профилът е замразен — само преглед. Изпращането на съобщения, обажданията и промените не са достъпни.', uk: 'Акаунт заморожен — доступен тільки перегляд. Надсилання Повідомлень, Дзвінки і Зміни недоступні.', be: 'Акаўнт заморожен — доступен толькі прагляд. Адпраўка Паведамленняў, Званкі і Змены недоступны.' 
});
define('msgr.peerDeletedCompose', { ru: 'Аккаунт удалён — поле ввода закрыто. Сообщения из истории остаются доступными.', en: 'The account was deleted — the input field is closed. Messages from the history remain available.', bg: 'Профилът е изтрит — полето за въвеждане е затворено. Съобщенията от историята остават достъпни.', uk: 'Акаунт Видалено — поле ввода Закрито. Повідомлення з истории остаются доступними.', be: 'Акаўнт Выдалена — поле ввода Закрыта. Паведамленне з истории остаются доступными.' 
});
define('msgr.peerFrozenCompose', { ru: 'Аккаунт собеседника заморожен — отправка недоступна. История переписки остаётся доступной.', en: 'The peer’s account is frozen — sending is unavailable. The chat history remains available.', bg: 'Профилът на събеседника е замразен — изпращането не е достъпно. Историята на разговора остава достъпна.', uk: 'Акаунт співрозмовника заморожен — Надсилання недоступна. Історія переписки остаётся доступной.', be: 'Акаўнт суразмоўцы заморожен — Адпраўка недаступная. Гісторыя переписки остаётся доступной.' 
});
define('msgr.scheduledCount', {
  ru: 'Запланированных сообщений: {count}',
  en: 'Scheduled messages: {count}',
  bg: 'Планирани съобщения: {count}',
  uk: 'Запланованих повідомлень: {count}',
  be: 'Запланаваных паведамленняў: {count}',
});

// --- Настройки: экран-список разделов -------------------------------------
define('settings.title', { ru: 'Настройки', en: 'Settings', bg: 'Настройки', uk: 'Налаштування', be: 'Налады' 
});
define('settings.search', { ru: 'Поиск', en: 'Search', bg: 'Търсене', uk: 'Пошук', be: 'Пошук' 
});
define('settings.searchPlaceholder', {
  ru: 'Поиск в настройках',
  en: 'Search settings',
  bg: 'Търсене в настройките',
  uk: 'Пошук у налаштуваннях',
  be: 'Пошук у наладках',
});
define('settings.nothingFound', {
  ru: 'Ничего не найдено',
  en: 'Nothing found',
  bg: 'Нищо не е намерено',
  uk: 'Нічого не знайдено',
  be: 'Нічого не знойдзена',
});
define('settings.myAccount', { ru: 'Мой аккаунт', en: 'My account', bg: 'Моят профил', uk: 'Мій акаунт', be: 'Мой акаўнт' });
define('settings.notifications', {
  ru: 'Уведомления и звуки',
  en: 'Notifications and sounds',
  bg: 'Известия и звуци',
  uk: 'Сповіщення та Звуки',
  be: 'Апавяшчэнні і гукі',
});
define('settings.privacy', { ru: 'Конфиденциальность', en: 'Privacy', bg: 'Поверителност', uk: 'Конфіденційність', be: 'Прыватнасць' 
});
define('settings.chatSettings', { ru: 'Настройки чатов', en: 'Chat settings', bg: 'Настройки на чатовете', uk: 'Налаштування чатів', be: 'Налады чатаў' 
});
define('settings.folders', { ru: 'Папки с чатами', en: 'Chat folders', bg: 'Папки с чатове', uk: 'Папки з чатами', be: 'Папкі з чатамі' 
});
define('settings.advanced', { ru: 'Продвинутые настройки', en: 'Advanced settings', bg: 'Разширени настройки', uk: 'Розширені налаштування', be: 'Пашыраныя налады' });
define('settings.soundCamera', { ru: 'Звук и камера', en: 'Sound and camera', bg: 'Звук и камера', uk: 'Звук і Камера', be: 'Гук і Камера' 
});
define('settings.language', { ru: 'Язык', en: 'Language', bg: 'Език', uk: 'Мова', be: 'Мова' 
});
define('settings.openAria', {
  ru: 'Открыть настройки: {section}',
  en: 'Open settings: {section}',
  bg: 'Отвори настройки: {section}',
  uk: 'Відкрити налаштування: {section}',
  be: 'Адкрыць налады: {section}',
});
// Заглушка для разделов, которые ещё не сделаны: честно говорим, а не врём кнопкой.
define('settings.comingSoon', {
  ru: 'Этот раздел ещё в разработке.',
  en: 'This section is still under development.',
  bg: 'Този раздел все още е в разработка.',
  uk: 'Цей розділ ще у розробці.',
  be: 'Гэты раздзел яшчэ ў распрацоўцы.',
});
define('settings.sessions', {
  ru: 'Активные сеансы',
  en: 'Active sessions',
  bg: 'Активни сесии',
  uk: 'Активні сеанси',
  be: 'Актыўныя сеансы',
});

// --- Настройки: «Конфиденциальность» ---------------------------------------
// Работает только «Время захода»: это единственный флаг приватности, который
// сервер хранит и отдаёт. Остальные разделы — помеченные заготовки.
define('privacy.intro', {
  ru: 'Здесь настраивается, кому видна ваша активность. Разделы, которые ещё не работают, отмечены.',
  en: 'Configure who can see your activity here. Sections that are not implemented yet are marked.',
  bg: 'Тук се настройва кой вижда активността ви. Разделите, които още не работят, са отбелязани.',
  uk: 'Тут налаштовується, кому видно вашу активність. Розділи, які ще не працюють, позначені.',
  be: 'Тут наладжваецца, каму відаць вашу актыўнасць. Раздзелы, якія яшчэ не працуюць, пазначаны.',
});
define('privacy.lastSeen', {
  ru: 'Время захода',
  en: 'Last seen time',
  bg: 'Време на последно виждане',
  uk: 'Час останнього входу',
  be: 'Час апошняга ўваходу',
});
define('privacy.lastSeenHint', {
  ru: 'Показывать другим, когда вы были в сети.',
  en: 'Show others when you were last online.',
  bg: 'Показвай на другите кога сте били онлайн.',
  uk: 'Показувати іншим, коли ви були в мережі.',
  be: 'Паказваць іншым, калі вы былі ў сетцы.',
});
define('privacy.calls', { ru: 'Звонки', en: 'Calls', bg: 'Обаждания', uk: 'Дзвінки', be: 'Званкі' });
define('privacy.callsHint', {
  ru: 'Кто может звонить вам.',
  en: 'Who can call you.',
  bg: 'Кой може да ви звъни.',
  uk: 'Хто може дзвонити вам.',
  be: 'Хто можа званіць вам.',
});
define('privacy.whoCanCallMe', {
  ru: 'Кто может звонить мне',
  en: 'Who can call me',
  bg: 'Кой може да ми звъни',
  uk: 'Хто може дзвонити мені',
  be: 'Хто можа званіць мне',
});
define('privacy.ruleEveryone', { ru: 'Все', en: 'Everybody', bg: 'Всички', uk: 'Усі', be: 'Усе' });
define('privacy.ruleContacts', { ru: 'Мои контакты', en: 'My Contacts', bg: 'Моите контакти', uk: 'Мої контакти', be: 'Мае кантакты' });
define('privacy.ruleNobody', { ru: 'Никто', en: 'Nobody', bg: 'Никой', uk: 'Ніхто', be: 'Ніхто' });
define('privacy.addExceptions', {
  ru: 'Добавить исключения',
  en: 'Add exceptions',
  bg: 'Добавяне на изключения',
  uk: 'Додати винятки',
  be: 'Дадаць выключэнні',
});
define('privacy.alwaysAllow', {
  ru: 'Всегда разрешать',
  en: 'Always allow',
  bg: 'Винаги разрешавай',
  uk: 'Завжди дозволяти',
  be: 'Заўсёды дазваляць',
});
define('privacy.neverAllow', {
  ru: 'Никогда не разрешать',
  en: 'Never allow',
  bg: 'Никога не разрешавай',
  uk: 'Ніколи не дозволяти',
  be: 'Ніколі не дазваляць',
});
define('privacy.exceptionsHint', {
  ru: 'Этим пользователям будет разрешено или запрещено звонить Вам независимо от настроек выше.',
  en: 'These users will or will not be allowed to call you regardless of the settings above.',
  bg: 'Тези потребители ще имат или няма да имат разрешение да ви се обаждат независимо от настройките по-горе.',
  uk: 'Цим користувачам буде дозволено або заборонено дзвонити Вам незалежно від налаштувань вище.',
  be: 'Гэтым карыстальнікам будзе дазволена або забаронена званіць Вам незалежна ад налад вышэй.',
});
define('privacy.nobodyCount', { ru: 'Никого', en: 'Nobody', bg: 'Никой', uk: 'Нікого', be: 'Нікога' });
define('privacy.addExceptionBtn', { ru: 'Добавить', en: 'Add', bg: 'Добави', uk: 'Додати', be: 'Дадаць' });
define('privacy.userCountOne', { ru: '{count} пользователь', en: '{count} user', bg: '{count} потребител', uk: '{count} користувач', be: '{count} карыстальнік' });
define('privacy.userCountFew', { ru: '{count} пользователя', en: '{count} users', bg: '{count} потребители', uk: '{count} користувачі', be: '{count} карыстальнікі' });
define('privacy.userCountMany', { ru: '{count} пользователей', en: '{count} users', bg: '{count} потребители', uk: '{count} користувачів', be: '{count} карыстальнікаў' });
define('privacy.messages', {
  ru: 'Сообщения',
  en: 'Messages',
  bg: 'Съобщения',
  uk: 'Повідомлення',
  be: 'Паведамленні',
});
define('privacy.messagesHint', {
  ru: 'Кто может писать вам в личные диалоги.',
  en: 'Who can message you in private chats.',
  bg: 'Кой може да ви пише в лични чатове.',
  uk: 'Хто може писати вам у приватні діалоги.',
  be: 'Хто можа пісаць вам у прыватныя дыялогі.',
});
define('privacy.birthday', {
  ru: 'День рождения',
  en: 'Birthday',
  bg: 'Рожден ден',
  uk: 'День народження',
  be: 'Дзень нараджэння',
});
define('privacy.birthdayHint', {
  ru: 'Кто видит дату рождения в вашем профиле.',
  en: 'Who can see the birthday in your profile.',
  bg: 'Кой вижда рожденния ден във вашия профил.',
  uk: 'Хто бачить дату народження у вашому профілі.',
  be: 'Хто бачыць дату нараджэння ў вашым профілі.',
});
define('privacy.invites', {
  ru: 'Приглашения',
  en: 'Invitations',
  bg: 'Покани',
  uk: 'Запрошення',
  be: 'Запрашэнне',
});
define('privacy.invitesHint', {
  ru: 'Кто может добавлять вас в группы.',
  en: 'Who can add you to groups.',
  bg: 'Кой може да ви добавя в групи.',
  uk: 'Хто може додавати вас до груп.',
  be: 'Хто можа дадаваць вас у групы.',
});
define('privacy.soon', { ru: 'скоро', en: 'soon', bg: 'скоро', uk: 'незабаром', be: 'неўзабаве' });
define('privacy.saveFailed', {
  ru: 'Не удалось сохранить настройку.',
  en: 'Could not save the setting.',
  bg: 'Настройката не беше запазена.',
  uk: 'Не вдалося зберегти налаштування.',
  be: 'Не ўдалося захаваць наладу.',
});

// --- Настройки: «Активные сеансы» -----------------------------------------
// Yargram — сайт, поэтому сеанс описывают парой «сайт + браузер», а не
// названием устройства: так видно, откуда именно вошли.
define('sessions.title', {
  ru: 'Активные сеансы',
  en: 'Active sessions',
  bg: 'Активни сесии',
  uk: 'Активні сеанси',
  be: 'Актыўныя сеансы',
});
define('sessions.intro', {
  ru: 'Здесь видно, откуда вы вошли в аккаунт. Чужой вход завершите и смените пароль.',
  en: 'This is where you signed in to your account. Terminate a foreign login and change the password.',
  bg: 'Тук се вижда откъде сте влезли в профила. Прекратете чужд вход и сменете паролата.',
  uk: 'Тут видно, звідки ви увійшли в акаунт. Чужий вхід завершіть і змініть пароль.',
  be: 'Тут відаць, адкуль вы ўвайшлі ў акаўнт. Чужы ўваход завершыце і зменіце пароль.',
});
define('sessions.current', { ru: 'Этот сеанс', en: 'This session', bg: 'Тази сесия', uk: 'Цей сеанс', be: 'Гэты сеанс' });
define('sessions.unknownSite', {
  ru: 'Сайт не определён',
  en: 'Unknown site',
  bg: 'Сайтът не е известен',
  uk: 'Сайт не визначено',
  be: 'Сайт не вызначаны',
});
define('sessions.unknownDevice', {
  ru: 'Браузер не определён',
  en: 'Unknown browser',
  bg: 'Браузърът не е известен',
  uk: 'Браузер не визначено',
  be: 'Браўзер не вызначаны',
});
define('sessions.lastSeen', {
  ru: 'Последняя активность: {time}',
  en: 'Last activity: {time}',
  bg: 'Последна активност: {time}',
  uk: 'Остання активність: {time}',
  be: 'Апошняя актыўнасць: {time}',
});
define('sessions.terminate', { ru: 'Завершить', en: 'Terminate', bg: 'Прекрати', uk: 'Завершити', be: 'Завяршыць' });
define('sessions.terminateAll', {
  ru: 'Завершить все остальные',
  en: 'Terminate all other sessions',
  bg: 'Прекрати всички останали',
  uk: 'Завершити всі інші',
  be: 'Завяршыць усе астатнія',
});
define('sessions.terminateAllHint', {
  ru: 'Закрыть все входы, кроме этого.',
  en: 'Close every login except this one.',
  bg: 'Затвори всички входове освен този.',
  uk: 'Закрити всі входи, крім цього.',
  be: 'Закрыць усе ўваходы, акрамя гэтага.',
});
// Право завершать чужие сеансы появляется через сутки после входа: чужой пароль
// не должен выкидывать владельца сразу.
define('sessions.gateHint', {
  ru: 'Завершать другие сеансы можно через 24 часа после входа.',
  en: 'You can terminate other sessions 24 hours after signing in.',
  bg: 'Другите сесии можете да прекратите 24 часа след влизането.',
  uk: 'Завершувати інші сеанси можна через 24 години після входу.',
  be: 'Завяршаць іншыя сеансы можна праз 24 гадзіны пасля ўваходу.',
});
define('sessions.gateLeft', {
  ru: 'Осталось: {time}',
  en: 'Left: {time}',
  bg: 'Остава: {time}',
  uk: 'Залишилось: {time}',
  be: 'Залалося: {time}',
});
define('sessions.hours', { ru: 'ч', en: 'h', bg: 'ч', uk: 'год', be: 'г' });
define('sessions.minutes', { ru: 'мин', en: 'min', bg: 'мин', uk: 'хв', be: 'хв' });
define('sessions.days', { ru: 'дн.', en: 'days', bg: 'дни', uk: 'днів', be: 'дзён' });
define('sessions.autoTerminate', {
  ru: 'Завершать неактивные сеансы',
  en: 'Terminate inactive sessions',
  bg: 'Прекратяй неактивните сесии',
  uk: 'Завершувати неактивні сеанси',
  be: 'Завяршаць неактыўныя сеансы',
});
define('sessions.autoTerminateHint', {
  ru: 'Сеанс закроется сам, если им не пользовались.',
  en: 'A session closes itself when it stays unused.',
  bg: 'Сесията се затваря сама, ако не е използвана.',
  uk: 'Сеанс закриється сам, якщо ним не користувалися.',
  be: 'Сеанс зачыніцца сам, калі ім не карысталіся.',
});
define('sessions.never', { ru: 'Никогда', en: 'Never', bg: 'Никога', uk: 'Ніколи', be: 'Ніколі' });
define('sessions.failed', {
  ru: 'Не удалось завершить сеанс.',
  en: 'Could not terminate the session.',
  bg: 'Сесията не беше прекратена.',
  uk: 'Не вдалося завершити сеанс.',
  be: 'Не ўдалося завяршыць сеанс.',
});
define('sessions.terminatedOne', {
  ru: 'Сеанс завершён.',
  en: 'The session is terminated.',
  bg: 'Сесията е прекратена.',
  uk: 'Сеанс завершено.',
  be: 'Сеанс завершаны.',
});
define('sessions.terminatedAll', {
  ru: 'Остальные сеансы завершены.',
  en: 'All other sessions are terminated.',
  bg: 'Останалите сесии са прекратени.',
  uk: 'Інші сеанси завершено.',
  be: 'Астатнія сеансы завершаны.',
});
define('sessions.loading', { ru: 'Загружаю…', en: 'Loading…', bg: 'Зареждам…', uk: 'Завантажую…', be: 'Загружаю…' });
define('sessions.renameDevice', {
  ru: 'Переименовать устройство',
  en: 'Rename device',
  bg: 'Преименувай устройството',
  uk: 'Перейменувати пристрій',
  be: 'Перайменаваць прыладу',
});
define('sessions.renamePrompt', {
  ru: 'Новое имя устройства:',
  en: 'New device name:',
  bg: 'Ново име на устройството:',
  uk: "Нове ім'я пристрою:",
  be: 'Новае імя прылады:',
});
define('sessions.renamePlaceholder', {
  ru: 'Например: Компьютер дома',
  en: 'e.g. Home computer',
  bg: 'Например: Домашен компютър',
  uk: "Наприклад: Комп'ютер вдома",
  be: 'Напрыклад: Камп’ютар дома',
});
define('sessions.nameUpdated', {
  ru: 'Имя устройства сохранено.',
  en: 'Device name saved.',
  bg: 'Името на устройството е запазено.',
  uk: "Ім'я пристрою збережено.",
  be: 'Імя прылады захавана.',
});

// Окно «новый вход»: показываем сразу после входа с незнакомого сайта.
define('sessions.alert.title', {
  ru: 'Новый вход',
  en: 'New login',
  bg: 'Ново влизане',
  uk: 'Новий вхід',
  be: 'Новы ўваход',
});
define('sessions.alert.body', {
  ru: 'В аккаунт вошли с сайта {site}. Если это были не вы — завершите сеанс и смените пароль.',
  en: 'Your account was opened from {site}. If it was not you, terminate the session and change the password.',
  bg: 'В профила влязоха от сайта {site}. Ако не сте били вие — прекратете сесията и сменете паролата.',
  uk: 'В акаунт увійшли з сайту {site}. Якщо це були не ви — завершіть сеанс і змініть пароль.',
  be: 'У акаўнт увайшлі з сайта {site}. Калі гэта былі не вы — завяршыце сеанс і зменіце пароль.',
});
define('sessions.alert.device', {
  ru: 'Браузер: {device}',
  en: 'Browser: {device}',
  bg: 'Браузър: {device}',
  uk: 'Браузер: {device}',
  be: 'Браўзер: {device}',
});
define('sessions.alert.wasMe', { ru: 'Это был я', en: 'It was me', bg: 'Това бях аз', uk: 'Це був я', be: 'Гэта быў я' });
define('sessions.alert.notMe', { ru: 'Это не я', en: 'It was not me', bg: 'Не бях аз', uk: 'Це не я', be: 'Гэта не я' });

// ---- Темы ----
define('settings.themes', { ru: 'Темы', en: 'Themes', bg: 'Теми', uk: 'Теми', be: 'Тэмы' });
define('settings.scale', { ru: 'Масштаб', en: 'Scale', bg: 'Мащаб', uk: 'Масштаб', be: 'Маштаб' });
define('scale.title', { ru: 'Масштаб интерфейса', en: 'Interface scale', bg: 'Мащаб на интерфейса', uk: 'Масштаб інтерфейсу', be: 'Маштаб інтэрфейсу' });
define('scale.hint', {
  ru: 'Меняет размер всего интерфейса. Значение хранится на этом устройстве.',
  en: 'Changes the size of the whole interface. The value is kept on this device.',
  bg: 'Променя размера на целия интерфейс. Стойността се пази на това устройство.',
  uk: 'Змінює розмір усього інтерфейсу. Значення зберігається на цьому пристрої.',
  be: 'Змяняе памер усяго інтэрфейсу. Значэнне захоўваецца на гэтай прыладзе.',
});
define('scale.slider', { ru: 'Размер', en: 'Size', bg: 'Размер', uk: 'Розмір', be: 'Памер' });
define('scale.reset', { ru: 'Обычный размер', en: 'Default size', bg: 'Обикновен размер', uk: 'Звичайний розмір', be: 'Звычайны памер' });
define('themes.title', { ru: 'Темы', en: 'Themes', bg: 'Теми', uk: 'Теми', be: 'Тэмы' });
define('themes.listHint', {
  ru: 'Тема меняет цвета и шрифт всего приложения. Выбор хранится на этом устройстве — у каждого аккаунта свой.',
  en: 'A theme changes the colours and the font of the whole app. Your choice is kept on this device — each account has its own.',
  bg: 'Темата променя цветовете и шрифта на цялото приложение. Изборът се пази на това устройство — всеки акаунт има свой.',
  uk: 'Тема змінює кольори та шрифт усього застосунку. Вибір зберігається на цьому пристрої — у кожного акаунта свій.',
  be: 'Тэма змяняе колеры і шрыфт усяго дастасунку. Выбар захоўваецца на гэтай прыладзе — у кожнага акаўнта свой.',
});
define('themes.builtIn', { ru: 'Встроенные', en: 'Built-in', bg: 'Вградени', uk: 'Вбудовані', be: 'Убудаваныя' });
define('themes.mine', { ru: 'Мои темы', en: 'My themes', bg: 'Мои теми', uk: 'Мої теми', be: 'Мае тэмы' });
define('themes.mineEmpty', {
  ru: 'Своих тем пока нет. Соберите свою или добавьте чужую по ссылке.',
  en: 'No themes of your own yet. Build one, or add someone else’s from a link.',
  bg: 'Още нямате свои теми. Направете своя или добавете чужда по връзка.',
  uk: 'Власних тем поки немає. Створіть свою або додайте чужу за посиланням.',
  be: 'Сваіх тэм пакуль няма. Стварыце сваю або дадайце чужую па спасылцы.',
});
define('themes.create', { ru: 'Создать тему', en: 'Create a theme', bg: 'Създай тема', uk: 'Створити тему', be: 'Стварыць тэму' });
define('themes.deleteConfirm', {
  ru: 'Удалить тему «{name}»?',
  en: 'Delete the theme “{name}”?',
  bg: 'Да изтрия ли темата „{name}“?',
  uk: 'Видалити тему «{name}»?',
  be: 'Выдаліць тэму «{name}»?',
});
define('themes.share', { ru: 'Поделиться', en: 'Share', bg: 'Сподели', uk: 'Поділитися', be: 'Падзяліцца' });
define('themes.shareTitle', { ru: 'Ссылка на тему', en: 'Theme link', bg: 'Връзка към тема', uk: 'Посилання на тему', be: 'Спасылка на тэму' });
define('themes.shareHint', {
  ru: 'Отправьте ссылку — человек откроет её и добавит тему себе. Сама тема лежит внутри ссылки, поэтому она не протухает.',
  en: 'Send the link — whoever opens it can add the theme to their own. The theme itself lives inside the link, so it never expires.',
  bg: 'Изпратете връзката — който я отвори, ще добави темата при себе си. Темата е вътре във връзката, затова не изтича.',
  uk: 'Надішліть посилання — людина відкриє його та додасть тему собі. Тема лежить усередині посилання, тому воно не протухає.',
  be: 'Дашліце спасылку — чалавек адкрые яе і дадасць тэму сабе. Тэма ляжыць унутры спасылкі, таму яна не сапсуецца.',
});
define('themes.copied', { ru: 'Скопировано', en: 'Copied', bg: 'Копирано', uk: 'Скопійовано', be: 'Скапіравана' });
define('themes.copyManual', {
  ru: 'Скопировать не вышло — выделите ссылку и скопируйте вручную.',
  en: 'Copying failed — select the link and copy it by hand.',
  bg: 'Копирането не успя — изберете връзката и я копирайте ръчно.',
  uk: 'Скопіювати не вдалося — виділіть посилання та скопіюйте вручну.',
  be: 'Скапіраваць не ўдалося — выдзеліце спасылку і скапіруйце ўручную.',
});
define('themes.import', { ru: 'Добавить по ссылке', en: 'Add from a link', bg: 'Добави по връзка', uk: 'Додати за посиланням', be: 'Дадаць па спасылцы' });
define('themes.importHint', {
  ru: 'Вставьте ссылку на тему. Она добавится в «Мои темы» и сразу включится.',
  en: 'Paste a theme link. It will be added to “My themes” and switched on right away.',
  bg: 'Поставете връзка към тема. Тя ще се добави в „Мои теми“ и веднага ще се включи.',
  uk: 'Вставте посилання на тему. Вона додасться до «Мої теми» й одразу увімкнеться.',
  be: 'Устаўце спасылку на тэму. Яна дадасца ў «Мае тэмы» і адразу ўключыцца.',
});
define('themes.importPlaceholder', {
  ru: 'https://example.com/#theme=…',
  en: 'https://example.com/#theme=…',
  bg: 'https://example.com/#theme=…',
  uk: 'https://example.com/#theme=…',
  be: 'https://example.com/#theme=…',
});
define('themes.importInvalid', {
  ru: 'Это не похоже на ссылку с темой.',
  en: 'This does not look like a theme link.',
  bg: 'Това не изглежда като връзка към тема.',
  uk: 'Це не схоже на посилання з темою.',
  be: 'Гэта не падобна на спасылку з тэмай.',
});
define('themes.imported', {
  ru: 'Тема «{name}» добавлена.',
  en: 'Theme “{name}” added.',
  bg: 'Темата „{name}“ е добавена.',
  uk: 'Тему «{name}» додано.',
  be: 'Тэму «{name}» дададзена.',
});
define('themes.importTitle', { ru: 'Добавить тему?', en: 'Add this theme?', bg: 'Да добавя ли темата?', uk: 'Додати тему?', be: 'Дадаць тэму?' });
define('themes.importAsk', {
  ru: 'Добавить тему «{name}» себе?',
  en: 'Add the theme “{name}” to your own?',
  bg: 'Да добавя ли темата „{name}“ при себе си?',
  uk: 'Додати тему «{name}» собі?',
  be: 'Дадаць тэму «{name}» сабе?',
});
define('themes.importSkip', { ru: 'Не надо', en: 'No thanks', bg: 'Не', uk: 'Не треба', be: 'Не трэба' });
define('themes.editorTitle', { ru: 'Своя тема', en: 'Custom theme', bg: 'Своя тема', uk: 'Власна тема', be: 'Уласная тэма' });
define('themes.newName', { ru: 'Моя тема', en: 'My theme', bg: 'Моя тема', uk: 'Моя тема', be: 'Мая тэма' });
define('themes.name', { ru: 'Название темы', en: 'Theme name', bg: 'Име на темата', uk: 'Назва теми', be: 'Назва тэмы' });
define('themes.mode', { ru: 'Режим', en: 'Mode', bg: 'Режим', uk: 'Режим', be: 'Рэжым' });
define('themes.modeLight', { ru: 'Светлая', en: 'Light', bg: 'Светла', uk: 'Світла', be: 'Светлая' });
define('themes.modeDark', { ru: 'Тёмная', en: 'Dark', bg: 'Тъмна', uk: 'Темна', be: 'Цёмная' });
define('themes.font', { ru: 'Шрифт', en: 'Font', bg: 'Шрифт', uk: 'Шрифт', be: 'Шрыфт' });
define('themes.colors', { ru: 'Цвета', en: 'Colours', bg: 'Цветове', uk: 'Кольори', be: 'Колеры' });
define('themes.previewHint', {
  ru: 'Черновик уже применён ко всему интерфейсу — так тему и примеряют. Выход без сохранения вернёт прежнюю.',
  en: 'The draft is already applied to the whole app — that is how you try a theme on. Leaving without saving restores the previous one.',
  bg: 'Черновата вече е приложена към цялото приложение — така се пробва тема. Изходът без запазване връща предишната.',
  uk: 'Чернетку вже застосовано до всього інтерфейсу — так тему й приміряють. Вихід без збереження поверне попередню.',
  be: 'Чарнавік ужо прыменены да ўсяго інтэрфейсу — так тэму і прымерваюць. Выхад без захавання верне папярэднюю.',
});
define('themes.makeDark', { ru: 'Сделать тёмную версию', en: 'Make a dark version', bg: 'Направи тъмна версия', uk: 'Зробити темну версію', be: 'Зрабіць цёмную версію' });
define('themes.makeLight', { ru: 'Сделать светлую версию', en: 'Make a light version', bg: 'Направи светла версия', uk: 'Зробити світлу версію', be: 'Зрабіць светлую версію' });
define('themes.makeCounterpartHint', {
  ru: 'Цвета пересчитаются под другой режим и получится отдельная тема. Оставьте то же название — и кнопка солнце/луна будет переключать их.',
  en: 'Colours are recomputed for the other mode and you get a separate theme. Keep the same name and the sun/moon button will switch between them.',
  bg: 'Цветовете се преизчисляват за другия режим и се получава отделна тема. Оставете същото име — и бутонът слънце/луна ще ги превключва.',
  uk: 'Кольори перерахуються під інший режим і вийде окрема тема. Залиште ту саму назву — і кнопка сонце/місяць перемикатиме їх.',
  be: 'Колеры пералічацца пад іншы рэжым і атрымаецца асобная тэма. Пакіньце тую ж назву — і кнопка сонца/месяц будзе перамыкаць іх.',
});
define('themes.applied', {
  ru: 'Тема «{name}» включена.',
  en: 'Theme “{name}” is on.',
  bg: 'Темата „{name}“ е включена.',
  uk: 'Тему «{name}» увімкнено.',
  be: 'Тэму «{name}» уключана.',
});
define('themes.colorCanvas', { ru: 'Фон приложения', en: 'App background', bg: 'Фон на приложението', uk: 'Фон застосунку', be: 'Фон дастасунку' });
define('themes.colorSurface', { ru: 'Панели и шапки', en: 'Panels and headers', bg: 'Панели и горни ленти', uk: 'Панелі та шапки', be: 'Панэлі і шапкі' });
define('themes.colorElevated', { ru: 'Всплывающие меню', en: 'Pop-up menus', bg: 'Изскачащи менюта', uk: 'Спливні меню', be: 'Усплывальныя меню' });
define('themes.colorInk', { ru: 'Основной текст', en: 'Main text', bg: 'Основен текст', uk: 'Основний текст', be: 'Асноўны тэкст' });
define('themes.colorMuted', { ru: 'Подписи', en: 'Captions', bg: 'Надписи', uk: 'Підписи', be: 'Подпісы' });
define('themes.colorLine', { ru: 'Границы', en: 'Borders', bg: 'Граници', uk: 'Межі', be: 'Мяжы' });
define('themes.colorBrand', { ru: 'Акцент', en: 'Accent', bg: 'Акцент', uk: 'Акцент', be: 'Акцэнт' });
define('themes.colorBrandSoft', { ru: 'Мягкий акцент', en: 'Soft accent', bg: 'Мек акцент', uk: 'М’який акцент', be: 'Мяккі акцэнт' });
define('themes.colorAccent', { ru: 'Дополнительный цвет', en: 'Secondary colour', bg: 'Допълнителен цвят', uk: 'Додатковий колір', be: 'Дадатковы колер' });
define('themes.colorChatBg', { ru: 'Фон переписки', en: 'Chat background', bg: 'Фон на разговора', uk: 'Фон переписки', be: 'Фон перапіскі' });
define('themes.colorBubbleOut', { ru: 'Свои сообщения', en: 'Your messages', bg: 'Вашите съобщения', uk: 'Свої повідомлення', be: 'Свае паведамленні' });
define('themes.fontSystem', { ru: 'Системный', en: 'System', bg: 'Системен', uk: 'Системний', be: 'Сістэмны' });
define('themes.fontRounded', { ru: 'Округлый', en: 'Rounded', bg: 'Заоблен', uk: 'Округлий', be: 'Акруглы' });
define('themes.fontSerif', { ru: 'С засечками', en: 'Serif', bg: 'Със серифи', uk: 'Із засічками', be: 'З засечкамі' });
define('themes.fontMono', { ru: 'Моноширинный', en: 'Monospace', bg: 'Моноширинен', uk: 'Моноширинний', be: 'Манашрыфтавы' });
define('themes.presetLight', { ru: 'Светлая', en: 'Light', bg: 'Светла', uk: 'Світла', be: 'Светлая' });
define('themes.presetDark', { ru: 'Тёмная', en: 'Dark', bg: 'Тъмна', uk: 'Темна', be: 'Цёмная' });
define('themes.presetEmerald', { ru: 'Изумруд', en: 'Emerald', bg: 'Изумруд', uk: 'Смарагд', be: 'Смарагд' });
define('themes.presetEmeraldNight', { ru: 'Изумруд (ночь)', en: 'Emerald (night)', bg: 'Изумруд (нощ)', uk: 'Смарагд (ніч)', be: 'Смарагд (ноч)' });
define('themes.presetRose', { ru: 'Розовая', en: 'Rose', bg: 'Розова', uk: 'Рожева', be: 'Ружовая' });
define('themes.presetRoseNight', { ru: 'Розовая (ночь)', en: 'Rose (night)', bg: 'Розова (нощ)', uk: 'Рожева (ніч)', be: 'Ружовая (ноч)' });
define('themes.presetSepia', { ru: 'Сепия', en: 'Sepia', bg: 'Сепия', uk: 'Сепія', be: 'Сепія' });
define('themes.presetSepiaNight', { ru: 'Сепия (ночь)', en: 'Sepia (night)', bg: 'Сепия (нощ)', uk: 'Сепія (ніч)', be: 'Сепія (ноч)' });
define('themes.presetMidnight', { ru: 'Полночь', en: 'Midnight', bg: 'Полунощ', uk: 'Опівніч', be: 'Поўнач' });
define('themes.presetMidnightDay', { ru: 'Полночь (день)', en: 'Midnight (day)', bg: 'Полунощ (ден)', uk: 'Опівніч (день)', be: 'Поўнач (дзень)' });
define('themes.presetSunset', { ru: 'Закат', en: 'Sunset', bg: 'Залез', uk: 'Захід', be: 'Захад' });
define('themes.presetSunsetNight', { ru: 'Закат (ночь)', en: 'Sunset (night)', bg: 'Залез (нощ)', uk: 'Захід (ніч)', be: 'Захад (ноч)' });
define('themes.presetAurora', { ru: 'Аврора', en: 'Aurora', bg: 'Аврора', uk: 'Аврора', be: 'Аўрора' });
define('themes.presetAuroraDay', { ru: 'Аврора (день)', en: 'Aurora (day)', bg: 'Аврора (ден)', uk: 'Аврора (день)', be: 'Аўрора (дзень)' });
define('themes.presetOcean', { ru: 'Океан', en: 'Ocean', bg: 'Океан', uk: 'Океан', be: 'Акіян' });
define('themes.presetOceanNight', { ru: 'Океан (ночь)', en: 'Ocean (night)', bg: 'Океан (нощ)', uk: 'Океан (ніч)', be: 'Акіян (ноч)' });

define('themes.filterLabel', { ru: 'Показать', en: 'Show', bg: 'Покажи', uk: 'Показати', be: 'Паказаць' });
define('themes.filterAll', { ru: 'Все темы', en: 'All themes', bg: 'Всички теми', uk: 'Усі теми', be: 'Усе тэмы' });
define('themes.filterLight', { ru: 'Светлые', en: 'Light', bg: 'Светли', uk: 'Світлі', be: 'Светлыя' });
define('themes.filterDark', { ru: 'Тёмные', en: 'Dark', bg: 'Тъмни', uk: 'Темні', be: 'Цёмныя' });
define('themes.sectionLight', { ru: 'Светлые темы', en: 'Light themes', bg: 'Светли теми', uk: 'Світлі теми', be: 'Светлыя тэмы' });
define('themes.sectionDark', { ru: 'Тёмные темы', en: 'Dark themes', bg: 'Тъмни теми', uk: 'Темні теми', be: 'Цёмныя тэмы' });
define('themes.wallpapersTab', { ru: 'Обои', en: 'Wallpapers', bg: 'Тапети', uk: 'Шпалери', be: 'Шпалеры' });
define('themes.wallpapersHint', {
  ru: 'Фоновая картинка для чата — выберите готовую или загрузите свою в профиле.',
  en: 'A background image for the chat — pick a ready-made one or upload your own from the profile.',
  bg: 'Фонова картинка за чата — изберете готова или качете своя в профила.',
  uk: 'Фонова картинка для чату — виберіть готову або завантажте свою в профілі.',
  be: 'Фонавая карцінка для чата — абярыце гатовую ці загрузіце сваю ў профілі.',
});
define('themes.wallpapersClear', { ru: 'Без обоев', en: 'No wallpaper', bg: 'Без тапет', uk: 'Без шпалер', be: 'Без шпалер' });
define('themes.wallpaperApplied', {
  ru: 'Обои «{name}» включены.',
  en: 'Wallpaper "{name}" enabled.',
  bg: 'Тапет „{name}“ е включен.',
  uk: 'Шпалери «{name}» увімкнено.',
  be: 'Шпалеры «{name}» уключаны.',
});
// Названия встроенных обоев. Отдельные ключи, а не названия тем: у обоев свой
// набор цветов (синий есть только здесь), и менять название темы не должно
// переименовывать картинку.
define('themes.imageBlue', { ru: 'Синие', en: 'Blue', bg: 'Сини', uk: 'Сині', be: 'Сінія' });
define('themes.imageEmerald', { ru: 'Изумрудные', en: 'Emerald', bg: 'Изумрудни', uk: 'Смарагдові', be: 'Смарагдавыя' });
define('themes.imageRose', { ru: 'Розовые', en: 'Rose', bg: 'Розови', uk: 'Рожеві', be: 'Ружовыя' });
define('themes.imageSepia', { ru: 'Сепия', en: 'Sepia', bg: 'Сепия', uk: 'Сепія', be: 'Сепія' });
define('themes.imageMidnight', { ru: 'Полночь', en: 'Midnight', bg: 'Полунощ', uk: 'Опівніч', be: 'Поўнач' });
define('themes.imageSunset', { ru: 'Закат', en: 'Sunset', bg: 'Залез', uk: 'Захід', be: 'Захад' });
define('themes.imageAurora', { ru: 'Аврора', en: 'Aurora', bg: 'Аврора', uk: 'Аврора', be: 'Аўрора' });
define('themes.imageOcean', { ru: 'Океан', en: 'Ocean', bg: 'Океан', uk: 'Океан', be: 'Акіян' });
// У каждого цвета две палитры: светлая и тёмная. Тёмная — для тёмных тем:
// светлая картинка на тёмном интерфейсе выглядит серой пеленой.
define('themes.imageLightGroup', { ru: 'Светлые', en: 'Light', bg: 'Светли', uk: 'Світлі', be: 'Светлыя' });
define('themes.imageDarkGroup', { ru: 'Тёмные', en: 'Dark', bg: 'Тъмни', uk: 'Темні', be: 'Цёмныя' });
define('themes.imageDarkName', {
  ru: '{name} (тёмные)',
  en: '{name} (dark)',
  bg: '{name} (тъмни)',
  uk: '{name} (темні)',
  be: '{name} (цёмныя)',
});
define('profile.bannerBuiltIn', {
  ru: 'Готовые баннеры',
  en: 'Ready-made banners',
  bg: 'Готови банери',
  uk: 'Готові банери',
  be: 'Гатовыя банеры',
});
define('themes.gradient', { ru: 'Градиент', en: 'Gradient', bg: 'Градиент', uk: 'Градієнт', be: 'Градыент' });
define('themes.gradientHint', {
  ru: 'Эти цвета переливаются на фоне переписки и в шапке списка чатов. От двух до пяти.',
  en: 'These colours flow across the chat background and the chat-list header. Two to five of them.',
  bg: 'Тези цветове се леят по фона на чата и в заглавната лента на списъка с чатове. От два до пет.',
  uk: 'Ці кольори переливаються на тлі переписки та в шапці списку чатів. Від двох до п’яти.',
  be: 'Гэтыя колеры пераліваюцца на фоне перапіскі і ў шапцы спісу чатаў. Ад двух да пяці.',
});
define('themes.gradientColor', {
  ru: 'Цвет {number}',
  en: 'Colour {number}',
  bg: 'Цвят {number}',
  uk: 'Колір {number}',
  be: 'Колер {number}',
});
define('themes.gradientRemove', {
  ru: 'Убрать цвет {number}',
  en: 'Remove colour {number}',
  bg: 'Премахни цвят {number}',
  uk: 'Прибрати колір {number}',
  be: 'Прыбраць колер {number}',
});
define('themes.gradientAdd', { ru: 'Добавить цвет', en: 'Add a colour', bg: 'Добави цвят', uk: 'Додати колір', be: 'Дадаць колер' });
define('themes.gradientAnimated', { ru: 'Перелив', en: 'Flowing', bg: 'Леене', uk: 'Перелив', be: 'Пераліў' });
define('themes.gradientAnimatedHint', {
  ru: 'Цвета плавно перетекают друг в друга. Выключено — стоят на месте.',
  en: 'The colours glide into one another. Switched off, they stay still.',
  bg: 'Цветовете плавно преливат един в друг. Изключено — стоят на място.',
  uk: 'Кольори плавно перетікають один в одного. Вимкнено — стоять на місці.',
  be: 'Колеры плаўна перацякаюць адзін у аднаго. Выключана — стаяць на месцы.',
});

// ---- Установка приложения (PWA) ----
define('settings.install', { ru: 'Установить приложение', en: 'Install the app', bg: 'Инсталиране на приложението', uk: 'Встановити застосунок', be: 'Усталяваць дастасунак' });
define('install.title', { ru: 'Установить приложение', en: 'Install the app', bg: 'Инсталиране на приложението', uk: 'Встановити застосунок', be: 'Усталяваць дастасунак' });
define('install.lead', {
  ru: 'Yargram можно установить как обычную программу: значок появится на рабочем столе или в меню, а окно браузера с адресной строкой больше не понадобится.',
  en: 'Yargram can be installed like a regular program: an icon appears on your desktop or in the menu, and the browser window with the address bar is no longer needed.',
  bg: 'Yargram може да се инсталира като обикновена програма: иконата се появява на работния плот или в менюто, а прозорецът на браузъра с адресната лента вече не е нужен.',
  uk: 'Yargram можна встановити як звичайну програму: значок з’явиться на робочому столі або в меню, а вікно браузера з адресним рядком більше не знадобиться.',
  be: 'Yargram можна ўсталяваць як звычайную праграму: значок з’явіцца на працоўным стале або ў меню, а акно браўзера з адрасным радком больш не спатрэбіцца.',
});
define('install.button', { ru: 'Установить', en: 'Install', bg: 'Инсталирай', uk: 'Встановити', be: 'Усталяваць' });
define('install.browserAsks', {
  ru: 'Дальше браузер сам спросит подтверждение — согласиться или отказаться решаете вы.',
  en: 'Your browser will ask you to confirm next — whether to agree or decline is up to you.',
  bg: 'След това браузърът сам ще поиска потвърждение — да се съгласите или да откажете решавате вие.',
  uk: 'Далі браузер сам запита підтвердження — погодитися чи відмовитися вирішуєте ви.',
  be: 'Далей браўзер сам запытае пацверджанне — пагадзіцца ці адмовіцца вырашаеце вы.',
});
define('install.alreadyInstalled', {
  ru: 'Приложение уже установлено — открывайте его со значка.',
  en: 'The app is already installed — open it from its icon.',
  bg: 'Приложението вече е инсталирано — отваряйте го от иконата.',
  uk: 'Застосунок уже встановлено — відкривайте його зі значка.',
  be: 'Дастасунак ужо ўсталяваны — адкрывайце яго са значка.',
});
define('install.manualTitle', {
  ru: 'Этот браузер не предлагает установку сам',
  en: 'This browser does not offer installation on its own',
  bg: 'Този браузър не предлага инсталиране сам',
  uk: 'Цей браузер не пропонує встановлення сам',
  be: 'Гэты браўзер не прапануе ўсталяванне сам',
});
define('install.manualHint', {
  ru: 'На компьютере откройте меню браузера и выберите «Установить приложение» — или найдите значок установки справа в адресной строке.',
  en: 'On a computer, open the browser menu and choose “Install app” — or look for the install icon on the right of the address bar.',
  bg: 'На компютър отворете менюто на браузъра и изберете „Инсталиране на приложение“ — или потърсете иконата за инсталиране вдясно в адресната лента.',
  uk: 'На комп’ютері відкрийте меню браузера та виберіть «Встановити застосунок» — або знайдіть значок встановлення праворуч в адресному рядку.',
  be: 'На камп’ютары адкрыйце меню браўзера і выберыце «Усталяваць дастасунак» — або знайдзіце значок усталявання справа ў адрасным радку.',
});
define('install.manualIos', {
  ru: 'На iPhone и iPad: кнопка «Поделиться», затем «На экран „Домой“».',
  en: 'On iPhone and iPad: the Share button, then “Add to Home Screen”.',
  bg: 'На iPhone и iPad: бутонът „Споделяне“, след това „На началния екран“.',
  uk: 'На iPhone та iPad: кнопка «Поділитися», потім «На екран „Домівка“».',
  be: 'На iPhone і iPad: кнопка «Падзяліцца», потым «На экран „Дом“».',
});
define('install.failed', {
  ru: 'Браузер уже не предлагает установку. Обновите страницу и попробуйте снова.',
  en: 'The browser no longer offers installation. Reload the page and try again.',
  bg: 'Браузърът вече не предлага инсталиране. Презаредете страницата и опитайте пак.',
  uk: 'Браузер уже не пропонує встановлення. Оновіть сторінку та спробуйте знову.',
  be: 'Браўзер ужо не прапануе ўсталяванне. Абнавіце старонку і паспрабуйце зноў.',
});
define('install.why', {
  ru: 'Установка бесплатна и занимает пару секунд. Приложение обновляется само — обновлять вручную не нужно.',
  en: 'Installation is free and takes a couple of seconds. The app updates itself — no manual updating needed.',
  bg: 'Инсталирането е безплатно и отнема няколко секунди. Приложението се обновява само — не е нужно ръчно обновяване.',
  uk: 'Встановлення безкоштовне й займає пару секунд. Застосунок оновлюється сам — оновлювати вручну не потрібно.',
  be: 'Усталяванне бясплатнае і займае пару секунд. Дастасунак абнаўляецца сам — абнаўляць уручную не трэба.',
});

export interface TranslateModule {
  t: TranslateFn;
  language: Language;
}
