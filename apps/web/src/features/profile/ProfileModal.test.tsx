import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { User } from '../../types';
import { ProfileModal } from './ProfileModal';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      updateProfile: vi.fn(),
      updateBanner: vi.fn(),
      deleteBanner: vi.fn(),
      upload: vi.fn(),
      setAppBadge: vi.fn(),
    },
  };
});

const me: User = {
  id: 'me-1',
  displayName: 'Алиса',
  username: 'alice',
  bannerColor: '#7a5cff',
};

/** В новой компоновке табов нет: вся форма живёт на одной странице. */
function renderProfile(user: User = me) {
  return render(
    <ProfileModal token="token" user={user} onClose={() => undefined} onSaved={() => undefined} />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('баннер в настройках профиля', () => {
  it('показывает выбранный цвет и сохраняет новый при выборе', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue({ ...me, bannerColor: '#ff0000' });
    renderProfile();
    const colorInput = screen.getByLabelText('Цвет баннера') as HTMLInputElement;

    expect(colorInput.value).toBe('#7a5cff');

    // Нативный пикер на изменение шлёт `input`, на закрытие — `blur`; сохраняем на blur.
    fireEvent.change(colorInput, { target: { value: '#ff0000' } });
    fireEvent.blur(colorInput);

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith('token', { bannerColor: '#ff0000' }),
    );
  });

  it('кнопка «Без заливки» стирает цвет пустой строкой', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue({ ...me, bannerColor: undefined });
    renderProfile();

    fireEvent.click(screen.getByRole('button', { name: 'Без заливки' }));

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith('token', { bannerColor: '' }),
    );
  });

  it('без фото показывает кнопку загрузки, а кнопку удаления — только при фото', async () => {
    renderProfile();
    expect(screen.getByRole('button', { name: /Загрузить фото/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Убрать фото/ })).toBeNull();

    cleanup();
    renderProfile({ ...me, bannerUrl: '/api/uploads/banner-9?t=x' });
    expect(screen.getByRole('button', { name: /Заменить фото/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Убрать фото/ })).toBeDefined();
  });

  it('удаление фото зовёт сервер и оставляет заливку', async () => {
    vi.mocked(api.deleteBanner).mockResolvedValue({ ...me, bannerUrl: null });
    renderProfile({ ...me, bannerUrl: '/api/uploads/banner-9?t=x' });

    fireEvent.click(screen.getByRole('button', { name: /Убрать фото/ }));

    await waitFor(() => expect(api.deleteBanner).toHaveBeenCalledWith('token'));
  });

  it('принимает GIF в поле баннера, но не в поле аватара', async () => {
    const { container } = renderProfile();
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));

    // Баннеру GIF разрешён — там уместна анимация.
    const banner = inputs.find((input) => input.accept.includes('.gif'));
    expect(banner?.accept).toContain('image/gif');
    // Аватару — нет: в кружке 40 px анимация только рябит.
    const avatar = inputs.find((input) => !input.accept.includes('.gif'));
    expect(avatar).toBeDefined();
    expect(avatar!.accept).not.toContain('gif');
  });

  it('отклоняет неподдерживаемый тип файла с понятным текстом', async () => {
    const { container } = renderProfile();
    const banner = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .find((input) => input.accept.includes('.gif'))!;
    const bad = new File(['x'], 'doc.pdf', { type: 'application/pdf' });

    fireEvent.change(banner, { target: { files: [bad] } });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('JPG'));
    expect(api.updateBanner).not.toHaveBeenCalled();
  });

  it('пускает фон до 50 МБ и шлёт его отдельным видом загрузки', async () => {
    // Раньше фон резался на 10 МБ, хотя сервер пускал больше: крупный GIF
    // не загружался ни при каком раскладе. Отдельный вид `wallpaper` затем,
    // чтобы предел фото в переписке (20 МБ) остался прежним.
    vi.mocked(api.upload).mockResolvedValue({
      id: 'att-1',
      ownerId: 'me',
      kind: 'wallpaper',
      fileName: 'wall.gif',
      mimeType: 'image/gif',
      size: 30 * 1024 * 1024,
      url: '/api/uploads/att-1',
    } as never);
    vi.mocked(api.updateProfile).mockResolvedValue({ ...me, wallpaperUrl: '/api/uploads/att-1' });
    const { container } = renderProfile();

    // GIF принимают два поля — баннер и фон; фон в разметке последний.
    const gifInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .filter((input) => input.accept.includes('.gif'));
    const wallpaper = gifInputs[gifInputs.length - 1];
    // Файл «весит» 30 МБ: раньше он не прошёл бы даже клиентскую проверку.
    const big = new File(['x'], 'wall.gif', { type: 'image/gif' });
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 });

    fireEvent.change(wallpaper, { target: { files: [big] } });

    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(vi.mocked(api.upload).mock.calls[0][2]).toBe('wallpaper');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('не пускает фон больше 50 МБ', async () => {
    const { container } = renderProfile();
    const gifInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .filter((input) => input.accept.includes('.gif'));
    const wallpaper = gifInputs[gifInputs.length - 1];
    const huge = new File(['x'], 'wall.gif', { type: 'image/gif' });
    Object.defineProperty(huge, 'size', { value: 51 * 1024 * 1024 });

    fireEvent.change(wallpaper, { target: { files: [huge] } });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('50 МБ'));
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('ставит готовый баннер одним нажатием, без загрузки файла', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue({
      ...me,
      bannerUrl: '/banners/Yargram-banner-rose.png',
    });
    renderProfile();

    const preset = document.querySelector<HTMLElement>('[data-banner-id="banner-rose"]')!;
    expect(preset).toBeInTheDocument();
    fireEvent.click(preset);

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith('token', {
        bannerUrl: '/banners/Yargram-banner-rose.png',
      }),
    );
    // Готовый баннер — не загрузка: файл никуда не отправляется.
    expect(api.updateBanner).not.toHaveBeenCalled();
  });

  it('отмечает выбранный готовый баннер и не путает его с другими', async () => {
    renderProfile({ ...me, bannerUrl: '/banners/Yargram-banner-emerald.png' });

    expect(document.querySelector('[data-banner-id="banner-emerald"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.querySelector('[data-banner-id="banner-rose"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('предлагает тёмную палитру и не путает её со светлой', async () => {
    vi.mocked(api.updateProfile).mockResolvedValue({
      ...me,
      bannerUrl: '/banners/Yargram-banner-rose-dark.png',
    });
    renderProfile();

    const dark = document.querySelector<HTMLElement>('[data-banner-id="banner-rose-dark"]')!;
    expect(dark).toBeInTheDocument();
    fireEvent.click(dark);

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith('token', {
        bannerUrl: '/banners/Yargram-banner-rose-dark.png',
      }),
    );
  });

  it('тёмный и светлый баннер одного цвета — разные плитки', async () => {
    renderProfile({ ...me, bannerUrl: '/banners/Yargram-banner-rose-dark.png' });

    expect(document.querySelector('[data-banner-id="banner-rose-dark"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.querySelector('[data-banner-id="banner-rose"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('раскладывает готовые баннеры по двум полкам, а не одной лентой', async () => {
    // 🔥 Лента с горизонтальной прокруткой распирала форму: у `<fieldset>`
    // браузерное `min-inline-size: min-content`, поэтому карточка вылезала за
    // экран и обрезалась. Теперь это сетка с полками, и все плитки видны.
    renderProfile();

    expect(screen.getByRole('group', { name: /Готовые баннеры — Светлые/ })).toBeDefined();
    expect(screen.getByRole('group', { name: /Готовые баннеры — Тёмные/ })).toBeDefined();

    const lightShelf = screen.getByRole('group', { name: /Готовые баннеры — Светлые/ });
    const darkShelf = screen.getByRole('group', { name: /Готовые баннеры — Тёмные/ });
    expect(lightShelf.querySelectorAll('[data-banner-id]')).toHaveLength(8);
    expect(darkShelf.querySelectorAll('[data-banner-id]')).toHaveLength(8);
    // Ни одной ленты с прокруткой: сетка не даёт плите вылезти за карточку.
    expect(lightShelf.className).toContain('grid');
    expect(lightShelf.className).not.toContain('overflow-x-auto');
  });
});

describe('живое оформление: видео в фоне и баннере', () => {
  it('принимает видео и в баннер, и в фон', () => {
    const { container } = renderProfile();
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));

    // Видео разрешено обоим полям оформления: полоса и фон играют сами, по кругу.
    const videoInputs = inputs.filter((input) => input.accept.includes('video/mp4'));
    expect(videoInputs).toHaveLength(2);
    expect(videoInputs.every((input) => input.accept.includes('video/webm'))).toBe(true);
  });

  it('видео-фон уходит отдельным видом загрузки вместе с типом', async () => {
    // По ссылке не видно, видео это или картинка, поэтому рядом с ней летит тип:
    // без него клиент нарисовал бы <img> вместо <video>.
    vi.mocked(api.upload).mockResolvedValue({
      id: 'att-video',
      ownerId: 'me',
      kind: 'wallpaper',
      fileName: 'loop.mp4',
      mimeType: 'video/mp4',
      size: 1024,
      url: '/api/uploads/att-video',
    } as never);
    vi.mocked(api.updateProfile).mockResolvedValue({
      ...me,
      wallpaperUrl: '/api/uploads/att-video',
      wallpaperMimeType: 'video/mp4',
    });
    const { container } = renderProfile();

    // Видео принимают два поля — баннер и фон; фон в разметке последний.
    const videoInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .filter((input) => input.accept.includes('video/mp4'));
    const wallpaper = videoInputs[videoInputs.length - 1];
    fireEvent.change(wallpaper, {
      target: { files: [new File(['x'], 'loop.mp4', { type: 'video/mp4' })] },
    });

    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(vi.mocked(api.upload).mock.calls[0][2]).toBe('wallpaper');
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith('token', {
        wallpaperUrl: '/api/uploads/att-video',
        wallpaperMimeType: 'video/mp4',
      }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('MOV отклоняет: браузеры играют его не везде', async () => {
    const { container } = renderProfile();
    const videoInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .filter((input) => input.accept.includes('video/mp4'));
    const wallpaper = videoInputs[videoInputs.length - 1];

    fireEvent.change(wallpaper, {
      target: { files: [new File(['x'], 'clip.mov', { type: 'video/quicktime' })] },
    });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('MP4'));
    expect(api.upload).not.toHaveBeenCalled();
  });
});

describe('знак приложения Yargram', () => {
  it('приложению даёт поставить значок, а повторное нажатие снимает его', async () => {
    const app: User = { id: 'app-1', displayName: 'Yargram App', username: 'app', isApp: true };
    vi.mocked(api.setAppBadge).mockResolvedValue({ ...app, badge: 'yargram' });
    renderProfile(app);

    // Кнопка видит, что приложение — значит значок можно ставить самому.
    const set = screen.getByRole('button', { name: /Поставить значок/ });
    fireEvent.click(set);

    await waitFor(() => expect(api.setAppBadge).toHaveBeenCalledWith('token', 'yargram'));
    // После постановки кнопка предлагает обратное действие — снять значок.
    await waitFor(() => screen.getByRole('button', { name: /Снять значок/ }));
  });

  it('обычному человеку не показывает блок знака приложения', () => {
    renderProfile(me);
    expect(screen.queryByRole('button', { name: /Поставить значок/ })).toBeNull();
    expect(screen.queryByText(/ставит только само приложение/)).toBeNull();
    expect(screen.queryByText(/Знак приложения/)).toBeNull();
  });
});

describe('экран информации без табов', () => {
  it('сразу показывает имя пользователя, цвет интерфейса и список «скоро»', () => {
    renderProfile();
    // Активные поля видны без переключения.
    expect(screen.getByLabelText('Имя')).toBeDefined();
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Цвет интерфейса')).toBeDefined();
    // Поля, у которых нет серверной модели, помечены «скоро».
    expect(screen.getByText('Личный канал')).toBeDefined();
    expect(screen.getByText('Автоматизация чатов')).toBeDefined();
    // «Номер телефона» из скриншота не делаем: поля нет в модели, а честно
    // показывать пустую строку мы не стали — оставили только рабочие поля.
    expect(screen.queryByText('Номер телефона')).toBeNull();
    // Никаких табов больше нет — заголовок «Информация», а не «Аккаунт/Оформление».
    expect(screen.queryByRole('button', { name: 'Оформление' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Уведомления' })).toBeNull();
  });

  it('поля «скоро» отмечены плашкой, а переключатель приватности остался', () => {
    renderProfile();
    // Подписи «скоро» могут встречаться несколько раз — достаточно одной.
    expect(screen.getAllByText(/скоро/i).length).toBeGreaterThanOrEqual(1);
    // Приватность живёт в отдельном экране «Конфиденциальность», но флаг
    // «Показывать время посещения» остался и здесь для быстрого доступа.
    expect(screen.getByText(/время посещения/i)).toBeDefined();
  });
});
describe('сохранение профиля с загруженным фоном', () => {
  it('не ругается на свою же загрузку: ссылка без протокола — это нормально', async () => {
    // Ссылку на фон выдаёт сам сервер при загрузке: `/api/uploads/<id>?t=<подпись>`.
    // Проверка «начинается с http» ругалась на неё ровно в тот момент, когда фон
    // уже стоит, и профиль не сохранялся вообще.
    const withWallpaper: User = {
      ...me,
      wallpaperUrl: '/api/uploads/att-1?t=eyJzIjoiOTNmN2RhZTkiLCJlIjoxNzkxNTc4MDQ0fQ.cSmUMsN7XtGotm-DYMfIrCDsnFXc7aJwQxK26z0X4q8',
      wallpaperMimeType: 'image/png',
    };
    vi.mocked(api.updateProfile).mockResolvedValue(withWallpaper);
    renderProfile(withWallpaper);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('и на готовые обои приложения тоже не ругается', async () => {
    const withWallpaper: User = {
      ...me,
      wallpaperUrl: '/wallpapers/Yargram-wallpaper-blue.png',
      wallpaperMimeType: 'image/png',
    };
    vi.mocked(api.updateProfile).mockResolvedValue(withWallpaper);
    renderProfile(withWallpaper);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('а вот на чужой мусор всё ещё ругается', async () => {
    const withJunk: User = { ...me, wallpaperUrl: 'javascript:alert(1)' };
    renderProfile(withJunk);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByRole('alert').textContent).toContain('https://');
    expect(api.updateProfile).not.toHaveBeenCalled();
  });
});
