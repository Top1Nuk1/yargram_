import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type Language, type LandingContent, isLanguage, resolveContent } from './i18n';

const STORAGE_KEY = 'yargram.landing.lang';

interface LanguageContextValue {
  language: Language;
  /** Весь переведённый контент под текущий язык. */
  content: LandingContent;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * 🔥 Язык по умолчанию — русский, и только русский, пока пользователь не выберет
 * свой. Браузерное определение (`navigator.language`) не берём намеренно: сайт
 * русскоязычный «по умолчанию», а автоопределение ломало бы тесты (они ждут
 * русский текст) и сбивало бы владельца, открывающего сайт на английской ОС.
 * Выбор сохраняется на устройстве и переживает перезагрузку.
 */
function detectInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Приватный режим: localStorage недоступен, остаёмся на русском.
  }
  return 'ru';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    // Атрибут `lang` на <html> нужен скринридерам и поиску — они читают
    // страницу на правильном языке, а не догадываются сами.
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLang(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Сохранить не удалось — язык всё равно применится до перезагрузки.
    }
  }, []);

  const content = useMemo(() => resolveContent(language), [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, content, setLanguage }),
    [language, content, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Доступ к языку и переводам. Работает только внутри `LanguageProvider` — иначе
 * бросает ошибку сразу, а не молча отдаёт пустоту, которую потом не найдёшь.
 */
export function useLandingLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLandingLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
