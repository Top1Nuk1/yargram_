import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.js";

export type MediaLinkKind = "attachment" | "avatar";

type MediaLinkConfig = {
  secret: string;
  ttlSeconds: number;
};

const defaultConfig: MediaLinkConfig = {
  secret: "yargram-development-secret-change-me",
  ttlSeconds: 24 * 60 * 60,
};

/** Avatars are shown to every signed-in user, so their links simply live longer. */
const avatarTtlMultiplier = 7;

let currentConfig: MediaLinkConfig = { ...defaultConfig };

export function configureMediaLinks(input: {
  secret: string;
  ttlSeconds?: number | undefined;
}): void {
  currentConfig = {
    secret: input.secret,
    ttlSeconds: input.ttlSeconds ?? defaultConfig.ttlSeconds,
  };
}

export type MediaUrlOptions = {
  kind?: MediaLinkKind;
  /** Only tests use this to create already expired links. */
  ttlSeconds?: number;
};

/**
 * Uploads used to be permanent capability URLs: whoever received the path kept
 * access forever. Every link now carries an expiring signature instead, and the
 * upload route re-checks access for the account the link was issued to.
 */
export function mediaUrlFor(
  attachmentId: string,
  subject: string,
  options: MediaUrlOptions = {},
): string {
  const ttlSeconds =
    options.ttlSeconds ??
    (options.kind === "avatar"
      ? currentConfig.ttlSeconds * avatarTtlMultiplier
      : currentConfig.ttlSeconds);
  const token = signPayload({ s: subject, e: Math.floor(Date.now() / 1_000) + ttlSeconds });
  return `/api/uploads/${encodeURIComponent(attachmentId)}?t=${encodeURIComponent(token)}`;
}

export type MediaToken = {
  subject: string;
  expiresAt: number;
};

export function verifyMediaToken(token: string, now = Date.now()): MediaToken {
  const separator = token.indexOf(".");
  if (separator <= 0) throw invalidLinkError();
  const encodedPayload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expectedSignature = signEncodedPayload(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw invalidLinkError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw invalidLinkError();
  }
  if (!payload || typeof payload !== "object") throw invalidLinkError();
  const { s: subject, e: expirySeconds } = payload as { s?: unknown; e?: unknown };
  if (typeof subject !== "string" || !subject || typeof expirySeconds !== "number") {
    throw invalidLinkError();
  }
  const expiresAt = expirySeconds * 1_000;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new AppError(401, "MEDIA_LINK_EXPIRED", "This media link has expired. Reload the chat.");
  }
  return { subject, expiresAt };
}

function signPayload(payload: { s: string; e: number }): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}

function signEncodedPayload(encodedPayload: string): string {
  return createHmac("sha256", currentConfig.secret).update(encodedPayload).digest("base64url");
}

function invalidLinkError(): AppError {
  return new AppError(401, "MEDIA_LINK_INVALID", "This media link is invalid. Reload the chat.");
}
