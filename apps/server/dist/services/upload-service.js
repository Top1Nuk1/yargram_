import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { toAttachmentView, toCurrentUser } from "../domain/models.js";
import { ENCRYPTION_OVERHEAD } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { verifyMediaToken } from "../lib/media-links.js";
const MEBIBYTE = 1024 * 1024;
export const uploadLimits = {
    avatar: 10 * MEBIBYTE,
    // Баннер — широкая полоса, которую часто делают анимированным GIF: такие
    // файлы весят заметно больше статичной картинки, поэтому лимит выше аватара.
    banner: 50 * MEBIBYTE,
    // Фон чата — то же, что баннер, по сути: его тоже ставят GIF-ом и он тянет
    // на десятки мегабайт. Отделён от `image` затем, чтобы поднять предел фону,
    // не сдвигая предел обычного фото в переписке (там 20 МиБ — и это
    // обещание из интерфейса, которое нельзя менять молча).
    wallpaper: 50 * MEBIBYTE,
    image: 20 * MEBIBYTE,
    file: 100 * MEBIBYTE,
    // Стикер — маленькая картинка 512×512, как в любом мессенджере. Предел низкий
    // намеренно: набор из 200 стикеров по несколько мегабайт каждый — это гигабайт
    // на диске у одного человека, а стикеры рисуют мелкими.
    sticker: 2 * MEBIBYTE,
    // Гифка — короткое видео без звука. Предел ниже обычного файла: гифку смотрят
    // в переписке, и она должна успеть приехать.
    gif: 12 * MEBIBYTE,
};
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const allowedAvatarExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
// Баннер — единственная картинка профиля, которой разрешён GIF: он анимированный,
// а аватар в кружке 40 px от анимации только рябит. Живая полоса — как раз то,
// чего от баннера ждут.
const allowedBannerExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
// Фон — как баннер: статичная картинка или GIF, без сюрпризов.
const allowedWallpaperExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
// Стикер — картинка, и почти всегда анимированная: GIF, анимированный WebP или
// APNG. JPEG разрешён тоже: статичный стикер ничем не хуже.
const allowedStickerExtensions = new Set([".png", ".webp", ".gif", ".jpg", ".jpeg"]);
// Живое оформление: фон и баннер можно сделать видео. Форматы — только те, что
// браузеры играют сами, без внешних кодеков: mp4 (H.264) и webm.
const videoExtensions = new Set([".mp4", ".webm"]);
const videoMimeByExtension = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
};
const mimePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;
export class UploadService {
    repositories;
    uploadDirectory;
    canAccessAttachment;
    crypto;
    constructor(repositories, uploadDirectory, canAccessAttachment, crypto) {
        this.repositories = repositories;
        this.uploadDirectory = uploadDirectory;
        this.canAccessAttachment = canAccessAttachment;
        this.crypto = crypto;
    }
    async initialize() {
        await mkdir(this.uploadDirectory, { recursive: true });
    }
    async upload(userId, kind, input) {
        await this.initialize();
        if (!(await this.repositories.users.findById(userId))) {
            throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
        }
        const validated = validateUpload(kind, input);
        const storedFileName = `${randomUUID()}${validated.extension}`;
        const filePath = this.resolveStoredFile(storedFileName);
        // На диск кладём шифротекст: сам файл (а не только имя) ни о чём не говорит.
        await writeFile(filePath, this.crypto.encryptBuffer(input.data), { flag: "wx", mode: 0o600 });
        try {
            const attachment = await this.repositories.attachments.create({
                ownerId: userId,
                kind,
                fileName: validated.fileName,
                storedFileName,
                mimeType: validated.mimeType,
                size: input.data.length,
                ...(input.mediaKind === undefined ? {} : { mediaKind: input.mediaKind }),
                ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
            });
            return toAttachmentView(attachment);
        }
        catch (error) {
            await rm(filePath, { force: true });
            throw error;
        }
    }
    async setAvatar(userId, input) {
        const previous = await this.repositories.users.findById(userId);
        if (!previous)
            throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
        const avatar = await this.upload(userId, "avatar", input);
        try {
            const updated = await this.repositories.users.update(userId, { avatar });
            if (previous.avatar?.id && previous.avatar.id !== avatar.id) {
                await this.deleteStoredAttachment(previous.avatar.id);
            }
            return toCurrentUser(updated);
        }
        catch (error) {
            await this.deleteStoredAttachment(avatar.id);
            throw error;
        }
    }
    async removeAvatar(userId) {
        const previous = await this.repositories.users.findById(userId);
        if (!previous)
            throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
        const updated = await this.repositories.users.update(userId, { avatar: null });
        if (previous.avatar?.id)
            await this.deleteStoredAttachment(previous.avatar.id);
        return toCurrentUser(updated);
    }
    /**
     * Баннер профиля. Прежний файл удаляем только после успешной записи: иначе
     * при ошибке сохранения человек остался бы и без нового баннера, и без старого.
     */
    async setBanner(userId, input) {
        const previous = await this.repositories.users.findById(userId);
        if (!previous)
            throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
        const banner = await this.upload(userId, "banner", input);
        try {
            const updated = await this.repositories.users.update(userId, { banner });
            if (previous.banner?.id && previous.banner.id !== banner.id) {
                await this.deleteStoredAttachment(previous.banner.id);
            }
            return toCurrentUser(updated);
        }
        catch (error) {
            await this.deleteStoredAttachment(banner.id);
            throw error;
        }
    }
    async removeBanner(userId) {
        const previous = await this.repositories.users.findById(userId);
        if (!previous)
            throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
        const updated = await this.repositories.users.update(userId, { banner: null });
        if (previous.banner?.id)
            await this.deleteStoredAttachment(previous.banner.id);
        return toCurrentUser(updated);
    }
    /**
     * Uploads are served only through the temporary link issued in an API response.
     * The link names the account it was issued to, and that account must still own
     * the attachment or still take part in a conversation that references it.
     */
    async getAuthorizedFile(id, token) {
        if (!token) {
            throw new AppError(401, "MEDIA_LINK_REQUIRED", "This media link is missing its access token");
        }
        const { subject } = verifyMediaToken(token);
        const file = await this.getStoredFile(id);
        await this.assertMediaAccess(file.attachment, subject);
        return file;
    }
    /** Тот же доступ, но сразу отдаёт расшифрованные байты — файлы лежат зашифрованными. */
    async readAuthorizedFile(id, token) {
        const { attachment } = await this.getAuthorizedFile(id, token);
        return { attachment, bytes: await this.readStoredBytes(attachment) };
    }
    /**
   * Прочитать свой файл по id — без подписи в адресе.
   *
   * Нужен там, где файл свежий и его только что загрузили: у стикера надо
   * посмотреть сигнатуру (анимированный он или нет), а подписанная ссылка для
   * этого лишняя — она живёт недолго и предназначена для отдачи в браузер.
   */
    async readOwnFile(userId, attachmentId) {
        const attachment = await this.repositories.attachments.findById(attachmentId);
        if (!attachment || attachment.ownerId !== userId) {
            throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
        }
        return this.readStoredBytes(attachment);
    }
    async readStoredBytes(attachment) {
        const filePath = this.resolveStoredFile(attachment.storedFileName);
        let stored;
        try {
            stored = await readFile(filePath);
        }
        catch {
            throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
        }
        return this.crypto.decryptBuffer(stored);
    }
    /**
     * Стирает аватары человека — и с диска, и из базы. Нужно при удалении аккаунта.
     * Файлы из переписки не трогаем: история остаётся у собеседников (как в
     * Telegram), поэтому вложения должны продолжать открываться.
     */
    async deleteUserAvatars(userId) {
        for (const attachment of await this.repositories.attachments.listByOwner(userId)) {
            if (attachment.kind !== "avatar" && attachment.kind !== "banner")
                continue;
            await this.deleteStoredAttachment(attachment.id);
        }
    }
    async assertMediaAccess(attachment, subject) {
        // The same rule as chat access: the owner, an avatar, or a participant of a
        // conversation that references this attachment.
        if (await this.canAccessAttachment(subject, attachment))
            return;
        throw new AppError(403, "MEDIA_LINK_FORBIDDEN", "This account no longer has access to this file");
    }
    async getStoredFile(id) {
        const attachment = await this.repositories.attachments.findById(id);
        if (!attachment)
            throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
        const filePath = this.resolveStoredFile(attachment.storedFileName);
        try {
            const details = await stat(filePath);
            // Зашифрованный файл длиннее исходного ровно на служебный заголовок.
            const expectedSizes = [attachment.size, attachment.size + ENCRYPTION_OVERHEAD];
            if (!details.isFile() || !expectedSizes.includes(details.size))
                throw new Error("Invalid upload file");
        }
        catch {
            throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
        }
        return { attachment, filePath };
    }
    async deleteStoredAttachment(id) {
        const attachment = await this.repositories.attachments.delete(id);
        if (attachment)
            await rm(this.resolveStoredFile(attachment.storedFileName), { force: true });
    }
    resolveStoredFile(storedFileName) {
        if (basename(storedFileName) !== storedFileName || !/^[a-f0-9-]+\.[a-z0-9]{1,15}$/i.test(storedFileName)) {
            throw new AppError(500, "UPLOAD_STORAGE_INVALID", "Stored upload metadata is invalid");
        }
        const path = resolve(this.uploadDirectory, storedFileName);
        if (!path.startsWith(`${resolve(this.uploadDirectory)}${sep}`) && path !== resolve(this.uploadDirectory)) {
            throw new AppError(500, "UPLOAD_STORAGE_INVALID", "Stored upload path is invalid");
        }
        return path;
    }
}
function validateUpload(kind, input) {
    if (input.data.length === 0)
        throw new AppError(400, "UPLOAD_EMPTY", "The uploaded file is empty");
    if (input.data.length > uploadLimits[kind]) {
        throw new AppError(413, "UPLOAD_TOO_LARGE", `The ${kind} upload exceeds its size limit`);
    }
    const fileName = sanitizeFileName(input.fileName);
    const extension = extname(fileName).toLowerCase();
    if (!extension || !/^\.[a-z0-9]{1,15}$/.test(extension)) {
        throw new AppError(400, "UPLOAD_EXTENSION_INVALID", "A valid file extension is required");
    }
    const declaredMime = input.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!mimePattern.test(declaredMime)) {
        throw new AppError(400, "UPLOAD_MIME_INVALID", "The upload MIME type is invalid");
    }
    // Запись голосом и кружок живут внутри обычного файла и обещают длительность.
    // Гифка — свой вид: она тоже бывает видео, но длительности не обещает.
    if (input.mediaKind === "gif") {
        if (kind !== "gif") {
            throw new AppError(400, "RECORDING_METADATA_INVALID", "The gif media kind requires a gif upload");
        }
    }
    else if (input.mediaKind !== undefined || input.durationSeconds !== undefined) {
        if (kind !== "file" || !input.mediaKind || input.durationSeconds === undefined ||
            !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
            throw new AppError(400, "RECORDING_METADATA_INVALID", "Recordings require a file, media kind and positive duration");
        }
        if (input.mediaKind === "video_circle" && input.durationSeconds > 60) {
            throw new AppError(400, "RECORDING_DURATION_INVALID", "Video circles may not exceed 60 seconds");
        }
        if ((input.mediaKind === "voice" && !declaredMime.startsWith("audio/")) ||
            (input.mediaKind === "video_circle" && !["video/webm", "video/mp4"].includes(declaredMime))) {
            throw new AppError(400, "RECORDING_MIME_INVALID", "Recording MIME type does not match its media kind");
        }
    }
    const detectedImageMime = detectImageMime(input.data);
    // Гифка — либо картинка (GIF и анимированный WebP играют сами по себе), либо
    // короткое видео без звука: его тоже показываем зацикленным. Разбираем оба
    // случая и в обоих проверяем подпись файла, а не только расширение.
    if (kind === "gif") {
        if (videoExtensions.has(extension)) {
            const expectedMime = videoMimeByExtension[extension];
            if (detectVideoMime(input.data) !== expectedMime) {
                throw new AppError(400, "UPLOAD_SIGNATURE_INVALID", "The file is not a supported video");
            }
            if (declaredMime !== expectedMime && declaredMime !== "application/octet-stream") {
                throw new AppError(400, "UPLOAD_MIME_MISMATCH", "The video MIME type does not match its content");
            }
            return { fileName, extension, mimeType: expectedMime };
        }
        if (!allowedImageExtensions.has(extension)) {
            throw new AppError(400, "UPLOAD_EXTENSION_INVALID", "A gif must be an image or a short video");
        }
        if (!detectedImageMime) {
            throw new AppError(400, "UPLOAD_SIGNATURE_INVALID", "The file is not a supported image");
        }
        if (!extensionMatchesImageMime(extension, detectedImageMime)) {
            throw new AppError(400, "UPLOAD_TYPE_MISMATCH", "The image extension does not match its content");
        }
        if (declaredMime !== detectedImageMime && declaredMime !== "application/octet-stream") {
            throw new AppError(400, "UPLOAD_MIME_MISMATCH", "The image MIME type does not match its content");
        }
        return { fileName, extension, mimeType: detectedImageMime };
    }
    if (kind === "image" || kind === "avatar" || kind === "banner" || kind === "wallpaper" || kind === "sticker") {
        // Баннер и фон — тоже картинки профиля, но крупнее по размеру и допускают GIF.
        const allowed = kind === "image" ? allowedImageExtensions
            : kind === "sticker" ? allowedStickerExtensions
                : kind === "banner" ? allowedBannerExtensions
                    : kind === "wallpaper" ? allowedWallpaperExtensions
                        : allowedAvatarExtensions;
        // Живое оформление: фон и баннер можно поставить видео. Проверяем подпись
        // так же строго, как у картинок, — расширению верить нельзя.
        if (videoExtensions.has(extension) && (kind === "banner" || kind === "wallpaper")) {
            const expectedMime = videoMimeByExtension[extension];
            if (detectVideoMime(input.data) !== expectedMime) {
                throw new AppError(400, "UPLOAD_SIGNATURE_INVALID", "The file is not a supported video");
            }
            if (declaredMime !== expectedMime && declaredMime !== "application/octet-stream") {
                throw new AppError(400, "UPLOAD_MIME_MISMATCH", "The video MIME type does not match its content");
            }
            return { fileName, extension, mimeType: expectedMime };
        }
        if (!allowed.has(extension)) {
            throw new AppError(400, "UPLOAD_EXTENSION_INVALID", `This ${kind} image format is not supported`);
        }
        if (!detectedImageMime) {
            throw new AppError(400, "UPLOAD_SIGNATURE_INVALID", "The file is not a supported image");
        }
        if (!extensionMatchesImageMime(extension, detectedImageMime)) {
            throw new AppError(400, "UPLOAD_TYPE_MISMATCH", "The image extension does not match its content");
        }
        if (declaredMime !== detectedImageMime && declaredMime !== "application/octet-stream") {
            throw new AppError(400, "UPLOAD_MIME_MISMATCH", "The image MIME type does not match its content");
        }
        return { fileName, extension, mimeType: detectedImageMime };
    }
    if (declaredMime.startsWith("image/") && declaredMime !== detectedImageMime) {
        throw new AppError(400, "UPLOAD_MIME_MISMATCH", "The file MIME type does not match its content");
    }
    validateKnownFileSignature(extension, input.data);
    // Files are always downloaded as attachments. Keeping the declared MIME is useful
    // for icons and does not permit HTML/SVG/script execution in the browser.
    return { fileName, extension, mimeType: declaredMime };
}
function sanitizeFileName(input) {
    const withoutPath = input.replace(/\\/g, "/").split("/").at(-1) ?? "";
    const normalized = withoutPath
        .normalize("NFC")
        .split("")
        .filter((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
    })
        .join("")
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/[. ]+$/g, "")
        .trim();
    if (!normalized || normalized === "." || normalized === "..") {
        throw new AppError(400, "UPLOAD_FILENAME_INVALID", "The upload filename is invalid");
    }
    const extension = extname(normalized).slice(0, 16);
    const stemLimit = Math.max(1, 180 - extension.length);
    return `${normalized.slice(0, normalized.length - extname(normalized).length).slice(0, stemLimit)}${extension}`;
}
function detectImageMime(data) {
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
        return "image/jpeg";
    if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return "image/png";
    if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP")
        return "image/webp";
    const gif = data.subarray(0, 6).toString("ascii");
    if (gif === "GIF87a" || gif === "GIF89a")
        return "image/gif";
    return null;
}
/**
 * Подпись видео. mp4 (и его родня) начинается с бокса `ftyp`, webm — с EBML.
 * Читаем только начало файла: этого достаточно, чтобы отличить видео от
 * переименованной картинки, и не требует разбора контейнера целиком.
 */
