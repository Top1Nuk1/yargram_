import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { AuthResult, EmailCodeChallenge } from '../../types';
import { AuthScreen } from './AuthScreen';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      login: vi.fn(),
      register: vi.fn(),
      requestPasswordReset: vi.fn(),
      confirmCode: vi.fn(),
      resendCode: vi.fn(),
      resetPassword: vi.fn(),
    },
  };
});

/** Сервер ответил не токеном, а требованием кода из письма. */
const challenge = (purpose: EmailCodeChallenge['purpose'], email = 'bob@example.com'): EmailCodeChallenge => ({
  status: 'code_sent',
  email,
  purpose,
  expiresInSeconds: 600,
});

const signedIn: AuthResult = { accessToken: 'token-1' };

function renderScreen(accent?: string) {
  const onAuthenticated = vi.fn().mockResolvedValue(undefined);
  render(
    <AuthScreen
      theme="light"
      onToggleTheme={() => undefined}
      onAuthenticated={onAuthenticated}
      {...(accent === undefined ? {} : { accent })}
    />,
  );
  return { onAuthenticated };
}

/** Заполняет почту и пароль на первом шаге и отправляет форму. */
function submitCredentials(email = 'bob@example.com', password = 'supersecret') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } });
}

beforeEach(() => {
  vi.mocked(api.confirmCode).mockResolvedValue(signedIn);
  vi.mocked(api.resetPassword).mockResolvedValue(signedIn);
  vi.mocked(api.resendCode).mockImplementation(async ({ purpose, email }) => challenge(purpose, email));
});

afterEach(cleanup);

describe('вход по коду из письма', () => {
  it('показывает второй шаг, когда сервер требует код, и входит по нему', async () => {
    vi.mocked(api.login).mockResolvedValue(challenge('login'));
    const { onAuthenticated } = renderScreen();

    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Войти в Yargram' }));

    // Шаг кода: подсказка с почтой и поле для шести цифр.
    expect(await screen.findByRole('heading', { name: 'Код из письма' })).toBeDefined();
    expect(screen.getByText('Мы отправили код на bob@example.com')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Код'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() =>
      expect(api.confirmCode).toHaveBeenCalledWith({ email: 'bob@example.com', code: '123456', purpose: 'login' }),
    );
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(signedIn));
  });

  it('требует код и после регистрации, и передаёт назначение «register»', async () => {
    vi.mocked(api.register).mockResolvedValue(challenge('register'));
    const { onAuthenticated } = renderScreen();

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Борис' } });
    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    fireEvent.change(await screen.findByLabelText('Код'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() =>
      expect(api.confirmCode).toHaveBeenCalledWith({
        email: 'bob@example.com',
        code: '654321',
        purpose: 'register',
      }),
    );
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(signedIn));
  });

  it('на шаге кода предупреждает про папку «Спам»', async () => {
    vi.mocked(api.register).mockResolvedValue(challenge('register'));
    renderScreen();

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Борис' } });
    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText(/Проверьте папку «Спам»/)).toBeDefined();
  });

  it('показывает срок действия кода в минутах', async () => {
    vi.mocked(api.login).mockResolvedValue(challenge('login'));
    renderScreen();

    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Войти в Yargram' }));

    // В challenge лежит 600 секунд — это ровно 10 минут.
    expect(await screen.findByText('Код действует 10 мин')).toBeDefined();
  });

  it('не отправляет код короче шести цифр и объясняет правило', async () => {
    vi.mocked(api.login).mockResolvedValue(challenge('login'));
    renderScreen();

    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Войти в Yargram' }));

    fireEvent.change(await screen.findByLabelText('Код'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Код — это шесть цифр из письма');
    expect(api.confirmCode).not.toHaveBeenCalled();
  });

  it('просит код, а затем новый пароль при сбросе', async () => {
    vi.mocked(api.requestPasswordReset).mockResolvedValue(challenge('reset'));
    const { onAuthenticated } = renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить код' }));

    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith('bob@example.com'));

    // На шаге сброса появляется поле нового пароля рядом с кодом.
    fireEvent.change(await screen.findByLabelText('Код'), { target: { value: '111111' } });
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'brandnewpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }));

    await waitFor(() =>
      expect(api.resetPassword).toHaveBeenCalledWith({
        email: 'bob@example.com',
        code: '111111',
        password: 'brandnewpass',
      }),
    );
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(signedIn));
  });

  it('повторная отправка просит новый код и подтверждает это', async () => {
    vi.mocked(api.login).mockResolvedValue(challenge('login'));
    renderScreen();

    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Войти в Yargram' }));
    await screen.findByRole('heading', { name: 'Код из письма' });

    fireEvent.click(screen.getByRole('button', { name: 'Отправить заново' }));

    await waitFor(() =>
      expect(api.resendCode).toHaveBeenCalledWith({ email: 'bob@example.com', purpose: 'login' }),
    );
    expect(await screen.findByText('Код отправлен заново')).toBeDefined();
  });

  it('возвращает к форме входа, если почта указана неверно', async () => {
    vi.mocked(api.login).mockResolvedValue(challenge('login'));
    renderScreen();

    submitCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Войти в Yargram' }));
    await screen.findByRole('heading', { name: 'Код из письма' });

    fireEvent.click(screen.getByRole('button', { name: 'Изменить почту' }));

    expect(await screen.findByLabelText('Пароль')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Код из письма' })).toBeNull();
  });
});

describe('фон экрана входа', () => {
  function backdrop(): HTMLElement | null {
    return document.querySelector('[data-auth-backdrop]');
  }

  /** Экран входа с заданной темой: палитра фона зависит от неё. */
  function renderWithTheme(theme: 'light' | 'dark', accent?: string) {
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthScreen
        theme={theme}
        onToggleTheme={() => undefined}
        onAuthenticated={onAuthenticated}
        {...(accent === undefined ? {} : { accent })}
      />,
    );
    return { onAuthenticated };
  }

  it('берёт рисунок того цвета, что ближе к акценту оформления', () => {
    renderScreen('#1f9d63');

    expect(backdrop()).toHaveAttribute('data-auth-backdrop', 'emerald');
  });

  it('без акцента показывает первый цвет, а не пустое место', () => {
    renderScreen();

    expect(backdrop()).toHaveAttribute('data-auth-backdrop', 'blue');
  });

  it('в светлой теме берёт светлую палитру', () => {
    renderWithTheme('light', '#3390ec');

    expect(backdrop()).toHaveAttribute('data-auth-backdrop-variant', 'light');
    expect(backdrop()?.getAttribute('src')).toBe('/backdrops/Yargram-backdrop-blue.png');
  });

  it('в тёмной теме берёт тёмную палитру, а не ту же картинку', () => {
    renderWithTheme('dark', '#3390ec');

    expect(backdrop()).toHaveAttribute('data-auth-backdrop-variant', 'dark');
    expect(backdrop()?.getAttribute('src')).toBe('/backdrops/Yargram-backdrop-blue-dark.png');
  });

  it('рисунок — украшение: он скрыт от чтения с экрана', () => {
    renderScreen('#3390ec');

    expect(backdrop()).toHaveAttribute('alt', '');
  });
});
