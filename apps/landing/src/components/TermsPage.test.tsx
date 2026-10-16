import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '../lib/useLandingLanguage';
import { TermsPage } from './TermsPage';

/**
 * Страница соглашения: она юридический документ, поэтому проверяем не
 * «красиво ли», а обязательные вещи: оговорка про Telegram на месте, все
 * шесть языков содержат полный документ, и каждый пункт в оглавлении ведёт
 * в существующий раздел.
 */
beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function renderTerms() {
  return render(
    <LanguageProvider>
      <TermsPage />
    </LanguageProvider>,
  );
}

describe('пользовательское соглашение', () => {
  it('прямо говорит, что Yargram не связан с Telegram', () => {
    renderTerms();
    const text = document.body.textContent ?? '';
    // Без этой фразы человек, сравнивающий мессенджеры по названию, решил бы
    // одно из двух: что это продукт Telegram или что его обманули.
    expect(text).toContain('не связан с Telegram');
    expect(text).toContain('не является продуктом Telegram');
    // Отдельный пункт про совпадение названий: именно из-за него и нужен документ.
    expect(text).toContain('случайно совпадает');
  });

  it('оглавление ведёт в существующие разделы', () => {
    renderTerms();
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#'));
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const link of links) {
      const href = link.getAttribute('href') as string;
      expect(document.getElementById(href.slice(1)), href).not.toBeNull();
    }
  });

  it('в документе есть срок редакции — иначе непонятно, что читать', () => {
    renderTerms();
    expect(document.body.textContent).toContain('Редакция от');
  });

  it('заголовок — единственный заголовок первого уровня', () => {
    renderTerms();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});