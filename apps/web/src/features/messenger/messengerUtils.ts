import type { Attachment, Conversation, Message, User } from '../../types';
import { formatMessageTime } from '../../lib/format';

export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😎', '🔥', '😢', '😮'] as const;

export const COMPOSER_EMOJIS = [
  '😀', '😃', '😄', '😁', '😂', '😊', '😍', '🥰', '😎', '🤔',
  '👍', '👎', '👏', '🙏', '❤️', '💜', '🔥', '🎉', '✨', '💯',
  '😢', '😭', '😮', '😱', '😡', '🤝', '👋', '💪', '🚀', '✅',
] as const;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const AUDIO_EXTENSIONS = new Set(['webm', 'mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus']);
const IMAGE_LIMIT = 20 * 1024 * 1024;
const FILE_LIMIT = 100 * 1024 * 1024;

export type UploadKind = 'image' | 'file';

export interface FileValidationResult {
  kind: UploadKind;
  error?: string;
}

export function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLocaleLowerCase('en-US') ?? '';
}

export function validateOutgoingFile(file: File): FileValidationResult {
  const image = IMAGE_MIME_TYPES.has(file.type) && IMAGE_EXTENSIONS.has(fileExtension(file.name));
  if (file.type.startsWith('image/') && !image) {
    return { kind: 'image', error: 'Фото должно быть в формате JPG, PNG, WEBP или GIF.' };
  }
  if (image && file.size > IMAGE_LIMIT) {
    return { kind: 'image', error: 'Размер фотографии не должен превышать 20 МБ.' };
  }
  if (!image && file.size > FILE_LIMIT) {
    return { kind: 'file', error: 'Размер файла не должен превышать 100 МБ.' };
  }
  if (file.size === 0) {
    return { kind: image ? 'image' : 'file', error: 'Нельзя отправить пустой файл.' };
  }
  return { kind: image ? 'image' : 'file' };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unit;
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function isImageAttachment(attachment: Attachment): boolean {
  return attachment.kind === 'image' || attachment.mimeType.startsWith('image/');
}

export function isVoiceAttachment(attachment: Attachment): boolean {
  return (
    attachment.mimeType?.startsWith('audio/') ||
    (attachment.kind === 'file' &&
      AUDIO_EXTENSIONS.has(fileExtension(attachment.fileName)))
  );
}

export function conversationPins(conversation: Conversation | null | undefined): Message[] {
  if (!conversation) return [];
  const pins = conversation.pinnedMessages?.length
    ? conversation.pinnedMessages
    : conversation.pinnedMessage
      ? [conversation.pinnedMessage]
      : [];
  return Array.from(new Map(pins.map((message) => [message.id, message])).values());
}

export function isUserOnline(user: User | null | undefined): boolean {
  return !user?.lastSeenStatus && user?.showLastSeen !== false && Boolean(user?.isOnline ?? user?.online);
}

export function formatLastSeen(user: User | null | undefined, now = new Date()): string {
  if (!user) return 'Статус неизвестен';
  if (user.lastSeenStatus) {
    return {
      recently: 'Был(а) недавно',
      within_week: 'Был(а) на прошлой неделе',
      within_month: 'Был(а) в прошлом месяце',
      long_ago: 'Был(а) давно',
    }[user.lastSeenStatus];
  }
  if (user.showLastSeen === false) return 'Был(а) давно';
  if (isUserOnline(user)) return 'В сети';
  if (!user.lastSeenAt) return 'Был(а) давно';
  const seen = new Date(user.lastSeenAt);
  if (Number.isNaN(seen.getTime())) return 'Был(а) давно';

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startSeen = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = formatMessageTime(user.lastSeenAt);
  if (startSeen.getTime() === startToday.getTime()) return `Был(а) сегодня в ${time}`;
  if (startSeen.getTime() === yesterday.getTime()) return `Был(а) вчера в ${time}`;
  const date = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long',
    ...(seen.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(seen);
  return `Был(а) ${date} в ${time}`;
}

// Conversation muting helper
export function conversationIsMuted(conversation: Conversation | null | undefined): boolean {
  if (!conversation?.mutedUntil) return false;
  if (conversation.mutedUntil === 'forever') return true;
  const until = new Date(conversation.mutedUntil);
  return until.getTime() > Date.now();
}

// Human‑readable summary of a message (used in UI, notifications, forward modal)
export function messageSummary(message: Message | null | undefined): string {
  if (!message) return '';
  if (message.kind === 'system' || message.kind === 'call') {
    return message.text ?? 'Системное сообщение';
  }
  if (message.text?.trim()) return message.text;

  const imageCount = message.attachments?.filter(isImageAttachment).length ?? 0;
  const totalCount = message.attachments?.length ?? 0;
  const fileCount = totalCount - imageCount;

  if (imageCount && fileCount) {
    return `📷 Фото: ${imageCount} · 📎 Файлы: ${fileCount}`;
  }
  if (imageCount) {
    return imageCount === 1 ? '📷 Фото' : `📷 Фото: ${imageCount}`;
  }
  if (fileCount) {
    return fileCount === 1 ? '📎 Файл' : `📎 Файлы: ${fileCount}`;
  }
  return 'Сообщение';
}