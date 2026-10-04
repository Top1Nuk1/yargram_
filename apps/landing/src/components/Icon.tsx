import type { ReactElement, SVGProps } from 'react';

/**
 * Иконки нарисованы прямо здесь и не тянут библиотеку: лендингу нужно
 * двенадцать значков, и ради них ставить зависимость незачем — страница должна
 * открываться мгновенно. Все рисуются линиями по сетке 24×24 и наследуют цвет
 * от родителя через `currentColor`.
 */
export type IconName =
  | 'message'
  | 'image'
  | 'mic'
  | 'phone'
  | 'users'
  | 'palette'
  | 'shield'
  | 'globe'
  | 'devices'
  | 'lock'
  | 'moon'
  | 'sun'
  | 'arrow'
  | 'check'
  | 'sparkle'
  | 'telegram';

// 🔥 React 19 убрал глобальный namespace `JSX`: без `ReactElement` из react
// (а не `JSX.Element`) сборка падает с TS2503 «Cannot find namespace 'JSX'».
const paths: Record<IconName, ReactElement> = {
  message: (
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.4A1 1 0 0 1 4 18.6z" />
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <circle cx="8.75" cy="9.75" r="1.75" />
      <path d="m3.5 17 5-5.2 4 4 2.6-2.4 5.4 5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 18.5V21" />
    </>
  ),
  phone: (
    <path d="M5 4h3l1.6 4-2 1.6a12.5 12.5 0 0 0 6.8 6.8l1.6-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 6.2 2 2 0 0 1 5 4Z" />
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.5" />
      <path d="M3.5 20a6 6 0 0 1 12 0M16.5 5.6a3.5 3.5 0 0 1 0 6.8M18 20a5.6 5.6 0 0 0-2.2-4.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.9 0-1.5-1.3-1.9-1.3-3 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6 17 3 12 3Z" />
      <circle cx="8.2" cy="10.4" r="1.2" />
      <circle cx="12" cy="7.6" r="1.2" />
      <circle cx="15.8" cy="10.4" r="1.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5 6v6c0 4.3 2.9 7.6 7 8.8 4.1-1.2 7-4.5 7-8.8V6z" />
      <path d="m9.2 12.2 2 2 3.6-3.9" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.4 9.6h17.2M3.4 14.4h17.2M12 3c2.6 3.2 2.6 14.8 0 18M12 3c-2.6 3.2-2.6 14.8 0 18" />
    </>
  ),
  devices: (
    <>
      <rect x="2.5" y="5" width="12.5" height="9.5" rx="2" />
      <path d="M6 18.5h6" />
      <rect x="16" y="9.5" width="5.5" height="10" rx="1.8" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
      <path d="M8 10V7.6a4 4 0 0 1 8 0V10M12 14.4v2.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6" />
    </>
  ),
  arrow: <path d="M4.5 12h14m-5.5-5.5L18.5 12 13 17.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  sparkle: (
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
  ),
  // 🔥 Знак Telegram — залитый круг с вырезанным самолётиком. Рисуется одним
  // контуром (круг + плоскость как «дырка»), поэтому уходит в `filled`-режим.
  telegram: (
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  ),
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const filled = name === 'moon' || name === 'telegram';
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {filled ? (
        <g fill="currentColor" stroke="none">
          {paths[name]}
        </g>
      ) : (
        paths[name]
      )}
    </svg>
  );
}
