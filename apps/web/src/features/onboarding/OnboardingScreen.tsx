import { useCallback, useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { ArrowLeft, ArrowRight, Check, Moon, Sun } from 'lucide-react';
import { Logo } from '../../components/Logo';
import { Button, IconButton } from '../../components/ui';
import { useTranslation } from '../../hooks/useLanguage';
import type { ThemeMode } from '../../types';

interface OnboardingScreenProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  /** Вызывается и при «Начать», и при «Пропустить». */
  onDone: () => void;
}

interface OnboardingSlide {
  /** Ключи перевода: текст берём из словаря, поэтому слайды не дублируются. */
  titleKey: string;
  textKey: string;
  art: ReactNode;
}

/** Подложка иллюстраций: мягкий градиент из акцентов приложения. */
function Art({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid aspect-[4/3] w-[236px] place-items-center rounded-[2rem] border border-line p-3 shadow-sm sm:w-[312px]"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 28% 18%, rgb(var(--brand) / 0.16), transparent 62%), radial-gradient(ellipse at 78% 88%, rgb(var(--accent) / 0.18), transparent 62%)',
      }}
    >
      {children}
    </div>
  );
}

/** Кадр иллюстрации: 160×120 ровно под пропорцию панели, чтобы рисунок её заполнял. */
const artProps: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 160 120',
  fill: 'none',
  className: 'h-full w-full',
  'aria-hidden': true,
};

/** Человечек: голова и плечи одним цветом — читается лучше, чем один кружок. */
function Person({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const shoulderY = y + r * 2.35;
  const width = r * 1.55;
  const height = r * 1.05;
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={color} />
      <path
        d={`M${x - width} ${shoulderY} A ${width} ${height} 0 0 1 ${x + width} ${shoulderY} Z`}
        fill={color}
      />
    </>
  );
}