function detectVideoMime(data) {
    if (data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp") {
        const brand = data.subarray(8, 12).toString("ascii");
        // `qt  ` — это MOV: браузеры играют его не везде, поэтому не обещаем.
        if (brand === "qt  ")
            return null;
        return "video/mp4";
    }
    if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
        return "video/webm";
    }
    return null;
}
function extensionMatchesImageMime(extension, mime) {
    return ((mime === "image/jpeg" && (extension === ".jpg" || extension === ".jpeg")) ||
        (mime === "image/png" && extension === ".png") ||
        (mime === "image/webp" && extension === ".webp") ||
        (mime === "image/gif" && extension === ".gif"));
}
function validateKnownFileSignature(extension, data) {
    const starts = (...bytes) => data.length >= bytes.length && bytes.every((byte, index) => data[index] === byte);
    const zip = starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
    const officeZip = new Set([".docx", ".xlsx", ".pptx"]);
    const compoundOffice = new Set([".doc", ".xls", ".ppt"]);
    let valid = true;
    if (extension === ".pdf")
        valid = data.subarray(0, 5).toString("ascii") === "%PDF-";
    else if (extension === ".zip" || officeZip.has(extension))
        valid = zip;
    else if (extension === ".rar")
        valid = data.subarray(0, 7).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) || data.subarray(0, 8).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]));
    else if (extension === ".7z")
        valid = data.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]));
    else if (extension === ".exe")
        valid = starts(0x4d, 0x5a);
    else if (compoundOffice.has(extension))
        valid = data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    if (!valid)
        throw new AppError(400, "UPLOAD_SIGNATURE_INVALID", "The file extension does not match its content");
}
//# sourceMappingURL=upload-service.js.map