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
export const SUPPORT_BOT_USERNAME = "YargramSupport_Bot";
/** Имя служебного аккаунта в интерфейсе. */
export const SUPPORT_BOT_DISPLAY_NAME = "Yargram Support";
/** Название служебной группы, куда бот пересылает обращения. */
export const SUPPORT_INBOX_TITLE = "Yargram · Поддержка";

/**
 * Код действия кнопки. Клиент не пишет его в чат, а отправляет серверу
 * отдельным запросом — поэтому в истории не остаётся «нажатий».
 */
export const SUPPORT_ACTION = {
  menu: "menu",
  error: "cat:error",
  idea: "cat:idea",
  other: "cat:other",
  cancel: "cancel",
} as const;

/**
 * Уточнения внутри раздела «Ошибка». Ключ — код действия кнопки, значение —
 * короткий код темы, который уезжает владельцам в обращении.
 */
export const SUPPORT_ERROR_TOPICS: Record<string, string> = {
  "err:code": "code",
  "err:login": "login",
  "err:messages": "messages",
  "err:calls": "calls",
  "err:other": "other",
};

/**
 * Языки, на которых говорит бот. Совпадают с языками интерфейса, кроме
 * греческого: интерфейс на нём тоже падает на английский (см. `define` в
 * `apps/web/src/lib/i18n.ts`), и бот не должен опережать интерфейс.
 */
export const supportLanguages = ["ru", "en", "bg", "uk", "be"] as const;
export type SupportLanguage = (typeof supportLanguages)[number];

/**
 * Язык бота по языку интерфейса из аккаунта. Незаданный и незнакомый — русский,
 * греческий — английский: ровно то же правило, что и у клиентских словарей.
 */
