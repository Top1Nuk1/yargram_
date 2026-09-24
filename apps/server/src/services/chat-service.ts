import { randomUUID } from "node:crypto";
import type {
  Attachment,
  AttachmentView,
  CallRecord,
  Conversation,
  Message,
  Poll,
  PollSettings,
  PublicUser,
  ReactionEmoji,
  User,
  UserReport,
} from "../domain/models.js";
import {
  effectiveGroupPermissions,
  ensurePublicUser,
  groupCan,
  groupRoleFor,
  removedUserPlaceholder,
  toAttachmentView,
  toPublicUser,
  toPublicUserFor,
} from "../domain/models.js";
import type { EffectiveGroupPermissions, GroupRole } from "../domain/models.js";

const POLL_QUESTION_MAX = 255;
const POLL_DESCRIPTION_MAX = 500;
const POLL_OPTION_MAX = 100;
const POLL_OPTIONS_MAX = 12;

/** Настройки из запроса: ключ может прийти как undefined, это допустимо. */
export type PollSettingsInput = {
  [K in keyof PollSettings]?: PollSettings[K] | undefined;
};

/** Настройки опроса по умолчанию: как в макете «Новый опрос». */
export function defaultPollSettings(): PollSettings {
  return {
    showNames: true,
    multiple: false,
    addOptions: true,
    changeVote: true,
    shuffle: false,
    correctOptionIds: [],
    deadline: null,
  };
}

/** Собираем настройки: что пришло в запросе, остальное — по умолчанию. */
export function mergePollSettings(input?: PollSettingsInput): PollSettings {
  const defaults = defaultPollSettings();
  const pick = <K extends keyof PollSettings>(key: K): PollSettings[K] => {
    const value = input?.[key];
    return value === undefined ? defaults[key] : value;
  };
  return {
    showNames: pick("showNames"),
    multiple: pick("multiple"),
    addOptions: pick("addOptions"),
    changeVote: pick("changeVote"),
    shuffle: pick("shuffle"),
    correctOptionIds: pick("correctOptionIds"),
    deadline: pick("deadline"),
  };
}

/** Опрос закрыт: автор остановил или вышел срок. */
export function pollClosed(poll: Poll, now: number = Date.now()): boolean {
  if (poll.closed) return true;
  if (!poll.settings.deadline) return false;
  const at = Date.parse(poll.settings.deadline);
  return !Number.isNaN(at) && at <= now;
}

/**
 * Опрос глазами смотрящего. Итоги считает сервер, поэтому анонимный опрос тоже
 * показывает числа; чужие голоса уезжают наружу только при открытых именах.
 */
export function viewPoll(poll: Poll, viewerId?: string): PollView {
  const counts: Record<string, number> = {};
  for (const option of poll.options) counts[option.id] = 0;
  let totalVoters = 0;
  for (const picks of Object.values(poll.votes)) {
    if (picks.length > 0) totalVoters += 1;
    for (const pick of picks) counts[pick] = (counts[pick] ?? 0) + 1;
  }
  const own = viewerId ? poll.votes[viewerId] : undefined;
  const votes = poll.settings.showNames ? poll.votes : own ? { [viewerId!]: own } : {};
  return { ...poll, votes, counts, totalVoters, closed: pollClosed(poll) };
}
import { AppError } from "../lib/errors.js";
import type { Repositories } from "../repositories/types.js";

export type ReactionView = {
  emoji: ReactionEmoji;
  userIds: string[];
  count: number;
};

/**
 * Опрос глазами смотрящего. Итоги считает сервер, поэтому анонимный опрос
 * показывает числа, но не имена: чужие голоса в `votes` не уезжают.
 */
export type PollView = Poll & {
  counts: Record<string, number>;
  totalVoters: number;
};

export type MessageSnapshot = Omit<Message, "attachmentIds" | "reactions" | "poll"> & {
  sender: PublicUser;
  attachments: AttachmentView[];
  reactions: ReactionView[];
  poll?: PollView | undefined;
  isFavorite?: boolean;
};

export type MessageView = MessageSnapshot & {
  replyTo: MessageSnapshot | null;
  forwardedFrom: MessageSnapshot | null;
};

export type ConversationView = Omit<
  Conversation,
  | "directKey"
  | "lastMessageId"
  | "pinnedMessageId"
  | "pinnedMessageIds"
  | "archivedBy"
  | "mutedUntilBy"
> & {
  members: PublicUser[];
  lastMessage: MessageView | null;
  /** Latest pin, retained for Yargram 0.1 clients. */
  pinnedMessage: MessageView | null;
  pinnedMessages: MessageView[];
  archived: boolean;
  mutedUntil: string | null;
  blocked: boolean;
  /** Я заблокировал собеседника: писать и звонить нельзя, пока не разблокирую. */
  blockedByMe: boolean;
  /** Собеседник заблокировал меня: писать можно, но ему это не доставляется. */
  blockedByPeer: boolean;
  /** Роль смотрящего в группе; у личного диалога и «Избранного» — null. */
  role?: GroupRole | null;
  /** Эффективные права смотрящего: клиент по ним включает или гасит кнопки. */
  myPermissions?: EffectiveGroupPermissions;
  memberCount?: number;
  /** Сколько сообщений в чате я ещё не прочитал. */
  unreadCount: number;
};

/** Сколько чего лежит в переписке с человеком — для разделов медиа в профиле. */
export type MediaSummary = {
  photos: number;
  videos: number;
  files: number;
  audio: number;
  voice: number;
  videoCircles: number;
  gifs: number;
  links: number;
};

