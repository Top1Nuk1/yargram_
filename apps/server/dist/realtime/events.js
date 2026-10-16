import { EventEmitter } from "node:events";
export class RealtimeEvents {
    emitter = new EventEmitter();
    publishNewMessage(event) {
        this.emitter.emit("message:new", event);
    }
    onNewMessage(listener) {
        return this.subscribe("message:new", listener);
    }
    publishUpdatedMessage(event) {
        this.emitter.emit("message:updated", event);
    }
    onUpdatedMessage(listener) {
        return this.subscribe("message:updated", listener);
    }
    publishDeletedMessage(event) {
        this.emitter.emit("message:deleted", event);
    }
    onDeletedMessage(listener) {
        return this.subscribe("message:deleted", listener);
    }
    publishPinnedMessage(event) {
        this.emitter.emit("message:pinned", event);
    }
    onPinnedMessage(listener) {
        return this.subscribe("message:pinned", listener);
    }
    publishReaction(event) {
        this.emitter.emit("message:reaction", event);
    }
    onReaction(listener) {
        return this.subscribe("message:reaction", listener);
    }
    publishReadMessages(event) {
        this.emitter.emit("messages:read", event);
    }
    onReadMessages(listener) {
        return this.subscribe("messages:read", listener);
    }
    publishUpdatedProfile(event) {
        this.emitter.emit("profile:updated", event);
    }
    onUpdatedProfile(listener) {
        return this.subscribe("profile:updated", listener);
    }
    publishConversationSettings(event) {
        this.emitter.emit("conversation:settings", event);
    }
    onConversationSettings(listener) {
        return this.subscribe("conversation:settings", listener);
    }
    publishDraft(event) {
        this.emitter.emit("draft:updated", event);
    }
    onDraft(listener) {
        return this.subscribe("draft:updated", listener);
    }
    publishFolders(event) {
        this.emitter.emit("folders:updated", event);
    }
    onFolders(listener) {
        return this.subscribe("folders:updated", listener);
    }
    publishScheduledMessage(event) {
        this.emitter.emit("scheduled:updated", event);
    }
    onScheduledMessage(listener) {
        return this.subscribe("scheduled:updated", listener);
    }
    publishAccountState(event) {
        this.emitter.emit("account:state", event);
    }
    onAccountState(listener) {
        return this.subscribe("account:state", listener);
    }
    publishFriendship(event) {
        this.emitter.emit("friendship:changed", event);
    }
    onFriendship(listener) {
        return this.subscribe("friendship:changed", listener);
    }
    publishSessionTerminated(event) {
        this.emitter.emit("session:terminated", event);
    }
    onSessionTerminated(listener) {
        return this.subscribe("session:terminated", listener);
    }
    publishStickerPack(event) {
        this.emitter.emit("stickerPack:updated", event);
    }
    onStickerPack(listener) {
        return this.subscribe("stickerPack:updated", listener);
    }
    subscribe(eventName, listener) {
        this.emitter.on(eventName, listener);
        return () => this.emitter.off(eventName, listener);
    }
}
//# sourceMappingURL=events.js.map