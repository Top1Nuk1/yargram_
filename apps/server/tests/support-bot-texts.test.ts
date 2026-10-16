import { describe, expect, it } from "vitest";
import {
  isSupportCancelCommand,
  isSupportCommand,
  isSupportHelpCommand,
  isSupportStartCommand,
  parseAskAction,
  supportErrorKeyboard,
  supportLanguageOf,
  supportMenuKeyboard,
  supportReplyKeyboard,
  supportSectionLabel,
  supportTexts,
  type SupportLanguage,
} from "../src/services/support-bot-texts.js";

/**
 * Тексты бота: выбор языка, команды и клавиатуры.
 *
 * Проверяем без базы: это чистые функции, а ошибка в них видна только в
 * переписке — то есть уже у человека.
 */

const LANGUAGES: SupportLanguage[] = ["ru", "en", "bg", "uk", "be"];

describe("язык бота", () => {
  it("берёт язык аккаунта, а незнакомый сводит к русскому", () => {
    expect(supportLanguageOf("en")).toBe("en");
    expect(supportLanguageOf("UK")).toBe("uk");
    expect(supportLanguageOf("be-BY")).toBe("be");
    // Греческий интерфейс падает на английский — бот не должен опережать кнопки.
    expect(supportLanguageOf("el")).toBe("en");
    // Незаданный и незнакомый — русский: бот не молчит из-за пустого поля.
    expect(supportLanguageOf(undefined)).toBe("ru");
    expect(supportLanguageOf("fr")).toBe("ru");
  });

  it("переводит все тексты и подписи кнопок на каждый язык", () => {
    for (const language of LANGUAGES) {
      const texts = supportTexts(language);
      expect(texts.welcome.length, language).toBeGreaterThan(20);
      expect(texts.help.length, language).toBeGreaterThan(20);
      // Кнопки меню и уточнений не пустые и без подстановок: они не шаблоны.
      for (const button of [...supportMenuKeyboard(language), ...supportErrorKeyboard(language)].flat()) {
        expect(button.label.trim(), `${language}: ${button.action}`).not.toBe("");
        expect(button.label, `${language}: ${button.action}`).not.toContain("{");
      }
      // Русский не протекает в остальные языки: у них свои приветствия.
      if (language !== "ru") expect(texts.welcome, language).not.toContain("Здравствуйте");
    }
  });

  it("подставляет номер обращения в подтверждение и в ответ владельца", () => {
    for (const language of LANGUAGES) {
      const texts = supportTexts(language);
      expect(texts.accepted("A1B2"), language).toContain("A1B2");
      expect(texts.ownerReply("Василий", "A1B2", "Готово"), language).toContain("A1B2");
      expect(texts.ownerReply("Василий", "A1B2", "Готово"), language).toContain("Василий");
      expect(texts.ownerReply("Василий", "A1B2", "Готово"), language).toContain("Готово");
      expect(texts.askPrompt("A1B2"), language).toContain("A1B2");
      // Незаполненных мест в готовом тексте остаться не должно.
      expect(texts.accepted("A1B2"), language).not.toContain("{");
      expect(texts.ownerReply("Василий", "A1B2", "Готово"), language).not.toContain("{");
    }
  });

  it("переводит подписи разделов обращения", () => {
    expect(supportSectionLabel("ru", "error", "code")).toBe("Ошибка → Код из письма");
    expect(supportSectionLabel("en", "idea")).toBe("Idea / suggestion");
    expect(supportSectionLabel("bg", "other")).toBe("Друго");
    // Незнакомая тема не ломает подпись: остаётся общий раздел.
    expect(supportSectionLabel("ru", "error", "unknown")).toBe("Ошибка");
  });
});

describe("команды бота", () => {
  it("узнаёт команду только с косой чертой", () => {
    expect(isSupportStartCommand("/start")).toBe(true);
    expect(isSupportStartCommand("/START")).toBe(true);
    expect(isSupportStartCommand("/start@YargramSupport_Bot")).toBe(true);
    expect(isSupportStartCommand("/menu")).toBe(true);
    // Обычное слово командой не считается: «старт» — это текст, а не команда.
    expect(isSupportStartCommand("старт")).toBe(false);
    expect(isSupportStartCommand("start")).toBe(false);
    expect(isSupportStartCommand("Код из письма не приходит")).toBe(false);
  });

  it("различает отмену, справку и незнакомую команду", () => {
    expect(isSupportCancelCommand("/cancel")).toBe(true);
    expect(isSupportHelpCommand("/help")).toBe(true);
    // /menu — это запуск, а не справка: у них разные тексты.
    expect(isSupportHelpCommand("/menu")).toBe(false);
    expect(isSupportCommand("/frobnicate")).toBe(true);
    expect(isSupportCommand("обычный текст")).toBe(false);
  });
});

describe("кнопка «спросить ещё»", () => {
  it("несёт номер и раздел обращения в самом коде действия", () => {
    const keyboard = supportReplyKeyboard("ru", { code: "A1B2", category: "error", topic: "login" });
    const ask = keyboard.flat().find((button) => button.action.startsWith("ask:"));
    expect(ask?.action).toBe("ask:A1B2:error:login");
    // Меню под кнопкой остаётся: человек может и начать новое обращение.
    expect(keyboard.flat().map((button) => button.action)).toContain("cat:error");
  });

  it("разбирает код действия и отвергает чужой", () => {
    expect(parseAskAction("ask:A1B2:error:login")).toEqual({
      code: "A1B2",
      category: "error",
      topic: "login",
    });
    expect(parseAskAction("ask:A1B2:idea")).toEqual({ code: "A1B2", category: "idea" });
    expect(parseAskAction("cat:error")).toBeNull();
    expect(parseAskAction("ask:")).toBeNull();
  });
});
