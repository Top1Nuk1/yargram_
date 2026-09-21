import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Шифрование данных в покое.
 *
 * Что защищает: текст сообщений (включая отложенные и черновики) и байты
 * загруженных файлов лежат на диске зашифрованными. Если кто-то унесёт файл
 * БД или папку uploads, прочитать переписку без ключа не получится.
 *
 * Чего НЕ делает: это не сквозное шифрование. Сервер в моменте расшифровывает
 * данные, чтобы отдать их клиенту, — поэтому поиск, пересылка и отложенная
 * отправка продолжают работать как раньше.
 *
 * Формат: «yargram1:» + base64(iv | authTag | ciphertext), AES-256-GCM.
 * Префикс нужен, чтобы отличить шифротекст от старых записей, сохранённых
 * до включения шифрования: они читаются как есть (см. decryptText).
 */

const PREFIX = "yargram1:";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_SALT = "yargram-at-rest-v1";

export type CryptoMode = "encrypted" | "plaintext";

/**
 * Насколько зашифрованный файл больше исходного: префикс + IV + тег GCM.
 * Нужно хранилищу, чтобы отличать «файл повреждён» от «файл зашифрован».
 */
export const ENCRYPTION_OVERHEAD = PREFIX.length + IV_LENGTH + TAG_LENGTH;

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Разворачивает секрет из конфига в 32-байтовый ключ AES-256. */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

export class AtRestCrypto {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error("DB_ENCRYPTION_KEY must be at least 16 characters");
    }
    this.key = deriveKey(secret);
  }

  /** Пустой текст не трогаем: иначе пустые сообщения стали бы шифротекстом. */
  encryptText(plain: string): string {
    if (!plain) return plain;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const payload = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, payload]).toString("base64");
  }

  /** Данные, записанные до включения шифрования, отдаются как есть. */
  decryptText(stored: string): string {
    if (!stored || !isEncrypted(stored)) return stored;
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    if (raw.length <= IV_LENGTH + TAG_LENGTH) return stored;
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const payload = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
    } catch {
      // Ключ подменили или данные повреждены — лучше отдать «как есть»,
      // чем уронить выдачу сообщений.
      return stored;
    }
  }

  /** Файлы: шифруем байты, но пустой файл оставляем пустым. */
  encryptBuffer(bytes: Buffer): Buffer {
    if (bytes.length === 0) return bytes;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const payload = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from(PREFIX, "utf8"), iv, tag, payload]);
  }

  /** Префикса нет — значит файл из старой версии, отдаём как есть. */
  decryptBuffer(bytes: Buffer): Buffer {
    if (!hasBufferPrefix(bytes)) return bytes;
    const body = bytes.subarray(PREFIX.length);
    if (body.length <= IV_LENGTH + TAG_LENGTH) return bytes;
    const iv = body.subarray(0, IV_LENGTH);
    const tag = body.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const payload = body.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(payload), decipher.final()]);
    } catch {
      return bytes;
    }
  }
}

function hasBufferPrefix(bytes: Buffer): boolean {
  if (bytes.length < PREFIX.length) return false;
  return bytes.subarray(0, PREFIX.length).toString("utf8") === PREFIX;
}

/** Режим для diagnostics: включено ли шифрование на этих данных. */
export function cryptoModeOf(value: string | null | undefined): CryptoMode {
  return isEncrypted(value) ? "encrypted" : "plaintext";
}
