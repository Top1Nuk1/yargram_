import type { Attachment, Conversation, Message } from '../../types';

export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😎', '🔥', '😢', '😮', '🍓', '🍷'] as const;

export interface EmojiCategory {
  id: string;
  nameKey: string;
  icon: string;
  emojis: readonly string[];
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'smileys',
    nameKey: 'emoji.smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '🫠', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚',
      '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🫣', '🤭',
      '🥱', '🤫', '🫡', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒',
      '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '😵‍💫', '🤯',
      '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁',
      '☹️', '😮', '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨',
      '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩',
      '😫', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩',
      '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
    ],
  },
  {
    id: 'gestures',
    nameKey: 'emoji.gestures',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
      '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠',
      '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫦',
    ],
  },
  {
    id: 'hearts',
    nameKey: 'emoji.hearts',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️',
      '☦️', '🛐', '⛎', '💯', '💢', '♨️', '💥', '💫', '💬', '💭',
      '✨', '⭐️', '🌟', '⚡️', '🔥', '🎉', '🎊', '🎈', '🎁', '🏆',
      '🥇', '🥈', '🥉', '👑', '💎', '✅', '❌', '⭕️', '‼️', '❓',
    ],
  },
  {
    id: 'nature',
    nameKey: 'emoji.nature',
    icon: '🐱',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
      '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐒', '🐔', '🐧', '🐦',
      '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝',
      '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🕷️', '🐢', '🐍', '🦎',
      '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
      '🦈', '🦭', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛',
      '🦏', '🐪', '🐫', '🦒', '🦘', '🌲', '🌳', '🌴', '🌱', '🌿',
      '☘️', '🍀', '🎍', '🪴', '🍃', '🍂', '🍁', '🍄', '💐', '🌸',
      '🌹', '🌺', '🌻', '🌼', '🌷', '🌞', '🌙', '⭐️', '🌈', '☁️',
    ],
  },
  {
    id: 'food',
    nameKey: 'emoji.food',
    icon: '🍕',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦',
      '🥒', '🌶️', '🌽', '🥕', '🧄', '🧅', '🥔', '🥐', '🥯', '🍞',
      '🥖', '🥨', '🧀', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖',
      '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗',
      '🥘', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙',
      '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬',
      '🍫', '🍿', '🍩', '🍪', '☕️', '🫖', '🍵', '🧃', '🥤', '🧋',
      '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾',
    ],
  },
  {
    id: 'activities',
    nameKey: 'emoji.activities',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸',
      '🏒', '🥊', '🥋', '🛹', '🛼', '⛷️', '🏂', '🏋️', '🤺', '🏇',
      '🧘', '🏄', '🏊', '🚣', '🚴', '🚵', '🎮', '🕹️', '🎲', '♟️',
      '🎯', '🎳', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷',
      '🎺', '🎸', '🎻', '🚗', '🚕', '🚙', '🏎️', '🚓', '🚑', '🚒',
      '🚲', '🛴', '✈️', '🚀', '🛸', '🚁', '⛵️', '🚤', '🚢', '⚓️',
      '📱', '💻', '🖥️', '⌨️', '📷', '📸', '📹', '📺', '📻', '💡',
      '🔍', '✉️', '📦', '✏️', '📌', '🔒', '🔑', '🛠️', '🧰', '💰',
    ],
  },
] as const;

export const COMPOSER_EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

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
  // 🔥 Видео-гифка лежит во вложениях с `kind=gif` и mime видео: показывать
  // её картинкой нужно явно, иначе она уехала бы в «Файлы» и выглядела бы
  // обычным вложением без картинки — то есть гифка перестала бы играть.
  if (attachment.kind === 'gif') return true;
  return attachment.kind === 'image' || attachment.mimeType.startsWith('image/');
}

/**
 * Гифка, загруженная как видео: её надо показывать `<video>` с автозапуском.
 * По одному mime это не отличить от обычного видео, поэтому смотрим на вид.
 */
export function isVideoGifAttachment(attachment: Attachment): boolean {
  return attachment.kind === 'gif' && (attachment.mimeType ?? '').startsWith('video/');
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

  // 🔥 Стикер и набор идут без текста и без вложений: по старым правилам они
  // попадали в «Сообщение», и в списке чатов и в уведомлении было бы пусто.
  const stickerCount = message.stickers?.length ?? 0;
  if (stickerCount) {
    return stickerCount === 1 ? '🏷️ Стикер' : `🏷️ Стикеры: ${stickerCount}`;
  }
  if (message.stickerPackId) return '🎁 Набор стикеров';

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