import { describe, expect, it } from 'vitest';
import { mergeHandles } from './handles';

describe('mergeHandles', () => {
  it('добавляет новые ники к уже выданным, не заменяя список', () => {
    expect(mergeHandles(['kotik', 'second_name'], 'third')).toEqual([
      'kotik',
      'second_name',
      'third',
    ]);
  });

  it('принимает список через запятую, пробел и с ведущим @', () => {
    expect(mergeHandles([], '@kotik, second_name third')).toEqual(['kotik', 'second_name', 'third']);
  });

  it('не плодит повторы без учёта регистра', () => {
    expect(mergeHandles(['Kotik'], 'kotik, KOTIK, second')).toEqual(['Kotik', 'second']);
  });

  it('оставляет прежний список, когда ничего нового не вписали', () => {
    expect(mergeHandles(['kotik'], '  ,  ')).toEqual(['kotik']);
    expect(mergeHandles(null, 'kotik')).toEqual(['kotik']);
  });
});
