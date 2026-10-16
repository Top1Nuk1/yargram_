import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.js";
const defaultConfig = {
    secret: "yargram-development-secret-change-me",
    ttlSeconds: 24 * 60 * 60,
};
/** Avatars are shown to every signed-in user, so their links simply live longer. */
const avatarTtlMultiplier = 7;
let currentConfig = { ...defaultConfig };
export function configureMediaLinks(input) {
    currentConfig = {
        secret: input.secret,
        ttlSeconds: input.ttlSeconds ?? defaultConfig.ttlSeconds,
    };
}
/**
 * Uploads used to be permanent capability URLs: whoever received the path kept
 * access forever. Every link now carries an expiring signature instead, and the
 * upload route re-checks access for the account the link was issued to.
 */
export function mediaUrlFor(attachmentId, subject, options = {}) {
    const ttlSeconds = options.ttlSeconds ??
        (options.kind === "avatar"
            ? currentConfig.ttlSeconds * avatarTtlMultiplier
            : currentConfig.ttlSeconds);
    const token = signPayload({ s: subject, e: Math.floor(Date.now() / 1_000) + ttlSeconds });
    return `/api/uploads/${encodeURIComponent(attachmentId)}?t=${encodeURIComponent(token)}`;
}
export function verifyMediaToken(token, now = Date.now()) {
    const separator = token.indexOf(".");
    if (separator <= 0)
        throw invalidLinkError();
    const encodedPayload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expectedSignature = signEncodedPayload(encodedPayload);
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (providedBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(providedBuffer, expectedBuffer)) {
        throw invalidLinkError();
    }
    let payload;
    try {
        payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    }
    catch {
        throw invalidLinkError();
    }
    if (!payload || typeof payload !== "object")
        throw invalidLinkError();
    const { s: subject, e: expirySeconds } = payload;
    if (typeof subject !== "string" || !subject || typeof expirySeconds !== "number") {
        throw invalidLinkError();
    }
    const expiresAt = expirySeconds * 1_000;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        throw new AppError(401, "MEDIA_LINK_EXPIRED", "This media link has expired. Reload the chat.");
    }
    return { subject, expiresAt };
}
function signPayload(payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}
function signEncodedPayload(encodedPayload) {
    return createHmac("sha256", currentConfig.secret).update(encodedPayload).digest("base64url");
}
function invalidLinkError() {
    return new AppError(401, "MEDIA_LINK_INVALID", "This media link is invalid. Reload the chat.");
}
//# sourceMappingURL=media-links.js.map