/**
 * Обработка внутренних ссылок YarGram (yargram.site, /join/<код>, темы и т. д.),
 * чтобы они открывались бесшовно внутри текущего приложения, а не в отдельной вкладке.
 */

export type InternalNavigation =
  | { type: 'join'; code: string }
  | { type: 'theme'; hash: string }
  | { type: 'app'; path: string }
  | { type: 'route'; path: string };

/**
 * Проверяет, указывает ли адрес на внутренние страницы YarGram:
 * - yargram.site или *.yargram.site
 * - текущий домен/хост (например, localhost или alwaysdata)
 * - относительные пути (/join/..., /app, #theme=...)
 */
export function isInternalYargramUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  // Относительные ссылки внутри приложения
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Скачивание файлов и вызовы API не перехватываем как навигацию SPA
    if (trimmed.startsWith('/api/uploads/') || trimmed.startsWith('/api/')) {
      return false;
    }
    // Корень («/») — это внешний сайт/лендинг (yargram.site без /app),
    // клик по нему должен переходить на сайт, а не оставаться в SPA
    if (trimmed === '/' || trimmed === '') {
      return false;
    }
    return true;
  }
  if (trimmed.startsWith('#')) {
    return true;
  }

  try {
    const currentOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://yargram.site';
    const parsed = new URL(trimmed, currentOrigin);

    // Не перехватываем прямые скачивания через /api/
    if (parsed.pathname.startsWith('/api/uploads/') || parsed.pathname.startsWith('/api/')) {
      return false;
    }

    // Главная страница yargram.site (без пути или «/») — это сайт/лендинг,
    // переход должен вести на него (без /app), если только нет хэша темы #theme=...
    const isRoot = parsed.pathname === '/' || parsed.pathname === '';
    const hasThemeHash = Boolean(parsed.hash && parsed.hash.startsWith('#theme='));
    if (isRoot && !hasThemeHash) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Официальный домен YarGram
    if (host === 'yargram.site' || host.endsWith('.yargram.site')) {
      return true;
    }

    // Текущий хост приложения в браузере (Alwaysdata, localhost и т. д.)
    if (
      typeof window !== 'undefined' &&
      window.location?.hostname &&
      host === window.location.hostname.toLowerCase()
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Разбирает адрес и определяет тип внутреннего действия YarGram.
 */
export function parseInternalUrl(rawUrl: string): InternalNavigation | null {
  if (!isInternalYargramUrl(rawUrl)) return null;

  try {
    const currentOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://yargram.site';
    const parsed = new URL(rawUrl.trim(), currentOrigin);

    // Ссылка-приглашение в группу вида /join/<код> или /app/join/<код>
    const joinMatch = /^(?:\/app)?\/join\/([^/?#]+)\/?$/.exec(parsed.pathname);
    if (joinMatch && joinMatch[1]) {
      return {
        type: 'join',
        code: decodeURIComponent(joinMatch[1]),
      };
    }

    // Ссылка на импорт темы оформления: ...#theme=<код>
    if (parsed.hash && parsed.hash.startsWith('#theme=')) {
      return {
        type: 'theme',
        hash: parsed.hash,
      };
    }

    // Главный экран приложения
    if (parsed.pathname === '/app') {
      return {
        type: 'app',
        path: '/app',
      };
    }

    return {
      type: 'route',
      path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    };
  } catch {
    return null;
  }
}

/**
 * Открывает ссылку внутри приложения без создания новой вкладки.
 */
export function navigateInternal(rawUrl: string): boolean {
  const action = parseInternalUrl(rawUrl);
  if (!action) return false;

  if (typeof window === 'undefined') return true;

  switch (action.type) {
    case 'join': {
      // Сообщаем MessengerScreen вступить в группу по коду приглашения
      window.dispatchEvent(
        new CustomEvent('yargram:join-group', {
          detail: { code: action.code },
        }),
      );
      return true;
    }

    case 'theme': {
      // Обновляем хэш и генерируем событие для ThemeLinkImport
      window.location.hash = action.hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    }

    case 'app': {
      window.dispatchEvent(new CustomEvent('yargram:navigate-home'));
      return true;
    }

    case 'route': {
      window.history.pushState(null, '', action.path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return true;
    }
  }
}

/**
 * Глобальный перехватчик кликов по ссылкам на yargram.site в DOM:
 * предотвращает открытие отдельной вкладки браузера и направляет клик в navigateInternal.
 */
export function initInternalLinkInterceptor(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const handleClick = (event: MouseEvent) => {
    // Реагируем только на обычный левый клик без зажатых Ctrl / Cmd / Shift / Alt
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a');
    if (!anchor || !anchor.href) return;

    // Прямые скачивания файлов не перехватываем
    if (anchor.getAttribute('download') !== null) return;
    if (anchor.dataset.noInternal !== undefined) return;

    if (isInternalYargramUrl(anchor.href)) {
      event.preventDefault();
      event.stopPropagation();
      navigateInternal(anchor.href);
    }
  };

  document.addEventListener('click', handleClick, true);
  return () => {
    document.removeEventListener('click', handleClick, true);
  };
}
