import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import type { Attachment, AttachmentKind, AttachmentView, CurrentUser } from "../domain/models.js";
import { toAttachmentView, toCurrentUser } from "../domain/models.js";
import { ENCRYPTION_OVERHEAD, type AtRestCrypto } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { verifyMediaToken } from "../lib/media-links.js";
import type { Repositories } from "../repositories/types.js";

const MEBIBYTE = 1024 * 1024;
export const uploadLimits = {
  avatar: 10 * MEBIBYTE,
  image: 20 * MEBIBYTE,
  file: 100 * MEBIBYTE,
} satisfies Record<AttachmentKind, number>;

const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const allowedAvatarExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const mimePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

type UploadInput = { fileName: string; mimeType: string; data: Buffer; mediaKind?: "voice" | "video_circle"; durationSeconds?: number };

export class UploadService {
  constructor(
    private readonly repositories: Repositories,
    private readonly uploadDirectory: string,
    private readonly canAccessAttachment: (
      userId: string,
      attachment: Attachment,
    ) => Promise<boolean>,
    private readonly crypto: AtRestCrypto,
  ) {}

  async initialize(): Promise<void> {
    await mkdir(this.uploadDirectory, { recursive: true });
  }

  async upload(userId: string, kind: AttachmentKind, input: UploadInput): Promise<AttachmentView> {
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
    } catch (error) {
      await rm(filePath, { force: true });
      throw error;
    }
  }

  async setAvatar(userId: string, input: UploadInput): Promise<CurrentUser> {
    const previous = await this.repositories.users.findById(userId);
    if (!previous) throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
    const avatar = await this.upload(userId, "avatar", input);
    try {
      const updated = await this.repositories.users.update(userId, { avatar });
      if (previous.avatar?.id && previous.avatar.id !== avatar.id) {
        await this.deleteStoredAttachment(previous.avatar.id);
      }
      return toCurrentUser(updated);
    } catch (error) {
      await this.deleteStoredAttachment(avatar.id);
      throw error;
    }
  }

  async removeAvatar(userId: string): Promise<CurrentUser> {
    const previous = await this.repositories.users.findById(userId);
    if (!previous) throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
    const updated = await this.repositories.users.update(userId, { avatar: null });
    if (previous.avatar?.id) await this.deleteStoredAttachment(previous.avatar.id);
    return toCurrentUser(updated);
  }

  /**
   * Uploads are served only through the temporary link issued in an API response.
   * The link names the account it was issued to, and that account must still own
   * the attachment or still take part in a conversation that references it.
   */
  async getAuthorizedFile(
    id: string,
    token: string | undefined,
  ): Promise<{ attachment: Attachment; filePath: string }> {
    if (!token) {
      throw new AppError(401, "MEDIA_LINK_REQUIRED", "This media link is missing its access token");
    }
    const { subject } = verifyMediaToken(token);
    const file = await this.getStoredFile(id);
    await this.assertMediaAccess(file.attachment, subject);
    return file;
  }

  /** Тот же доступ, но сразу отдаёт расшифрованные байты — файлы лежат зашифрованными. */
  async readAuthorizedFile(
    id: string,
    token: string | undefined,
  ): Promise<{ attachment: Attachment; bytes: Buffer }> {
    const { attachment } = await this.getAuthorizedFile(id, token);
    return { attachment, bytes: await this.readStoredBytes(attachment) };
  }

  private async readStoredBytes(attachment: Attachment): Promise<Buffer> {
    const filePath = this.resolveStoredFile(attachment.storedFileName);
    let stored: Buffer;
    try {
      stored = await readFile(filePath);
    } catch {
      throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
    }
    return this.crypto.decryptBuffer(stored);
  }

  /**
   * Стирает аватары человека — и с диска, и из базы. Нужно при удалении аккаунта.
   * Файлы из переписки не трогаем: история остаётся у собеседников (как в
   * Telegram), поэтому вложения должны продолжать открываться.
   */
  async deleteUserAvatars(userId: string): Promise<void> {
    for (const attachment of await this.repositories.attachments.listByOwner(userId)) {
      if (attachment.kind !== "avatar") continue;
      await this.deleteStoredAttachment(attachment.id);
    }
  }

  private async assertMediaAccess(attachment: Attachment, subject: string): Promise<void> {
    // The same rule as chat access: the owner, an avatar, or a participant of a
    // conversation that references this attachment.
    if (await this.canAccessAttachment(subject, attachment)) return;
    throw new AppError(403, "MEDIA_LINK_FORBIDDEN", "This account no longer has access to this file");
  }

  async getStoredFile(id: string): Promise<{ attachment: Attachment; filePath: string }> {
    const attachment = await this.repositories.attachments.findById(id);
    if (!attachment) throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
    const filePath = this.resolveStoredFile(attachment.storedFileName);
    try {
      const details = await stat(filePath);
      // Зашифрованный файл длиннее исходного ровно на служебный заголовок.
      const expectedSizes = [attachment.size, attachment.size + ENCRYPTION_OVERHEAD];
      if (!details.isFile() || !expectedSizes.includes(details.size)) throw new Error("Invalid upload file");
    } catch {
      throw new AppError(404, "UPLOAD_NOT_FOUND", "The uploaded file was not found");
    }
    return { attachment, filePath };
  }

  private async deleteStoredAttachment(id: string): Promise<void> {
    const attachment = await this.repositories.attachments.delete(id);
    if (attachment) await rm(this.resolveStoredFile(attachment.storedFileName), { force: true });
  }

  private resolveStoredFile(storedFileName: string): string {
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

function validateUpload(
  kind: AttachmentKind,
  input: UploadInput,
): { fileName: string; extension: string; mimeType: string } {
  if (input.data.length === 0) throw new AppError(400, "UPLOAD_EMPTY", "The uploaded file is empty");
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

  if (input.mediaKind !== undefined || input.durationSeconds !== undefined) {
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
  if (kind === "image" || kind === "avatar") {
    const allowed = kind === "avatar" ? allowedAvatarExtensions : allowedImageExtensions;
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

function sanitizeFileName(input: string): string {
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

function detectImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const gif = data.subarray(0, 6).toString("ascii");
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  return null;
}

function extensionMatchesImageMime(extension: string, mime: string): boolean {
  return (
    (mime === "image/jpeg" && (extension === ".jpg" || extension === ".jpeg")) ||
    (mime === "image/png" && extension === ".png") ||
    (mime === "image/webp" && extension === ".webp") ||
    (mime === "image/gif" && extension === ".gif")
  );
}

function validateKnownFileSignature(extension: string, data: Buffer): void {
  const starts = (...bytes: number[]) =>
    data.length >= bytes.length && bytes.every((byte, index) => data[index] === byte);
  const zip = starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08);
  const officeZip = new Set([".docx", ".xlsx", ".pptx"]);
  const compoundOffice = new Set([".doc", ".xls", ".ppt"]);
  let valid = true;
  if (extension === ".pdf") valid = data.subarray(0, 5).toString("ascii") === "%PDF-";
  else if (extension === ".zip" || officeZip.has(extension)) valid = zip;
  else if (extension === ".rar") valid = data.subarray(0, 7).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) || data.subarray(0, 8).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]));
  else if (extension === ".7z") valid = data.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]));
  else if (extension === ".exe") valid = starts(0x4d, 0x5a);
  else if (compoundOffice.has(extension)) valid = data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (!valid) throw new AppError(400, "UPLOAD_SIGNATURE_INVALID", "The file extension does not match its content");
}
