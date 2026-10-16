import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { Session, SessionOverview, User } from '../../types';
import { SessionsScreen } from './SessionsScreen';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      sessions: vi.fn(),
      terminateSession: vi.fn(),
      terminateOtherSessions: vi.fn(),
      renameSession: vi.fn(),
    },
  };
});

const user: User = { id: 'user-1', displayName: 'Васька', username: 'vaskaime_001' };

const home: Session = {
  id: 'session-home',
  site: 'https://yargram.test',
  device: 'Chrome, Windows',
  createdAt: '2026-09-01T10:00:00.000Z',
  lastSeenAt: '2026-09-29T10:00:00.000Z',
  current: true,
  newDevice: false,
  acknowledged: false,
};

const mirror: Session = {
  id: 'session-mirror',
  site: 'https://mirror.test',
  device: 'Firefox, Linux',
  createdAt: '2026-09-29T09:00:00.000Z',
  lastSeenAt: '2026-09-29T09:30:00.000Z',
  current: false,
  newDevice: true,
  acknowledged: false,
};

function overview(overrides: Partial<SessionOverview> = {}): SessionOverview {
  return {
    sessions: [home, mirror],
    currentSessionId: home.id,
    canTerminateOthers: false,
    gateUntil: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    alert: null,
    autoTerminateDays: null,
    ...overrides,
  };
}

function renderScreen(options: {
  overview?: SessionOverview;
  me?: User;
  /** Ошибка загрузки: экран должен объяснить её, а не показать пустой список. */
  sessionsError?: Error;
  onAutoTerminateChange?: (days: number | null) => Promise<void>;
  withBack?: boolean;
} = {}) {
  const onAutoTerminateChange =
    options.onAutoTerminateChange ?? vi.fn(async () => undefined);
  const onClose = vi.fn();
  const onBack = vi.fn();
  if (options.sessionsError) vi.mocked(api.sessions).mockRejectedValue(options.sessionsError);
  else vi.mocked(api.sessions).mockResolvedValue(options.overview ?? overview());
  const view = render(
    <SessionsScreen
      token="token"
      user={options.me ?? user}
      onAutoTerminateChange={onAutoTerminateChange}
      onClose={onClose}
      {...(options.withBack ? { onBack } : {})}
    />,
  );
  return { ...view, onAutoTerminateChange, onClose, onBack };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.terminateSession).mockResolvedValue(overview({ sessions: [home] }));
  vi.mocked(api.terminateOtherSessions).mockResolvedValue(overview({ sessions: [home] }));
  vi.mocked(api.renameSession).mockResolvedValue(
    overview({ sessions: [{ ...home, customDeviceName: 'Мой Компьютер' }, mirror] }),
  );
});

afterEach(cleanup);

