import { describe, expect, it } from "vitest";
import { configureMediaLinks, mediaUrlFor, verifyMediaToken } from "../src/lib/media-links.js";

function tokenFrom(url: string): string {
  return new URL(url, "http://localhost").searchParams.get("t") ?? "";
}

describe("media links", () => {
  it("issues a link that names the account it was created for", () => {
    configureMediaLinks({ secret: "unit-test-secret", ttlSeconds: 600 });
    const url = mediaUrlFor("attachment-1", "user-1");
    expect(url.startsWith("/api/uploads/attachment-1?t=")).toBe(true);
    expect(verifyMediaToken(tokenFrom(url))).toMatchObject({ subject: "user-1" });
  });

  it("rejects a link signed with another secret", () => {
    configureMediaLinks({ secret: "unit-test-secret", ttlSeconds: 600 });
    const token = tokenFrom(mediaUrlFor("attachment-1", "user-1"));
    configureMediaLinks({ secret: "another-secret", ttlSeconds: 600 });
    expect(() => verifyMediaToken(token)).toThrow(/invalid/i);
  });

  it("rejects a tampered payload", () => {
    configureMediaLinks({ secret: "unit-test-secret", ttlSeconds: 600 });
    const token = tokenFrom(mediaUrlFor("attachment-1", "user-1"));
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ s: "user-2", e: 4_102_444_800 }), "utf8").toString("base64url");
    expect(() => verifyMediaToken(`${forged}.${signature}`)).toThrow(/invalid/i);
  });

  it("rejects an expired link", () => {
    configureMediaLinks({ secret: "unit-test-secret", ttlSeconds: 600 });
    const token = tokenFrom(mediaUrlFor("attachment-1", "user-1", { ttlSeconds: -60 }));
    expect(() => verifyMediaToken(token)).toThrow(/expired/i);
  });

  it("keeps avatar links alive longer than attachment links", () => {
    configureMediaLinks({ secret: "unit-test-secret", ttlSeconds: 600 });
    const now = Date.now();
    const attachment = verifyMediaToken(tokenFrom(mediaUrlFor("a", "u")), now);
    const avatar = verifyMediaToken(tokenFrom(mediaUrlFor("a", "u", { kind: "avatar" })), now);
    expect(avatar.expiresAt).toBeGreaterThan(attachment.expiresAt);
  });
});