const slides: OnboardingSlide[] = [
  {
    titleKey: 'onboarding.s1.title',
    textKey: 'onboarding.s1.text',
    art: (
      <svg {...artProps}>
        <rect x="12" y="18" width="96" height="58" rx="20" fill="rgb(var(--brand))" />
        <path d="M32 74 20 94 52 76Z" fill="rgb(var(--brand))" />
        <path d="M30 38h60M30 54h34" stroke="white" strokeWidth="7" strokeLinecap="round" />
        <rect x="84" y="72" width="64" height="40" rx="14" fill="rgb(var(--surface))" stroke="rgb(var(--line))" strokeWidth="3" />
        <path d="M98 88h34M98 100h20" stroke="rgb(var(--muted))" strokeWidth="5" strokeLinecap="round" />
        <circle cx="138" cy="26" r="15" fill="rgb(var(--accent))" />
        <path d="M131 26l5 6 9-11" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.s2.title',
    textKey: 'onboarding.s2.text',
    art: (
      <svg {...artProps}>
        <rect x="10" y="16" width="92" height="44" rx="16" fill="rgb(var(--surface))" stroke="rgb(var(--line))" strokeWidth="3" />
        <path d="M26 32h58M26 46h32" stroke="rgb(var(--muted))" strokeWidth="6" strokeLinecap="round" />
        <rect x="58" y="64" width="92" height="44" rx="16" fill="rgb(var(--brand))" />
        <path d="M74 80h56M74 94h28" stroke="white" strokeWidth="6" strokeLinecap="round" />
        <path d="M124 98l5 6 9-11" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M134 98l5 6 9-11" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.s3.title',
    textKey: 'onboarding.s3.text',
    art: (
      <svg {...artProps}>
        <rect x="10" y="16" width="84" height="66" rx="14" fill="rgb(var(--surface))" stroke="rgb(var(--line))" strokeWidth="3" />
        <circle cx="30" cy="36" r="7" fill="rgb(var(--accent))" />
        <path d="M16 76l22-24 14 15 10-9 20 18" stroke="rgb(var(--success))" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="92" y="16" width="58" height="50" rx="12" fill="rgb(var(--brand-soft))" stroke="rgb(var(--brand))" strokeWidth="3" />
        <path d="M104 34h34M104 48h20" stroke="rgb(var(--brand))" strokeWidth="5" strokeLinecap="round" />
        <rect x="100" y="72" width="20" height="28" rx="10" fill="rgb(var(--danger))" />
        <path d="M96 92v3a14 14 0 0 0 28 0v-3" stroke="rgb(var(--danger))" strokeWidth="4" strokeLinecap="round" />
        <path d="M110 109v5" stroke="rgb(var(--danger))" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.s4.title',
    textKey: 'onboarding.s4.text',
    art: (
      <svg {...artProps}>
        <rect x="104" y="4" width="50" height="18" rx="9" fill="rgb(var(--brand-soft))" stroke="rgb(var(--brand))" strokeWidth="3" />
        <path d="M116 13h26" stroke="rgb(var(--brand))" strokeWidth="4" strokeLinecap="round" />
        <Person x={44} y={54} r={19} color="rgb(var(--brand))" />
        <Person x={92} y={46} r={15} color="rgb(var(--accent))" />
        <Person x={128} y={62} r={12} color="rgb(var(--success))" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.s5.title',
    textKey: 'onboarding.s5.text',
    art: (
      <svg {...artProps}>
        <rect x="10" y="28" width="94" height="68" rx="14" fill="rgb(var(--surface))" stroke="rgb(var(--line))" strokeWidth="3" />
        <rect x="22" y="44" width="30" height="36" rx="8" fill="rgb(var(--brand))" />
        <rect x="58" y="44" width="30" height="36" rx="8" fill="rgb(var(--accent))" />
        <rect x="112" y="42" width="30" height="40" rx="9" fill="rgb(var(--brand))" />
        <path d="M142 54l16-10v32l-16-10z" fill="rgb(var(--brand))" />
      </svg>
    ),
  },
  {
    titleKey: 'onboarding.s6.title',
    textKey: 'onboarding.s6.text',
    art: (
      <svg {...artProps}>
        <rect x="12" y="36" width="96" height="44" rx="22" fill="rgb(var(--brand-soft))" stroke="rgb(var(--brand))" strokeWidth="3" />
        <circle cx="86" cy="58" r="16" fill="rgb(var(--brand))" />
        <circle cx="124" cy="40" r="11" fill="rgb(var(--brand))" />
        <circle cx="148" cy="40" r="11" fill="rgb(var(--accent))" />
        <circle cx="124" cy="72" r="11" fill="rgb(var(--success))" />
        <circle cx="148" cy="72" r="11" fill="rgb(var(--danger))" />
      </svg>
    ),
  },
];

/**
 * Первый экран для нового посетителя: короткое знакомство со слайдами,
 * точками-индикаторами и переключателем темы. Показывается один раз.
 */
export function OnboardingScreen({ theme, onToggleTheme, onDone }: OnboardingScreenProps) {
  const t = useTranslation();
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;

  const goNext = useCallback(() => {
    setIndex((current) => (current >= slides.length - 1 ? current : current + 1));
  }, []);
  const goBack = useCallback(() => setIndex((current) => Math.max(0, current - 1)), []);

  // Стрелки на клавиатуре — привычная навигация по слайдам.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') goNext();
      else if (event.key === 'ArrowLeft') goBack();
      else if (event.key === 'Escape') onDone();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goBack, goNext, onDone]);

  const slide = slides[index]!;

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-canvas text-ink" aria-label={t('onboarding.ariaLabel')}>
      <header className="flex items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <Logo />
        <div className="flex items-center gap-1">
          <IconButton label={theme === 'dark' ? t('auth.toggleLight') : t('auth.toggleDark')} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </IconButton>
          <Button variant="ghost" className="px-3 text-[13px]" onClick={onDone}>
            {t('onboarding.skip')}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-4">
        <section
          key={index}
          className="flex w-full max-w-[380px] animate-slide-up flex-col items-center text-center"
          aria-live="polite"
        >
          <Art>{slide.art}</Art>
          <h1 className="mt-7 text-[22px] font-bold leading-[1.25] tracking-[-0.02em] sm:text-[27px]">{t(slide.titleKey)}</h1>
          <p className="mt-3 max-w-[330px] text-[13.5px] leading-[1.65] text-muted sm:max-w-[370px] sm:text-[15px]">{t(slide.textKey)}</p>
        </section>
      </div>

      <footer className="px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[380px] flex-col gap-4">
          <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label={t('onboarding.slidesLabel')}>
            {slides.map((item, dotIndex) => (
              <button
                key={item.titleKey}
                type="button"
                role="tab"
                aria-selected={dotIndex === index}
                aria-label={t('onboarding.slideAria', { index: dotIndex + 1, title: t(item.titleKey) })}
                onClick={() => setIndex(dotIndex)}
                className={`h-1.5 rounded-full transition-all ${
                  dotIndex === index ? 'w-5 bg-brand' : 'w-1.5 bg-line hover:bg-brand/40'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <IconButton
              label={t('common.back')}
              className="h-12 w-12 border border-line bg-elevated"
              onClick={goBack}
              disabled={index === 0}
            >
              <ArrowLeft className="h-5 w-5" />
            </IconButton>
            {isLast ? (
              <Button className="min-h-12 flex-1" onClick={onDone}>
                <Check className="h-5 w-5" />
                {t('onboarding.start')}
              </Button>
            ) : (
              <Button className="min-h-12 flex-1" onClick={goNext}>
                {t('onboarding.next')}
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
