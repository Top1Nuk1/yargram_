import { AppError } from "../lib/errors.js";
export async function readMultipartFile(request, options) {
    const contentType = request.header("Content-Type") ?? "";
    const boundaryMatch = /multipart\/form-data\s*;[^\r\n]*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
    if (!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) {
        throw new AppError(400, "MULTIPART_REQUIRED", "A valid multipart/form-data upload is required");
    }
    const chunks = [];
    let received = 0;
    let oversized = false;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > options.maxBodyBytes) {
            // Решение принято, но поток нельзя просто бросить: если выйти из цикла с
            // недочитанным телом, Node уничтожит сокет и ответ 413 до клиента не
            // дойдёт (supertest видит ECONNRESET, браузер — «сеть недоступна»).
            // Дочитываем остаток и только потом отвечаем.
            oversized = true;
            chunks.length = 0;
            continue;
        }
        if (!oversized)
            chunks.push(buffer);
    }
    if (oversized) {
        throw new AppError(413, "UPLOAD_TOO_LARGE", "The uploaded request is too large");
    }
    const body = Buffer.concat(chunks);
    const marker = Buffer.from(`--${boundary}`);
    const partMarker = Buffer.from(`\r\n--${boundary}`);
    let cursor = body.indexOf(marker);
    let result = null;
    while (cursor !== -1) {
        cursor += marker.length;
        if (body.subarray(cursor, cursor + 2).equals(Buffer.from("--")))
            break;
        if (!body.subarray(cursor, cursor + 2).equals(Buffer.from("\r\n"))) {
            throw new AppError(400, "MULTIPART_INVALID", "Malformed multipart upload");
        }
        cursor += 2;
        const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), cursor);
        if (headerEnd === -1 || headerEnd - cursor > 16_384) {
            throw new AppError(400, "MULTIPART_INVALID", "Malformed multipart headers");
        }
        const headers = body.subarray(cursor, headerEnd).toString("latin1");
        const nextMarker = body.indexOf(partMarker, headerEnd + 4);
        if (nextMarker === -1) {
            throw new AppError(400, "MULTIPART_INVALID", "Multipart upload is missing its closing boundary");
        }
        const disposition = /^content-disposition:\s*form-data;([^\r\n]+)$/im.exec(headers)?.[1] ?? "";
        const fieldName = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition)?.[1] ?? "";
        const plainFileName = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition)?.[1];
        const encodedFileName = /(?:^|;)\s*filename\*=UTF-8''([^;\s]*)/i.exec(disposition)?.[1];
        const fileName = decodeFileName(encodedFileName, plainFileName);
        const mimeType = /^content-type:\s*([^\r\n]+)$/im.exec(headers)?.[1]?.trim() ?? "";
        if (fieldName === options.fieldName && fileName !== null) {
            if (result)
                throw new AppError(400, "UPLOAD_COUNT_INVALID", "Only one file may be uploaded");
            result = {
                fieldName,
                fileName,
                mimeType,
                data: Buffer.from(body.subarray(headerEnd + 4, nextMarker)),
            };
        }
        cursor = nextMarker + 2;
    }
    if (!result) {
        throw new AppError(400, "UPLOAD_FILE_REQUIRED", `Multipart field '${options.fieldName}' is required`);
    }
    return result;
}
function decodeFileName(encoded, plain) {
    if (encoded !== undefined) {
        try {
            return decodeURIComponent(encoded);
        }
        catch {
            throw new AppError(400, "UPLOAD_FILENAME_INVALID", "The upload filename is invalid");
        }
    }
    if (plain === undefined)
        return null;
    // Browsers encode non-ASCII filenames as UTF-8 bytes in this legacy field.
    const decoded = Buffer.from(plain, "latin1").toString("utf8");
    return decoded.includes("�") ? plain : decoded;
}
//# sourceMappingURL=multipart.js.map