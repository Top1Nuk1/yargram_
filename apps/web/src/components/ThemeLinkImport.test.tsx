import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_KEY } from '../lib/i18n';
import { BUILT_IN_THEMES, type Theme } from '../lib/theme';
import { SHARE_HASH_PREFIX, encodeTheme } from '../lib/themeShare';
import { ThemeLinkImport } from './ThemeLinkImport';

const SHARED: Theme = {
  id: 'custom-чужой',
  name: 'Закат',
  mode: 'dark',
  font: 'serif',
  colors: { ...BUILT_IN_THEMES[0]!.colors, chatBg: '#101820' },
};

function openWith(hash: string) {
  window.history.replaceState(null, '', `/${hash}`);
}

beforeEach(() => localStorage.setItem(LANGUAGE_KEY, 'ru'));

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('ThemeLinkImport', () => {
  it('спрашивает, добавлять ли приехавшую по ссылке тему', () => {
    openWith(`${SHARE_HASH_PREFIX}${encodeTheme(SHARED)}`);
    render(<ThemeLinkImport onImport={vi.fn()} />);

    expect(screen.getByText('Добавить тему?')).toBeInTheDocument();
    expect(screen.getByText('Добавить тему «Закат» себе?')).toBeInTheDocument();
  });

  it('по согласию отдаёт тему наверх и убирает её из адреса', () => {
    openWith(`${SHARE_HASH_PREFIX}${encodeTheme(SHARED)}`);
    const onImport = vi.fn((theme: Theme) => theme);
    render(<ThemeLinkImport onImport={onImport} />);

    fireEvent.click(screen.getByText('Добавить'));

    expect(onImport).toHaveBeenCalledTimes(1);
    const handed = onImport.mock.calls[0]?.[0];
    expect(handed?.name).toBe('Закат');
    expect(handed?.colors).toEqual(SHARED.colors);
    // Перезагрузка не должна спрашивать второй раз.
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('Добавить тему?')).toBeNull();
  });

  it('по отказу ничего не добавляет, но адрес всё равно чистит', () => {
    openWith(`${SHARE_HASH_PREFIX}${encodeTheme(SHARED)}`);
    const onImport = vi.fn((theme: Theme) => theme);
    render(<ThemeLinkImport onImport={onImport} />);

    fireEvent.click(screen.getByText('Не надо'));

    expect(onImport).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('Добавить тему?')).toBeNull();
  });

  it('молчит, если темы в адресе нет', () => {
    openWith('#chat=42');
    render(<ThemeLinkImport onImport={vi.fn()} />);
    expect(screen.queryByText('Добавить тему?')).toBeNull();
  });

  it('молчит на испорченном коде в адресе', () => {
    openWith(`${SHARE_HASH_PREFIX}мусор`);
    render(<ThemeLinkImport onImport={vi.fn()} />);
    expect(screen.queryByText('Добавить тему?')).toBeNull();
  });

  it('открывает модалку при событии hashchange после клика по ссылке', async () => {
    render(<ThemeLinkImport onImport={vi.fn()} />);
    expect(screen.queryByText('Добавить тему?')).toBeNull();

    openWith(`${SHARE_HASH_PREFIX}${encodeTheme(SHARED)}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByText('Добавить тему?')).toBeInTheDocument();
    expect(screen.getByText('Добавить тему «Закат» себе?')).toBeInTheDocument();
  });

  it('открывает модалку при событии yargram:import-theme', async () => {
    render(<ThemeLinkImport onImport={vi.fn()} />);
    expect(screen.queryByText('Добавить тему?')).toBeNull();

    window.dispatchEvent(
      new CustomEvent('yargram:import-theme', {
        detail: { hash: `${SHARE_HASH_PREFIX}${encodeTheme(SHARED)}` },
      }),
    );

    expect(await screen.findByText('Добавить тему?')).toBeInTheDocument();
    expect(screen.getByText('Добавить тему «Закат» себе?')).toBeInTheDocument();
  });
});
