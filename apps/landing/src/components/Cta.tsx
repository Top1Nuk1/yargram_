import { Icon } from './Icon';
import { Logo } from './Logo';
import { appHref } from '../lib/appUrl';
import { TELEGRAM_CHANNEL_URL } from '../lib/links';
import { useLandingLanguage } from '../lib/useLandingLanguage';

/** Финальный призыв: кнопка «Открыть Yargram» и подсказка про аккаунт. */
export function CallToAction() {
  const { content } = useLandingLanguage();
  const cta = content.cta;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20">
      <div className="card-lift relative overflow-hidden rounded-3xl bg-brand px-6 py-12 text-center text-white shadow-float sm:px-12 sm:py-16">
        {/* Мягкие круги того же оттенка — фон без картинок. */}
        <span
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-white/[0.07]"
          aria-hidden="true"
        />

        <div className="relative">
          {/* 🔥 Знак — настоящая плитка Yargram (как `Yargram-plate.png`): светлая
              подложка, синий круг, белая буква. Белую обёртку вокруг убрали: она
              давала вторую светлую окантовку поверх плитки, и знак выглядел как
              «заплатка» в рамке. `onBrand` держит цвета знака неизменными — блок
              синий в любой теме. */}
          <span className="flex justify-center">
            <Logo size={72} withWordmark={false} onBrand />
          </span>
          <h2 className="mt-4 text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
            {cta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.7] text-white/85">
            {cta.text}
          </p>

          <a
            href={appHref()}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-[15px] font-bold text-brand-deep shadow-card transition hover:bg-brand-soft"
          >
            {cta.button}
            <Icon name="arrow" className="h-5 w-5" />
          </a>

          <p className="mt-5 text-[12.5px] text-white/70">{cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/** Подвал: логотип, разделы и короткая подпись. */
export function Footer() {
  const { content } = useLandingLanguage();
  const navItems = [
    { href: '#features', label: content.nav.features },
    { href: '#updates', label: content.nav.updates },
    { href: '#calls', label: content.nav.calls },
    { href: '#security', label: content.nav.security },
    { href: '#faq', label: content.nav.faq },
  ];

  return (
    <footer className="border-t border-stroke bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={34} withWordmark={false} />
          <span>
            <span className="block text-[15px] font-bold">Yargram</span>
            <span className="block text-[12px] text-body">{content.footer.tagline}</span>
          </span>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Подвал">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-body transition hover:text-brand">
              {item.label}
            </a>
          ))}
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-body transition hover:text-brand"
          >
            <Icon name="telegram" className="h-4 w-4" />
            {content.footer.channel}
          </a>
          <a href={appHref()} className="font-semibold text-brand">
            {content.header.cta}
          </a>
        </nav>
      </div>
    </footer>
  );
}
