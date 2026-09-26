import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { User } from '../../types';
import { UserProfileSheet } from './UserProfileSheet';

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return {
    ...original,
    api: {
      ...original.api,
      user: vi.fn(),
      mediaSummary: vi.fn(),
    },
  };
});

/** Сервер отдаёт помеченному SCAM вместо описания готовое предупреждение. */
const SCAM_TEXT =
  '⚠️ Внимание: на этот аккаунт много жаловались в связи с мошенничеством или попытками выдать себя за официальный аккаунт. Будьте осторожны, особенно если у Вас попросят денег.';

const scammer: User = {
  id: 'scam-1',
  displayName: 'Тимур',
  username: 'timur',
  bio: SCAM_TEXT,
  scam: true,
};

const honest: User = {
  id: 'honest-2',
  displayName: 'Борис',
  username: 'boris',
  bio: 'Люблю рыбалку',
};

beforeEach(() => {
  vi.mocked(api.user).mockImplementation(async (_token, userId) =>
    userId === scammer.id ? scammer : honest,
  );
  vi.mocked(api.mediaSummary).mockResolvedValue({
    photos: 0,
    videos: 0,
    voice: 0,
    videoCircles: 0,
    files: 0,
    audio: 0,
    links: 0,
    gifs: 0,
  });
});

afterEach(cleanup);

describe('карточка профиля и отметка SCAM', () => {
  it('показывает предупреждение и не даёт его скопировать', () => {
    const { container } = render(
      <UserProfileSheet token="token" user={scammer} mode="peer" onClose={() => undefined} />,
    );
    const warning = Array.from(container.querySelectorAll('p')).find((node) =>
      node.textContent?.startsWith('Внимание:'),
    ) as HTMLParagraphElement;

    // Ведущий ⚠️ убирается: на карточке его место занимает значок.
    expect(warning.textContent).toBe(SCAM_TEXT.replace(/^\s*⚠️?\s*/u, ''));
    expect(warning.className).toContain('select-none');
    expect(fireEvent.copy(warning)).toBe(false);
    expect(fireEvent.contextMenu(warning)).toBe(false);
  });

  it('обычное описание по-прежнему выделяется и копируется', () => {
    const { container } = render(
      <UserProfileSheet token="token" user={honest} mode="peer" onClose={() => undefined} />,
    );
    const bio = Array.from(container.querySelectorAll('p')).find(
      (node) => node.textContent === 'Люблю рыбалку',
    ) as HTMLParagraphElement;

    expect(bio).toBeDefined();
    expect(bio.className).not.toContain('select-none');
    expect(fireEvent.copy(bio)).toBe(true);
  });
});
