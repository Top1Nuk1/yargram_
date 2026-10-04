import { useCallback, useEffect, useState } from 'react';
import {
  LANGUAGE_KEY,
  isLanguage,
  readLanguage,
  translate,
  type Language,
  type TranslateFn,
} from '../lib/i18n';

const LANGUAGE_EVENT = 'yargram:language';

/** Сохраняет язык и сообщает об этом всем подписчикам (в т.ч. в других вкладках). */
export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Storage может быть недоступен в приватном режиме.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: language }));
  }
}

/**
 * Язык интерфейса и функция перевода. Хук держит своё состояние, поэтому смена
 * языка мгновенно перерисовывает всё подписанное дерево.
 */
export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(readLanguage);

  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      setLanguageState(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_KEY) return;
      // Проверяем через isLanguage, а не перечислением: иначе новый язык
      // не подхватился бы из другой вкладки (список языков тут уже разъезжался).
      if (isLanguage(event.newValue)) setLanguageState(event.newValue);
    };
    window.addEventListener(LANGUAGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Держим атрибут <html lang> в актуальном состоянии — от него зависит
  // перенос слов и корректная работа скринридеров.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const changeLanguage = useCallback((next: Language) => {
    setLanguage(next);
  }, []);

  // Переводчик мемоизируем: его личность меняется только вместе с языком.
  // Иначе `t` попадает в deps эффектов как новая функция на каждом рендере и
  // зацикливает их (бесконечное «Подключение…», повторные запросы).
  const t = useCallback<TranslateFn>((key, params) => translate(language, key, params), [language]);

  return { language, t, setLanguage: changeLanguage };
}

/**
 * Только функция перевода — для компонентов, которым не нужна смена языка.
 * Подписка на событие одна и та же, поэтому лишних перерисовок не возникает.
 */
export function useTranslation(): TranslateFn {
  return useLanguage().t;
}

export type { TranslateFn };
