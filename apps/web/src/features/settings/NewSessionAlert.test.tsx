import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../types';
import { NewSessionAlert } from './NewSessionAlert';

const session: Session = {
  id: 'session-mirror',
  site: 'https://mirror.test',
  device: 'Firefox, Linux',
  createdAt: '2026-09-29T09:00:00.000Z',
  lastSeenAt: '2026-09-29T09:30:00.000Z',
  current: true,
  newDevice: true,
  acknowledged: false,
};

function renderAlert(overrides: Partial<Session> = {}) {
  const onAcknowledge = vi.fn();
  const onTerminate = vi.fn();
  const view = render(
    <NewSessionAlert
      session={{ ...session, ...overrides }}
      onAcknowledge={onAcknowledge}
      onTerminate={onTerminate}
    />,
  );
  return { ...view, onAcknowledge, onTerminate };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe('окно «Новый вход»', () => {
  it('называет сайт без протокола и браузер', () => {
    renderAlert();

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Новый вход')).toBeTruthy();
    // Сайт, а не устройство: Yargram открывают в браузере, и человек должен
    // узнать именно адрес, откуда вошли в его аккаунт.
    expect(screen.getByText(/В аккаунт вошли с сайта mirror\.test/)).toBeTruthy();
    expect(screen.getByText('Браузер: Firefox, Linux')).toBeTruthy();
  });

  it('«Это был я» подтверждает вход', () => {
    const { onAcknowledge, onTerminate } = renderAlert();

    fireEvent.click(screen.getByRole('button', { name: 'Это был я' }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onTerminate).not.toHaveBeenCalled();
  });

  it('«Это не я» завершает этот самый сеанс', () => {
    const { onAcknowledge, onTerminate } = renderAlert();

    fireEvent.click(screen.getByRole('button', { name: 'Это не я' }));
    expect(onTerminate).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  it('Escape равносилен «это был я»: окно не должно висеть до перезапуска', () => {
    const { onAcknowledge } = renderAlert();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('клик по фону тоже подтверждает вход', () => {
    const { onAcknowledge } = renderAlert();

    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('без сайта не остаётся пустого места в тексте', () => {
    renderAlert({ site: '' });

    expect(screen.getByText(/В аккаунт вошли с сайта Сайт не определён/)).toBeTruthy();
  });

  it('подписи берутся из словаря выбранного языка', () => {
    localStorage.setItem('yargram.lang', 'uk');
    renderAlert();

    expect(screen.getByText('Новий вхід')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Це був я' })).toBeTruthy();
  });
});
