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

  it('ignores unknown badge values', () => {
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <UserName name="Борис" user={{ badge: 'something-else' as any }} />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('Борис');
  });
});