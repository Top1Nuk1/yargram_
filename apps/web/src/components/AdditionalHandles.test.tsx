import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AdditionalHandles, primaryHandle } from './AdditionalHandles';

describe('AdditionalHandles', () => {
  it('renders nothing when there are no alternate usernames', () => {
    const { container } = render(<AdditionalHandles usernames={[]} />);
    expect(container.firstChild).toBeNull();
    const { container: undefinedContainer } = render(<AdditionalHandles usernames={undefined} />);
    expect(undefinedContainer.firstChild).toBeNull();
    const { container: nullContainer } = render(<AdditionalHandles usernames={null} />);
    expect(nullContainer.firstChild).toBeNull();
  });

  it('renders the comma-joined list of alternate handles', () => {
    const { container } = render(<AdditionalHandles usernames={['unbrokensociety', 'crow']} />);
    expect(container.textContent).toContain('а также');
    expect(container.textContent).toContain('@unbrokensociety');
    expect(container.textContent).toContain('@crow');
    expect(container.textContent).toContain('@unbrokensociety, @crow');
  });

  it('drops the primary username from the alternates to avoid duplicates', () => {
    const { container } = render(<AdditionalHandles usernames={['monk', 'unbrokensociety', 'crow']} primaryUsername="monk" />);
    expect(container.textContent).not.toContain('@monk,');
    expect(container.textContent).not.toContain('а также @monk');
    expect(container.textContent).toContain('@unbrokensociety');
    expect(container.textContent).toContain('@crow');
  });

  it('renders nothing when the only alternate equals the primary username', () => {
    const { container } = render(<AdditionalHandles usernames={['monk']} primaryUsername="monk" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('primaryHandle', () => {
  it('returns the @username when available', () => {
    expect(primaryHandle({ username: 'monk', displayName: 'Александр' })).toBe('@monk');
  });

  it('falls back to the display name when there is no username', () => {
    expect(primaryHandle({ username: null, displayName: 'Алиса' })).toBe('Алиса');
    expect(primaryHandle({ displayName: 'Алиса' })).toBe('Алиса');
  });

  it('returns an empty string for a missing user', () => {
    expect(primaryHandle(null)).toBe('');
    expect(primaryHandle(undefined)).toBe('');
  });
});