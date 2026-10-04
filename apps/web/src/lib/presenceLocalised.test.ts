import { describe, expect, it } from 'vitest';
import { createTranslator } from '../lib/i18n';
import { formatLastSeen, presenceBucketLabel } from './presence';
import { translateScamWarning } from '../lib/i18n';
import type { User } from '../types';

const user: User = { id: 'peer', displayName: 'Peer', lastSeenAt: '2026-05-14T09:05:00Z', online: false };

/**
 * Подписи присутствия и предупреждение SCAM должны переводиться: это проверка
 * того, что переводчик действительно доходит до строк, а не только до разметки.
 */
describe('localised presence', () => {
  it('переводит «был(а) недавно» на английский и болгарский', () => {
    const hidden = { ...user, lastSeenStatus: 'recently' as const };

    expect(formatLastSeen(hidden, createTranslator('en'))).toBe('Last seen recently');
    expect(formatLastSeen(hidden, createTranslator('bg'))).toBe('Беше наскоро');
  });

  it('переводит точное время и подставляет его в шаблон', () => {
    const now = new Date(2026, 4, 14, 12, 0);
    const at = { ...user, lastSeenAt: new Date(2026, 4, 14, 9, 5).toISOString() };

    expect(formatLastSeen(at, createTranslator('en'), now)).toBe('Last seen at 09:05');
    expect(formatLastSeen(at, createTranslator('bg'), now)).toBe('Беше в 09:05');
  });

  it('переводит группы присутствия в списке участников', () => {
    expect(presenceBucketLabel('online', createTranslator('en'))).toBe('Online');
    expect(presenceBucketLabel('long_ago', createTranslator('en'))).toBe('A long time ago');
    expect(presenceBucketLabel('recent', createTranslator('bg'))).toBe('Наскоро');
    // Без переводчика — русская подпись.
    expect(presenceBucketLabel('online')).toBe('В сети');
  });
});

describe('localised scam warning', () => {
  const account = '⚠️ Внимание: на этот аккаунт часто жаловались в связи с мошенничеством.';
  const group = '⚠️ Внимание: на эту группу часто жаловались в связи с мошенничеством.';

  it('переводит предупреждение аккаунта и снимает ведущий ⚠️', () => {
    const text = translateScamWarning(account, createTranslator('en'));

    expect(text).not.toContain('⚠️');
    expect(text).toContain('Warning');
    expect(text).toContain('reported for fraud');
  });

  it('переводит предупреждение группы отдельным текстом', () => {
    const accountText = translateScamWarning(account, createTranslator('en'));
    const groupText = translateScamWarning(group, createTranslator('en'));

    expect(groupText).toContain('this group');
    expect(groupText).not.toBe(accountText);
  });

  it('узнаёт старое предупреждение про «много жаловались»', () => {
    const legacy = '⚠️ Внимание: на этот аккаунт много жаловались в связи с мошенничеством.';

    expect(translateScamWarning(legacy, createTranslator('en'))).toContain('Warning');
  });

  it('не трогает обычное описание «о себе»', () => {
    const bio = 'Люблю рыбалку и горы';

    expect(translateScamWarning(bio, createTranslator('en'))).toBe(bio);
  });

  it('переводит предупреждение FAKE отдельным текстом', () => {
    const fake = '⚠️ Внимание: многие жаловались, что этот аккаунт выдаёт себя за официальный.';
    const text = translateScamWarning(fake, createTranslator('en'));

    expect(text).not.toContain('⚠️');
    expect(text).toContain('impersonates an official');
    // Ветки SCAM и FAKE не должны схлопываться в один текст.
    expect(text).not.toBe(translateScamWarning(account, createTranslator('en')));
  });
});
