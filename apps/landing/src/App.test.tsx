import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * 🔥 Без `beforeEach` тесты делили бы общий `document.body`: `render` из
 * предыдущего теста остаётся в DOM, и `getByRole` находит две одинаковые
 * кнопки темы. Чистим перед каждым тестом, а не после — тогда прогон не зависит
 * от того, какие ещё файлы успели отработать.
 */
beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('лендинг Yargram', () => {
  it('показывает название, описание и кнопку перехода в веб-версию', () => {
    vi.stubEnv('VITE_APP_URL', 'https://yargram.example.com');
    render(<App />);

    // Заголовок первого экрана.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('для тех, кто рядом');

    // Кнопка «Открыть Yargram» есть и в шапке, и в финальном блоке, и обе ведут
    // на адрес приложения: лендинг не должен уводить в никуда.
    const links = screen.getAllByRole('link', { name: /yargram/i });
    const toApp = links.filter(
      (link) => link.getAttribute('href') === 'https://yargram.example.com',
    );
    expect(toApp.length).toBeGreaterThanOrEqual(2);
  });

  it('без VITE_APP_URL ведёт на /app, а не в пустоту', () => {
    render(<App />);
    const links = screen.getAllByRole('link', { name: /yargram/i });
    // Хотя бы одна ссылка должна вести на относительный путь приложения.
    expect(links.some((link) => link.getAttribute('href') === '/app')).toBe(true);
  });

  it('перечисляет возможности приложения, а не общие слова', () => {
    render(<App />);
    const features = document.getElementById('features');
    expect(features).not.toBeNull();

    const text = features!.textContent ?? '';
    // Ключевые возможности из реального списка функций Yargram.
    expect(text).toContain('Реакции');
    expect(text).toContain('100 МБ');
    expect(text).toContain('Демонстрация экрана');
    expect(text).toContain('Активные сеансы');
  });

  it('честно перечисляет то, чего пока нет', () => {
    render(<App />);
    const faq = document.getElementById('faq');
    expect(faq).not.toBeNull();
    expect(faq!.textContent).toContain('push');
    expect(faq!.textContent).toContain('Telegram');
  });

  it('рассказывает про версию 0.0.1 ЗБТ и расшифровывает сокращение', () => {
    render(<App />);
    const updates = document.getElementById('updates');
    expect(updates).not.toBeNull();

    const text = updates!.textContent ?? '';
    expect(text).toContain('0.0.1');
    expect(text).toContain('ЗБТ');
    // Сокращение знакомо не всем — расшифровка обязана быть на странице.
    expect(text).toContain('закрытое бета-тестирование');
    // И это именно открытие беты, а не «очередная версия».
    expect(text).toContain('Открытие');
  });

  it('в обновлениях перечислены возможности выпуска', () => {
    render(<App />);
    const updates = document.getElementById('updates');
    const text = updates!.textContent ?? '';
    // По одной строке из разных направлений — блок наполнен, а не пуст.
    expect(text).toContain('Реакции');
    expect(text).toContain('Демонстрация экрана');
    expect(text).toContain('Активные сеансы');
    expect(text).toContain('Семь встроенных тем');
  });

  it('ни в одном разделе нет слов про админские возможности владельца', () => {
    render(<App />);
    // 🔥 Просьба владельца: его внутренние инструменты — не для сайта.
    // «Администраторы группы», «теги» и «мьют» — возможности обычного человека,
    // поэтому ищем не «админ» вообще, а именно признаки панели владельца.
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const word of [
      'панель администратора',
      'админ-панел',
      'модератор',
      'scam',
      'fake',
      'заморожен',
      'выдать значок',
      'жалобу рассмотр',
      'список аккаунтов',
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it('в призыве стоит настоящий знак Yargram — плитка, но без белой обёртки', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Открыть Yargram' });
    const cta = heading.closest('div')!.parentElement!;
    const mark = cta.querySelector('[role="img"][aria-label="Yargram"]');
    expect(mark).not.toBeNull();

    // 🔥 Знак — именно плитка Yargram (`Yargram-plate.png`): светлый прямоугольник
    // с синим кругом и буквой, а не белый круг с синей буквой.
    const plate = mark!.querySelector('rect');
    expect(plate).not.toBeNull();
    // Цвета знака пришпилены к самому знаку, а не к теме: блок призыва синий в
    // любой теме, иначе на тёмной светлая плитка стала бы тёмным квадратом.
    expect(plate!.getAttribute('class')).toContain('#EBF3FC');
    const circle = mark!.querySelector('circle');
    expect(circle).not.toBeNull();
    expect(circle!.getAttribute('class')).toContain('#3390EC');

    // Но белой обёртки вокруг знака быть не должно: она давала вторую светлую
    // окантовку поверх плитки — владелец просил её убрать.
    expect(mark!.closest('[class*="bg-white"]')).toBeNull();
  });

  it('карточки увеличиваются при наведении', () => {
    render(<App />);
    // Класс `.card-lift` даёт `transform: scale()` — проверяем, что он вообще
    // применён к поверхностям-карточкам, а не забыт где-то по дороге.
    const lifted = document.querySelectorAll('.card-lift');
    expect(lifted.length).toBeGreaterThanOrEqual(5);
  });

  it('переключает тёмную тему и запоминает выбор', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: /тёмная тема/i }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('yargram.landing.theme')).toBe('dark');

    // Кнопка теперь предлагает вернуться к светлой — состояние не «залипло».
    expect(screen.getByRole('button', { name: /светлая тема/i })).toBeInTheDocument();
  });

  it('берёт сохранённую тему из хранилища при открытии', () => {
    localStorage.setItem('yargram.landing.theme', 'dark');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('подвал ведёт на разделы страницы, а не в пустоту', () => {
    render(<App />);
    const footer = screen.getByRole('contentinfo');
    const anchors = within(footer)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    for (const href of anchors) {
      if (!href?.startsWith('#')) continue;
      // Каждый якорь должен указывать на существующий раздел: ссылка в никуда
      // выглядит как ошибка страницы.
      expect(document.getElementById(href.slice(1))).not.toBeNull();
    }
  });

  it('ведёт на Telegram-канал из шапки и подвала', () => {
    render(<App />);
    // Ссылка на канал стоит в двух местах — значком в шапке и подписью в подвале.
    const links = screen.getAllByRole('link', { name: /telegram/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://t.me/Yargram_official');
      // Внешняя ссылка обязана открываться в новой вкладке и не тащить referrer.
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

it('переключает язык на английский и обновляет контент и <html lang>', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 🔥 По умолчанию — русский, и только русский (браузерное определение
// намеренно не берём, чтобы не ломать ожидания владельца).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('для тех, кто рядом');
    expect(document.documentElement.lang).toBe('ru');

    // Открываем переключатель (кнопка подписана текущим языком) и выбираем English.
    await user.click(screen.getByRole('button', { name: /русский/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /english/i }));

    // Язык применился к странице и запомнился на устройстве.
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('yargram.landing.lang')).toBe('en');
    // Контент реально перерисовался: русская фраза заголовка ушла.
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain(
      'для тех, кто рядом',
    );
  });

  it('на сайте есть оговорка про Telegram и ссылка на соглашение', () => {
    render(<App />);
    const text = document.body.textContent ?? '';

    // 🔥 Название сходится с Telegram, поэтому оговорку нельзя прятать:
    // без неё человек решит, что Yargram — это продукт Telegram.
    expect(text).toContain('не связан с Telegram');

    const terms = screen.getAllByRole('link').filter(
      (link) => link.getAttribute('href') === '/terms',
    );
    // Ссылка в подвале и в блоке призыва: обе заметны, обе ведут на документ.
    expect(terms.length).toBeGreaterThanOrEqual(2);
  });

  it('шапка ужимается на узком экране, а не выталкивает страницу вбок', () => {
    render(<App />);
    const header = document.querySelector('header');
    expect(header).not.toBeNull();

    // Кнопка перехода в шапке подписана текстом, который на телефоне скрыт.
    // 🔥 Раньше подпись была всегда, и шапка не влезала в 390 px: сайт уезжал
    // вбок на 45 px, и это молча ломало всю вёрстку на телефоне. Поэтому у
    // ссылки остаётся `aria-label` (доступность), а текст живёт под `sm`.
    const cta = [...(header?.querySelectorAll('a') ?? [])].find(
      (link) => link.getAttribute('title') !== null && link.textContent?.trim() === '',
    );
    expect(cta?.getAttribute('aria-label')).toBeTruthy();

    // Надпись логотипа в шапке — только на широком экране.
    const wordmark = [...(header?.querySelectorAll('span') ?? [])].find((node) =>
      node.textContent?.trim() === 'Yargram',
    );
    expect(wordmark?.className).toContain('hidden');
  });
});