export function supportLanguageOf(value: string | null | undefined): SupportLanguage {
  // «en-US» и «en_US» — тот же английский: регион языку не мешает.
  const code = (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (code === "en" || code === "bg" || code === "uk" || code === "be") return code;
  if (code === "el") return "en";
  return "ru";
}

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
export function isSupportStartCommand(text: string): boolean {
  const command = commandOf(text);
  return command === "start" || command === "menu";
}

/** Команда отмены: то же, что кнопка «Отмена» под подсказкой. */
export function isSupportCancelCommand(text: string): boolean {
  return commandOf(text) === "cancel";
}

/** Команда справки: короткий список того, что бот умеет. */
export function isSupportHelpCommand(text: string): boolean {
  return commandOf(text) === "help";
}

/**
 * Похоже ли сообщение на команду. Так бот отличает «/start» от текста «старт»:
 * без ведущей косой черты это обычное слово, а не команда, — и набирать «start»
 * вместо «/start» бот не станет угадывать.
 */
export function isSupportCommand(text: string): boolean {
  return commandOf(text) !== "";
}

/**
 * Команда из начала сообщения, без косой черты и адресата. Пустая строка —
 * сообщение командой не является.
 */
function commandOf(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  if (!first.startsWith("/")) return "";
  // `/start@YargramSupport_Bot` — та же команда, только с адресатом: в личной
  // переписке адресат лишний, но клиенты его иногда дописывают.
  return first.slice(1).split("@")[0]?.toLowerCase() ?? "";
}

/**
 * Ключи всех текстов бота. Один список на все языки: забытый перевод виден
 * сразу — без него объект языка просто не соберётся.
 */
type SupportKey =
  | "welcome"
  | "menu"
  | "errorPrompt"
  | "ideaPrompt"
  | "otherPrompt"
  | "describePrompt"
  | "cancelled"
  | "askPrompt"
  | "accepted"
  | "followUpAccepted"
  | "help"
  | "unknownCommand"
  | "noText"
  | "noDetails"
  | "ownerReply"
  | "ticket"
  | "btnError"
  | "btnIdea"
  | "btnOther"
  | "btnBack"
  | "btnCancel"
  | "btnAsk";

/**
 * Тексты по языкам.
 *
 * `{code}` — номер обращения, `{name}` — кто ответил, `{text}` — сам ответ,
 * `{section}` — раздел, `{details}` — описание от человека, `{language}` — код
 * языка обращения, `{handle}` — « (@ник)» или пустая строка.
 */
const TEXTS: Record<SupportLanguage, Record<SupportKey, string>> = {
  ru: {
    welcome: [
      "👋 Здравствуйте! Это бот поддержки Yargram.",
      "",
      "Выберите, что случилось, — обращение уйдёт владельцам, и они ответят вам здесь.",
    ].join("\n"),
    menu: "Чем помочь?",
    errorPrompt: "Уточните, что именно не работает:",
    ideaPrompt: "Напишите, что хотите добавить или изменить, — одним сообщением.",
    otherPrompt: "Опишите вопрос одним сообщением.",
    describePrompt: "Опишите подробнее одним сообщением — так владельцам будет понятнее.",
    cancelled: "Хорошо, отменил. Если понадобится — выберите пункт заново.",
    askPrompt: "Напишите, что уточнить по обращению {code}, — владельцы увидят это там же.",
    noDetails: "Без описания — всё видно на приложенном файле.",
    accepted: [
      "✅ Передал обращение владельцам.",
      "",
      "Номер обращения: {code}.",
      "Ответ придёт сюда же. Если что-то останется непонятным — просто напишите здесь ещё раз.",
    ].join("\n"),
    followUpAccepted: [
      "✅ Передал дополнение владельцам.",
      "",
      "Номер обращения: {code}. Ответ придёт сюда же.",
    ].join("\n"),
    help: [
      "Что я умею:",
      "",
      "🐞 Ошибка — сообщить, что не работает.",
      "💡 Идея — предложить улучшение.",
      "❓ Другое — задать любой вопрос.",
      "",
      "Кнопки живут под сообщением с меню. Если ответ владельцев оказался непонятным — просто напишите ещё раз, обращение уйдёт снова.",
    ].join("\n"),
    unknownCommand: "Такой команды я не знаю. Вот что я умею:",
    noText:
      "В сообщении нет текста, а описать словами нужно. Напишите одним сообщением, что случилось, — файлы можно приложить к нему же.",
    ownerReply: [
      "💬 Ответ от {name}",
      "",
      "Обращение {code}.",
      "",
      "{text}",
      "",
      "Если ответ непонятен — напишите ещё раз, обращение уйдёт владельцам снова.",
    ].join("\n"),
    ticket: [
      "🎫 Новое обращение {code}",
      "",
      "👤 {name}{handle}",
      "🗂 {section}",
      "🌐 {language}",
      "",
      "{details}",
      "",
      "↩️ Ответьте на это сообщение — ответ уйдёт человеку от вашего имени.",
    ].join("\n"),
    btnError: "🐞 Ошибка",
    btnIdea: "💡 Идея",
    btnOther: "❓ Другое",
    btnBack: "⬅️ Назад",
    btnCancel: "⬅️ Отмена",
    btnAsk: "✍️ Спросить ещё",
  },

  en: {
    welcome: [
      "👋 Hello! This is the Yargram support bot.",
      "",
      "Pick what happened — your request goes to the owners, and they will answer you right here.",
    ].join("\n"),
    menu: "How can I help?",
    errorPrompt: "Tell me what exactly is not working:",
    ideaPrompt: "Describe what you would like to add or change, in one message.",
    otherPrompt: "Describe your question in one message.",
    describePrompt: "Describe it in a little more detail in one message — that makes it clearer for the owners.",
    cancelled: "Alright, cancelled. Pick an item again whenever you need it.",
    askPrompt: "Write what needs clarifying about request {code} — the owners will see it in the same place.",
    noDetails: "No description — the attached file speaks for itself.",
    accepted: [
      "✅ Sent to the owners.",
      "",
      "Request number: {code}.",
      "The answer will arrive here. If anything stays unclear, just write here again.",
    ].join("\n"),
    followUpAccepted: [
      "✅ Sent your addition to the owners.",
      "",
      "Request number: {code}. The answer will arrive here.",
    ].join("\n"),
    help: [
      "What I can do:",
      "",
      "🐞 Bug — report something that is broken.",
      "💡 Idea — suggest an improvement.",
      "❓ Other — ask any question.",
      "",
      "The buttons live under the menu message. If the owners' answer was unclear, just write again — the request goes out anew.",
    ].join("\n"),
    unknownCommand: "I do not know that command. Here is what I can do:",
    noText:
      "Your message has no text, and a description is what is needed. Write in one message what happened — files can be attached to it.",
    ownerReply: [
      "💬 Answer from {name}",
      "",
      "Request {code}.",
      "",
      "{text}",
      "",
      "If the answer is unclear, write again — the request goes out to the owners anew.",
    ].join("\n"),
    ticket: [
      "🎫 New request {code}",
      "",
      "👤 {name}{handle}",
      "🗂 {section}",
      "🌐 {language}",
      "",
      "{details}",
      "",
      "↩️ Reply to this message — the answer goes to the person under your name.",
    ].join("\n"),
    btnError: "🐞 Bug",
    btnIdea: "💡 Idea",
    btnOther: "❓ Other",
    btnBack: "⬅️ Back",
    btnCancel: "⬅️ Cancel",
    btnAsk: "✍️ Ask again",
  },

  bg: {
    welcome: [
      "👋 Здравейте! Това е ботът за поддръжка на Yargram.",
      "",
      "Изберете какво се е случило — обръщението отива при собствениците и те ще отговорят тук.",
    ].join("\n"),
    menu: "С какво да помогна?",
    errorPrompt: "Уточнете какво точно не работи:",
    ideaPrompt: "Напишете какво искате да добавим или променим — с едно съобщение.",
    otherPrompt: "Опишете въпроса с едно съобщение.",
    describePrompt: "Опишете по-подробно с едно съобщение — така на собствениците ще е по-ясно.",
    cancelled: "Добре, отказах. Ако потрябва — изберете отново.",
    askPrompt: "Напишете какво да уточним по обръщение {code} — собствениците ще го видят там.",
    noDetails: "Без описание — всичко се вижда на прикачения файл.",
    accepted: [
      "✅ Предадох обръщението на собствениците.",
      "",
      "Номер на обръщението: {code}.",
      "Отговорът ще дойде тук. Ако нещо остане неясно — просто пишете отново тук.",
    ].join("\n"),
    followUpAccepted: [
      "✅ Предадох допълнението на собствениците.",
      "",
      "Номер на обръщението: {code}. Отговорът ще дойде тук.",
    ].join("\n"),
    help: [
      "Какво мога:",
      "",
      "🐞 Грешка — да съобщите какво не работи.",
      "💡 Идея — да предложите подобрение.",
      "❓ Друго — да зададете всякакъв въпрос.",
      "",
      "Бутоните са под съобщението с менюто. Ако отговорът на собствениците е неясен, просто пишете отново — обръщението тръгва наново.",
    ].join("\n"),
    unknownCommand: "Не познавам такава команда. Ето какво мога:",
    noText:
      "Съобщението няма текст, а трябва описание. Напишете с едно съобщение какво се е случило — файлове можете да прикачите към него.",
    ownerReply: [
      "💬 Отговор от {name}",
      "",
      "Обръщение {code}.",
      "",
      "{text}",
      "",
      "Ако отговорът е неясен — пишете отново, обръщението тръгва при собствениците наново.",
    ].join("\n"),
    ticket: [
      "🎫 Ново обръщение {code}",
      "",
      "👤 {name}{handle}",
      "🗂 {section}",
      "🌐 {language}",
      "",
      "{details}",
      "",
      "↩️ Отговорете на това съобщение — отговорът отива при човека от ваше име.",
    ].join("\n"),
    btnError: "🐞 Грешка",
    btnIdea: "💡 Идея",
    btnOther: "❓ Друго",
    btnBack: "⬅️ Назад",
    btnCancel: "⬅️ Отказ",
    btnAsk: "✍️ Питай пак",
  },

  uk: {
    welcome: [
      "👋 Вітаю! Це бот підтримки Yargram.",
      "",
      "Виберіть, що сталося, — звернення піде власникам, і вони відповідять вам тут.",
    ].join("\n"),
    menu: "Чим допомогти?",
    errorPrompt: "Уточніть, що саме не працює:",
    ideaPrompt: "Напишіть, що хочете додати або змінити, — одним повідомленням.",
    otherPrompt: "Опишіть питання одним повідомленням.",
    describePrompt: "Опишіть докладніше одним повідомленням — так власникам буде зрозуміліше.",
    cancelled: "Гаразд, скасував. Якщо потрібно — виберіть пункт заново.",
    askPrompt: "Напишіть, що уточнити щодо звернення {code}, — власники побачать це там же.",
    noDetails: "Без опису — усе видно на прикріпленому файлі.",
    accepted: [
      "✅ Передав звернення власникам.",
      "",
      "Номер звернення: {code}.",
      "Відповідь прийде сюди. Якщо щось залишиться незрозумілим — просто напишіть тут ще раз.",
    ].join("\n"),
    followUpAccepted: [
      "✅ Передав доповнення власникам.",
      "",
      "Номер звернення: {code}. Відповідь прийде сюди.",
    ].join("\n"),
    help: [
      "Що я вмію:",
      "",
      "🐞 Помилка — повідомити, що не працює.",
      "💡 Ідея — запропонувати покращення.",
      "❓ Інше — поставити будь-яке питання.",
      "",
      "Кнопки — під повідомленням із меню. Якщо відповідь власників була незрозумілою, просто напишіть ще раз — звернення піде знову.",
    ].join("\n"),
    unknownCommand: "Такої команди я не знаю. Ось що я вмію:",
    noText:
      "У повідомленні немає тексту, а потрібен опис словами. Напишіть одним повідомленням, що сталося, — файли можна прикріпити до нього.",
    ownerReply: [
      "💬 Відповідь від {name}",
      "",
      "Звернення {code}.",
      "",
      "{text}",
      "",
      "Якщо відповідь незрозуміла — напишіть ще раз, звернення піде власникам знову.",
    ].join("\n"),
    ticket: [
      "🎫 Нове звернення {code}",
      "",
      "👤 {name}{handle}",
      "🗂 {section}",
      "🌐 {language}",
      "",
      "{details}",
      "",
      "↩️ Дайте відповідь на це повідомлення — вона піде людині від вашого імені.",
    ].join("\n"),
    btnError: "🐞 Помилка",
    btnIdea: "💡 Ідея",
    btnOther: "❓ Інше",
    btnBack: "⬅️ Назад",
    btnCancel: "⬅️ Скасувати",
    btnAsk: "✍️ Спитати ще",
  },

  be: {
    welcome: [
      "👋 Вітаю! Гэта бот падтрымкі Yargram.",
      "",
      "Выберыце, што здарылася, — зварот пойдзе ўладальнікам, і яны адкажуць вам тут.",
    ].join("\n"),
    menu: "Чым дапамагчы?",
    errorPrompt: "Удакладніце, што менавіта не працуе:",
    ideaPrompt: "Напішыце, што хочаце дадаць або змяніць, — адным паведамленнем.",
    otherPrompt: "Апішыце пытанне адным паведамленнем.",
    describePrompt: "Апішыце падрабязней адным паведамленнем — так уладальнікам будзе зразумелей.",
    cancelled: "Добра, адмяніў. Калі спатрэбіцца — выберыце пункт нанова.",
    askPrompt: "Напішыце, што ўдакладніць па звароце {code}, — уладальнікі ўбачаць гэта там жа.",
    noDetails: "Без апісання — усё відаць на прымацаваным файле.",
    accepted: [
      "✅ Перадаў зварот уладальнікам.",
      "",
      "Нумар звароту: {code}.",
      "Адказ прыйдзе сюды. Калі нешта застанецца незразумелым — проста напішыце тут яшчэ раз.",
    ].join("\n"),
    followUpAccepted: [
      "✅ Перадаў дапаўненне ўладальнікам.",
      "",
      "Нумар звароту: {code}. Адказ прыйдзе сюды.",
    ].join("\n"),
    help: [
      "Што я ўмею:",
      "",
      "🐞 Памылка — паведаміць, што не працуе.",
      "💡 Ідэя — прапанаваць паляпшэнне.",
      "❓ Іншае — задаць любое пытанне.",
      "",
      "Кнопкі — пад паведамленнем з меню. Калі адказ уладальнікаў быў незразумелым, проста напішыце яшчэ раз — зварот пойдзе зноў.",
    ].join("\n"),
    unknownCommand: "Такой каманды я не ведаю. Вось што я ўмею:",
    noText:
      "У паведамленні няма тэксту, а патрэбна апісанне словамі. Напішыце адным паведамленнем, што здарылася, — файлы можна прымацаваць да яго.",
    ownerReply: [
      "💬 Адказ ад {name}",
      "",
      "Зварот {code}.",
      "",
      "{text}",
      "",
      "Калі адказ незразумелы — напішыце яшчэ раз, зварот пойдзе ўладальнікам зноў.",
    ].join("\n"),
    ticket: [
      "🎫 Новы зварот {code}",
      "",
      "👤 {name}{handle}",
      "🗂 {section}",
      "🌐 {language}",
      "",
      "{details}",
      "",
      "↩️ Адкажыце на гэта паведамленне — адказ пойдзе чалавеку ад вашага імя.",
    ].join("\n"),
    btnError: "🐞 Памылка",
    btnIdea: "💡 Ідэя",
    btnOther: "❓ Іншае",
    btnBack: "⬅️ Назад",
    btnCancel: "⬅️ Скасаваць",
    btnAsk: "✍️ Спытаць яшчэ",
  },
};

/**
 * Подписи разделов обращения. Собираются из общего слова раздела и названия
 * темы: так пять тем не приходится переводить целиком пять раз.
 */
const SECTIONS: Record<
  SupportLanguage,
  { idea: string; other: string; error: string; code: string; login: string; messages: string; calls: string }
> = {
  ru: {
    idea: "Идея / предложение",
    other: "Другое",
    error: "Ошибка",
    code: "Код из письма",
    login: "Вход в аккаунт",
    messages: "Сообщения не отправляются",
    calls: "Звонки",
  },
  en: {
    idea: "Idea / suggestion",
    other: "Other",
    error: "Bug",
    code: "Email code",
    login: "Signing in",
    messages: "Messages are not sent",
    calls: "Calls",
  },
  bg: {
    idea: "Идея / предложение",
    other: "Друго",
    error: "Грешка",
    code: "Код от имейла",
    login: "Влизане в профила",
    messages: "Съобщенията не се изпращат",
    calls: "Обаждания",
  },
  uk: {
    idea: "Ідея / пропозиція",
    other: "Інше",
    error: "Помилка",
    code: "Код з листа",
    login: "Вхід в акаунт",
    messages: "Повідомлення не надсилаються",
    calls: "Дзвінки",
  },
  be: {
    idea: "Ідэя / прапанова",
    other: "Іншае",
    error: "Памылка",
    code: "Код з ліста",
    login: "Уваход у акаўнт",
    messages: "Паведамленні не адпраўляюцца",
    calls: "Званкі",
  },
};

/** Подставляет `{ключ}` значениями. Лишние плейсхолдеры остаются как есть. */
function fill(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] ?? match : match,
  );
}

