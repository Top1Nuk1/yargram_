import type { Attachment, AttachmentKind, AttachmentView, CurrentUser, MediaKind } from "../domain/models.js";
import { type AtRestCrypto } from "../lib/crypto.js";
import type { Repositories } from "../repositories/types.js";
export declare const uploadLimits: {
    avatar: number;
    banner: number;
    wallpaper: number;
    image: number;
    file: number;
    sticker: number;
    gif: number;
};
type UploadInput = {
    fileName: string;
    mimeType: string;
    data: Buffer;
    mediaKind?: MediaKind;
    durationSeconds?: number;
};
export declare class UploadService {
    private readonly repositories;
    private readonly uploadDirectory;
    private readonly canAccessAttachment;
    private readonly crypto;
    constructor(repositories: Repositories, uploadDirectory: string, canAccessAttachment: (userId: string, attachment: Attachment) => Promise<boolean>, crypto: AtRestCrypto);
    initialize(): Promise<void>;
    upload(userId: string, kind: AttachmentKind, input: UploadInput): Promise<AttachmentView>;
    setAvatar(userId: string, input: UploadInput): Promise<CurrentUser>;
    removeAvatar(userId: string): Promise<CurrentUser>;
    /**
     * Баннер профиля. Прежний файл удаляем только после успешной записи: иначе
     * при ошибке сохранения человек остался бы и без нового баннера, и без старого.
     */
    setBanner(userId: string, input: UploadInput): Promise<CurrentUser>;
    removeBanner(userId: string): Promise<CurrentUser>;
    /**
     * Uploads are served only through the temporary link issued in an API response.
     * The link names the account it was issued to, and that account must still own
     * the attachment or still take part in a conversation that references it.
     */
    getAuthorizedFile(id: string, token: string | undefined): Promise<{
        attachment: Attachment;
        filePath: string;
    }>;
    /** Тот же доступ, но сразу отдаёт расшифрованные байты — файлы лежат зашифрованными. */
    readAuthorizedFile(id: string, token: string | undefined): Promise<{
        attachment: Attachment;
        bytes: Buffer;
    }>;
    /**
   * Прочитать свой файл по id — без подписи в адресе.
   *
   * Нужен там, где файл свежий и его только что загрузили: у стикера надо
   * посмотреть сигнатуру (анимированный он или нет), а подписанная ссылка для
   * этого лишняя — она живёт недолго и предназначена для отдачи в браузер.
   */
    readOwnFile(userId: string, attachmentId: string): Promise<Buffer>;
    private readStoredBytes;
    /**
     * Стирает аватары человека — и с диска, и из базы. Нужно при удалении аккаунта.
     * Файлы из переписки не трогаем: история остаётся у собеседников (как в
     * Telegram), поэтому вложения должны продолжать открываться.
     */
    deleteUserAvatars(userId: string): Promise<void>;
    private assertMediaAccess;
    getStoredFile(id: string): Promise<{
        attachment: Attachment;
        filePath: string;
    }>;
    private deleteStoredAttachment;
    private resolveStoredFile;
}
export {};
