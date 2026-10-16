import { Logo } from './Logo';
import { Icon } from './Icon';
import { appHref } from '../lib/appUrl';
import { useLandingLanguage } from '../lib/useLandingLanguage';
import { useLandingTheme } from '../lib/useLandingTheme';

/**
 * Пользовательское соглашение — отдельная страница, а не раздел лендинга.
 *
 * 🔥 Страницу отдаёт сервер по адресу `/terms`, и она намеренно не входит в
 * общий SPA-маршрут лендинга: у документа юридический смысл, у него должен
 * быть свой адрес, который можно процитировать и отправить ссылкой. Поэтому
 * у неё своя точка входа (`terms.html`) и никакой зависимости от `App`.
 */
export function TermsPage() {
  const { content } = useLandingLanguage();
  // Тема на странице соглашения тоже своя: если человек ушёл с тёмного
  // лендинга, документ не должен вдруг оказаться белым.
  useLandingTheme();
  const terms = content.terms;

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="sticky top-0 z-40 border-b border-stroke/70 bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-3 px-5 sm:px-8">
          <a href="/" aria-label="Yargram — на главную" className="shrink-0">
            <Logo size={38} />
          </a>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {terms.title}
          </span>
          <a
            href={appHref()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 text-[13.5px] font-semibold text-white transition hover:bg-brand-strong"
          >
            {terms.toApp}
            <Icon name="arrow" className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[38px]">
          {terms.title}
        </h1>
        <p className="mt-4 max-w-[640px] text-[15px] leading-[1.7] text-body">
          {terms.intro}
        </p>
        <p className="mt-3 text-[13px] text-body">{terms.updated}</p>

        {/* Оглавление: длинный документ без указателя читать неудобно, а у
            человека он открывается по ссылке из окна регистрации. */}
        <nav
          className="mt-8 rounded-2xl border border-stroke bg-card p-4"
          aria-label={terms.title}
        >
          <ol className="grid gap-2 sm:grid-cols-2">
            {terms.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-lg px-2 py-1 text-[13.5px] text-body transition hover:bg-page hover:text-brand"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {terms.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-[20px] font-bold tracking-[-0.01em] sm:text-[22px]">
                {section.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] leading-[1.7] text-body">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <a
          href="/"
          className="mt-12 inline-flex h-11 items-center gap-2 rounded-xl border border-stroke bg-card px-5 text-[14px] font-semibold transition hover:border-brand/40 hover:text-brand"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          {terms.back}
        </a>
      </main>
    </div>
  );
}