/**
 * Тексты бота на одном языке. Функция, а не объект: язык приходит из аккаунта,
 * и один и тот же сервис обслуживает людей на разных языках одновременно.
 */
export function supportTexts(language: SupportLanguage) {
  const raw = TEXTS[language];
  const text = (key: SupportKey, params: Record<string, string> = {}): string =>
    fill(raw[key], params);
  return {
    /** Любой одиночный текст: `texts.text('menu')`. */
    text,
    welcome: raw.welcome,
    menu: raw.menu,
    errorPrompt: raw.errorPrompt,
    ideaPrompt: raw.ideaPrompt,
    otherPrompt: raw.otherPrompt,
    describePrompt: raw.describePrompt,
    cancelled: raw.cancelled,
    askPrompt: (code: string): string => text("askPrompt", { code }),
    help: raw.help,
    noText: raw.noText,
    noDetails: raw.noDetails,
    /** «Такой команды я не знаю» вместе со справкой: без неё подсказка пустая. */
    unknownCommand: `${raw.unknownCommand}\n\n${raw.help}`,
    accepted: (code: string): string => text("accepted", { code }),
    followUpAccepted: (code: string): string => text("followUpAccepted", { code }),
    /** Ответ владельца: человек должен видеть, кто именно ему ответил. */
    ownerReply: (ownerName: string, code: string, body: string): string =>
      text("ownerReply", { name: ownerName, code, text: body }),
    /** Обращение в служебной группе. */
    ticket: (input: {
      displayName: string;
      username: string | null;
      section: string;
      code: string;
      details: string;
    }): string =>
      text("ticket", {
        name: input.displayName,
        handle: input.username ? ` (@${input.username})` : "",
        section: input.section,
        // Код языка латиницей: владельцы должны понимать, на каком языке им
        // отвечать, а название языка на самом языке им бы ничего не сказало.
        language: language.toUpperCase(),
        code: input.code,
        details: input.details,
      }),
  };
}

