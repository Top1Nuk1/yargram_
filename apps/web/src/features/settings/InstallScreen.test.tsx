import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_KEY } from '../../lib/i18n';

/**
 * Экран «Установить приложение».
 *
 * Экран опасен тем, что легко притворяется работающим: если браузер установку
 * не предлагает (так всегда на iOS и в Firefox), неактивная кнопка выглядела бы
 * поломкой. Поэтому проверяем все три состояния — доступна, уже установлена,
 * нужно вручную, — и что своё окно подтверждения мы не показываем: согласие
 * даёт браузер.
 */

/** Событие браузера про готовую установку. `cancelable` — как у настоящего. */
function installPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
}

beforeEach(() => {
  localStorage.setItem(LANGUAGE_KEY, 'ru');
  // Среда по умолчанию — обычная вкладка браузера, а не установленное окно.
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Свежий модуль: предложение установки одноразовое и живёт на уровне модуля. */
async function renderScreen() {
  vi.resetModules();
  const { InstallScreen: FreshInstallScreen } = await import('./InstallScreen');
  const onClose = vi.fn();
  return {
    ...render(<FreshInstallScreen onClose={onClose} />),
    onClose,
  };
}

describe('экран установки приложения', () => {
  it('без предложения браузера объясняет, как установить вручную', async () => {
    await renderScreen();

    // Молчаливая неактивная кнопка тут была бы поломкой: показываем инструкцию.
    expect(screen.getByText('Этот браузер не предлагает установку сам')).toBeTruthy();
    expect(screen.getByText(/«Поделиться»/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Установить' })).toBeNull();
  });

  it('по предложению браузера показывает кнопку установки', async () => {
    await renderScreen();

    const event = installPromptEvent();
    await vi.waitFor(async () => {
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    const button = await screen.findByRole('button', { name: /Установить$/ });
    expect(button).toBeTruthy();
  });

  it('нажатие открывает системное окно браузера, а не своё', async () => {
    await renderScreen();
    const event = installPromptEvent('dismissed');
    await vi.waitFor(async () => {
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    // Сам экран имеет роль `dialog`, поэтому «своим окном» считаем **второй**
    // диалог: именно он появился бы, рисуй мы подтверждение сами.
    const dialogsBefore = screen.getAllByRole('dialog').length;

    fireEvent.click(await screen.findByRole('button', { name: /Установить$/ }));

    // Отказ человека — тоже нормальный исход: решение остаётся за браузером,
    // а мы ничего не рисуем и не переспрашиваем.
    await vi.waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole('dialog')).toHaveLength(dialogsBefore);
    expect(screen.queryByRole('button', { name: /Отмена/ })).toBeNull();
  });

  it('в уже установленном приложении предлагать нечего', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(display-mode: standalone)',
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );

    await renderScreen();

    expect(screen.getByText('Приложение уже установлено — открывайте его со значка.')).toBeTruthy();
  });
});
