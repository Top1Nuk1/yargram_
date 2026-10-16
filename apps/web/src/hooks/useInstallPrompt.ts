import { useCallback, useSyncExternalStore } from 'react';

/**
 * Установка Yargram как приложения (PWA).
 *
 * 🔥 Зачем перехватывать `beforeinstallprompt`.
 *
 * Браузер сам показывает свою кнопку установки, но только когда посчитает
 * нужным: в Chrome это маленький значок в адресной строке, который легко не
 * заметить, а сам мини-опросник «Установить приложение?» со временем и вовсе
 * перестали показывать автоматически. Событие `beforeinstallprompt` позволяет
 * сохранить предложение браузера и вызвать его по нашей кнопке — тогда человек
 * видит установку там, где ищет её: в настройках. Согласие и отказ при этом
 * остаются браузерными: мы открываем системное окно, а не своё.
 *
 * Почему состояние модульное, а не внутри хука. Событие приходит один раз,
 * вскоре после загрузки страницы, — и вполне может опередить монтирование
 * React. Слушатели, повешенные в `useEffect`, такое событие пропустили бы, и
 * кнопка навсегда осталась бы неактивной: в браузере предложение одноразовое,
 * «сгоревшее» событие повторно не приходит. Поэтому подписка стоит на уровне
 * модуля, а хук лишь читает уже собранное состояние.
 */

/** Своё поле у события браузера — в типах DOM его нет. */
export type BeforeInstallPromptEvent = Event & {
  /** Показать системное окно «Установить приложение?». */
  prompt: () => Promise<void>;
  /** Чем закончился выбор. `accepted` — установку начали. */
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

/** Открыто ли приложение как установленное — без адресной строки браузера. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // Старый браузер без поддержки медиазапросов — считаем, что в браузере.
  }
  // iOS Safari до установки своего `display-mode` не даёт, зато выставляет
  // свой флаг: без него владелец айфона видел бы кнопку и после установки.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Предложение браузера, сохранённое до нажатия нашей кнопки. */
let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** Событие `appinstalled` уже приходило в этой вкладке. */
let wasInstalled = false;

export interface InstallState {
  /** Готово ли предложение браузера — от этого зависит активность кнопки. */
  canInstall: boolean;
  /** Приложение уже установлено: предлагать нечего. */
  installed: boolean;
}

/**
 * 🔥 Снимок держим готовым объектом, а не собираем при каждом чтении:
 * `useSyncExternalStore` сравнивает результаты через `Object.is` и на новом
 * объекте каждый раз перерисовывал бы подписчика бесконечно.
 */
let snapshot: InstallState = readState();

function readState(): InstallState {
  return { canInstall: deferredPrompt !== null, installed: wasInstalled || isStandalone() };
}

const listeners = new Set<() => void>();

function emit(): void {
  snapshot = readState();
  // Копия списка: слушатель может отписаться прямо во время обхода.
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallState {
  return snapshot;
}

/** При отрисовке вне браузера установки быть не может. */
function getServerSnapshot(): InstallState {
  return { canInstall: false, installed: false };
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // 🔥 Без `preventDefault` браузер покажет свой мини-опросник сам, а
    // сохранённое событие станет недействительным — наша кнопка ничего бы не
    // открыла. Мы забираем предложение себе и показываем по своему выбору.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  // Приложение установили — предлагать больше нечего.
  window.addEventListener('appinstalled', () => {
    wasInstalled = true;
    deferredPrompt = null;
    emit();
  });
}

export interface InstallPromptControls extends InstallState {
  /** Показать системное окно установки. Возвращает выбранный исход. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function useInstallPrompt(): InstallPromptControls {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt;
    if (!event) return 'unavailable' as const;

    // 🔥 Предложение одноразовое: повторный `prompt()` на том же событии
    // ничего не откроет. Забираем его себе сразу, поэтому после этого вызова
    // кнопка обязана исчезнуть — иначе человек нажимал бы её впустую.
    deferredPrompt = null;
    emit();

    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') wasInstalled = true;
    emit();
    return choice.outcome;
  }, []);

  return { ...state, promptInstall };
}