export type SupportTexts = ReturnType<typeof supportTexts>;

/** Человеческая подпись раздела для обращения. */
export function supportSectionLabel(
  language: SupportLanguage,
  category: string,
  topic?: string | undefined,
): string {
  const labels = SECTIONS[language];
  if (category === "idea") return labels.idea;
  if (category !== "error") return labels.other;
  if (topic === undefined) return labels.error;
  const byTopic: Record<string, string | undefined> = {
    code: labels.code,
    login: labels.login,
    messages: labels.messages,
    calls: labels.calls,
  };
  const name = byTopic[topic];
  return name === undefined ? labels.error : `${labels.error} → ${name}`;
}

/** Главное меню бота. */
export function supportMenuKeyboard(language: SupportLanguage): BotKeyboard {
  const raw = TEXTS[language];
  return [
    [
      { label: raw.btnError, action: SUPPORT_ACTION.error },
      { label: raw.btnIdea, action: SUPPORT_ACTION.idea },
    ],
    [{ label: raw.btnOther, action: SUPPORT_ACTION.other }],
  ];
}

/** Уточнения раздела «Ошибка». */
export function supportErrorKeyboard(language: SupportLanguage): BotKeyboard {
  const raw = TEXTS[language];
  const labels = SECTIONS[language];
  return [
    [
      { label: labels.code, action: "err:code" },
      { label: labels.login, action: "err:login" },
    ],
    [
      { label: labels.messages, action: "err:messages" },
      { label: labels.calls, action: "err:calls" },
    ],
    [
      { label: labels.other, action: "err:other" },
      { label: raw.btnBack, action: SUPPORT_ACTION.menu },
    ],
  ];
}

