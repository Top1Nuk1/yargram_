import { Icon, type IconName } from './Icon';
import { appHref } from '../lib/appUrl';
import { useLandingLanguage } from '../lib/useLandingLanguage';

/**
 * Вкладка «Обновления»: одна версия — `0.1.0 ЗБТ` — как карточка выпуска.
 *
 * Сделана выпуском, а не лентой дат: версия пока одна, и «список изменений»
 * из одного пункта выглядел бы странно. Когда версий станет больше, сюда
 * добавятся новые карточки сверху, а форма останется прежней.
 */
export function Releases() {
  const { content } = useLandingLanguage();
  const release = content.releases;

  return (
    <section
      id="updates"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20"
    >
      <header className="max-w-[620px]">
        <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand">
          {release.tag}
        </span>
        <h2 className="mt-3 text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[36px]">
          {release.title}
        </h2>
        <p className="mt-4 text-[15px] leading-[1.7] text-body">{release.intro}</p>
      </header>

      <article className="card-lift mt-10 overflow-hidden rounded-3xl border border-stroke bg-card shadow-card hover:border-brand/35">
        {/* Шапка выпуска: версия крупно, канал рядом — как ярлык. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-stroke bg-brand-soft/60 px-6 py-5 sm:px-8">
          <span className="inline-flex items-baseline gap-1.5 font-extrabold tracking-[-0.02em]">
            <span className="text-[26px] text-brand sm:text-[30px]">{release.version}</span>
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand/80">
              {release.channel}
            </span>
          </span>

          <span className="rounded-full border border-brand/25 bg-card px-3 py-1 text-[12px] font-semibold text-brand">
            {release.openLabel(release.channelLong)}
          </span>

          <span className="ml-auto text-[12.5px] text-body">{release.date}</span>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <p className="text-[15px] leading-[1.7] text-ink">{release.summary}</p>

          <div className="mt-5 space-y-2.5">
            {[release.intro1, release.intro2].map((paragraph) => (
              <p key={paragraph} className="text-[13.5px] leading-[1.7] text-body">
                {paragraph}
              </p>
            ))}
          </div>

          {/* Возможности выпуска — по направлениям, как в списке функций. */}
          <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {release.groups.map((group) => (
              <section key={group.title}>
                <h3 className="flex items-center gap-2.5 text-[15.5px] font-bold">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon name={group.icon as IconName} className="h-4 w-4" />
                  </span>
                  {group.title}
                </h3>

                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[13px] leading-[1.6]">
                      <Icon
                        name="check"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                        strokeWidth={2.4}
                      />
                      <span className="text-body">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Что дальше: честно и без сроков. */}
          <div className="mt-8 rounded-2xl border border-stroke bg-page px-5 py-5">
            <h3 className="flex items-center gap-2 text-[14.5px] font-bold">
              <Icon name="sparkle" className="h-4 w-4 text-brand" />
              {release.nextTitle}
            </h3>
            <ul className="mt-3 space-y-2">
              {release.next.map((item) => (
                <li key={item} className="flex gap-2.5 text-[13px] leading-[1.6] text-body">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <a
            href={appHref()}
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white transition hover:bg-brand-strong"
          >
            {release.tryButton}
            <Icon name="arrow" className="h-4 w-4" />
          </a>
        </div>
      </article>
    </section>
  );
}
