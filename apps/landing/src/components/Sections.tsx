import { Icon, type IconName } from './Icon';
import { useLandingLanguage } from '../lib/useLandingLanguage';

/** Полоса коротких возможностей под первым экраном. */
export function Highlights() {
  const { content } = useLandingLanguage();

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-4 sm:px-8">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {content.highlights.map((item) => (
          <li
            key={item.title}
            className="card-lift rounded-2xl border border-stroke bg-card p-5 shadow-card hover:border-brand/35"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon name={item.icon as IconName} className="h-5 w-5" />
            </span>
            <h3 className="mt-3.5 text-[15.5px] font-bold">{item.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-body">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Подробный список возможностей: разделы с перечислением. */
export function Features() {
  const { content } = useLandingLanguage();

  return (
    <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
      <header className="max-w-[620px]">
        <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">
          {content.features.tag}
        </span>
        <h2 className="mt-3 text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[36px]">
          {content.features.title}
        </h2>
        <p className="mt-4 text-[15px] leading-[1.7] text-body">{content.features.intro}</p>
      </header>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {content.sections.map((section) => (
          <article
            key={section.id}
            id={section.id}
            className="card-lift scroll-mt-20 rounded-2xl border border-stroke bg-card p-6 shadow-card hover:border-brand/35"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon name={section.icon as IconName} className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-[17px] font-bold">{section.title}</h3>
                <p className="text-[13px] text-body">{section.lead}</p>
              </div>
            </div>

            <ul className="mt-4 space-y-2.5">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-[13.5px] leading-[1.6]">
                  <Icon
                    name="check"
                    className="mt-0.5 h-4 w-4 shrink-0 text-success"
                    strokeWidth={2.4}
                  />
                  <span className="text-body">{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Три причины, почему браузер: отвечаем на первый вопрос новичка. */
export function Reasons() {
  const { content } = useLandingLanguage();

  return (
    <section className="border-y border-stroke bg-card">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <header className="max-w-[620px]">
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">
            {content.reasonsSection.tag}
          </span>
          <h2 className="mt-3 text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[36px]">
            {content.reasonsSection.title}
          </h2>
        </header>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {content.reasons.map((reason) => (
            <div key={reason.title}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Icon name={reason.icon as IconName} className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-[16.5px] font-bold">{reason.title}</h3>
              <p className="mt-2 text-[13.5px] leading-[1.65] text-body">{reason.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Честный список того, чего пока нет. */
export function Limits() {
  const { content } = useLandingLanguage();

  return (
    <section id="faq" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <header>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">
            {content.limits.tag}
          </span>
          <h2 className="mt-3 text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
            {content.limits.title}
          </h2>
          <p className="mt-4 text-[14.5px] leading-[1.7] text-body">{content.limits.intro}</p>
        </header>

        <ul className="space-y-3">
          {content.limits.items.map((item) => (
            <li
              key={item}
              className="card-lift flex gap-3 rounded-2xl border border-stroke bg-card p-4 text-[13.5px] leading-[1.65] text-body shadow-card"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
