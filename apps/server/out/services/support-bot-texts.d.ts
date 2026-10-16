import type { BotKeyboard } from "../domain/models.js";
/**
 * Тексты и кнопки бота поддержки — на языке того, кто к нему обратился.
 *
 * 🔥 Тексты живут на сервере, а не в клиентском `i18n.ts`, потому что бот
 * пишет их в переписку **навсегда**: сообщение остаётся в истории, даже если
 * человек потом сменит язык интерфейса. Так же устроены служебные сообщения о
 * звонках («Звонок отклонён» и прочие) — они тоже лежат на сервере.
 *
 * 🔥 Язык берётся из аккаунта (`User.language`), а не из запроса: клиент
 * сообщает его при смене языка в настройках, и сервер помнит выбор. Поэтому
 * бот говорит на том же языке, что и кнопки вокруг него.
 *
 * Смена языка переписку не переписывает: старые сообщения остаются теми, какими
 * их отправили, — как и в клиентском словаре, где готовый текст уже не меняется.
 */
/** Ник служебного аккаунта бота. По нему его и находят, и создают скриптом. */
export declare const SUPPORT_BOT_USERNAME = "YargramSupport_Bot";
/** Имя служебного аккаунта в интерфейсе. */
export declare const SUPPORT_BOT_DISPLAY_NAME = "Yargram Support";
/** Название служебной группы, куда бот пересылает обращения. */
export declare const SUPPORT_INBOX_TITLE = "Yargram \u00B7 \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430";
/**
 * Код действия кнопки. Клиент не пишет его в чат, а отправляет серверу
 * отдельным запросом — поэтому в истории не остаётся «нажатий».
 */
export declare const SUPPORT_ACTION: {
    readonly menu: "menu";
    readonly error: "cat:error";
    readonly idea: "cat:idea";
    readonly other: "cat:other";
    readonly cancel: "cancel";
};
/**
 * Уточнения внутри раздела «Ошибка». Ключ — код действия кнопки, значение —
 * короткий код темы, который уезжает владельцам в обращении.
 */
export declare const SUPPORT_ERROR_TOPICS: Record<string, string>;
/**
 * Языки, на которых говорит бот. Совпадают с языками интерфейса, кроме
 * греческого: интерфейс на нём тоже падает на английский (см. `define` в
 * `apps/web/src/lib/i18n.ts`), и бот не должен опережать интерфейс.
 */
export declare const supportLanguages: readonly ["ru", "en", "bg", "uk", "be"];
export type SupportLanguage = (typeof supportLanguages)[number];
/**
 * Язык бота по языку интерфейса из аккаунта. Незаданный и незнакомый — русский,
 * греческий — английский: ровно то же правило, что и у клиентских словарей.
 */
export declare function supportLanguageOf(value: string | null | undefined): SupportLanguage;
/**
 * Команда запуска бота.
 *
 * 🔥 Бот не пишет первым: под пустой перепиской клиент показывает широкую
 * кнопку «СТАРТ» (как в Telegram), и она отправляет эту команду обычным
 * сообщением. Пока человек не нажал — в истории пусто, и «приветствие»,
 * которого он не просил, не появляется.
 *
 * `/menu` — тот же запуск: так команду зовут, когда меню нужно вернуть.
 */
export declare function isSupportStartCommand(text: string): boolean;
/** Команда отмены: то же, что кнопка «Отмена» под подсказкой. */
export declare function isSupportCancelCommand(text: string): boolean;
/** Команда справки: короткий список того, что бот умеет. */
export declare function isSupportHelpCommand(text: string): boolean;
/**
 * Похоже ли сообщение на команду. Так бот отличает «/start» от текста «старт»:
 * без ведущей косой черты это обычное слово, а не команда, — и набирать «start»
 * вместо «/start» бот не станет угадывать.
 */
export declare function isSupportCommand(text: string): boolean;
/**
 * Ключи всех текстов бота. Один список на все языки: забытый перевод виден
 * сразу — без него объект языка просто не соберётся.
 */
type SupportKey = "welcome" | "menu" | "errorPrompt" | "ideaPrompt" | "otherPrompt" | "describePrompt" | "cancelled" | "askPrompt" | "accepted" | "followUpAccepted" | "help" | "unknownCommand" | "noText" | "noDetails" | "ownerReply" | "ticket" | "btnError" | "btnIdea" | "btnOther" | "btnBack" | "btnCancel" | "btnAsk";
/**
 * Тексты бота на одном языке. Функция, а не объект: язык приходит из аккаунта,
 * и один и тот же сервис обслуживает людей на разных языках одновременно.
 */
export declare function supportTexts(language: SupportLanguage): {
    /** Любой одиночный текст: `texts.text('menu')`. */
    text: (key: SupportKey, params?: Record<string, string>) => string;
    welcome: string;
    menu: string;
    errorPrompt: string;
    ideaPrompt: string;
    otherPrompt: string;
    describePrompt: string;
    cancelled: string;
    askPrompt: (code: string) => string;
    help: string;
    noText: string;
    noDetails: string;
    /** «Такой команды я не знаю» вместе со справкой: без неё подсказка пустая. */
    unknownCommand: string;
    accepted: (code: string) => string;
    followUpAccepted: (code: string) => string;
    /** Ответ владельца: человек должен видеть, кто именно ему ответил. */
    ownerReply: (ownerName: string, code: string, body: string) => string;
    /** Обращение в служебной группе. */
    ticket: (input: {
        displayName: string;
        username: string | null;
        section: string;
        code: string;
        details: string;
    }) => string;
};
export type SupportTexts = ReturnType<typeof supportTexts>;
/** Человеческая подпись раздела для обращения. */
export declare function supportSectionLabel(language: SupportLanguage, category: string, topic?: string | undefined): string;
/** Главное меню бота. */
export declare function supportMenuKeyboard(language: SupportLanguage): BotKeyboard;
/** Уточнения раздела «Ошибка». */
export declare function supportErrorKeyboard(language: SupportLanguage): BotKeyboard;
/** Ожидание описания: единственная кнопка — отмена. */
export declare function supportCancelKeyboard(language: SupportLanguage): BotKeyboard;
/**
 * Начало кода действия «спросить ещё». Дальше идут номер обращения, раздел и
 * (если есть) тема — через двоеточие.
 */
export declare const SUPPORT_ASK_PREFIX = "ask:";
/**
 * Клавиатура под ответом владельца: меню плюс «Спросить ещё».
 *
 * 🔥 Кнопка нужна потому, что ответ не всегда понятен, а человек в этот момент
 * видит перед собой готовые кнопки и не догадывается, что можно просто написать
 * ещё раз. Нажатие переводит бота в тот же раздел, и дополнение уходит
 * владельцам тем же обращением — без нового номера и без потери истории.
 *
 * 🔥 Номер и раздел едут **в самой кнопке**, а не в памяти сервера: состояние
 * переживает перезапуск, и старая кнопка в истории продолжает работать.
 */
export declare function supportReplyKeyboard(language: SupportLanguage, ticket: {
    code: string;
    category: string;
    topic?: string | undefined;
}): BotKeyboard;
/** Разбор кода действия «спросить ещё». `null` — код чужой или испорченный. */
export declare function parseAskAction(action: string): {
    code: string;
    category: string;
    topic?: string | undefined;
} | null;
export {};