/** Ожидание описания: единственная кнопка — отмена. */
export function supportCancelKeyboard(language: SupportLanguage): BotKeyboard {
  return [[{ label: TEXTS[language].btnCancel, action: SUPPORT_ACTION.cancel }]];
}

/**
 * Начало кода действия «спросить ещё». Дальше идут номер обращения, раздел и
 * (если есть) тема — через двоеточие.
 */
export const SUPPORT_ASK_PREFIX = "ask:";

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
export function supportReplyKeyboard(
  language: SupportLanguage,
  ticket: { code: string; category: string; topic?: string | undefined },
): BotKeyboard {
  const action = `${SUPPORT_ASK_PREFIX}${ticket.code}:${ticket.category}${
    ticket.topic === undefined ? "" : `:${ticket.topic}`
  }`;
  return [
    [{ label: TEXTS[language].btnAsk, action }],
    ...supportMenuKeyboard(language),
  ];
}

/** Разбор кода действия «спросить ещё». `null` — код чужой или испорченный. */
export function parseAskAction(
  action: string,
): { code: string; category: string; topic?: string | undefined } | null {
  if (!action.startsWith(SUPPORT_ASK_PREFIX)) return null;
  const [code, category, topic] = action.slice(SUPPORT_ASK_PREFIX.length).split(":");
  if (!code || !category) return null;
  return { code, category, ...(topic === undefined || topic === "" ? {} : { topic }) };
}
