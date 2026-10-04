import { useEffect, useRef } from 'react';

interface DecorativeVideoProps {
  src: string;
  className?: string;
}

/**
 * Живое оформление профиля: видео вместо картинки — фон переписки или баннер.
 *
 * Управления нет намеренно: это оформление, а не плеер. Поэтому `controls`
 * выключены, а `loop` возвращает ролик к началу сам — «перематывать» тут нечего,
 * видео просто идёт по кругу. Панель управления не показывается даже по клику,
 * а меню правой кнопки закрыто: иначе появились бы «Сохранить видео» и
 * «Показать элементы управления».
 *
 * `muted` обязателен: без него браузер откажется запускать видео сам, без
 * нажатия человека. Ставим его и атрибутом, и через ссылку — React не всегда
 * успевает выставить свойство до первой попытки воспроизведения.
 */
export function DecorativeVideo({ src, className = '' }: DecorativeVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.muted = true;
    // Браузер может отказать в автозапуске (экономия трафика, политика вкладки).
    // Это не ошибка: видео останется на первом кадре, а не сломает оформление.
    void element.play().catch(() => undefined);
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      controls={false}
      controlsList="nodownload noplaybackrate noremoteplayback"
      // Фон не должен перехватывать нажатия: под ним кнопки и переписка.
      onContextMenu={(event) => event.preventDefault()}
      aria-hidden="true"
    />
  );
}
