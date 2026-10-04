import { Icon } from './Icon';
import { appHref } from '../lib/appUrl';
import { useLandingLanguage } from '../lib/useLandingLanguage';

/**
 * Первый экран лендинга: заголовок, подзаголовок, две кнопки, четыре цифры
 * и мокап переписки с плашкой «звонок идёт». Все тексты берутся из `content`
 * под текущий язык — см. `lib/translations.ts`, хардкода здесь нет.
 */
export function Hero() {
  const { content } = useLandingLanguage();
  const { hero, stats } = content;

  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-stroke bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-brand">
            <Icon name="sparkle" className="h-3.5 w-3.5" />
            {hero.badge}
          </span>

          <h1 className="mt-5 text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
            {hero.title1}
            <br />
            <span className="text-brand">{hero.title2}</span>
          </h1>

          <p className="mt-5 max-w-[520px] text-[15px] leading-[1.7] text-body sm:text-[17px]">
            {hero.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={appHref()}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white shadow-card transition hover:bg-brand-strong"
            >
              {hero.cta}
              <Icon name="arrow" className="h-5 w-5" />
            </a>
            <a
              href="#features"
              className="inline-flex h-12 items-center rounded-xl border border-stroke bg-card px-6 text-[15px] font-semibold transition hover:border-brand/40 hover:text-brand"
            >
              {hero.ctaSecondary}
            </a>
          </div>

          <dl className="mt-10 grid max-w-[520px] grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label}>
                <dt className="text-[22px] font-bold tracking-tight text-brand">{item.value}</dt>
                <dd className="mt-0.5 text-[12.5px] leading-[1.45] text-body">{item.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Мокап: поднимается и «плывёт» — единственная анимация в первом экране. */}
        {/* 🔥 `card-lift` и `animate-float` на **разных** элементах: обе задают
            `transform` (scale и translateY), и на одном узле увеличение при
            наведении гасило бы полёт. */}
        <div className="relative mx-auto w-full max-w-[380px] animate-fade-up lg:max-w-none">
          <div className="card-lift mx-auto w-[304px] rounded-[2.25rem] sm:w-[340px]">
            <div className="animate-float rounded-[2.25rem] border border-stroke bg-card p-3 shadow-float">
              <div className="overflow-hidden rounded-[1.75rem] bg-page">
                <div className="flex items-center gap-2.5 border-b border-stroke bg-card px-3.5 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">
                    {hero.mock.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{hero.mock.name}</span>
                    <span className="block text-[11.5px] font-medium text-success">{hero.mock.online}</span>
                  </span>
                  <Icon name="phone" className="h-4 w-4 text-body" />
                </div>

                <div className="space-y-2.5 px-3.5 py-4">
                  {hero.mock.bubbles.map((bubble, index) => (
                    <div
                      key={index}
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.5] ${
                        bubble.from === 'me'
                          ? 'ml-auto bg-brand text-white'
                          : 'bg-card text-ink shadow-card'
                      }`}
                    >
                      {bubble.text}
                      {bubble.from === 'me' && (
                        <span className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-white/75">
                          <Icon name="check" className="h-3 w-3" />
                          <Icon name="check" className="-ml-2 h-3 w-3" />
                        </span>
                      )}
                    </div>
                  ))}

                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand [animation-delay:300ms]" />
                    <span className="ml-1 text-[11.5px] font-medium text-body">{hero.mock.typing}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-stroke bg-card px-3.5 py-3">
                  <span className="h-8 flex-1 rounded-full bg-page" />
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">
                    <Icon name="arrow" className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>

            {/* Плашка «звонок идёт» — показывает ещё одну возможность сразу. */}
            <div className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-stroke bg-card px-4 py-2.5 shadow-float">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-success/10 text-success">
                <Icon name="phone" className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[12.5px] font-semibold">{hero.mock.call.title}</span>
                <span className="block text-[11px] text-body">{hero.mock.call.subtitle}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
