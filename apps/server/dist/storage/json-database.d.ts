import { z } from "zod";
import { type DatabaseState } from "../domain/models.js";
export declare const databaseSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    users: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        email: z.ZodString;
        passwordHash: z.ZodString;
        displayName: z.ZodString;
        username: z.ZodOptional<z.ZodString>;
        bio: z.ZodDefault<z.ZodString>;
        avatar: z.ZodOptional<z.ZodObject<Omit<{
            id: z.ZodString;
            ownerId: z.ZodString;
            kind: z.ZodEnum<["image", "file", "avatar", "banner", "wallpaper", "sticker", "gif"]>;
            mediaKind: z.ZodOptional<z.ZodEnum<["voice", "video_circle", "gif"]>>;
            durationSeconds: z.ZodOptional<z.ZodNumber>;
            fileName: z.ZodString;
            storedFileName: z.ZodString;
            mimeType: z.ZodString;
            size: z.ZodNumber;
            createdAt: z.ZodString;
        }, "storedFileName"> & {
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        }, {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        }>>;
        lastSeenAt: z.ZodOptional<z.ZodString>;
        blockedUserIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        favoriteMessageIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notificationSoundEnabled: z.ZodDefault<z.ZodBoolean>;
        showLastSeen: z.ZodDefault<z.ZodBoolean>;
        callPrivacy: z.ZodDefault<z.ZodEnum<["everyone", "contacts", "nobody"]>>;
        callPrivacyAllowedUserIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        callPrivacyDeniedUserIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        themeColor: z.ZodOptional<z.ZodString>;
        wallpaperUrl: z.ZodOptional<z.ZodString>;
        wallpaperMimeType: z.ZodOptional<z.ZodString>;
        bannerColor: z.ZodOptional<z.ZodString>;
        banner: z.ZodOptional<z.ZodObject<Omit<{
            id: z.ZodString;
            ownerId: z.ZodString;
            kind: z.ZodEnum<["image", "file", "avatar", "banner", "wallpaper", "sticker", "gif"]>;
            mediaKind: z.ZodOptional<z.ZodEnum<["voice", "video_circle", "gif"]>>;
            durationSeconds: z.ZodOptional<z.ZodNumber>;
            fileName: z.ZodString;
            storedFileName: z.ZodString;
            mimeType: z.ZodString;
            size: z.ZodNumber;
            createdAt: z.ZodString;
        }, "storedFileName"> & {
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        }, {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        }>>;
        bannerUrl: z.ZodOptional<z.ZodString>;
        avatarUrl: z.ZodOptional<z.ZodString>;
        language: z.ZodOptional<z.ZodString>;
        isVerified: z.ZodOptional<z.ZodBoolean>;
        badge: z.ZodOptional<z.ZodNullable<z.ZodEnum<["yargram"]>>>;
        scam: z.ZodOptional<z.ZodBoolean>;
        fake: z.ZodOptional<z.ZodBoolean>;
        usernames: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        adminUserIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        friendIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        outgoingFriendRequestIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        incomingFriendRequestIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        isApp: z.ZodOptional<z.ZodBoolean>;
        isBot: z.ZodOptional<z.ZodBoolean>;
        isOwner: z.ZodOptional<z.ZodBoolean>;
        isBanned: z.ZodOptional<z.ZodBoolean>;
        isFrozen: z.ZodOptional<z.ZodBoolean>;
        isDeleted: z.ZodOptional<z.ZodBoolean>;
        deletedAt: z.ZodOptional<z.ZodString>;
        birthday: z.ZodOptional<z.ZodString>;
        emailVerified: z.ZodOptional<z.ZodBoolean>;
        emailCodeHash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        emailCodePurpose: z.ZodOptional<z.ZodNullable<z.ZodEnum<["register", "login", "reset", "delete"]>>>;
        emailCodeExpiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        emailCodeAttempts: z.ZodOptional<z.ZodNumber>;
        sessionAutoTerminateDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        email: string;
        showLastSeen: boolean;
        callPrivacy: "everyone" | "contacts" | "nobody";
        callPrivacyAllowedUserIds: string[];
        callPrivacyDeniedUserIds: string[];
        notificationSoundEnabled: boolean;
        passwordHash: string;
        displayName: string;
        bio: string;
        blockedUserIds: string[];
        favoriteMessageIds: string[];
        avatar?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        banner?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        themeColor?: string | undefined;
        wallpaperUrl?: string | undefined;
        wallpaperMimeType?: string | undefined;
        bannerColor?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        usernames?: string[] | undefined;
        adminUserIds?: string[] | undefined;
        isOwner?: boolean | undefined;
        isBanned?: boolean | undefined;
        isFrozen?: boolean | undefined;
        birthday?: string | undefined;
        isApp?: boolean | undefined;
        isBot?: boolean | undefined;
        language?: string | undefined;
        sessionAutoTerminateDays?: number | null | undefined;
        emailVerified?: boolean | undefined;
        username?: string | undefined;
        avatarUrl?: string | undefined;
        lastSeenAt?: string | undefined;
        bannerUrl?: string | undefined;
        friendIds?: string[] | undefined;
        outgoingFriendRequestIds?: string[] | undefined;
        incomingFriendRequestIds?: string[] | undefined;
        isDeleted?: boolean | undefined;
        deletedAt?: string | undefined;
        emailCodeHash?: string | null | undefined;
        emailCodePurpose?: "register" | "login" | "reset" | "delete" | null | undefined;
        emailCodeExpiresAt?: string | null | undefined;
        emailCodeAttempts?: number | undefined;
    }, {
        id: string;
        createdAt: string;
        email: string;
        passwordHash: string;
        displayName: string;
        avatar?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        banner?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        themeColor?: string | undefined;
        wallpaperUrl?: string | undefined;
        wallpaperMimeType?: string | undefined;
        bannerColor?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        usernames?: string[] | undefined;
        adminUserIds?: string[] | undefined;
        isOwner?: boolean | undefined;
        isBanned?: boolean | undefined;
        isFrozen?: boolean | undefined;
        birthday?: string | undefined;
        isApp?: boolean | undefined;
        isBot?: boolean | undefined;
        language?: string | undefined;
        sessionAutoTerminateDays?: number | null | undefined;
        showLastSeen?: boolean | undefined;
        callPrivacy?: "everyone" | "contacts" | "nobody" | undefined;
        callPrivacyAllowedUserIds?: string[] | undefined;
        callPrivacyDeniedUserIds?: string[] | undefined;
        notificationSoundEnabled?: boolean | undefined;
        emailVerified?: boolean | undefined;
        username?: string | undefined;
        bio?: string | undefined;
        avatarUrl?: string | undefined;
        lastSeenAt?: string | undefined;
        blockedUserIds?: string[] | undefined;
        favoriteMessageIds?: string[] | undefined;
        bannerUrl?: string | undefined;
        friendIds?: string[] | undefined;
        outgoingFriendRequestIds?: string[] | undefined;
        incomingFriendRequestIds?: string[] | undefined;
        isDeleted?: boolean | undefined;
        deletedAt?: string | undefined;
        emailCodeHash?: string | null | undefined;
        emailCodePurpose?: "register" | "login" | "reset" | "delete" | null | undefined;
        emailCodeExpiresAt?: string | null | undefined;
        emailCodeAttempts?: number | undefined;
    }>, {
        lastSeenAt: string;
        blockedUserIds: string[];
        favoriteMessageIds: string[];
        id: string;
        createdAt: string;
        email: string;
        showLastSeen: boolean;
        callPrivacy: "everyone" | "contacts" | "nobody";
        callPrivacyAllowedUserIds: string[];
        callPrivacyDeniedUserIds: string[];
        notificationSoundEnabled: boolean;
        passwordHash: string;
        displayName: string;
        bio: string;
        avatar?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        banner?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        themeColor?: string | undefined;
        wallpaperUrl?: string | undefined;
        wallpaperMimeType?: string | undefined;
        bannerColor?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        usernames?: string[] | undefined;
        adminUserIds?: string[] | undefined;
        isOwner?: boolean | undefined;
        isBanned?: boolean | undefined;
        isFrozen?: boolean | undefined;
        birthday?: string | undefined;
        isApp?: boolean | undefined;
        isBot?: boolean | undefined;
        language?: string | undefined;
        sessionAutoTerminateDays?: number | null | undefined;
        emailVerified?: boolean | undefined;
        username?: string | undefined;
        avatarUrl?: string | undefined;
        bannerUrl?: string | undefined;
        friendIds?: string[] | undefined;
        outgoingFriendRequestIds?: string[] | undefined;
        incomingFriendRequestIds?: string[] | undefined;
        isDeleted?: boolean | undefined;
        deletedAt?: string | undefined;
        emailCodeHash?: string | null | undefined;
        emailCodePurpose?: "register" | "login" | "reset" | "delete" | null | undefined;
        emailCodeExpiresAt?: string | null | undefined;
        emailCodeAttempts?: number | undefined;
    }, {
        id: string;
        createdAt: string;
        email: string;
        passwordHash: string;
        displayName: string;
        avatar?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        banner?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        themeColor?: string | undefined;
        wallpaperUrl?: string | undefined;
        wallpaperMimeType?: string | undefined;
        bannerColor?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        usernames?: string[] | undefined;
        adminUserIds?: string[] | undefined;
        isOwner?: boolean | undefined;
        isBanned?: boolean | undefined;
        isFrozen?: boolean | undefined;
        birthday?: string | undefined;
        isApp?: boolean | undefined;
        isBot?: boolean | undefined;
        language?: string | undefined;
        sessionAutoTerminateDays?: number | null | undefined;
        showLastSeen?: boolean | undefined;
        callPrivacy?: "everyone" | "contacts" | "nobody" | undefined;
        callPrivacyAllowedUserIds?: string[] | undefined;
        callPrivacyDeniedUserIds?: string[] | undefined;
        notificationSoundEnabled?: boolean | undefined;
        emailVerified?: boolean | undefined;
        username?: string | undefined;
        bio?: string | undefined;
        avatarUrl?: string | undefined;
        lastSeenAt?: string | undefined;
        blockedUserIds?: string[] | undefined;
        favoriteMessageIds?: string[] | undefined;
        bannerUrl?: string | undefined;
        friendIds?: string[] | undefined;
        outgoingFriendRequestIds?: string[] | undefined;
        incomingFriendRequestIds?: string[] | undefined;
        isDeleted?: boolean | undefined;
        deletedAt?: string | undefined;
        emailCodeHash?: string | null | undefined;
        emailCodePurpose?: "register" | "login" | "reset" | "delete" | null | undefined;
        emailCodeExpiresAt?: string | null | undefined;
        emailCodeAttempts?: number | undefined;
    }>, "many">;
    conversations: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["direct", "saved", "group"]>;
        memberIds: z.ZodArray<z.ZodString, "many">;
        directKey: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        lastMessageId: z.ZodOptional<z.ZodString>;
        pinnedMessageId: z.ZodOptional<z.ZodString>;
        pinnedMessageIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        archivedBy: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        mutedUntilBy: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        ownerId: z.ZodOptional<z.ZodString>;
        adminIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        adminPermissions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodOptional<z.ZodObject<{
            [k: string]: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            [x: string]: boolean | undefined;
        }, {
            [x: string]: boolean | undefined;
        }>>>>;
        adminDefaults: z.ZodOptional<z.ZodObject<{
            [k: string]: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            [x: string]: boolean | undefined;
        }, {
            [x: string]: boolean | undefined;
        }>>;
        inviteCode: z.ZodOptional<z.ZodString>;
        permissions: z.ZodOptional<z.ZodObject<{
            [k: string]: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            [x: string]: boolean | undefined;
        }, {
            [x: string]: boolean | undefined;
        }>>;
        restrictions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodOptional<z.ZodObject<{
            [k: string]: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            [x: string]: boolean | undefined;
        }, {
            [x: string]: boolean | undefined;
        }>>>>;
        mutedMembers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNullable<z.ZodString>>>;
        memberTags: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        leftIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        history: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            at: z.ZodString;
            actorId: z.ZodString;
            kind: z.ZodString;
            targetId: z.ZodOptional<z.ZodString>;
            detail: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }, {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }>, "many">>;
        isVerified: z.ZodOptional<z.ZodBoolean>;
        badge: z.ZodOptional<z.ZodNullable<z.ZodEnum<["yargram"]>>>;
        scam: z.ZodOptional<z.ZodBoolean>;
        fake: z.ZodOptional<z.ZodBoolean>;
        isSupportInbox: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        type: "direct" | "saved" | "group";
        id: string;
        createdAt: string;
        updatedAt: string;
        directKey: string;
        archivedBy: string[];
        mutedUntilBy: Record<string, string | null>;
        memberIds: string[];
        ownerId?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        avatarUrl?: string | null | undefined;
        title?: string | undefined;
        lastMessageId?: string | undefined;
        pinnedMessageId?: string | undefined;
        pinnedMessageIds?: string[] | undefined;
        description?: string | undefined;
        adminIds?: string[] | undefined;
        adminPermissions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        adminDefaults?: {
            [x: string]: boolean | undefined;
        } | undefined;
        inviteCode?: string | undefined;
        permissions?: {
            [x: string]: boolean | undefined;
        } | undefined;
        restrictions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        mutedMembers?: Record<string, string | null> | undefined;
        memberTags?: Record<string, string> | undefined;
        leftIds?: string[] | undefined;
        history?: {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }[] | undefined;
        isSupportInbox?: boolean | undefined;
    }, {
        type: "direct" | "saved" | "group";
        id: string;
        createdAt: string;
        updatedAt: string;
        directKey: string;
        memberIds: string[];
        ownerId?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        avatarUrl?: string | null | undefined;
        title?: string | undefined;
        lastMessageId?: string | undefined;
        pinnedMessageId?: string | undefined;
        pinnedMessageIds?: string[] | undefined;
        archivedBy?: string[] | undefined;
        mutedUntilBy?: Record<string, string | null> | undefined;
        description?: string | undefined;
        adminIds?: string[] | undefined;
        adminPermissions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        adminDefaults?: {
            [x: string]: boolean | undefined;
        } | undefined;
        inviteCode?: string | undefined;
        permissions?: {
            [x: string]: boolean | undefined;
        } | undefined;
        restrictions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        mutedMembers?: Record<string, string | null> | undefined;
        memberTags?: Record<string, string> | undefined;
        leftIds?: string[] | undefined;
        history?: {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }[] | undefined;
        isSupportInbox?: boolean | undefined;
    }>, {
        pinnedMessageIds: string[];
        archivedBy: string[];
        mutedUntilBy: {
            [k: string]: string | null;
        };
        pinnedMessageId?: string | undefined;
        type: "direct" | "saved" | "group";
        id: string;
        createdAt: string;
        updatedAt: string;
        directKey: string;
        memberIds: string[];
        ownerId?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        avatarUrl?: string | null | undefined;
        title?: string | undefined;
        lastMessageId?: string | undefined;
        description?: string | undefined;
        adminIds?: string[] | undefined;
        adminPermissions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        adminDefaults?: {
            [x: string]: boolean | undefined;
        } | undefined;
        inviteCode?: string | undefined;
        permissions?: {
            [x: string]: boolean | undefined;
        } | undefined;
        restrictions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        mutedMembers?: Record<string, string | null> | undefined;
        memberTags?: Record<string, string> | undefined;
        leftIds?: string[] | undefined;
        history?: {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }[] | undefined;
        isSupportInbox?: boolean | undefined;
    }, {
        type: "direct" | "saved" | "group";
        id: string;
        createdAt: string;
        updatedAt: string;
        directKey: string;
        memberIds: string[];
        ownerId?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        avatarUrl?: string | null | undefined;
        title?: string | undefined;
        lastMessageId?: string | undefined;
        pinnedMessageId?: string | undefined;
        pinnedMessageIds?: string[] | undefined;
        archivedBy?: string[] | undefined;
        mutedUntilBy?: Record<string, string | null> | undefined;
        description?: string | undefined;
        adminIds?: string[] | undefined;
        adminPermissions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        adminDefaults?: {
            [x: string]: boolean | undefined;
        } | undefined;
        inviteCode?: string | undefined;
        permissions?: {
            [x: string]: boolean | undefined;
        } | undefined;
        restrictions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        mutedMembers?: Record<string, string | null> | undefined;
        memberTags?: Record<string, string> | undefined;
        leftIds?: string[] | undefined;
        history?: {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }[] | undefined;
        isSupportInbox?: boolean | undefined;
    }>, "many">;
    messages: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        senderId: z.ZodString;
        text: z.ZodString;
        kind: z.ZodDefault<z.ZodEnum<["user", "system", "poll", "bot"]>>;
        systemEvent: z.ZodOptional<z.ZodEnum<["call", "user_joined", "user_left"]>>;
        call: z.ZodOptional<z.ZodObject<{
            callId: z.ZodString;
            callerId: z.ZodString;
            mode: z.ZodEnum<["audio", "video"]>;
            outcome: z.ZodEnum<["completed", "missed", "declined", "unanswered"]>;
            startedAt: z.ZodString;
            endedAt: z.ZodString;
            durationSeconds: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        }, {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        }>>;
        poll: z.ZodOptional<z.ZodObject<{
            question: z.ZodString;
            description: z.ZodDefault<z.ZodString>;
            options: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                text: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                id: string;
                text: string;
            }, {
                id: string;
                text: string;
            }>, "many">>;
            settings: z.ZodObject<{
                showNames: z.ZodDefault<z.ZodBoolean>;
                multiple: z.ZodDefault<z.ZodBoolean>;
                addOptions: z.ZodDefault<z.ZodBoolean>;
                changeVote: z.ZodDefault<z.ZodBoolean>;
                shuffle: z.ZodDefault<z.ZodBoolean>;
                correctOptionIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                deadline: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            }, "strip", z.ZodTypeAny, {
                showNames: boolean;
                multiple: boolean;
                addOptions: boolean;
                changeVote: boolean;
                shuffle: boolean;
                correctOptionIds: string[];
                deadline: string | null;
            }, {
                showNames?: boolean | undefined;
                multiple?: boolean | undefined;
                addOptions?: boolean | undefined;
                changeVote?: boolean | undefined;
                shuffle?: boolean | undefined;
                correctOptionIds?: string[] | undefined;
                deadline?: string | null | undefined;
            }>;
            votes: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
            closed: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            options: {
                id: string;
                text: string;
            }[];
            description: string;
            question: string;
            settings: {
                showNames: boolean;
                multiple: boolean;
                addOptions: boolean;
                changeVote: boolean;
                shuffle: boolean;
                correctOptionIds: string[];
                deadline: string | null;
            };
            votes: Record<string, string[]>;
            closed: boolean;
        }, {
            question: string;
            settings: {
                showNames?: boolean | undefined;
                multiple?: boolean | undefined;
                addOptions?: boolean | undefined;
                changeVote?: boolean | undefined;
                shuffle?: boolean | undefined;
                correctOptionIds?: string[] | undefined;
                deadline?: string | null | undefined;
            };
            options?: {
                id: string;
                text: string;
            }[] | undefined;
            description?: string | undefined;
            votes?: Record<string, string[]> | undefined;
            closed?: boolean | undefined;
        }>>;
        keyboard: z.ZodOptional<z.ZodArray<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            action: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            action: string;
            label: string;
        }, {
            action: string;
            label: string;
        }>, "many">, "many">>;
        supportTicket: z.ZodOptional<z.ZodObject<{
            userId: z.ZodString;
            category: z.ZodString;
            topic: z.ZodOptional<z.ZodString>;
            code: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        }, {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        }>>;
        stickerPackId: z.ZodOptional<z.ZodString>;
        stickerIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        createdAt: z.ZodString;
        editedAt: z.ZodOptional<z.ZodString>;
        replyToId: z.ZodOptional<z.ZodString>;
        forwardedFromId: z.ZodOptional<z.ZodString>;
        attachmentIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        reactions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            userId: z.ZodString;
            emoji: z.ZodEnum<["👍", "❤️", "😂", "😎", "🔥", "😢", "😮", "🍓", "🍷"]>;
            createdAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }, {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }>, "many">>;
        readBy: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "user" | "system" | "poll" | "bot";
        createdAt: string;
        conversationId: string;
        senderId: string;
        text: string;
        stickerIds: string[];
        attachmentIds: string[];
        reactions: {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }[];
        poll?: {
            options: {
                id: string;
                text: string;
            }[];
            description: string;
            question: string;
            settings: {
                showNames: boolean;
                multiple: boolean;
                addOptions: boolean;
                changeVote: boolean;
                shuffle: boolean;
                correctOptionIds: string[];
                deadline: string | null;
            };
            votes: Record<string, string[]>;
            closed: boolean;
        } | undefined;
        call?: {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        } | undefined;
        systemEvent?: "call" | "user_joined" | "user_left" | undefined;
        keyboard?: {
            action: string;
            label: string;
        }[][] | undefined;
        supportTicket?: {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        } | undefined;
        stickerPackId?: string | undefined;
        editedAt?: string | undefined;
        replyToId?: string | undefined;
        forwardedFromId?: string | undefined;
        readBy?: string[] | undefined;
    }, {
        id: string;
        createdAt: string;
        conversationId: string;
        senderId: string;
        text: string;
        kind?: "user" | "system" | "poll" | "bot" | undefined;
        poll?: {
            question: string;
            settings: {
                showNames?: boolean | undefined;
                multiple?: boolean | undefined;
                addOptions?: boolean | undefined;
                changeVote?: boolean | undefined;
                shuffle?: boolean | undefined;
                correctOptionIds?: string[] | undefined;
                deadline?: string | null | undefined;
            };
            options?: {
                id: string;
                text: string;
            }[] | undefined;
            description?: string | undefined;
            votes?: Record<string, string[]> | undefined;
            closed?: boolean | undefined;
        } | undefined;
        call?: {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        } | undefined;
        systemEvent?: "call" | "user_joined" | "user_left" | undefined;
        keyboard?: {
            action: string;
            label: string;
        }[][] | undefined;
        supportTicket?: {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        } | undefined;
        stickerIds?: string[] | undefined;
        stickerPackId?: string | undefined;
        editedAt?: string | undefined;
        replyToId?: string | undefined;
        forwardedFromId?: string | undefined;
        attachmentIds?: string[] | undefined;
        reactions?: {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }[] | undefined;
        readBy?: string[] | undefined;
    }>, {
        attachmentIds: string[];
        reactions: {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }[];
        readBy: string[];
        id: string;
        kind: "user" | "system" | "poll" | "bot";
        createdAt: string;
        conversationId: string;
        senderId: string;
        text: string;
        stickerIds: string[];
        poll?: {
            options: {
                id: string;
                text: string;
            }[];
            description: string;
            question: string;
            settings: {
                showNames: boolean;
                multiple: boolean;
                addOptions: boolean;
                changeVote: boolean;
                shuffle: boolean;
                correctOptionIds: string[];
                deadline: string | null;
            };
            votes: Record<string, string[]>;
            closed: boolean;
        } | undefined;
        call?: {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        } | undefined;
        systemEvent?: "call" | "user_joined" | "user_left" | undefined;
        keyboard?: {
            action: string;
            label: string;
        }[][] | undefined;
        supportTicket?: {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        } | undefined;
        stickerPackId?: string | undefined;
        editedAt?: string | undefined;
        replyToId?: string | undefined;
        forwardedFromId?: string | undefined;
    }, {
        id: string;
        createdAt: string;
        conversationId: string;
        senderId: string;
        text: string;
        kind?: "user" | "system" | "poll" | "bot" | undefined;
        poll?: {
            question: string;
            settings: {
                showNames?: boolean | undefined;
                multiple?: boolean | undefined;
                addOptions?: boolean | undefined;
                changeVote?: boolean | undefined;
                shuffle?: boolean | undefined;
                correctOptionIds?: string[] | undefined;
                deadline?: string | null | undefined;
            };
            options?: {
                id: string;
                text: string;
            }[] | undefined;
            description?: string | undefined;
            votes?: Record<string, string[]> | undefined;
            closed?: boolean | undefined;
        } | undefined;
        call?: {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        } | undefined;
        systemEvent?: "call" | "user_joined" | "user_left" | undefined;
        keyboard?: {
            action: string;
            label: string;
        }[][] | undefined;
        supportTicket?: {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        } | undefined;
        stickerIds?: string[] | undefined;
        stickerPackId?: string | undefined;
        editedAt?: string | undefined;
        replyToId?: string | undefined;
        forwardedFromId?: string | undefined;
        attachmentIds?: string[] | undefined;
        reactions?: {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }[] | undefined;
        readBy?: string[] | undefined;
    }>, "many">;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ownerId: z.ZodString;
        kind: z.ZodEnum<["image", "file", "avatar", "banner", "wallpaper", "sticker", "gif"]>;
        mediaKind: z.ZodOptional<z.ZodEnum<["voice", "video_circle", "gif"]>>;
        durationSeconds: z.ZodOptional<z.ZodNumber>;
        fileName: z.ZodString;
        storedFileName: z.ZodString;
        mimeType: z.ZodString;
        size: z.ZodNumber;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        storedFileName: string;
        id: string;
        ownerId: string;
        kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
        fileName: string;
        mimeType: string;
        size: number;
        createdAt: string;
        mediaKind?: "gif" | "voice" | "video_circle" | undefined;
        durationSeconds?: number | undefined;
    }, {
        storedFileName: string;
        id: string;
        ownerId: string;
        kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
        fileName: string;
        mimeType: string;
        size: number;
        createdAt: string;
        mediaKind?: "gif" | "voice" | "video_circle" | undefined;
        durationSeconds?: number | undefined;
    }>, "many">>;
    reports: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        reporterId: z.ZodString;
        reportedUserId: z.ZodString;
        reason: z.ZodEnum<["spam", "abuse", "fraud", "other"]>;
        details: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        reason: "spam" | "abuse" | "fraud" | "other";
        reporterId: string;
        reportedUserId: string;
        details?: string | undefined;
    }, {
        id: string;
        createdAt: string;
        reason: "spam" | "abuse" | "fraud" | "other";
        reporterId: string;
        reportedUserId: string;
        details?: string | undefined;
    }>, "many">>;
    calls: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        initiatorId: z.ZodString;
        mode: z.ZodEnum<["audio", "video"]>;
        status: z.ZodEnum<["ringing", "active", "completed", "missed", "rejected", "not_answered"]>;
        startedAt: z.ZodString;
        answeredAt: z.ZodOptional<z.ZodString>;
        endedAt: z.ZodOptional<z.ZodString>;
        endedById: z.ZodOptional<z.ZodString>;
        durationSeconds: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        status: "completed" | "missed" | "ringing" | "active" | "rejected" | "not_answered";
        id: string;
        conversationId: string;
        startedAt: string;
        initiatorId: string;
        mode: "audio" | "video";
        durationSeconds?: number | undefined;
        answeredAt?: string | undefined;
        endedAt?: string | undefined;
        endedById?: string | undefined;
    }, {
        status: "completed" | "missed" | "ringing" | "active" | "rejected" | "not_answered";
        id: string;
        conversationId: string;
        startedAt: string;
        initiatorId: string;
        mode: "audio" | "video";
        durationSeconds?: number | undefined;
        answeredAt?: string | undefined;
        endedAt?: string | undefined;
        endedById?: string | undefined;
    }>, "many">>;
    favoriteNotes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        content: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        userId: string;
        content: string;
        updatedAt?: string | undefined;
    }, {
        id: string;
        createdAt: string;
        userId: string;
        content: string;
        updatedAt?: string | undefined;
    }>, "many">>;
    drafts: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        conversationId: z.ZodString;
        text: z.ZodString;
        attachmentIds: z.ZodArray<z.ZodString, "many">;
        replyToId: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        updatedAt: string;
        userId: string;
        replyToId?: string | undefined;
    }, {
        id: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        updatedAt: string;
        userId: string;
        replyToId?: string | undefined;
    }>, "many">>;
    folders: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        name: z.ZodString;
        position: z.ZodNumber;
        conversationIds: z.ZodArray<z.ZodString, "many">;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        name: string;
        position: number;
        conversationIds: string[];
    }, {
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        name: string;
        position: number;
        conversationIds: string[];
    }>, "many">>;
    scheduledMessages: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        conversationId: z.ZodString;
        text: z.ZodString;
        attachmentIds: z.ZodArray<z.ZodString, "many">;
        replyToId: z.ZodOptional<z.ZodString>;
        sendAt: z.ZodString;
        status: z.ZodEnum<["pending", "sending", "sent", "failed", "cancelled"]>;
        createdAt: z.ZodString;
        sentAt: z.ZodOptional<z.ZodString>;
        messageId: z.ZodOptional<z.ZodString>;
        failureReason: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "sending" | "sent" | "failed" | "cancelled";
        id: string;
        createdAt: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        userId: string;
        sendAt: string;
        replyToId?: string | undefined;
        messageId?: string | undefined;
        sentAt?: string | undefined;
        failureReason?: string | undefined;
    }, {
        status: "pending" | "sending" | "sent" | "failed" | "cancelled";
        id: string;
        createdAt: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        userId: string;
        sendAt: string;
        replyToId?: string | undefined;
        messageId?: string | undefined;
        sentAt?: string | undefined;
        failureReason?: string | undefined;
    }>, "many">>;
    sessions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        tokenHashes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        site: z.ZodDefault<z.ZodString>;
        device: z.ZodDefault<z.ZodString>;
        deviceId: z.ZodOptional<z.ZodString>;
        customDeviceName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        lastSeenAt: z.ZodString;
        newDevice: z.ZodOptional<z.ZodBoolean>;
        acknowledgedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        terminatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        lastSeenAt: string;
        userId: string;
        site: string;
        tokenHashes: string[];
        device: string;
        deviceId?: string | undefined;
        customDeviceName?: string | null | undefined;
        terminatedAt?: string | null | undefined;
        newDevice?: boolean | undefined;
        acknowledgedAt?: string | null | undefined;
    }, {
        id: string;
        createdAt: string;
        lastSeenAt: string;
        userId: string;
        deviceId?: string | undefined;
        customDeviceName?: string | null | undefined;
        terminatedAt?: string | null | undefined;
        site?: string | undefined;
        tokenHashes?: string[] | undefined;
        device?: string | undefined;
        newDevice?: boolean | undefined;
        acknowledgedAt?: string | null | undefined;
    }>, "many">>;
    stickerPacks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ownerId: z.ZodString;
        title: z.ZodString;
        emoji: z.ZodString;
        version: z.ZodNumber;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        ownerId: string;
        createdAt: string;
        emoji: string;
        title: string;
        version: number;
        updatedAt: string;
    }, {
        id: string;
        ownerId: string;
        createdAt: string;
        emoji: string;
        title: string;
        version: number;
        updatedAt: string;
    }>, "many">>;
    stickers: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        packId: z.ZodString;
        attachmentId: z.ZodOptional<z.ZodString>;
        imageUrl: z.ZodOptional<z.ZodString>;
        emoji: z.ZodString;
        animated: z.ZodBoolean;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        packId: string;
        emoji: string;
        animated: boolean;
        attachmentId?: string | undefined;
        imageUrl?: string | undefined;
    }, {
        id: string;
        createdAt: string;
        packId: string;
        emoji: string;
        animated: boolean;
        attachmentId?: string | undefined;
        imageUrl?: string | undefined;
    }>, "many">>;
    stickerInstalls: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        packId: z.ZodString;
        sharedByUserId: z.ZodString;
        installedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        packId: string;
        sharedByUserId: string;
        userId: string;
        installedAt: string;
    }, {
        id: string;
        packId: string;
        sharedByUserId: string;
        userId: string;
        installedAt: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    stickers: {
        id: string;
        createdAt: string;
        packId: string;
        emoji: string;
        animated: boolean;
        attachmentId?: string | undefined;
        imageUrl?: string | undefined;
    }[];
    attachments: {
        storedFileName: string;
        id: string;
        ownerId: string;
        kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
        fileName: string;
        mimeType: string;
        size: number;
        createdAt: string;
        mediaKind?: "gif" | "voice" | "video_circle" | undefined;
        durationSeconds?: number | undefined;
    }[];
    users: {
        lastSeenAt: string;
        blockedUserIds: string[];
        favoriteMessageIds: string[];
        id: string;
        createdAt: string;
        email: string;
        showLastSeen: boolean;
        callPrivacy: "everyone" | "contacts" | "nobody";
        callPrivacyAllowedUserIds: string[];
        callPrivacyDeniedUserIds: string[];
        notificationSoundEnabled: boolean;
        passwordHash: string;
        displayName: string;
        bio: string;
        avatar?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        banner?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        themeColor?: string | undefined;
        wallpaperUrl?: string | undefined;
        wallpaperMimeType?: string | undefined;
        bannerColor?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        usernames?: string[] | undefined;
        adminUserIds?: string[] | undefined;
        isOwner?: boolean | undefined;
        isBanned?: boolean | undefined;
        isFrozen?: boolean | undefined;
        birthday?: string | undefined;
        isApp?: boolean | undefined;
        isBot?: boolean | undefined;
        language?: string | undefined;
        sessionAutoTerminateDays?: number | null | undefined;
        emailVerified?: boolean | undefined;
        username?: string | undefined;
        avatarUrl?: string | undefined;
        bannerUrl?: string | undefined;
        friendIds?: string[] | undefined;
        outgoingFriendRequestIds?: string[] | undefined;
        incomingFriendRequestIds?: string[] | undefined;
        isDeleted?: boolean | undefined;
        deletedAt?: string | undefined;
        emailCodeHash?: string | null | undefined;
        emailCodePurpose?: "register" | "login" | "reset" | "delete" | null | undefined;
        emailCodeExpiresAt?: string | null | undefined;
        emailCodeAttempts?: number | undefined;
    }[];
    conversations: {
        pinnedMessageIds: string[];
        archivedBy: string[];
        mutedUntilBy: {
            [k: string]: string | null;
        };
        pinnedMessageId?: string | undefined;
        type: "direct" | "saved" | "group";
        id: string;
        createdAt: string;
        updatedAt: string;
        directKey: string;
        memberIds: string[];
        ownerId?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        avatarUrl?: string | null | undefined;
        title?: string | undefined;
        lastMessageId?: string | undefined;
        description?: string | undefined;
        adminIds?: string[] | undefined;
        adminPermissions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        adminDefaults?: {
            [x: string]: boolean | undefined;
        } | undefined;
        inviteCode?: string | undefined;
        permissions?: {
            [x: string]: boolean | undefined;
        } | undefined;
        restrictions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        mutedMembers?: Record<string, string | null> | undefined;
        memberTags?: Record<string, string> | undefined;
        leftIds?: string[] | undefined;
        history?: {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }[] | undefined;
        isSupportInbox?: boolean | undefined;
    }[];
    messages: {
        attachmentIds: string[];
        reactions: {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }[];
        readBy: string[];
        id: string;
        kind: "user" | "system" | "poll" | "bot";
        createdAt: string;
        conversationId: string;
        senderId: string;
        text: string;
        stickerIds: string[];
        poll?: {
            options: {
                id: string;
                text: string;
            }[];
            description: string;
            question: string;
            settings: {
                showNames: boolean;
                multiple: boolean;
                addOptions: boolean;
                changeVote: boolean;
                shuffle: boolean;
                correctOptionIds: string[];
                deadline: string | null;
            };
            votes: Record<string, string[]>;
            closed: boolean;
        } | undefined;
        call?: {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        } | undefined;
        systemEvent?: "call" | "user_joined" | "user_left" | undefined;
        keyboard?: {
            action: string;
            label: string;
        }[][] | undefined;
        supportTicket?: {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        } | undefined;
        stickerPackId?: string | undefined;
        editedAt?: string | undefined;
        replyToId?: string | undefined;
        forwardedFromId?: string | undefined;
    }[];
    reports: {
        id: string;
        createdAt: string;
        reason: "spam" | "abuse" | "fraud" | "other";
        reporterId: string;
        reportedUserId: string;
        details?: string | undefined;
    }[];
    favoriteNotes: {
        id: string;
        createdAt: string;
        userId: string;
        content: string;
        updatedAt?: string | undefined;
    }[];
    calls: {
        status: "completed" | "missed" | "ringing" | "active" | "rejected" | "not_answered";
        id: string;
        conversationId: string;
        startedAt: string;
        initiatorId: string;
        mode: "audio" | "video";
        durationSeconds?: number | undefined;
        answeredAt?: string | undefined;
        endedAt?: string | undefined;
        endedById?: string | undefined;
    }[];
    drafts: {
        id: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        updatedAt: string;
        userId: string;
        replyToId?: string | undefined;
    }[];
    folders: {
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        name: string;
        position: number;
        conversationIds: string[];
    }[];
    scheduledMessages: {
        status: "pending" | "sending" | "sent" | "failed" | "cancelled";
        id: string;
        createdAt: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        userId: string;
        sendAt: string;
        replyToId?: string | undefined;
        messageId?: string | undefined;
        sentAt?: string | undefined;
        failureReason?: string | undefined;
    }[];
    sessions: {
        id: string;
        createdAt: string;
        lastSeenAt: string;
        userId: string;
        site: string;
        tokenHashes: string[];
        device: string;
        deviceId?: string | undefined;
        customDeviceName?: string | null | undefined;
        terminatedAt?: string | null | undefined;
        newDevice?: boolean | undefined;
        acknowledgedAt?: string | null | undefined;
    }[];
    stickerPacks: {
        id: string;
        ownerId: string;
        createdAt: string;
        emoji: string;
        title: string;
        version: number;
        updatedAt: string;
    }[];
    stickerInstalls: {
        id: string;
        packId: string;
        sharedByUserId: string;
        userId: string;
        installedAt: string;
    }[];
    version: 1;
}, {
    users: {
        id: string;
        createdAt: string;
        email: string;
        passwordHash: string;
        displayName: string;
        avatar?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        banner?: {
            id: string;
            ownerId: string;
            kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
            fileName: string;
            mimeType: string;
            size: number;
            createdAt: string;
            url: string;
            mediaKind?: "gif" | "voice" | "video_circle" | undefined;
            durationSeconds?: number | undefined;
        } | undefined;
        themeColor?: string | undefined;
        wallpaperUrl?: string | undefined;
        wallpaperMimeType?: string | undefined;
        bannerColor?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        usernames?: string[] | undefined;
        adminUserIds?: string[] | undefined;
        isOwner?: boolean | undefined;
        isBanned?: boolean | undefined;
        isFrozen?: boolean | undefined;
        birthday?: string | undefined;
        isApp?: boolean | undefined;
        isBot?: boolean | undefined;
        language?: string | undefined;
        sessionAutoTerminateDays?: number | null | undefined;
        showLastSeen?: boolean | undefined;
        callPrivacy?: "everyone" | "contacts" | "nobody" | undefined;
        callPrivacyAllowedUserIds?: string[] | undefined;
        callPrivacyDeniedUserIds?: string[] | undefined;
        notificationSoundEnabled?: boolean | undefined;
        emailVerified?: boolean | undefined;
        username?: string | undefined;
        bio?: string | undefined;
        avatarUrl?: string | undefined;
        lastSeenAt?: string | undefined;
        blockedUserIds?: string[] | undefined;
        favoriteMessageIds?: string[] | undefined;
        bannerUrl?: string | undefined;
        friendIds?: string[] | undefined;
        outgoingFriendRequestIds?: string[] | undefined;
        incomingFriendRequestIds?: string[] | undefined;
        isDeleted?: boolean | undefined;
        deletedAt?: string | undefined;
        emailCodeHash?: string | null | undefined;
        emailCodePurpose?: "register" | "login" | "reset" | "delete" | null | undefined;
        emailCodeExpiresAt?: string | null | undefined;
        emailCodeAttempts?: number | undefined;
    }[];
    conversations: {
        type: "direct" | "saved" | "group";
        id: string;
        createdAt: string;
        updatedAt: string;
        directKey: string;
        memberIds: string[];
        ownerId?: string | undefined;
        isVerified?: boolean | undefined;
        badge?: "yargram" | null | undefined;
        scam?: boolean | undefined;
        fake?: boolean | undefined;
        avatarUrl?: string | null | undefined;
        title?: string | undefined;
        lastMessageId?: string | undefined;
        pinnedMessageId?: string | undefined;
        pinnedMessageIds?: string[] | undefined;
        archivedBy?: string[] | undefined;
        mutedUntilBy?: Record<string, string | null> | undefined;
        description?: string | undefined;
        adminIds?: string[] | undefined;
        adminPermissions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        adminDefaults?: {
            [x: string]: boolean | undefined;
        } | undefined;
        inviteCode?: string | undefined;
        permissions?: {
            [x: string]: boolean | undefined;
        } | undefined;
        restrictions?: Record<string, {
            [x: string]: boolean | undefined;
        } | undefined> | undefined;
        mutedMembers?: Record<string, string | null> | undefined;
        memberTags?: Record<string, string> | undefined;
        leftIds?: string[] | undefined;
        history?: {
            at: string;
            id: string;
            kind: string;
            actorId: string;
            targetId?: string | undefined;
            detail?: string | undefined;
        }[] | undefined;
        isSupportInbox?: boolean | undefined;
    }[];
    messages: {
        id: string;
        createdAt: string;
        conversationId: string;
        senderId: string;
        text: string;
        kind?: "user" | "system" | "poll" | "bot" | undefined;
        poll?: {
            question: string;
            settings: {
                showNames?: boolean | undefined;
                multiple?: boolean | undefined;
                addOptions?: boolean | undefined;
                changeVote?: boolean | undefined;
                shuffle?: boolean | undefined;
                correctOptionIds?: string[] | undefined;
                deadline?: string | null | undefined;
            };
            options?: {
                id: string;
                text: string;
            }[] | undefined;
            description?: string | undefined;
            votes?: Record<string, string[]> | undefined;
            closed?: boolean | undefined;
        } | undefined;
        call?: {
            durationSeconds: number;
            startedAt: string;
            mode: "audio" | "video";
            endedAt: string;
            callId: string;
            callerId: string;
            outcome: "completed" | "missed" | "declined" | "unanswered";
        } | undefined;
        systemEvent?: "call" | "user_joined" | "user_left" | undefined;
        keyboard?: {
            action: string;
            label: string;
        }[][] | undefined;
        supportTicket?: {
            userId: string;
            category: string;
            code?: string | undefined;
            topic?: string | undefined;
        } | undefined;
        stickerIds?: string[] | undefined;
        stickerPackId?: string | undefined;
        editedAt?: string | undefined;
        replyToId?: string | undefined;
        forwardedFromId?: string | undefined;
        attachmentIds?: string[] | undefined;
        reactions?: {
            createdAt: string;
            emoji: "👍" | "❤️" | "😂" | "😎" | "🔥" | "😢" | "😮" | "🍓" | "🍷";
            userId: string;
        }[] | undefined;
        readBy?: string[] | undefined;
    }[];
    version: 1;
    stickers?: {
        id: string;
        createdAt: string;
        packId: string;
        emoji: string;
        animated: boolean;
        attachmentId?: string | undefined;
        imageUrl?: string | undefined;
    }[] | undefined;
    attachments?: {
        storedFileName: string;
        id: string;
        ownerId: string;
        kind: "avatar" | "image" | "file" | "banner" | "wallpaper" | "sticker" | "gif";
        fileName: string;
        mimeType: string;
        size: number;
        createdAt: string;
        mediaKind?: "gif" | "voice" | "video_circle" | undefined;
        durationSeconds?: number | undefined;
    }[] | undefined;
    reports?: {
        id: string;
        createdAt: string;
        reason: "spam" | "abuse" | "fraud" | "other";
        reporterId: string;
        reportedUserId: string;
        details?: string | undefined;
    }[] | undefined;
    favoriteNotes?: {
        id: string;
        createdAt: string;
        userId: string;
        content: string;
        updatedAt?: string | undefined;
    }[] | undefined;
    calls?: {
        status: "completed" | "missed" | "ringing" | "active" | "rejected" | "not_answered";
        id: string;
        conversationId: string;
        startedAt: string;
        initiatorId: string;
        mode: "audio" | "video";
        durationSeconds?: number | undefined;
        answeredAt?: string | undefined;
        endedAt?: string | undefined;
        endedById?: string | undefined;
    }[] | undefined;
    drafts?: {
        id: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        updatedAt: string;
        userId: string;
        replyToId?: string | undefined;
    }[] | undefined;
    folders?: {
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        name: string;
        position: number;
        conversationIds: string[];
    }[] | undefined;
    scheduledMessages?: {
        status: "pending" | "sending" | "sent" | "failed" | "cancelled";
        id: string;
        createdAt: string;
        conversationId: string;
        text: string;
        attachmentIds: string[];
        userId: string;
        sendAt: string;
        replyToId?: string | undefined;
        messageId?: string | undefined;
        sentAt?: string | undefined;
        failureReason?: string | undefined;
    }[] | undefined;
    sessions?: {
        id: string;
        createdAt: string;
        lastSeenAt: string;
        userId: string;
        deviceId?: string | undefined;
        customDeviceName?: string | null | undefined;
        terminatedAt?: string | null | undefined;
        site?: string | undefined;
        tokenHashes?: string[] | undefined;
        device?: string | undefined;
        newDevice?: boolean | undefined;
        acknowledgedAt?: string | null | undefined;
    }[] | undefined;
    stickerPacks?: {
        id: string;
        ownerId: string;
        createdAt: string;
        emoji: string;
        title: string;
        version: number;
        updatedAt: string;
    }[] | undefined;
    stickerInstalls?: {
        id: string;
        packId: string;
        sharedByUserId: string;
        userId: string;
        installedAt: string;
    }[] | undefined;
}>;
export declare class JsonDatabase {
    private readonly filePath;
    private state;
    private mutationQueue;
    private initialized;
    constructor(filePath: string);
    initialize(): Promise<void>;
    read<T>(reader: (state: Readonly<DatabaseState>) => T): T;
    transaction<T>(mutator: (draft: DatabaseState) => T | Promise<T>): Promise<T>;
    private persist;
    private ensureInitialized;
}