export type ReadReceipt = {
  conversationId: string;
  messageIds: string[];
  userId: string;
  readAt: string;
};

export type PinsResult = {
  conversationId: string;
  message: MessageView | null;
  pinnedMessages: MessageView[];
  memberIds: string[];
};

export class ChatService {
  constructor(private readonly repositories: Repositories) {}

  async createSavedConversation(currentUserId: string): Promise<{ conversation: ConversationView; created: boolean }> {
    await this.getUser(currentUserId);
    const result = await this.repositories.conversations.findOrCreateSaved(currentUserId);
    return { conversation: await this.toConversationView(result.conversation, currentUserId), created: result.created };
  }

  async createDirectConversation(currentUserId: string, otherUserId: string): Promise<{
    conversation: ConversationView;
    created: boolean;
  }> {
    if (currentUserId === otherUserId) {
      throw new AppError(400, "SELF_CONVERSATION", "A direct chat with yourself is not supported");
    }
    if (!(await this.repositories.users.findById(otherUserId))) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    }
    await this.assertUsersCanInteract(currentUserId, otherUserId);

    const result = await this.repositories.conversations.findOrCreateDirect(
      currentUserId,
      otherUserId,
    );
    return {
      conversation: await this.toConversationView(result.conversation, currentUserId),
      created: result.created,
    };
  }

  async listConversations(
    currentUserId: string,
    archived: boolean | "all" = "all",
  ): Promise<ConversationView[]> {
    const conversations = await this.repositories.conversations.listForUser(currentUserId);
    const shown = conversations.filter(
      (conversation) =>
        archived === "all" || conversation.archivedBy.includes(currentUserId) === archived,
    );
    // Непрочитанные считаем одним запросом на все чаты, а не по беседе.
    const unread = await this.repositories.messages.countUnread(
      shown.map((conversation) => conversation.id),
      currentUserId,
    );
    return Promise.all(
      shown.map((conversation) =>
        this.toConversationView(conversation, currentUserId, unread[conversation.id] ?? 0),
      ),
    );
  }

  async listMessages(
    currentUserId: string,
    conversationId: string,
    options: { limit: number; before?: string; query?: string },
  ): Promise<MessageView[]> {
    await this.getAuthorizedConversation(currentUserId, conversationId);
    const messages = await this.repositories.messages.listForConversation(conversationId, options);
    // Сообщения от заблокированных мною не существуют для меня — даже если они
    // были отправлены до блокировки или пока она действовала.
    const me = await this.repositories.users.findById(currentUserId);
    const blocked = me?.blockedUserIds ?? [];
    const visible = blocked.length
      ? messages.filter((message) => !blocked.includes(message.senderId))
      : messages;
    return this.toMessageViews(visible, currentUserId);
  }

  /**
   * Считает медиа, которое есть в переписке с этим человеком. Профиль показывает
   * только те разделы, где счётчик больше нуля: пустые «0 файлов» не нужны.
   */
  async mediaSummary(currentUserId: string, peerId: string): Promise<MediaSummary> {
    const summary: MediaSummary = {
      photos: 0,
      videos: 0,
      files: 0,
      audio: 0,
      voice: 0,
      videoCircles: 0,
      gifs: 0,
      links: 0,
    };
    const conversations = await this.repositories.conversations.listForUser(currentUserId);
    const shared = conversations.filter((conversation) => conversation.memberIds.includes(peerId));
    for (const conversation of shared) {
      let before: string | undefined;
      for (let page = 0; page < MEDIA_SCAN_PAGES; page += 1) {
        const batch = await this.repositories.messages.listForConversation(conversation.id, {
          limit: MEDIA_SCAN_PAGE_SIZE,
          ...(before === undefined ? {} : { before }),
        });
        if (batch.length === 0) break;
        const ids = [...new Set(batch.flatMap((message) => message.attachmentIds))];
        const attachments = ids.length ? await this.repositories.attachments.findManyByIds(ids) : [];
        const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
        for (const message of batch) {
          if (LINK_PATTERN.test(message.text)) summary.links += 1;
          for (const id of message.attachmentIds) {
            const attachment = byId.get(id);
            if (attachment) countMedia(summary, attachment);
          }
        }
        if (batch.length < MEDIA_SCAN_PAGE_SIZE) break;
        const cursor = batch[0]?.createdAt;
        if (!cursor || cursor === before) break;
        before = cursor;
      }
    }
    return summary;
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    text: string,
    replyToId?: string,
    options: { attachmentIds?: string[]; forwardedFromId?: string } = {},
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.assertConversationInteractionAllowed(currentUserId, conversation);
    // В группе права важнее блокировок: запреты участников и общие правила группы.
    await this.assertGroupSendingAllowed(currentUserId, conversation, text, options.attachmentIds ?? []);
    if (replyToId !== undefined) {
      const replyTarget = await this.repositories.messages.findById(replyToId);
      if (!replyTarget || replyTarget.conversationId !== conversationId) {
        throw new AppError(400, "REPLY_MESSAGE_INVALID", "Reply message is not in this conversation");
      }
    }
    const attachmentIds = [...new Set(options.attachmentIds ?? [])];
    if (!text.trim() && attachmentIds.length === 0) {
      throw new AppError(400, "MESSAGE_EMPTY", "A message must contain text or an attachment");
    }
    if (attachmentIds.length > 10) {
      throw new AppError(400, "TOO_MANY_ATTACHMENTS", "A message may contain at most 10 attachments");
    }
    await this.assertOwnedMessageAttachments(currentUserId, attachmentIds);
    if (options.forwardedFromId !== undefined) {
      const forwarded = await this.repositories.messages.findById(options.forwardedFromId);
      if (!forwarded) {
        throw new AppError(400, "FORWARDED_MESSAGE_INVALID", "Forwarded message was not found");
      }
      const sourceConversation = await this.repositories.conversations.findById(
        forwarded.conversationId,
      );
      if (!sourceConversation?.memberIds.includes(currentUserId)) {
        throw new AppError(403, "FORWARDED_MESSAGE_FORBIDDEN", "You cannot forward this message");
      }
    }

    const message = await this.repositories.messages.create({
      conversationId,
      senderId: currentUserId,
      text: text.trim(),
      ...(replyToId === undefined ? {} : { replyToId }),
      ...(options.forwardedFromId === undefined
        ? {}
        : { forwardedFromId: options.forwardedFromId }),
      attachmentIds,
    });
    // A delivered message replaces its own draft.
    await this.repositories.drafts.delete(currentUserId, conversationId);
    return {
      message: await this.toMessageView(message, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  /** Опрос: отдельное сообщение вида poll, а не текст с разметкой. */
  async createPoll(
    currentUserId: string,
    conversationId: string,
    input: {
      question: string;
      description?: string | undefined;
      options: string[];
      settings?: PollSettingsInput | undefined;
    },
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.assertConversationInteractionAllowed(currentUserId, conversation);
    if (conversation.type === "group") {
      if (!groupCan(conversation, currentUserId, "send_messages")) {
        throw new AppError(403, "GROUP_SENDING_DENIED", "В этой группе вам запрещено писать");
      }
      if (!groupCan(conversation, currentUserId, "send_polls")) {
        throw new AppError(403, "GROUP_POLLS_DENIED", "В этой группе запрещено создавать опросы");
      }
    }

    const question = input.question.trim();
    if (!question) throw new AppError(400, "POLL_QUESTION_EMPTY", "У опроса должен быть вопрос");
    if (question.length > POLL_QUESTION_MAX) {
      throw new AppError(400, "POLL_QUESTION_TOO_LONG", "Вопрос слишком длинный");
    }
    const options = input.options.map((option) => option.trim()).filter((option) => option !== "");
    if (options.length < 2) {
      throw new AppError(400, "POLL_OPTIONS_TOO_FEW", "Нужно хотя бы два варианта ответа");
    }
    if (options.length > POLL_OPTIONS_MAX) {
      throw new AppError(400, "POLL_OPTIONS_TOO_MANY", "Слишком много вариантов ответа");
    }

    const message = await this.repositories.messages.create({
      conversationId,
      senderId: currentUserId,
      text: question,
      kind: "poll",
      attachmentIds: [],
      poll: {
        question,
        description: (input.description ?? "").trim().slice(0, POLL_DESCRIPTION_MAX),
        options: options.map((text) => ({ id: randomUUID().slice(0, 8), text })),
        settings: mergePollSettings(input.settings),
        votes: {},
        closed: false,
      },
    });
    return {
      message: await this.toMessageView(message, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  /** Голос: один или несколько вариантов, с учётом настроек опроса. */
  async votePoll(
    currentUserId: string,
    messageId: string,
    optionIds: string[],
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const message = await this.getPollMessage(currentUserId, messageId);
    const poll = message.poll!;
    const conversation = await this.repositories.conversations.findById(message.conversationId);
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    await this.assertConversationInteractionAllowed(currentUserId, conversation);
    if (pollClosed(poll)) {
      throw new AppError(403, "POLL_CLOSED", "Опрос уже завершён");
    }

    const known = new Set(poll.options.map((option) => option.id));
    const picked = [...new Set(optionIds)].filter((id) => known.has(id));
    if (picked.length === 0 && optionIds.length > 0) {
      throw new AppError(400, "POLL_OPTION_UNKNOWN", "Такого варианта ответа нет");
    }
    if (picked.length > 1 && !poll.settings.multiple) {
      throw new AppError(400, "POLL_SINGLE_CHOICE", "В этом опросе можно выбрать один ответ");
    }
    const voted = poll.votes[currentUserId] !== undefined;
    if (voted && !poll.settings.changeVote) {
      throw new AppError(403, "POLL_VOTE_LOCKED", "Ответ уже отправлен и изменить его нельзя");
    }

    const votes = { ...poll.votes };
    if (picked.length === 0) {
      delete votes[currentUserId];
    } else {
      votes[currentUserId] = picked;
    }
    const updated = await this.repositories.messages.updatePoll(messageId, { ...poll, votes });
    return {
      message: await this.toMessageView(updated, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  /** Свой вариант ответа: только если владелец опроса это разрешил. */
  async addPollOption(
    currentUserId: string,
    messageId: string,
    text: string,
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const message = await this.getPollMessage(currentUserId, messageId);
    const poll = message.poll!;
    if (pollClosed(poll)) throw new AppError(403, "POLL_CLOSED", "Опрос уже завершён");
    if (!poll.settings.addOptions) {
      throw new AppError(403, "POLL_OPTIONS_LOCKED", "В этом опросе нельзя добавлять варианты");
    }
    const trimmed = text.trim();
    if (!trimmed) throw new AppError(400, "POLL_OPTION_EMPTY", "Вариант ответа пустой");
    if (poll.options.length >= POLL_OPTIONS_MAX) {
      throw new AppError(400, "POLL_OPTIONS_TOO_MANY", "Слишком много вариантов ответа");
    }
    const conversation = await this.repositories.conversations.findById(message.conversationId);
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    const option = { id: randomUUID().slice(0, 8), text: trimmed.slice(0, POLL_OPTION_MAX) };
    const updated = await this.repositories.messages.updatePoll(messageId, {
      ...poll,
      options: [...poll.options, option],
    });
    return {
      message: await this.toMessageView(updated, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  /** Остановить опрос может только его автор. */
  async closePoll(
    currentUserId: string,
    messageId: string,
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const message = await this.getPollMessage(currentUserId, messageId);
    if (message.senderId !== currentUserId) {
      throw new AppError(403, "POLL_NOT_AUTHOR", "Остановить опрос может только его автор");
    }
    const conversation = await this.repositories.conversations.findById(message.conversationId);
    if (!conversation) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    const updated = await this.repositories.messages.updatePoll(messageId, {
      ...message.poll!,
      closed: true,
    });
    return {
      message: await this.toMessageView(updated, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  /**
   * Вид сообщения для рассылки всем сразу: в анонимном опросе чужие голоса
   * не уезжают никому, поэтому итоги считаем без смотрящего.
   */
  async broadcastView(messageId: string): Promise<MessageView | null> {
    const message = await this.repositories.messages.findById(messageId);
    return message ? this.toMessageView(message) : null;
  }

  private async getPollMessage(currentUserId: string, messageId: string): Promise<Message> {
    const message = await this.repositories.messages.findById(messageId);
    if (!message || message.kind !== "poll" || !message.poll) {
      throw new AppError(404, "POLL_NOT_FOUND", "Опрос не найден");
    }
    await this.getAuthorizedConversation(currentUserId, message.conversationId);
    return message;
  }

  async forwardMessage(
    currentUserId: string,
    sourceConversationId: string,
    messageId: string,
    targetConversationId: string,
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    await this.getAuthorizedConversation(currentUserId, sourceConversationId);
    const source = await this.getConversationMessage(sourceConversationId, messageId);
    const target = await this.getAuthorizedConversation(currentUserId, targetConversationId);
    await this.assertConversationInteractionAllowed(currentUserId, target);
    const forwarded = await this.repositories.messages.create({
      conversationId: targetConversationId,
      senderId: currentUserId,
      text: source.text,
      forwardedFromId: source.id,
      attachmentIds: source.attachmentIds,
    });
    return {
      message: await this.toMessageView(forwarded, currentUserId),
      memberIds: target.memberIds,
    };
  }

  async updateMessage(
    currentUserId: string,
    conversationId: string,
    messageId: string,
    text: string,
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    const existing = await this.getConversationMessage(conversationId, messageId);
    if (existing.senderId !== currentUserId || existing.kind !== "user") {
      throw new AppError(403, "MESSAGE_EDIT_FORBIDDEN", "You can only edit your own messages");
    }
    if (!text.trim() && existing.attachmentIds.length === 0) {
      throw new AppError(400, "MESSAGE_EMPTY", "A message must contain text or an attachment");
    }
    const message = await this.repositories.messages.updateText(messageId, text.trim());
    return {
      message: await this.toMessageView(message, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  async deleteMessage(
    currentUserId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{
    conversationId: string;
    messageId: string;
    conversation: ConversationView;
    memberIds: string[];
  }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.getConversationMessage(conversationId, messageId);
    await this.repositories.messages.deleteFromConversation(conversationId, messageId);
    const updatedConversation = await this.repositories.conversations.findById(conversationId);
    if (!updatedConversation) {
      throw new AppError(500, "DATA_INTEGRITY_ERROR", "Conversation disappeared during deletion");
    }
    return {
      conversationId,
      messageId,
      conversation: await this.toConversationView(updatedConversation, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  async setReaction(
    currentUserId: string,
    conversationId: string,
    messageId: string,
    emoji: ReactionEmoji | null,
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.getConversationMessage(conversationId, messageId);
    const message = await this.repositories.messages.setReaction(messageId, currentUserId, emoji);
    return {
      message: await this.toMessageView(message, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  async setFavorite(
    currentUserId: string,
    conversationId: string,
    messageId: string,
    favorite: boolean,
  ): Promise<{ message: MessageView; favorite: boolean }> {
    await this.getAuthorizedConversation(currentUserId, conversationId);
    const existing = await this.getConversationMessage(conversationId, messageId);
    await this.repositories.users.setFavorite(currentUserId, messageId, favorite);
    return {
      message: await this.toMessageView(existing, currentUserId),
      favorite,
    };
  }

  async listFavorites(currentUserId: string): Promise<MessageView[]> {
    const user = await this.getUser(currentUserId);
    const messages = await this.repositories.messages.listByIds(user.favoriteMessageIds);
    const authorized: Message[] = [];
    for (const message of messages) {
      const conversation = await this.repositories.conversations.findById(message.conversationId);
      if (conversation?.memberIds.includes(currentUserId)) authorized.push(message);
    }
    return this.toMessageViews(authorized.reverse(), currentUserId);
  }

  async setPinnedMessage(
    currentUserId: string,
    conversationId: string,
    messageId: string | null,
  ): Promise<PinsResult> {
    await this.getAuthorizedConversation(currentUserId, conversationId);
    if (messageId !== null) await this.getConversationMessage(conversationId, messageId);
    const updated = await this.repositories.conversations.setPinnedMessage(
      conversationId,
      messageId,
    );
    return this.toPinsResult(updated, currentUserId);
  }

  async setMessagePinned(
    currentUserId: string,
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<PinsResult> {
    await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.getConversationMessage(conversationId, messageId);
    const updated = await this.repositories.conversations.setMessagePinned(
      conversationId,
      messageId,
      pinned,
    );
    return this.toPinsResult(updated, currentUserId);
  }

  async updateConversationSettings(
    currentUserId: string,
    conversationId: string,
    input: { archived?: boolean; mutedUntil?: string | null },
  ): Promise<{ conversation: ConversationView; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    const updated = await this.repositories.conversations.updateUserSettings(
      conversationId,
      currentUserId,
      input,
    );
    return {
      conversation: await this.toConversationView(updated, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  async markConversationRead(
    currentUserId: string,
    conversationId: string,
  ): Promise<{ receipt: ReadReceipt; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    const result = await this.repositories.messages.markRead(conversationId, currentUserId);
    return {
      receipt: {
        conversationId,
        messageIds: result.messageIds,
        userId: currentUserId,
        readAt: new Date().toISOString(),
      },
      memberIds: conversation.memberIds,
    };
  }

  async setBlocked(
    currentUserId: string,
    otherUserId: string,
    blocked: boolean,
  ): Promise<{ userId: string; blocked: boolean }> {
    if (currentUserId === otherUserId) {
      throw new AppError(400, "SELF_BLOCK", "You cannot block yourself");
    }
    await this.getUser(otherUserId);
    await this.repositories.users.setBlocked(currentUserId, otherUserId, blocked);
    return { userId: otherUserId, blocked };
  }

  async listBlocked(currentUserId: string): Promise<PublicUser[]> {
    const user = await this.getUser(currentUserId);
    const users = await this.repositories.users.findManyByIds(user.blockedUserIds);
    return users.map(toPublicUser);
  }

  async reportUser(
    currentUserId: string,
    reportedUserId: string,
    reason: UserReport["reason"],
    details?: string,
  ): Promise<UserReport> {
    if (currentUserId === reportedUserId) {
      throw new AppError(400, "SELF_REPORT", "You cannot report yourself");
    }
    await this.getUser(reportedUserId);
    return this.repositories.reports.create({
      reporterId: currentUserId,
      reportedUserId,
      reason,
      ...(details === undefined ? {} : { details: details.trim() }),
    });
  }

  async beginCall(
    currentUserId: string,
    conversationId: string,
    callId: string,
    mode: "audio" | "video",
  ): Promise<{ call: CallRecord; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.assertConversationCallable(currentUserId, conversation);
    if (conversation.type === "saved") {
      throw new AppError(400, "CALL_NOT_SUPPORTED", "Calls are not supported in Saved Messages");
    }
    const existing = await this.repositories.calls.findById(callId);
    if (existing &&
      (existing.conversationId !== conversationId || existing.initiatorId !== currentUserId)) {
      throw new AppError(409, "CALL_ID_TAKEN", "This call identifier is already in use");
    }
    const call = await this.repositories.calls.create({
      id: callId,
      conversationId,
      initiatorId: currentUserId,
      mode,
      status: "ringing",
    });
    return { call, memberIds: conversation.memberIds };
  }

  async answerCall(
    currentUserId: string,
    conversationId: string,
    callId: string,
  ): Promise<{ call: CallRecord; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.assertConversationCallable(currentUserId, conversation);
    const call = await this.getConversationCall(conversationId, callId);
    if (call.status !== "ringing") {
      throw new AppError(409, "CALL_NOT_RINGING", "The call is no longer ringing");
    }
    if (call.initiatorId === currentUserId) {
      throw new AppError(403, "CALL_ANSWER_FORBIDDEN", "The caller cannot answer their own call");
    }
    const updated = await this.repositories.calls.update(callId, {
      status: "active",
      answeredAt: new Date().toISOString(),
    });
    return { call: updated, memberIds: conversation.memberIds };
  }

  async updateCallMode(
    currentUserId: string,
    conversationId: string,
    callId: string,
    mode: "audio" | "video",
  ): Promise<{ call: CallRecord; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    await this.getConversationCall(conversationId, callId);
    return {
      call: await this.repositories.calls.update(callId, { mode }),
      memberIds: conversation.memberIds,
    };
  }

  async finishCall(
    currentUserId: string,
    conversationId: string,
    callId: string,
    rejected = false,
  ): Promise<{
    call: CallRecord;
    message: MessageView;
    memberIds: string[];
  }> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    const call = await this.getConversationCall(conversationId, callId);
    if (["completed", "missed", "rejected", "not_answered"].includes(call.status)) {
      throw new AppError(409, "CALL_ALREADY_FINISHED", "The call has already finished");
    }
    const endedAt = new Date().toISOString();
    const durationSeconds = call.answeredAt
      ? Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(call.answeredAt)) / 1_000))
      : 0;
    const status = call.status === "active" ? "completed" : rejected ? "rejected" : "not_answered";
    const updated = await this.repositories.calls.update(callId, {
      status,
      endedAt,
      endedById: currentUserId,
      durationSeconds,
    });
    const labels = {
      completed: call.mode === "video" ? "Видеозвонок завершён" : "Аудиозвонок завершён",
      rejected: "Звонок отклонён",
      not_answered: "Нет ответа",
    } as const;
    const message = await this.repositories.messages.create({
      conversationId,
      senderId: call.initiatorId,
      text: labels[status],
      kind: "system",
      systemEvent: "call",
      call: {
        callId,
        callerId: call.initiatorId,
        mode: call.mode,
        outcome:
          status === "completed" ? "completed" : status === "rejected" ? "declined" : "unanswered",
        startedAt: call.startedAt,
        endedAt,
        durationSeconds,
      },
    });
    return {
      call: updated,
      message: await this.toMessageView(message, currentUserId),
      memberIds: conversation.memberIds,
    };
  }

  async conversationIdsForUser(userId: string): Promise<string[]> {
    const conversations = await this.repositories.conversations.listForUser(userId);
    return conversations.map((conversation) => conversation.id);
  }

  /** Публичный просмотр беседы: нужен сервису групп, чтобы разослать обновление. */
  async viewConversation(currentUserId: string, conversationId: string): Promise<ConversationView> {
    const conversation = await this.getAuthorizedConversation(currentUserId, conversationId);
    return this.toConversationView(conversation, currentUserId);
  }

  /**
   * Служебное сообщение группы («Алиса добавила Боба»). Пишется от имени того,
   * кто совершил действие, чтобы в истории было видно, кто именно.
   */
  async createGroupEventMessage(
    conversationId: string,
    actorId: string,
    text: string,
    systemEvent: "user_joined" | "user_left",
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    const conversation = await this.getAuthorizedConversation(actorId, conversationId);
    const message = await this.repositories.messages.create({
      conversationId,
      senderId: actorId,
      text,
      kind: "system",
      systemEvent,
    });
    return {
      message: await this.toMessageView(message),
      memberIds: conversation.memberIds,
    };
  }

  async memberIdsForConversation(userId: string, conversationId: string): Promise<string[]> {
    const conversation = await this.getAuthorizedConversation(userId, conversationId);
    await this.assertConversationInteractionAllowed(userId, conversation);
    return conversation.memberIds;
  }

  async publicUser(userId: string, viewerId?: string | null): Promise<PublicUser> {
    return toPublicUserFor(await this.getUser(userId), viewerId);
  }

  async markUserSeen(userId: string, timestamp = new Date().toISOString()): Promise<PublicUser> {
    return toPublicUser(await this.repositories.users.updateLastSeen(userId, timestamp));
  }

  async canAccessAttachment(userId: string, attachment: Attachment): Promise<boolean> {
    if (attachment.ownerId === userId || attachment.kind === "avatar") return true;
    const messages = await this.repositories.messages.findByAttachmentId(attachment.id);
    for (const message of messages) {
      const conversation = await this.repositories.conversations.findById(message.conversationId);
      if (conversation?.memberIds.includes(userId)) return true;
    }
    return false;
  }

  /** Shared validation for drafts and scheduled messages: only own, non-avatar files. */
  async assertAttachableFiles(userId: string, attachmentIds: string[]): Promise<void> {
    await this.assertOwnedMessageAttachments(userId, attachmentIds);
  }

  /** Shared validation for drafts and scheduled messages: membership plus blocking. */
  async assertConversationUsable(userId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.getAuthorizedConversation(userId, conversationId);
    await this.assertConversationInteractionAllowed(userId, conversation);
    return conversation;
  }

  private async assertOwnedMessageAttachments(userId: string, attachmentIds: string[]): Promise<void> {
    if (attachmentIds.length === 0) return;
    const attachments = await this.repositories.attachments.findManyByIds(attachmentIds);
    if (attachments.length !== attachmentIds.length) {
      throw new AppError(400, "ATTACHMENT_NOT_FOUND", "One or more attachments do not exist");
    }
    if (attachments.some((attachment) => attachment.ownerId !== userId)) {
      throw new AppError(403, "ATTACHMENT_FORBIDDEN", "Only your own uploads may be attached");
    }
    if (attachments.some((attachment) => attachment.kind === "avatar")) {
      throw new AppError(400, "ATTACHMENT_KIND_INVALID", "An avatar cannot be sent as a message file");
    }
  }

  private async assertConversationInteractionAllowed(
    currentUserId: string,
    conversation: Conversation,
  ): Promise<void> {
    // В группе личные блокировки не закрывают общий чат: там решают права группы.
    if (conversation.type === "group") return;
    const otherId = conversation.memberIds.find((id) => id !== currentUserId);
    if (!otherId) return;
    await this.assertNotBlockedByMe(currentUserId, otherId);
    // Удалённый аккаунт историю не обнуляет, но новых сообщений не принимает:
    // клиент вместо поля ввода показывает заглушку, а сервер дублирует запрет.
    await this.assertAccountAlive(otherId, "Аккаунт собеседника удалён. Отправка недоступна.");
  }

  /** Звонок запрещён в обе стороны: звонить заблокировавшему нельзя. */
  private async assertConversationCallable(
    currentUserId: string,
    conversation: Conversation,
  ): Promise<void> {
    const otherId = conversation.memberIds.find((id) => id !== currentUserId);
    if (otherId) await this.assertUsersCanInteract(currentUserId, otherId);
  }

  private async assertUsersCanInteract(firstUserId: string, secondUserId: string): Promise<void> {
    const [first, second] = await Promise.all([
      this.repositories.users.findById(firstUserId),
      this.repositories.users.findById(secondUserId),
    ]);
    if (!first || !second) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    if (
      first.blockedUserIds.includes(secondUserId) ||
      second.blockedUserIds.includes(firstUserId)
    ) {
      throw new AppError(403, "USER_BLOCKED", "Communication with this user is blocked");
    }
    // Удалённый аккаунт нельзя ни открыть заново, ни вызвать.
    await this.assertAccountAlive(firstUserId, "Аккаунт собеседника удалён.");
    await this.assertAccountAlive(secondUserId, "Аккаунт собеседника удалён. Звонок и переписка недоступны.");
  }

  /** Права группы: писать, отправлять медиа и ссылки — три независимых запрета. */
  private async assertGroupSendingAllowed(
    currentUserId: string,
    conversation: Conversation,
    text: string,
    attachmentIds: string[],
  ): Promise<void> {
    if (conversation.type !== "group") return;
    if (!groupCan(conversation, currentUserId, "send_messages")) {
      throw new AppError(403, "GROUP_SENDING_DENIED", "В этой группе вам запрещено писать");
    }
    if (attachmentIds.length > 0 && !groupCan(conversation, currentUserId, "send_media")) {
      throw new AppError(403, "GROUP_MEDIA_DENIED", "В этой группе запрещено отправлять медиа");
    }
    if (LINK_PATTERN.test(text) && !groupCan(conversation, currentUserId, "send_links")) {
      throw new AppError(403, "GROUP_LINKS_DENIED", "В этой группе запрещено отправлять ссылки");
    }
  }

  /** Удалённый аккаунт остаётся в базе, но общение с ним закрыто. */
  private async assertAccountAlive(userId: string, message: string): Promise<void> {
    const user = await this.repositories.users.findById(userId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    if (user.isDeleted) throw new AppError(403, "ACCOUNT_DELETED", message);
  }

  /**
   * Блокирующий не может общаться, пока не снимет блокировку. Обратное направление
   * здесь не запрещаем: как в Telegram, заблокированный писать может — сообщение
   * сохраняется у него, но блокирующему не доставляется (см. membersBlocking).
   */
  private async assertNotBlockedByMe(currentUserId: string, otherUserId: string): Promise<void> {
    const me = await this.repositories.users.findById(currentUserId);
    if (!me) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    if (me.blockedUserIds.includes(otherUserId)) {
      throw new AppError(403, "USER_BLOCKED", "You blocked this user");
    }
  }

  /** Участники, которым не доставляем сообщения автора: те, кто его заблокировал. */
  async membersBlocking(authorId: string, memberIds: string[]): Promise<string[]> {
    const users = await this.repositories.users.findManyByIds(memberIds);
    return users.filter((user) => user.blockedUserIds.includes(authorId)).map((user) => user.id);
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.repositories.users.findById(userId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User was not found");
    return user;
  }

  private async getAuthorizedConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.repositories.conversations.findById(conversationId);
    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation was not found");
    }
    if (!conversation.memberIds.includes(userId)) {
      throw new AppError(403, "CONVERSATION_FORBIDDEN", "You are not a member of this conversation");
    }
    return conversation;
  }

  private async getConversationMessage(conversationId: string, messageId: string): Promise<Message> {
    const message = await this.repositories.messages.findById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new AppError(404, "MESSAGE_NOT_FOUND", "Message was not found in this conversation");
    }
    return message;
  }

  private async getConversationCall(conversationId: string, callId: string): Promise<CallRecord> {
    const call = await this.repositories.calls.findById(callId);
    if (!call || call.conversationId !== conversationId) {
      throw new AppError(404, "CALL_NOT_FOUND", "Call was not found in this conversation");
    }
    return call;
  }

  private async toConversationView(
    conversation: Conversation,
    currentUserId: string,
    unreadCount = 0,
  ): Promise<ConversationView> {
    const users = await this.repositories.users.findManyByIds(conversation.memberIds);
    // Удалённый аккаунт не должен ронять диалог — подставляем заглушку.
    const usersById = new Map(users.map((user) => [user.id, user]));
    const currentUser = usersById.get(currentUserId);
    const otherUser = users.find((user) => user.id !== currentUserId);
    const blockedByMe = Boolean(currentUser && otherUser && currentUser.blockedUserIds.includes(otherUser.id));
    const blockedByPeer = Boolean(currentUser && otherUser && otherUser.blockedUserIds.includes(currentUserId));
    const hiddenAuthors = currentUser?.blockedUserIds ?? [];
    const members = conversation.memberIds.map((id) =>
      ensurePublicUser(usersById.get(id), id, currentUserId),
    );
    const storedLast = conversation.lastMessageId
      ? await this.repositories.messages.findById(conversation.lastMessageId)
      : null;
    const lastMessage = storedLast && !hiddenAuthors.includes(storedLast.senderId) ? storedLast : null;
    const pinned = await this.repositories.messages.listByIds(conversation.pinnedMessageIds);
    const pinnedMessages = await this.toMessageViews(
      pinned.filter((message) => message.conversationId === conversation.id),
      currentUserId,
    );

    const isGroup = conversation.type === "group";
    return {
      id: conversation.id,
      type: conversation.type,
      memberIds: conversation.memberIds,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      members,
      lastMessage: lastMessage ? await this.toMessageView(lastMessage, currentUserId) : null,
      pinnedMessage: pinnedMessages.at(-1) ?? null,
      pinnedMessages,
      archived: conversation.archivedBy.includes(currentUserId),
      mutedUntil: conversation.mutedUntilBy[currentUserId] ?? null,
      unreadCount,
      blocked: blockedByMe || blockedByPeer,
      blockedByMe,
      blockedByPeer,
      ...(isGroup
        ? {
            // Название, аватар и описание группы: у личного диалога их нет.
            title: conversation.title ?? "",
            description: conversation.description ?? "",
            avatarUrl: conversation.avatarUrl ?? null,
            // Пустая строка — «владельца нет»: поле обязательное в записи группы.
            ownerId: conversation.ownerId ?? "",
            adminIds: conversation.adminIds ?? [],
            adminPermissions: conversation.adminPermissions ?? {},
            adminDefaults: conversation.adminDefaults ?? {},
            inviteCode: conversation.inviteCode ?? "",
            // Права участников и личные ограничения: клиент рисует по ним галочки.
            permissions: conversation.permissions ?? {},
            restrictions: conversation.restrictions ?? {},
            mutedMembers: conversation.mutedMembers ?? {},
            // Теги участников: клиент рисует их рядом с именем и красит по роли.
            memberTags: conversation.memberTags ?? {},
            history: conversation.history ?? [],
            role: groupRoleFor(conversation, currentUserId),
            myPermissions: effectiveGroupPermissions(conversation, currentUserId),
            memberCount: conversation.memberIds.length,
          }
        : {}),
    };
  }

  private async toPinsResult(
    conversation: Conversation,
    currentUserId: string,
  ): Promise<PinsResult> {
    const pinned = await this.repositories.messages.listByIds(conversation.pinnedMessageIds);
    const pinnedMessages = await this.toMessageViews(
      pinned.filter((message) => message.conversationId === conversation.id),
      currentUserId,
    );
    return {
      conversationId: conversation.id,
      message: pinnedMessages.at(-1) ?? null,
      pinnedMessages,
      memberIds: conversation.memberIds,
    };
  }

  private async toMessageViews(messages: Message[], currentUserId?: string): Promise<MessageView[]> {
    return Promise.all(messages.map((message) => this.toMessageView(message, currentUserId)));
  }

  private async toMessageSnapshot(
    message: Message,
    currentUserId?: string,
  ): Promise<MessageSnapshot> {
    const [sender, attachments, currentUser] = await Promise.all([
      this.repositories.users.findById(message.senderId),
      this.repositories.attachments.findManyByIds(message.attachmentIds),
      currentUserId ? this.repositories.users.findById(currentUserId) : Promise.resolve(null),
    ]);
    // Удалённый отправитель не должен ронять переписку: подставляем заглушку.
    if (!sender) return this.placeholderSnapshot(message, attachments, currentUserId);
    const { attachmentIds: _attachmentIds, reactions, poll, ...safeMessage } = message;
    const groupedReactions = new Map<ReactionEmoji, string[]>();
    for (const reaction of reactions) {
      const users = groupedReactions.get(reaction.emoji) ?? [];
      users.push(reaction.userId);
      groupedReactions.set(reaction.emoji, users);
    }
    return {
      ...safeMessage,
      // Удалённый и замороженный аккаунты остаются в базе, но наружу всё равно
      // выглядят заглушкой — поэтому toPublicUserFor, а не toPublicUser.
      sender: toPublicUserFor(sender, currentUserId),
      attachments: attachments.map((attachment) => toAttachmentView(attachment, currentUserId)),
      reactions: [...groupedReactions].map(([emoji, userIds]) => ({
        emoji,
        userIds,
        count: userIds.length,
      })),
      ...(poll ? { poll: viewPoll(poll, currentUserId) } : {}),
      ...(currentUser
        ? { isFavorite: currentUser.favoriteMessageIds.includes(message.id) }
        : {}),
    };
  }

  private async toMessageView(message: Message, currentUserId?: string): Promise<MessageView> {
    const [reply, forwarded] = await Promise.all([
      message.replyToId ? this.repositories.messages.findById(message.replyToId) : null,
      message.forwardedFromId
        ? this.repositories.messages.findById(message.forwardedFromId)
        : null,
    ]);
    return {
      ...(await this.toMessageSnapshot(message, currentUserId)),
      replyTo:
        reply && reply.conversationId === message.conversationId
          ? await this.toMessageSnapshot(reply, currentUserId)
          : null,
      forwardedFrom: forwarded ? await this.toMessageSnapshot(forwarded, currentUserId) : null,
    };
  }

  /**
   * Снимок сообщения для автора, которого уже нет в базе. Чтобы переписка не
   * падала, подставляем заглушку «Удалённый аккаунт» вместо настоящего профиля.
   */
  private async placeholderSnapshot(
    message: Message,
    attachments: Attachment[],
    currentUserId: string | undefined,
  ): Promise<MessageSnapshot> {
    const { attachmentIds: _attachmentIds, reactions, poll, ...safeMessage } = message;
    return {
      ...safeMessage,
      sender: removedUserPlaceholder(message.senderId),
      attachments: attachments.map((attachment) => toAttachmentView(attachment, currentUserId)),
      reactions: [],
      ...(currentUserId
        ? {
            isFavorite: Boolean(
              (await this.repositories.users.findById(currentUserId))?.favoriteMessageIds.includes(message.id),
            ),
          }
        : {}),
    };
  }
}

/** Профиль не обязан перебирать всю историю: достаточно последних сообщений. */
const MEDIA_SCAN_PAGE_SIZE = 200;
const MEDIA_SCAN_PAGES = 25;
const LINK_PATTERN = /https?:\/\/\S+/i;

function countMedia(summary: MediaSummary, attachment: Attachment): void {
  if (attachment.kind === "image") {
    if (attachment.mimeType === "image/gif") summary.gifs += 1;
    else summary.photos += 1;
    return;
  }
  // Кружочки и голосовые — отдельные разделы, как в Telegram.
  if (attachment.mediaKind === "voice") {
    summary.voice += 1;
    return;
  }
  if (attachment.mediaKind === "video_circle") {
    summary.videoCircles += 1;
    return;
  }
  if (attachment.mimeType.startsWith("video/")) {
    summary.videos += 1;
    return;
  }
  if (attachment.mimeType.startsWith("audio/")) {
    summary.audio += 1;
    return;
  }
  summary.files += 1;
}
