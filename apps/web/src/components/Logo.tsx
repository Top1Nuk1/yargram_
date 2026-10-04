interface LogoProps {
  compact?: boolean;
  className?: string;
  /**
   * Если передан — логотип становится ссылкой (например, на лендинг). Без
   * `href` рендерится как некликабельный `<div>` (заставка загрузки, экраны
   * входа/онбординга), чтобы не уводить пользователя прочь в неподходящий момент.
   */
  href?: string;
  title?: string;
}

export function Logo({ compact = false, className = '', href, title }: LogoProps) {
  const content = (
    <>
      <svg className="h-10 w-10 shrink-0 text-brand" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="currentColor" />
        <path
          d="M12.7 13.9c-.7-1.5 1.2-2.8 2.3-1.6L24 22l9-9.7c1.1-1.2 3-.1 2.4 1.5l-7.5 20.6a4.1 4.1 0 0 1-7.7 0l-7.5-20.5Z"
          fill="white"
        />
        <path d="m18.2 18.5 5.8 6.3 5.8-6.3L24 32.7l-5.8-14.2Z" fill="#D9EFFA" />
      </svg>
      {!compact && <span className="text-xl font-semibold tracking-tight text-ink">Yargram</span>}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-2.5 ${className}`}
        aria-label="Yargram"
        title={title ?? 'Yargram'}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Yargram">
      {content}
    </div>
  );
}
