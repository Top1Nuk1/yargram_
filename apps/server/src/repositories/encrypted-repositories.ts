import type { ConversationDraft, Message, ScheduledMessage } from "../domain/models.js";
import type { AtRestCrypto } from "../lib/crypto.js";
import type {
  DraftRepository,
  MessageRepository,
  Repositories,
  ScheduledMessageRepository,
} from "./types.js";

/**
 * Шифрование «в покое» поверх любого драйвера хранилища.
 *
 * Обёртка ничего не знает про JSON или PostgreSQL: она шифрует текст на записи
 * и расшифровывает на чтении, поэтому оба драйвера ведут себя одинаково, а
 * весь остальной код сервера работает с обычным открытым текстом.
 *
 * Поиск по сообщениям — единственное место, где это заметно: хранилище больше
 * не может искать по шифротексту, поэтому обёртка сама вычитывает историю
 * страницами и отбирает совпадения уже после расшифровки.
 */

/** Сколько страниц истории максимум просматривает поиск, чтобы не уйти в бесконечность. */
const SEARCH_PAGE_LIMIT = 50;

export function withEncryption(repositories: Repositories, crypto: AtRestCrypto): Repositories {
  return {
    ...repositories,
    messages: encryptedMessages(repositories.messages, crypto),
    scheduledMessages: encryptedScheduledMessages(repositories.scheduledMessages, crypto),
    drafts: encryptedDrafts(repositories.drafts, crypto),
  };
}

function encryptedMessages(messages: MessageRepository, crypto: AtRestCrypto): MessageRepository {
  const toPlain = (message: Message): Message => ({ ...message, text: crypto.decryptText(message.text) });

  return {
    create: async (input) => toPlain(await messages.create({ ...input, text: crypto.encryptText(input.text) })),
    async listForConversation(conversationId, options) {
      const needle = options.query?.trim().toLocaleLowerCase("ru-RU") ?? "";
      if (!needle) {
        const page = await messages.listForConversation(conversationId, {
          limit: options.limit,
          ...(options.before === undefined ? {} : { before: options.before }),
        });
        return page.map(toPlain);
      }
      return searchInConversation(messages, crypto, conversationId, options, needle);
    },
    listByIds: async (ids) => (await messages.listByIds(ids)).map(toPlain),
    findById: async (id) => {
      const message = await messages.findById(id);
      return message ? toPlain(message) : null;
    },
    findByAttachmentId: async (attachmentId) => (await messages.findByAttachmentId(attachmentId)).map(toPlain),
    updateText: async (id, text) => toPlain(await messages.updateText(id, crypto.encryptText(text))),
    setReaction: async (id, userId, emoji) => toPlain(await messages.setReaction(id, userId, emoji)),
    deleteFromConversation: async (conversationId, id) =>
      toPlain(await messages.deleteFromConversation(conversationId, id)),
    async markRead(conversationId, userId) {
      const result = await messages.markRead(conversationId, userId);
      return { messages: result.messages.map(toPlain), messageIds: result.messageIds };
    },
  };
}

async function searchInConversation(
  messages: MessageRepository,
  crypto: AtRestCrypto,
  conversationId: string,
  options: { limit: number; before?: string },
  needle: string,
): Promise<Message[]> {
  const pageSize = Math.max(100, options.limit);
  const found: Message[] = [];
  let before = options.before;
  for (let page = 0; page < SEARCH_PAGE_LIMIT && found.length < options.limit; page += 1) {
    const batch = await messages.listForConversation(conversationId, {
      limit: pageSize,
      ...(before === undefined ? {} : { before }),
    });
    if (batch.length === 0) break;
    for (const message of batch) {
      const plain = { ...message, text: crypto.decryptText(message.text) };
      if (!plain.text.toLocaleLowerCase("ru-RU").includes(needle)) continue;
      found.push(plain);
      if (found.length >= options.limit) break;
    }
    if (found.length >= options.limit || batch.length < pageSize) break;
    // Идём backwards по истории: следующая страница — то, что старше самой старой записи.
    const cursor = batch[0]?.createdAt;
    if (!cursor || cursor === before) break;
    before = cursor;
  }
  return found.slice(0, options.limit);
}

function encryptedScheduledMessages(
  scheduled: ScheduledMessageRepository,
  crypto: AtRestCrypto,
): ScheduledMessageRepository {
  const toPlain = (item: ScheduledMessage): ScheduledMessage => ({ ...item, text: crypto.decryptText(item.text) });

  return {
    listForUser: async (userId) => (await scheduled.listForUser(userId)).map(toPlain),
    findById: async (id) => {
      const item = await scheduled.findById(id);
      return item ? toPlain(item) : null;
    },
    create: async (input) => toPlain(await scheduled.create({ ...input, text: crypto.encryptText(input.text) })),
    async update(id, userId, input) {
      const updated = await scheduled.update(id, userId, {
        ...input,
        ...(input.text === undefined ? {} : { text: crypto.encryptText(input.text) }),
      });
      return toPlain(updated);
    },
    cancel: async (id, userId) => toPlain(await scheduled.cancel(id, userId)),
    claimDue: async (id) => {
      const item = await scheduled.claimDue(id);
      return item ? toPlain(item) : null;
    },
    listDue: async (nowIso, limit) => (await scheduled.listDue(nowIso, limit)).map(toPlain),
    markSent: async (id, messageId, sentAt) => toPlain(await scheduled.markSent(id, messageId, sentAt)),
    markFailed: async (id, reason) => toPlain(await scheduled.markFailed(id, reason)),
  };
}

function encryptedDrafts(drafts: DraftRepository, crypto: AtRestCrypto): DraftRepository {
  const toPlain = (draft: ConversationDraft): ConversationDraft => ({ ...draft, text: crypto.decryptText(draft.text) });

  return {
    listForUser: async (userId) => (await drafts.listForUser(userId)).map(toPlain),
    find: async (userId, conversationId) => {
      const draft = await drafts.find(userId, conversationId);
      return draft ? toPlain(draft) : null;
    },
    save: async (input) => toPlain(await drafts.save({ ...input, text: crypto.encryptText(input.text) })),
    delete: (userId, conversationId) => drafts.delete(userId, conversationId),
  };
}
