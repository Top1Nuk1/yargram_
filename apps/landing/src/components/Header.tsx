import { Icon } from './Icon';
import { Logo } from './Logo';
import { appHref } from '../lib/appUrl';
import { TELEGRAM_CHANNEL_URL } from '../lib/links';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLandingLanguage } from '../lib/useLandingLanguage';
import type { ThemeMode } from '../lib/useLandingTheme';

interface HeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  // 🔥 Язык и переведённые подписи берём из контекста, а не хардкодим: тогда
  // переключатель и шапка всегда синхронны и не разъезжаются на другом языке.
  const { content } = useLandingLanguage();
  const navItems = [
    { href: '#features', label: content.nav.features },
    { href: '#updates', label: content.nav.updates },
    { href: '#calls', label: content.nav.calls },
    { href: '#security', label: content.nav.security },
    { href: '#faq', label: content.nav.faq },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-stroke/70 bg-page/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 sm:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="Yargram — на главную">
          {/* 🔥 Надпись в шапке скрывается на узком экране: вместе с кнопкой
              «Открыть Yargram», переключателем языка и двумя иконками она не
              влезала в 390 px, и лендинг уезжал вбок на 45 px. */}
          <Logo size={38} withWordmark={false} />
          <span className="hidden text-[19.8px] font-bold tracking-[-0.02em] text-brand sm:inline">
            Yargram
          </span>
        </a>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Разделы страницы">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-body transition hover:bg-card hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Ссылка на Telegram-канал — тем же размером, что кнопка темы. */}
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={content.footer.channel}
            title={content.footer.channel}
            className="grid h-10 w-10 place-items-center rounded-xl border border-stroke bg-card text-body transition hover:text-brand"
          >
            <Icon name="telegram" className="h-5 w-5" />
          </a>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? content.header.themeLight : content.header.themeDark}
            title={theme === 'dark' ? content.header.themeLight : content.header.themeDark}
            className="grid h-10 w-10 place-items-center rounded-xl border border-stroke bg-card text-body transition hover:text-ink"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-5 w-5" />
          </button>

          {/* 🔥 Переключатель языка — ровно между темой и «Открыть Yargram». */}
          <LanguageSwitcher />

          {/* 🔥 На телефоне у кнопки остаётся только значок: подпись в 128 px
              плюс всё остальное не помещались в шапку. Подпись всё равно
              есть в блоке призыва на первом экране. */}
          <a
            href={appHref()}
            aria-label={content.header.cta}
            title={content.header.cta}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-3 text-[13.5px] font-semibold text-white transition hover:bg-brand-strong sm:px-4"
          >
            <span className="hidden sm:inline">{content.header.cta}</span>
            <Icon name="arrow" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
