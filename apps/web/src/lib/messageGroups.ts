import type { Message } from '../types';
import { messageSenderId } from './conversation';
import { formatDayLabel } from './format';

/**
 * Служебное сообщение: системное событие или звонок. Такие строки рисуются
 * отдельным блоком и никогда не получают аватар, поэтому они всегда разрывают
 * серию сообщений одного автора.
 */
export function isServiceMessage(message: Pick<Message, 'kind'> | null | undefined): boolean {
  return message?.kind === 'system' || message?.kind === 'call';
}

export interface MessageGroup {
  /** Подпись разделителя дня: «Сегодня», «Вчера» или полная дата. */
  day: string;
  /** Показывать ли над сообщением разделитель дня. */
  showDay: boolean;
  /** Служебное сообщение — рисуется своей разметкой, без пузыря и аватара. */
  service: boolean;
  /** Сообщение продолжает серию предыдущего автора (пузыри почти слипаются). */
  continuesGroup: boolean;
  /** Сообщение последнее в серии — у него показывается аватар автора. */
  endsGroup: boolean;
}

const EMPTY_GROUP: MessageGroup = {
  day: '',
  showDay: false,
  service: false,
  continuesGroup: false,
  endsGroup: false,
};

/** Автор сообщения, если он известен. */
function senderOf(message: Message | undefined): string | undefined {
  return message ? messageSenderId(message) : undefined;
}

/**
 * Размечает список сообщений: где проходят границы дней и где заканчиваются
 * серии сообщений одного автора. Считается за один проход и с одной точкой
 * «сейчас» на весь список — иначе у сообщений, попавших на границу суток,
 * разделители дней могли бы разъехаться.
 */
export function buildMessageGroups(messages: readonly Message[], now = new Date()): MessageGroup[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const day = formatDayLabel(message.createdAt, now);
    const nextDay = next ? formatDayLabel(next.createdAt, now) : day;

    const service = isServiceMessage(message);
    const previousDay = formatDayLabel(previous?.createdAt, now);

    // Своя серия у сообщения, если это первая строка, служебная запись,
    // новый день или сменился автор. Служебные записи всегда отдельно:
    // они рисуются своей разметкой и не должны прилипать к пузырям.
    const startsOwnGroup =
      index === 0 ||
      service ||
      day !== previousDay ||
      isServiceMessage(previous) ||
      senderOf(previous) !== senderOf(message);

    return {
      day,
      showDay: index === 0 || day !== previousDay,
      service,
      continuesGroup: !startsOwnGroup,
      // Аватар рисуют только обычные сообщения, поэтому служебная запись
      // серию не завершает.
      endsGroup:
        !service &&
        (!next ||
          isServiceMessage(next) ||
          nextDay !== day ||
          senderOf(next) !== senderOf(message)),
    };
  });
}

/** Флаги группы для сообщения. Для отсутствующей позиции — безопасные значения. */
export function groupAt(groups: readonly MessageGroup[], index: number): MessageGroup {
  return groups[index] ?? EMPTY_GROUP;
}

/** Отступ перед сообщением: внутри серии пузыри почти слипаются, между сериями — зазор. */
export function groupSpacing(index: number, group: MessageGroup): string {
  if (index === 0) return '';
  return group.continuesGroup ? 'mt-0.5' : 'mt-3';
}
