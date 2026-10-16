export type CryptoMode = "encrypted" | "plaintext";
/**
 * Насколько зашифрованный файл больше исходного: префикс + IV + тег GCM.
 * Нужно хранилищу, чтобы отличать «файл повреждён» от «файл зашифрован».
 */
export declare const ENCRYPTION_OVERHEAD: number;
export declare function isEncrypted(value: string | null | undefined): boolean;
export declare class AtRestCrypto {
    private readonly key;
    constructor(secret: string);
    /** Пустой текст не трогаем: иначе пустые сообщения стали бы шифротекстом. */
    encryptText(plain: string): string;
    /** Данные, записанные до включения шифрования, отдаются как есть. */
    decryptText(stored: string): string;
    /** Файлы: шифруем байты, но пустой файл оставляем пустым. */
    encryptBuffer(bytes: Buffer): Buffer;
    /** Префикса нет — значит файл из старой версии, отдаём как есть. */
    decryptBuffer(bytes: Buffer): Buffer;
}
/** Режим для diagnostics: включено ли шифрование на этих данных. */
export declare function cryptoModeOf(value: string | null | undefined): CryptoMode;
