import { Snowflake } from 'lucide-react';
import type { User } from '../types';
import { isFrozenAccount } from '../lib/user';

interface UserNameProps {
  name: string;
  user?: Partial<Pick<User, 'displayName' | 'isFrozen' | 'isVerified' | 'badge' | 'scam'>> | null;
  /** "sm" fits chat bubbles and list rows, "md" fits profile headers. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Силуэты значков — «печати» из округлых лучей, каждая грань описана
 * квадратичной кривой, проходящей точно через вершину. У значка Yargram
 * лучей 8 (силуэт как у значка Telegram), у галочки — 12, поэтому она
 * читается как розетка. Пути посчитаны в системе координат 48×48.
 */
const YARGRAM_STAR_PATH =
  'M30.85 7.46Q44.83 3.17 40.54 17.15Q53.46 24 40.54 30.85Q44.83 44.83 30.85 40.54' +
  'Q24 53.46 17.15 40.54Q3.17 44.83 7.46 30.85Q-5.46 24 7.46 17.15Q3.17 3.17 17.15 7.46' +
  'Q24 -5.46 30.85 7.46Z';

const VERIFIED_ROSETTE_PATH =
  'M29.07 5.07Q37.53 0.56 37.86 10.14Q47.44 10.47 42.93 18.93Q51.07 24 42.93 29.07' +
  'Q47.44 37.53 37.86 37.86Q37.53 47.44 29.07 42.93Q24 51.07 18.93 42.93Q10.47 47.44 10.14 37.86' +
  'Q0.56 37.53 5.07 29.07Q-3.07 24 5.07 18.93Q0.56 10.47 10.14 10.14Q10.47 0.56 18.93 5.07' +
  'Q24 -3.07 29.07 5.07Z';

/** Стрелка из логотипа Yargram (см. components/Logo.tsx, та же сетка 48×48). */
const YARGRAM_GLYPH_PATH =
  'M12.7 13.9c-.7-1.5 1.2-2.8 2.3-1.6L24 22l9-9.7c1.1-1.2 3-.1 2.4 1.5l-7.5 20.6a4.1 4.1 0 0 1-7.7 0l-7.5-20.5Z';
const YARGRAM_GLYPH_SHADE_PATH = 'm18.2 18.5 5.8 6.3 5.8-6.3L24 32.7l-5.8-14.2Z';

function YargramBadge({ className }: { className: string }) {
  return (
    // Подсказка висит на обёртке: атрибут title у <svg> в TSX запрещён, а <title>
    // внутри <svg> попал бы в textContent имени и сломал сравнение строк.
    <span title="Подтверждён представителями Yargram" className="inline-flex shrink-0">
      <svg className={className} viewBox="0 0 48 48" fill="none" role="img" aria-label="Значок Yargram">
        <path d={YARGRAM_STAR_PATH} fill="currentColor" />
        <g transform="translate(24 24) scale(1.02) translate(-24 -24)">
          <path d={YARGRAM_GLYPH_PATH} fill="#FFFFFF" />
          <path d={YARGRAM_GLYPH_SHADE_PATH} fill="#D9EFFA" />
        </g>
      </svg>
    </span>
  );
}

function VerifiedBadge({ className }: { className: string }) {
  return (
    <span title="Подтверждённый аккаунт" className="inline-flex shrink-0">
      <svg className={className} viewBox="0 0 48 48" fill="none" role="img" aria-label="Подтверждено">
        <path d={VERIFIED_ROSETTE_PATH} fill="currentColor" />
        <path
          d="M16.4 24.7 21.3 29.7 32 18.6"
          stroke="#FFFFFF"
          strokeWidth={4.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Отметка SCAM: красная рамка сразу после имени — как в Telegram. Надпись
 * оставляем латиницей: это узнаваемая метка, а не слово интерфейса.
 * Подсказка короткая и в один ряд с остальными значками: «Мошенник».
 */
function ScamBadge({ className }: { className: string }) {
  return (
    <span
      role="img"
      aria-label="Отметка SCAM: аккаунт помечен как мошеннический"
      title="Мошенник"
      className={`inline-flex shrink-0 items-center justify-center rounded-[0.3rem] border-[1.5px] border-danger/70 font-black uppercase leading-none tracking-[0.02em] text-danger ${className}`}
    >
      SCAM
    </span>
  );
}

/**
 * Отображаемое имя (ник) со значком Yargram слева и галочкой справа.
 * Значки привязаны к нику, поэтому видны и в переписке, а не только у @username.
 */
export function UserName({ name, user, size = 'md', className = '' }: UserNameProps) {
  // У звезды и розетки меньше «тела», чем у залитого круга, поэтому коробка
  // чуть больше: 14 px в переписке и списках, 17 px в шапках профилей.
  const badgeSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-[17px] w-[17px]';
  // Значки сидят чуть выше строки, как в Telegram; галочка приподнята заметнее.
  const badgeLift = size === 'sm' ? '-translate-y-[0.5px]' : '-translate-y-px';
  const checkLift = size === 'sm' ? '-translate-y-[1px]' : '-translate-y-[1.5px]';
  // Рамка SCAM — не квадрат, поэтому её размер задаётся текстом и отступами.
  const scamBox = size === 'sm' ? 'px-1 py-[1px] text-[9px]' : 'px-1.5 py-[2px] text-[10px]';
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      {/* Замороженный аккаунт помечается снежинкой: у собеседников это
          «Удалённый аккаунт», у себя — настоящее имя со значком. */}
      {isFrozenAccount(user) && (
        <span
          role="img"
          aria-label="Аккаунт заморожен"
          title="Аккаунт заморожен"
          className={`inline-flex shrink-0 items-center justify-center text-brand ${badgeSize} ${badgeLift}`}
        >
          <Snowflake className="h-full w-full" aria-hidden="true" />
        </span>
      )}
      {user?.badge === 'yargram' && (
        <YargramBadge className={`shrink-0 text-brand ${badgeSize} ${badgeLift}`} />
      )}
      <span className="truncate">{name}</span>
      {user?.scam && <ScamBadge className={`${scamBox} ${badgeLift}`} />}
      {user?.isVerified && (
        <VerifiedBadge className={`shrink-0 text-brand ${badgeSize} ${checkLift}`} />
      )}
    </span>
  );
}
