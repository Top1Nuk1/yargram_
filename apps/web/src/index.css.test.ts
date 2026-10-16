import { describe, expect, it } from 'vitest';
import css from './index.css?raw';

/**
 * Страж глобальной раскладки.
 *
 * Правила в CSS не видит ни один тест на разметку: jsdom не считает размеры.
 * А ломается от них много — молча и не в том месте. Поэтому проверяем сам
 * файл: список тут короткий и все правила с объяснением, зачем они.
 */
describe('глобальные стили раскладки', () => {
  // 🔥 Комментарии из проверки выбрасываем. Иначе правило, упомянутое в
  // пояснении («прежнее `scrollbar-width: thin` их только сужало»), считалось бы
  // живым — и сторож срабатывал бы на собственном объяснении, а не на коде.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

  it('сбрасывает у fieldset браузерный min-inline-size', () => {
    // 🔥 Без этого `<fieldset>` не даёт форме стать уже своего содержимого:
    // широкая лента внутри распирает карточку профиля до ширины ленты, и она
    // вылезает за экран. Поле должно подчиняться родителю.
    expect(code).toContain('fieldset { min-inline-size: 0; }');
  });

  it('прячет полосы прокрутки, оставляя саму прокрутку', () => {
    // 🔥 Полосу рисует система, а не мы: прежнее `thin` её только сужало —
    // стрелки и уголки оставались на месте. Колесо, свайп, тачпад и клавиатура
    // листают и без полосы, поэтому её можно убрать целиком.
    //
    // Три правила — три движка, и одного мало: `scrollbar-width` понимает
    // Firefox и свежий Chromium, `-ms-overflow-style` — старый Edge,
    // `::-webkit-scrollbar` — Safari и Chromium постарше. Без запаса полоса
    // вернётся ровно в том браузере, где правила нет.
    expect(code).toContain('scrollbar-width: none');
    expect(code).toContain('-ms-overflow-style: none');
    expect(code).toContain('::-webkit-scrollbar { width: 0; height: 0; }');
  });

  it('не оставляет правил, которые снова показали бы полосу', () => {
    // Сторож от возврата: `thin` снова включил бы системную полосу со стрелками,
    // а `thumb`/`track` вернули бы её в WebKit.
    expect(code).not.toContain('scrollbar-width: thin');
    expect(code).not.toContain('::-webkit-scrollbar-thumb');
    expect(code).not.toContain('::-webkit-scrollbar-track');
  });
});
