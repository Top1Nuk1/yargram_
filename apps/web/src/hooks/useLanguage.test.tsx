import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LANGUAGE_KEY } from '../lib/i18n';
import { useLanguage } from './useLanguage';

// `setLanguage` шлёт событие в window, а хук на него подписан. Если сбросить
// язык после того, как среда теста уже снесена, отложенное обновление React
// прилетает «в пустоту» и сыпет window is not defined. Поэтому сбрасываем
// значение в localStorage до теста, не трогая обработчики.
beforeEach(() => localStorage.setItem(LANGUAGE_KEY, 'ru'));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * Личность `t` обязана меняться только вместе с языком.
 *
 * На стабильность `t` опираются deps эффектов по всему приложению: если `t`
 * окажется новой функцией на каждом рендере, эффект с `t` в deps зациклится.
 * Ровно так однажды и появилось бесконечное «Подключение…» в App.tsx.
 */
describe('useLanguage', () => {
  it('держит одну и ту же функцию перевода между рендерами', () => {
    const { result, rerender } = renderHook(() => useLanguage());
    const first = result.current.t;

    rerender();
    rerender();

    expect(result.current.t).toBe(first);
  });

  it('возвращает новую функцию перевода после смены языка', () => {
    const { result, rerender } = renderHook(() => useLanguage());
    const before = result.current.t;

    result.current.setLanguage('en');
    rerender();

    expect(result.current.language).toBe('en');
    expect(result.current.t).not.toBe(before);
    expect(result.current.t('common.save')).toBe('Save');
  });

  it('не меняет личность setLanguage — на ней тоже могут висеть подписки', () => {
    const { result, rerender } = renderHook(() => useLanguage());
    const first = result.current.setLanguage;

    rerender();

    expect(result.current.setLanguage).toBe(first);
  });

  it('переводит на выбранный язык и подставляет параметры', () => {
    const { result, unmount } = renderHook(() => useLanguage());

    // Смена языка идёт через событие window, поэтому обновление состояния
    // надо обернуть в act — иначе проверка увидит прежний язык.
    act(() => result.current.setLanguage('bg'));
    expect(result.current.language).toBe('bg');
    expect(result.current.t('common.save')).toBe('Запази');
    expect(result.current.t('attach.playVoice')).toBe('Пусни гласовото съобщение');

    // Снимаем подписку до конца теста, чтобы отложенное обновление события
    // не выполнилось после сноса среды.
    unmount();
  });
});
