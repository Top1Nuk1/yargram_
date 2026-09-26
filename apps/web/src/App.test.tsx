import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api, ApiError } from './api/client';
import type { User } from './types';

vi.mock('./api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api/client')>();
  return { ...original, api: { ...original.api, me: vi.fn() } };
});
vi.mock('./hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('./features/auth/AuthScreen', () => ({ AuthScreen: () => <div>Sign in</div> }));
vi.mock('./features/messenger/MessengerScreen', () => ({ MessengerScreen: () => <div>Messenger</div> }));
vi.mock('./features/onboarding/OnboardingScreen', () => ({
  OnboardingScreen: ({ onDone }: { onDone: () => void }) => (
    <div>
      Onboarding
      <button type="button" onClick={onDone}>Начать</button>
    </div>
  ),
}));

const tokenKey = 'yargram.accessToken';
const onboardingKey = 'yargram.onboardingDone';

beforeEach(() => {
  localStorage.setItem(tokenKey, 'saved-token');
  // Возвращающийся посетитель: знакомство уже показано.
  localStorage.setItem(onboardingKey, '1');
  vi.mocked(api.me).mockReset();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('session restoration', () => {
  it.each([0, 500, 503])('preserves the token after status %s and retries successfully', async (status) => {
    vi.mocked(api.me)
      .mockRejectedValueOnce(new ApiError('Unavailable', status))
      .mockResolvedValueOnce({ id: 'user-1' } as User);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Повторить подключение' }));
    expect(localStorage.getItem(tokenKey)).toBe('saved-token');
    expect(await screen.findByText('Messenger')).toBeInTheDocument();
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.me).mock.calls[1]?.[0]).toBe('saved-token');
  });

  it.each([401, 403])('clears invalid authentication after status %s', async (status) => {
    vi.mocked(api.me).mockRejectedValue(new ApiError('Unauthorized', status));
    render(<App />);

    expect(await screen.findByText('Sign in')).toBeInTheDocument();
    expect(localStorage.getItem(tokenKey)).toBeNull();
  });

  it('keeps the current request loading when StrictMode cancels the first request', async () => {
    let resolveCurrent!: (user: User) => void;
    vi.mocked(api.me)
      .mockImplementationOnce((_token, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));
    render(<StrictMode><App /></StrictMode>);

    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolveCurrent({ id: 'user-1' } as User);
    expect(await screen.findByText('Messenger')).toBeInTheDocument();
    expect(localStorage.getItem(tokenKey)).toBe('saved-token');
  });
});

describe('first visit', () => {
  it('shows the onboarding once and then the sign-in screen', async () => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(onboardingKey);
    render(<App />);

    expect(await screen.findByText('Onboarding')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));

    expect(await screen.findByText('Sign in')).toBeInTheDocument();
    expect(localStorage.getItem(onboardingKey)).toBe('1');
    expect(api.me).not.toHaveBeenCalled();
  });

  it('skips the onboarding for a returning visitor', async () => {
    localStorage.removeItem(tokenKey);
    render(<App />);

    expect(await screen.findByText('Sign in')).toBeInTheDocument();
  });
});