describe('экран «Активные сеансы»', () => {
  it('показывает сайт без протокола и помечает текущий сеанс', async () => {
    renderScreen();

    // Yargram — сайт, поэтому сеанс описывают парой «сайт + браузер»:
    // «https://yargram.test» в списке читался бы хуже, чем «yargram.test».
    await waitFor(() => expect(screen.getByText('yargram.test')).toBeTruthy());
    expect(screen.getByText('mirror.test')).toBeTruthy();
    expect(screen.getByText('Chrome, Windows')).toBeTruthy();
    expect(screen.getByText('Этот сеанс')).toBeTruthy();
    // У каждого сеанса своя строка активности — по ней видно, живой ли он.
    expect(screen.getAllByText(/Последняя активность:/)).toHaveLength(2);
  });

  it('неизвестные сайт и браузер не оставляют пустых строк', async () => {
    renderScreen({
      overview: overview({
        sessions: [{ ...home, site: '', device: '' }],
        currentSessionId: home.id,
      }),
    });

    await waitFor(() => expect(screen.getByText('Сайт не определён')).toBeTruthy());
    expect(screen.getByText('Браузер не определён')).toBeTruthy();
  });

  it('до суток чужой сеанс завершить нельзя, а свой — можно', async () => {
    renderScreen({ overview: overview({ canTerminateOthers: false }) });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    const buttons = screen.getAllByRole('button', { name: 'Завершить' });
    // Первый сеанс — текущий, его закрыть можно всегда: этим и спасаются от
    // чужого входа. Второй закрывать раньше суток нельзя.
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
    expect(buttons[1]).toHaveAttribute(
      'title',
      'Завершать другие сеансы можно через 24 часа после входа.',
    );
    expect(screen.getByRole('button', { name: 'Завершить все остальные' })).toBeDisabled();
    // Обратный отсчёт объясняет, почему кнопка не работает.
    expect(screen.getByText(/^Осталось:/)).toBeTruthy();

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(api.terminateSession).toHaveBeenCalledWith('token', 'session-home'));
    await waitFor(() => expect(screen.getByText('Сеанс завершён.')).toBeTruthy());
  });

  it('через сутки чужой сеанс завершается и показывает, что закрыто', async () => {
    renderScreen({
      overview: overview({
        canTerminateOthers: true,
        gateUntil: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    const buttons = screen.getAllByRole('button', { name: 'Завершить' });
    expect(buttons[1]).toBeEnabled();

    fireEvent.click(buttons[1]);
    await waitFor(() => expect(api.terminateSession).toHaveBeenCalledWith('token', 'session-mirror'));
  });

  it('через сутки «завершить все остальные» закрывает чужие входы', async () => {
    renderScreen({ overview: overview({ canTerminateOthers: true }) });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    const terminateAll = screen.getByRole('button', { name: 'Завершить все остальные' });
    expect(terminateAll).toBeEnabled();

    fireEvent.click(terminateAll);
    await waitFor(() => expect(api.terminateOtherSessions).toHaveBeenCalledWith('token'));
    await waitFor(() => expect(screen.getByText('Остальные сеансы завершены.')).toBeTruthy());
  });

  it('срок автозавершения уходит на сервер, а при ошибке возвращается назад', async () => {
    const onAutoTerminateChange = vi.fn(async () => undefined);
    renderScreen({ onAutoTerminateChange });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    const select = screen.getByLabelText('Завершать неактивные сеансы') as HTMLSelectElement;
    expect(select.value).toBe('never');

    fireEvent.change(select, { target: { value: '30' } });
    await waitFor(() => expect(onAutoTerminateChange).toHaveBeenCalledWith(30));
    await waitFor(() => expect(select.value).toBe('30'));
  });

  it('непринятый срок автозавершения откатывается и объясняется', async () => {
    const onAutoTerminateChange = vi.fn(async () => {
      throw new Error('Сервер недоступен');
    });
    renderScreen({ onAutoTerminateChange });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    const select = screen.getByLabelText('Завершать неактивные сеансы') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '7' } });

    await waitFor(() => expect(screen.getByText('Сервер недоступен')).toBeTruthy());
    expect(select.value).toBe('never');
  });

  it('срок из профиля сразу виден в переключателе', async () => {
    renderScreen({ me: { ...user, sessionAutoTerminateDays: 90 } });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    expect((screen.getByLabelText('Завершать неактивные сеансы') as HTMLSelectElement).value).toBe('90');
  });

  it('ошибка загрузки объясняется, а не оставляет пустой список', async () => {
    renderScreen({ sessionsError: new Error('Сервер недоступен') });

    await waitFor(() => expect(screen.getByText('Сервер недоступен')).toBeTruthy());
    expect(screen.queryByText('yargram.test')).toBeNull();
  });

  it('Escape закрывает экран', async () => {
    const { onClose } = renderScreen();
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('стрелка ведёт назад на прежний экран, а не закрывает всё', async () => {
    // Экран открывают из списка настроек: стрелка возвращает туда же.
    const { onBack, onClose } = renderScreen({ withBack: true });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape при заданном возврате тоже ведёт назад', async () => {
    const { onBack, onClose } = renderScreen({ withBack: true });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('на мобильном кнопка «Закрыть» по-прежнему закрывает экран', async () => {
    const { onBack, onClose } = renderScreen({ withBack: true });
    await waitFor(() => expect(screen.getByText('mirror.test')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('подписи берутся из словаря выбранного языка', async () => {
    localStorage.setItem('yargram.lang', 'uk');
    renderScreen();

    await waitFor(() => expect(screen.getByText('Активні сеанси')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Завершити' })).toHaveLength(2);
  });

  it('отображает пользовательское имя устройства и позволяет переименовать его', async () => {
    renderScreen({
      overview: overview({
        sessions: [
          { ...home, customDeviceName: 'Рабочий ПК' },
          mirror,
        ],
      }),
    });

    await waitFor(() => expect(screen.getByText('Рабочий ПК')).toBeTruthy());
    expect(screen.getByText('Chrome, Windows • yargram.test')).toBeTruthy();

    // Кликаем по кнопке редактирования устройства
    const renameButtons = screen.getAllByRole('button', { name: 'Переименовать устройство' });
    fireEvent.click(renameButtons[0]);

    // Появляется диалоговое окно переименования
    const input = screen.getByPlaceholderText('Например: Компьютер дома') as HTMLInputElement;
    expect(input.value).toBe('Рабочий ПК');

    fireEvent.change(input, { target: { value: 'Мой Компьютер' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(api.renameSession).toHaveBeenCalledWith('token', home.id, 'Мой Компьютер');
    });

    await waitFor(() => {
      expect(screen.getByText('Имя устройства сохранено.')).toBeTruthy();
      expect(screen.getByText('Мой Компьютер')).toBeTruthy();
    });
  });
});
