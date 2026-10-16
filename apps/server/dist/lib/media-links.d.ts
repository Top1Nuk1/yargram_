export type MediaLinkKind = "attachment" | "avatar";
export declare function configureMediaLinks(input: {
    secret: string;
    ttlSeconds?: number | undefined;
}): void;
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
export declare function mediaUrlFor(attachmentId: string, subject: string, options?: MediaUrlOptions): string;
export type MediaToken = {
    subject: string;
    expiresAt: number;
};
export declare function verifyMediaToken(token: string, now?: number): MediaToken;
