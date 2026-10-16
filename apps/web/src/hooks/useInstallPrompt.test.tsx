import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeforeInstallPromptEvent } from './useInstallPrompt';

/**
 * Перехват установки приложения.
 *
 * 🔥 Состояние этого хука живёт в модуле, а не в компоненте: событие
 * `beforeinstallprompt` приходит один раз и вполне может опередить
 * монтирование React. Поэтому каждый тест берёт свежую копию модуля — иначе
 * событие, «сгоревшее» в предыдущем тесте, осталось бы выбранным, и следующий
 * тест проверял бы чужое состояние.
 */
async function freshHook() {
  vi.resetModules();
  return import('./useInstallPrompt');
}

/**
 * Собираем событие ровно таким, каким его отдаёт браузер.
 *
 * 🔥 `cancelable: true` здесь обязателен. У события, созданного через
 * `new Event(name)` без опций, `cancelable` выключен, и `preventDefault()`
 * внутри обработчика ничего не делает — проверка поведения молча проходила бы
 * даже со сломанным кодом. Настоящее `beforeinstallprompt` отменяемое.
 */
function installPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
}

afterEach(cleanup);

describe('useInstallPrompt', () => {
  it('до события установка недоступна', async () => {
    const { useInstallPrompt } = await freshHook();
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.canInstall).toBe(false);
    expect(result.current.installed).toBe(false);
  });

  it('после предложения браузера установка становится доступной', async () => {
    const { useInstallPrompt } = await freshHook();
    const { result } = renderHook(() => useInstallPrompt());
    const event = installPromptEvent();

    await act(async () => {
      window.dispatchEvent(event);
    });

    // 🔥 `preventDefault` здесь не формальность: без него браузер покажет свой
    // мини-опросник сам, а сохранённое событие станет недействительным — наша
    // кнопка открыла бы пустоту. Проверяем именно это, иначе тест остаётся
    // зелёным даже после удаления строки (проверено).
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canInstall).toBe(true);
  });

  it('открывает системное окно и отдаёт выбор человека', async () => {
    const { useInstallPrompt } = await freshHook();
    const { result } = renderHook(() => useInstallPrompt());
    const event = installPromptEvent('accepted');
    await act(async () => {
      window.dispatchEvent(event);
    });

    let outcome: Awaited<ReturnType<typeof result.current.promptInstall>> | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('accepted');
    // 🔥 Предложение одноразовое: повторный вызов на том же событии ничего не
    // откроет. После использования кнопка обязана погаснуть, иначе человек
    // нажимал бы её впустую.
    expect(result.current.canInstall).toBe(false);
  });

  it('после установки предложение пропадает навсегда', async () => {
    const { useInstallPrompt } = await freshHook();
    const { result } = renderHook(() => useInstallPrompt());
    await act(async () => {
      window.dispatchEvent(installPromptEvent());
    });
    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.installed).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  it('без предложения нажатие не падает, а сообщает о недоступности', async () => {
    const { useInstallPrompt } = await freshHook();
    const { result } = renderHook(() => useInstallPrompt());

    let outcome: Awaited<ReturnType<typeof result.current.promptInstall>> | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe('unavailable');
  });
});
