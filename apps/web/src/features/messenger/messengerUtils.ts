import type { Attachment, Conversation, Message } from '../../types';

export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😎', '🔥', '😢', '😮', '🍓', '🍷'] as const;

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

// Онлайн считается в одном месте — в lib/presence, чтобы списки и шапка чата
// не расходились в ответе.
export { formatLastSeen, isUserOnline } from '../../lib/presence';


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