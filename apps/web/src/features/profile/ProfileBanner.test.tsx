import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Attachment, User } from '../../types';
import { ProfileBanner } from './ProfileBanner';

afterEach(cleanup);

beforeEach(() => {
  // jsdom не умеет играть видео: `play()` там не реализован и не возвращает
  // промис, а компонент на него опирается при автозапуске.
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: () => Promise.resolve(),
  });
});

const me: User = { id: 'u1', displayName: 'Алиса', username: 'alice' };

const videoBanner: Attachment = {
  id: 'b1',
  ownerId: 'u1',
  kind: 'banner',
  fileName: 'loop.mp4',
  mimeType: 'video/mp4',
  size: 1024,
  url: '/api/uploads/b1?t=x',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('баннер профиля', () => {
  it('видео рисует как <video> без управления и с повтором', () => {
    const { container } = render(<ProfileBanner user={{ ...me, banner: videoBanner }} />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    // Управления нет намеренно: это оформление, а не плеер — перематывать нечего,
    // ролик идёт по кругу сам.
    expect(video!.hasAttribute('controls')).toBe(false);
    expect(video!.loop).toBe(true);
    expect(video!.muted).toBe(true);
    expect(video!.autoplay).toBe(true);
    // Поверх видео картинка не остаётся: они рисуются по типу, а не обе разом.
    expect(container.querySelector('img')).toBeNull();
  });

  it('картинку-баннер оставляет картинкой', () => {
    const { container } = render(
      <ProfileBanner
        user={{
          ...me,
          banner: { ...videoBanner, fileName: 'banner.png', mimeType: 'image/png' },
        }}
      />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('прямая ссылка на баннер — всегда картинка, даже если вложение видео', () => {
    // Ссылку человек вписывает руками, тип у неё не известен — обещать по ней
    // <video> нельзя. Фото важнее, поэтому рисуется картинка.
    const { container } = render(
      <ProfileBanner
        user={{ ...me, bannerUrl: '/api/uploads/b1?t=x', banner: videoBanner }}
      />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
