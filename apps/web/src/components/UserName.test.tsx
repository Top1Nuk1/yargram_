import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { UserName } from './UserName';

describe('UserName', () => {
  it('renders only the display name when there are no badges', () => {
    const { container } = render(<UserName name="Алиса" />);
    expect(container.textContent).toBe('Алиса');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the Yargram star badge when the user has the yargram badge', () => {
    const { container } = render(
      <UserName name="Алиса" user={{ badge: 'yargram' }} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('Значок Yargram');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 48 48');
    expect(container.textContent).toContain('Алиса');
  });

  it('renders the verified rosette when the user is verified', () => {
    const { container } = render(
      <UserName name="Борис" user={{ isVerified: true }} />,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
    expect(svgs[0].getAttribute('aria-label')).toBe('Подтверждено');
    expect(container.textContent).toContain('Борис');
  });

  it('renders both badges when the user is verified and has the yargram badge', () => {
    const { container } = render(
      <UserName name="Тимур" user={{ badge: 'yargram', isVerified: true }} />,
    );
    const labels = Array.from(container.querySelectorAll('svg')).map(
      (svg) => svg.getAttribute('aria-label'),
    );
    expect(labels).toContain('Значок Yargram');
    expect(labels).toContain('Подтверждено');
  });

  it('positions the verified badge higher than the Yargram badge', () => {
    const { container } = render(
      <UserName name="Тимур" user={{ badge: 'yargram', isVerified: true }} />,
    );
    const yargramBadge = container.querySelector('svg[aria-label="Значок Yargram"]');
    const verifiedBadge = container.querySelector('svg[aria-label="Подтверждено"]');
    expect(yargramBadge).not.toBeNull();
    expect(verifiedBadge).not.toBeNull();
    // Классы цвета и подъёма: цвет — text-brand, подъём у галочки заметнее, чем у звезды.
    const classNameOf = (element: Element | null): string => element?.getAttribute('class') ?? '';
    expect(classNameOf(verifiedBadge)).toContain('text-brand');
    expect(classNameOf(yargramBadge)).toContain('text-brand');
    expect(classNameOf(verifiedBadge)).toContain('-translate-y-[1.5px]');
    expect(classNameOf(yargramBadge)).toContain('-translate-y-px');
  });

  it('renders the snowflake for a frozen account, even under its real name', () => {
    const removed = render(<UserName name="Удалённый аккаунт" user={{ isFrozen: true }} />);
    expect(removed.container.querySelector('svg')).not.toBeNull();

    // Себе замороженный видит своё имя — снежинка должна остаться.
    const own = render(<UserName name="Алиса" user={{ isFrozen: true }} />);
    expect(own.container.querySelector('svg')).not.toBeNull();
    expect(own.container.textContent).toBe('Алиса');
  });

  it('renders no snowflake for a plain or deleted account', () => {
    expect(render(<UserName name="Алиса" />).container.querySelector('svg')).toBeNull();
    expect(
      render(<UserName name="Удалённый аккаунт" user={{ isFrozen: false }} />).container.querySelector('svg'),
    ).toBeNull();
  });

  it('renders the SCAM box next to the name of a marked account', () => {
    const { container } = render(<UserName name="Борис" user={{ scam: true }} />);
    const box = container.querySelector('[role="img"]');
    expect(box).not.toBeNull();
    expect(box?.textContent).toBe('SCAM');
    expect(box?.getAttribute('aria-label')).toBe(
      'Отметка SCAM: аккаунт помечен как мошеннический',
    );
    // Метка стоит после имени, а не вместо него.
    expect(container.textContent).toBe('БорисSCAM');
  });

  it('shows the SCAM box together with the other badges', () => {
    const { container } = render(
      <UserName name="Тимур" user={{ badge: 'yargram', isVerified: true, scam: true }} />,
    );
    expect(container.textContent).toBe('ТимурSCAM');
    const labels = Array.from(container.querySelectorAll('svg')).map((svg) =>
      svg.getAttribute('aria-label'),
    );
    expect(labels).toContain('Значок Yargram');
    expect(labels).toContain('Подтверждено');
  });

  it('renders no SCAM box for a plain or explicitly unmarked account', () => {
    expect(render(<UserName name="Алиса" />).container.querySelector('[role="img"]')).toBeNull();
    expect(
      render(<UserName name="Алиса" user={{ scam: false }} />).container.querySelector('[role="img"]'),
    ).toBeNull();
  });

  it('explains every badge in a hover tooltip', () => {
    const { container } = render(
      <UserName name="Тимур" user={{ badge: 'yargram', isVerified: true, scam: true, isFrozen: true }} />,
    );
    const titles = Array.from(container.querySelectorAll('[title]')).map((node) =>
      node.getAttribute('title'),
    );
    expect(titles).toContain('Подтверждённый аккаунт');
    expect(titles).toContain('Мошенник');
    expect(titles).toContain('Подтверждён представителями Yargram');
    expect(titles).toContain('Аккаунт заморожен');
    // Подсказки висят на обёртках, а не текстом внутри имени.
    expect(container.textContent).toBe('ТимурSCAM');
  });

  it('ignores unknown badge values', () => {
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <UserName name="Борис" user={{ badge: 'something-else' as any }} />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('Борис');
  });
});