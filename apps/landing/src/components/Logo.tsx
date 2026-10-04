interface LogoProps {
  /** Высота плитки в пикселях. Ширина считается пропорционально. */
  size?: number;
  /** Показывать надпись «Yargram» рядом со знаком. */
  withWordmark?: boolean;
  /**
   * Знак стоит на плашке цвета бренда (блок призыва).
   *
   * 🔥 Там цвета берутся из самого знака, а не из темы: блок призыва синий в
   * любой теме, поэтому на тёмной теме «плавающие» цвета превращали светлую
   * плитку в тёмный квадрат, и знак переставал совпадать с `Yargram-plate.png`.
   */
  onBrand?: boolean;
  className?: string;
}

/**
 * Логотип Yargram — плитка с синим кругом и буквой V.
 *
 * 🔥 Рисуется вектором по настоящей геометрии из `logo-plate.svg`, а не
 * подбирается на глаз: знак — это **залитая буква V на синем круге** с более
 * светлой внутренней V, на светлой плитке. В `Icon` лежала приблизительная
 * версия, где V была вырезана из круга, — издалека похоже, но это другой знак.
 *
 * Нарисован, а не картинкой: остаётся резким на любом экране, весит меньше
 * килобайта, а цвета берутся от темы — на тёмной теме плитка не «выжигает» глаз.
 */
export function Logo({
  size = 36,
  withWordmark = true,
  onBrand = false,
  className = '',
}: LogoProps) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      // 🔥 `aria-label` на голом `<span>` большинство скринридеров игнорируют —
      // роль обязательна, иначе «Yargram» просто пропадёт из озвучки.
      role="img"
      aria-label="Yargram"
    >
      <svg
        viewBox="0 0 80 88"
        width={(size * 80) / 88}
        height={size}
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Плитка: светлый фон и тонкая рамка — именно она даёт «объём» знака. */}
        <rect
          x="0"
          y="4"
          width="80"
          height="80"
          rx="21"
          className={
            onBrand ? 'fill-[#EBF3FC] stroke-[#CFE4F9]' : 'fill-brand-soft stroke-brand/25'
          }
          strokeWidth="2.5"
        />
        <g transform="translate(11 15) scale(1.2)">
          <circle cx="24" cy="24" r="22" className={onBrand ? 'fill-[#3390EC]' : 'fill-brand'} />
          <path
            d="M12.7 13.9c-.7-1.5 1.2-2.8 2.3-1.6L24 22l9-9.7c1.1-1.2 3-.1 2.4 1.5l-7.5 20.6a4.1 4.1 0 0 1-7.7 0l-7.5-20.5Z"
            fill="#ffffff"
          />
          <path d="m18.2 18.5 5.8 6.3 5.8-6.3L24 32.7l-5.8-14.2Z" fill="#D9EFFA" />
        </g>
      </svg>

      {withWordmark && (
        <span
          className="font-bold tracking-[-0.02em] text-brand"
          style={{ fontSize: size * 0.52 }}
        >
          Yargram
        </span>
      )}
    </span>
  );
}
