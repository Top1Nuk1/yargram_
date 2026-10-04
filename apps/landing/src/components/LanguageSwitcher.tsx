import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  LANGUAGES,
  LANGUAGE_ENGLISH_LABELS,
  LANGUAGE_LABELS,
  LANGUAGE_SHORT,
  type Language,
} from '../lib/i18n';
import { useLandingLanguage } from '../lib/useLandingLanguage';

/**
 * Переключатель языка лендинга.
 *
 * Стоит в шапке между кнопкой темы и «Открыть Yargram». Компактный: значок
 * глобуса и двухбуквенный код текущего языка (`RU`, `EN`…), по клику — список
 * всех шести языков на родном и английском. По клику вне или Escape список
 * закрывается. Выбор запоминается на устройстве (см. `useLandingLanguage`).
 */
export function LanguageSwitcher() {
  const { language, setLanguage } = useLandingLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 🔥 Закрываем по клику вне и по Escape — иначе меню висит, пока не выберешь.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(lang: Language) {
    setLanguage(lang);
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${LANGUAGE_LABELS[language]} — ${LANGUAGE_ENGLISH_LABELS[language]}`}
        title={LANGUAGE_LABELS[language]}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-stroke bg-card px-3 text-[13px] font-semibold text-body transition hover:text-ink"
      >
        <Icon name="globe" className="h-[18px] w-[18px]" />
        {LANGUAGE_SHORT[language]}
      </button>

      {open && (
        // 🔥 `role="menu"` + радио-пункты: скринридер объявляет это как меню
        // выбора одного из языков, а не просто список кнопок.
        <div
          role="menu"
          aria-label="Язык"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-stroke bg-card p-1.5 shadow-float"
        >
          {LANGUAGES.map((lang) => {
            const active = lang === language;
            return (
              <button
                key={lang}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(lang)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] transition ${
                  active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-page'
                }`}
              >
                <span className="w-7 shrink-0 text-[12px] font-bold text-body">
                  {LANGUAGE_SHORT[lang]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-tight">{LANGUAGE_LABELS[lang]}</span>
                  <span className="block text-[11.5px] leading-tight text-body">
                    {LANGUAGE_ENGLISH_LABELS[lang]}
                  </span>
                </span>
                {active && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
