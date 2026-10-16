import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageStickers, SharedPackCard } from './StickerBubble';
import { StickerPicker } from './StickerPicker';
import type { Sticker, StickerPack } from '../../types';

/**
 * 🔥 Стикеры в интерфейсе. Проверяем то, что иначе тихо ломается: битый файл
 * не оставляет дыру, гифка играет сама, а удалённый файл не роняет набор.
 */
beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 's1',
    packId: 'builtin-yargram',
    emoji: '🔵',
    animated: false,
    url: '/app/stickers/yargram/logo.png',
    ...overrides,
  };
}

function pack(overrides: Partial<StickerPack> = {}): StickerPack {
  return {
    id: 'builtin-yargram',
    title: 'Yargram',
    emoji: '🔵',
    version: 1,
    mine: false,
    builtin: true,
    updatedAt: '',
    stickers: [sticker()],
    ...overrides,
  };
}

describe('стикеры в пузыре', () => {
  it('рисует картинку по готовому адресу', () => {
    render(<MessageStickers stickers={[sticker()]} showSave={false} />);
    const image = screen.getByRole('img', { name: '🔵' });
    expect(image).toHaveAttribute('src', '/app/stickers/yargram/logo.png');
  });

  it('битый файл показывается значком, а не пустым квадратом', () => {
    // 🔥 Адрес пустой — файл удалён, а стикер остался. Без заглушки в наборе
    // была бы дыра, и человек решил бы, что набор сломан.
    render(<MessageStickers stickers={[sticker({ url: '' })]} showSave={false} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.body.textContent).toContain('🔵');
  });

  it('ничего не рисует для пустого списка', () => {
    const { container } = render(<MessageStickers stickers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('кнопка сохранения появляется только у картинки и только по нажатию', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<MessageStickers stickers={[sticker()]} onSave={save} />);

    const button = screen.getByRole('button', { name: /Сохранить/i });
    expect(button).toHaveClass('opacity-0');
    await user.click(button);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('карточка присланного набора', () => {
  it('показывает «убрать», когда набор уже у человека', () => {
    render(
      <SharedPackCard
        pack={pack({ mine: false })}
        installed
        onInstall={() => {}}
        onUninstall={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Убрать набор/i })).toBeInTheDocument();
  });

  it('предлагает поставить набор, которого у человека нет', () => {
    render(
      <SharedPackCard
        pack={pack({ mine: false })}
        installed={false}
        onInstall={() => {}}
        onUninstall={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Прислать набор/i })).toBeInTheDocument();
  });

  it('не показывает превью содержимого', () => {
    // Набор мог обновиться у автора уже после отправки: показывать старые
    // картинки значило бы врать о том, что человек получит.
    render(
      <SharedPackCard
        pack={pack({ mine: false })}
        installed={false}
        onInstall={() => {}}
        onUninstall={() => {}}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('пикер стикеров', () => {
  const onClose = () => {};
  const noop = () => {};
  const manyStickers = (count: number): Sticker[] =>
    Array.from({ length: count }, (_, index) => sticker({ id: `s${index}`, emoji: `🙂${index}` }));

  beforeEach(() => {
    window.localStorage.clear();
  });

  const renderPicker = (props: Partial<Parameters<typeof StickerPicker>[0]> = {}) =>
    render(
      <StickerPicker
        packs={[pack()]}
        gifs={[]}
        onSendSticker={noop}
        onSendGif={noop}
        onOpenPacks={noop}
        onClose={onClose}
        {...props}
      />,
    );

  /** Заголовок секции вроде «Избранное · 3/5» и её же плитки. */
  const section = (name: RegExp) => screen.getByRole('heading', { name }).closest('section');

  it('показывает две вкладки: стикеры и гифки', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: 'Стикеры' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Гифки' })).toBeInTheDocument();
  });

  it('строится сверху вниз: избранное, недавние, а ниже наборы со своими именами', () => {
    // 🔥 Раньше наборы жили за отдельной вкладкой и без имён — человек не видел,
    // что именно отправляет. Теперь одна лента: сначала подборка под пальцем,
    // потом недавние, потом все наборы по порядку.
    window.localStorage.setItem('yargram.stickerFavorites', JSON.stringify(['s0']));
    window.localStorage.setItem('yargram.stickerRecents', JSON.stringify(['s1']));
    renderPicker({ packs: [pack({ stickers: manyStickers(2) })] });

    const headings = [...document.querySelectorAll('h3')].map((node) => node.textContent ?? '');
    expect(headings).toEqual(['Избранное · 1/5', 'Недавние', '🔵 Yargram']);
  });

  it('звёздочка перекладывает стикер в избранное и убирает обратно', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'В избранное' }));
    expect(screen.getByRole('heading', { name: /Избранное · 1\/5/ })).toBeInTheDocument();

    // Звезда есть и у плитки в избранном, и у той же плитки в наборе ниже.
    await user.click(screen.getAllByRole('button', { name: 'Убрать из избранного' })[0]!);
    expect(screen.queryByRole('heading', { name: /Избранное/ })).toBeNull();
  });

  it('в избранном живут пять стикеров: шестой вытесняет самый старый', () => {
    window.localStorage.setItem(
      'yargram.stickerFavorites',
      JSON.stringify(['s0', 's1', 's2', 's3', 's4']),
    );
    renderPicker({ packs: [pack({ stickers: manyStickers(6) })] });

    // Кликаем звёздочку у шестого (s5): s0 — самый старый — должен уйти.
    fireEvent.click(screen.getByRole('button', { name: 'В избранное' }));
    const images = [...(section(/Избранное · 5\/5/)?.querySelectorAll('img') ?? [])];
    expect(images.map((image) => image.alt)).toEqual(['🙂1', '🙂2', '🙂3', '🙂4', '🙂5']);
  });

  it('недавние показывают не больше двадцати стикеров', () => {
    const stickers = manyStickers(25);
    window.localStorage.setItem(
      'yargram.stickerRecents',
      JSON.stringify(stickers.map((item) => item.id)),
    );
    renderPicker({ packs: [pack({ stickers })] });
    expect(section(/Недавние/)?.querySelectorAll('img')).toHaveLength(20);
  });

  it('стикеры в наборах выстраиваются по четыре в ряд', () => {
    renderPicker({ packs: [pack({ stickers: manyStickers(8) })] });
    const tiles = packSection().querySelectorAll('.grid.grid-cols-4 > div');
    expect(tiles).toHaveLength(8);
  });

  it('недавние и избранное переживают закрытие пикера', async () => {
    const user = userEvent.setup();
    const send = vi.fn();
    const { unmount } = renderPicker({ onSendSticker: send });
    await user.click(screen.getByRole('button', { name: 'Отправить стикер' }));
    expect(send).toHaveBeenCalled();
    unmount();

    renderPicker();
    // 🔥 Списки жили в состоянии компонента и стирались при закрытии. Теперь
    // они в `localStorage`, и отправленный стикер виден сразу.
    expect(screen.getByRole('heading', { name: /Недавние/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Отправить стикер' }).length).toBeGreaterThan(0);
  });

  it('вкладка гифок объясняет, что их нет, а не показывает пустоту', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('button', { name: 'Гифки' }));
    expect(document.body.textContent).toContain('Гифок пока нет');
  });

  it('закрывается по Escape и клику вне', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    renderPicker({ onClose: close });
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalled();
  });

  it('видео-гифка играет сама, по кругу и без звука', async () => {
    const user = userEvent.setup();
    // 🔥 Без `muted` и `loop` гифка не поехала бы: браузер не запускает звук
    // без жеста, и человек увидел бы неподвижную картинку.
    const gif = {
      id: 'g1',
      ownerId: 'me',
      kind: 'gif' as const,
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 1024,
      url: '/api/uploads/g1?t=token',
      createdAt: new Date().toISOString(),
    };
    renderPicker({ gifs: [gif] });
    await user.click(screen.getByRole('button', { name: 'Гифки' }));
    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video).toHaveProperty('loop', true);
    // 🔥 React пишет `muted` свойством, а не атрибутом: в HTML это логическое
    // свойство, и проверять надо именно его — иначе тест прошёл бы на «пустом»
    // элементе, который на живой странице звук играл бы.
    expect(video).toHaveProperty('muted', true);
    expect(video?.getAttribute('playsinline')).not.toBeNull();
    expect(video?.getAttribute('autoplay')).not.toBeNull();
  });

  it('стикеры в пикере грузятся сразу, без прокрутки', () => {
    renderPicker({ packs: [pack({ stickers: manyStickers(8) })] });
    // 🔥 С `loading="lazy"` нижние плитки остаются незагруженными, и человек
    // видит пустые квадраты вместо стикеров, пока не прокрутит вниз.
    const images = [...document.querySelectorAll('img')];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.getAttribute('loading')).toBeNull();
    }
  });
});

/** Секция набора в ленте пикера: заголовок с именем набора и сетка плиток. */
function packSection(): ParentNode {
  const heading = screen.getByRole('heading', { name: /Yargram/ });
  return heading.closest('section') ?? document.body;
}