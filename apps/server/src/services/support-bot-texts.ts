import type { BotKeyboard } from "../domain/models.js";

/**
 * Тексты и кнопки бота поддержки.
 *
 * 🔥 Тексты живут на сервере, а не в клиентском `i18n.ts`, потому что бот
 * пишет их в переписку **навсегда**: сообщение остаётся в истории, даже если
 * человек потом сменит язык интерфейса. Так же устроены служебные сообщения о
 * звонках («Звонок отклонён» и прочие) — они тоже русские и лежат на сервере.
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

export const supportTexts = {
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

  accepted: [
    "✅ Передал обращение владельцам.",
    "",
    "Ответ придёт сюда же. Если нужно что-то добавить — просто напишите следующим сообщением.",
  ].join("\n"),

  /** Ответ владельца: человек должен видеть, кто именно ему ответил. */
  ownerReply: (ownerName: string, text: string): string =>
    [`💬 Ответ от ${ownerName}`, "", text].join("\n"),

  /** Обращение в служебной группе. */
  ticket: (input: {
    displayName: string;
    username: string | null;
    section: string;
    details: string;
  }): string =>
    [
      "🎫 Новое обращение",
      "",
      `👤 ${input.displayName}${input.username ? ` (@${input.username})` : ""}`,
      `🗂 ${input.section}`,
      "",
      input.details,
      "",
      "↩️ Ответьте на это сообщение — ответ уйдёт человеку от вашего имени.",
    ].join("\n"),
};

/** Человеческая подпись раздела для обращения. */
export function supportSectionLabel(category: string, topic?: string | undefined): string {
  if (category === "idea") return "Идея / предложение";
  if (category === "other") return "Другое";
  const byTopic: Record<string, string> = {
    code: "Ошибка → Код из письма",
    login: "Ошибка → Вход в аккаунт",
    messages: "Ошибка → Сообщения не отправляются",
    calls: "Ошибка → Звонки",
    other: "Ошибка → Другое",
  };
  if (category !== "error") return "Другое";
  return topic === undefined ? "Ошибка" : (byTopic[topic] ?? "Ошибка");
}

/** Главное меню бота. */
export function supportMenuKeyboard(): BotKeyboard {
  return [
    [
      { label: "🐞 Ошибка", action: SUPPORT_ACTION.error },
      { label: "💡 Идея", action: SUPPORT_ACTION.idea },
    ],
    [{ label: "❓ Другое", action: SUPPORT_ACTION.other }],
  ];
}

/** Уточнения раздела «Ошибка». */
export function supportErrorKeyboard(): BotKeyboard {
  return [
    [
      { label: "Код из письма", action: "err:code" },
      { label: "Вход в аккаунт", action: "err:login" },
    ],
    [
      { label: "Сообщения", action: "err:messages" },
      { label: "Звонки", action: "err:calls" },
    ],
    [
      { label: "Другое", action: "err:other" },
      { label: "⬅️ Назад", action: SUPPORT_ACTION.menu },
    ],
  ];
}

/** Ожидание описания: единственная кнопка — отмена. */
export function supportCancelKeyboard(): BotKeyboard {
  return [[{ label: "⬅️ Отмена", action: SUPPORT_ACTION.cancel }]];
}
