import type { BotKeyboard, Conversation, PublicUser, User } from "../domain/models.js";
import { toPublicUser } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { Repositories } from "../repositories/types.js";
import type { ChatService, ConversationView, MessageView } from "./chat-service.js";
import {
  SUPPORT_ACTION,
  SUPPORT_BOT_USERNAME,
  SUPPORT_ERROR_TOPICS,
  SUPPORT_INBOX_TITLE,
  supportCancelKeyboard,
  supportErrorKeyboard,
  supportMenuKeyboard,
  supportSectionLabel,
  supportTexts,
} from "./support-bot-texts.js";

/** Человек уже выбрал раздел кнопкой и сейчас напишет описание. */
type PendingTicket = { category: string; topic?: string | undefined };

/**
 * Бот поддержки Yargram.
 *
 * Как это работает. У бота есть служебный аккаунт (`isBot`), в личной переписке
 * с которым он показывает меню кнопками. Выбор кнопки уходит не сообщением, а
 * отдельным действием, поэтому в истории не остаётся «нажатий». Собрав описание,
 * бот пересылает обращение в **служебную группу** с владельцами; ответ владельца
 * на сообщение бота возвращается человеку с именем того, кто ответил.
 *
 * Бот не пишет первым и не рассылает ничего: он реагирует либо на нажатие
 * кнопки, либо на сообщение в своей переписке, либо на ответ владельца в
 * служебной группе.
 */
export class SupportBotService {
  /** Кто чего ждёт: раздел выбирается кнопкой, а описание человек пишет сам. */
  private readonly pending = new Map<string, PendingTicket>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly repositories: Repositories,
    private readonly chatService: ChatService,
    private readonly events: RealtimeEvents,
  ) {}

  /**
   * Подписка на поток сообщений. Один обработчик на всё: сообщения в переписке
   * с ботом (обращение) и сообщения в служебной группе (ответ владельца).
   * Подписка не мешает остальным слушателям — их у событий может быть много.
   */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.events.onNewMessage((event) => {
      void this.onMessage(event.message).catch((error) => {
        console.error("Бот поддержки не смог обработать сообщение", error);
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Служебный аккаунт бота. `null` — бота ещё не завели скриптом. */
  async botUser(): Promise<User | null> {
    return this.repositories.users.findByUsername(SUPPORT_BOT_USERNAME);
  }

  /**
   * Открыть переписку с поддержкой: создаёт её при первом обращении и один раз
   * показывает приветствие с меню. Возвращает готовый вид беседы, чтобы клиент
   * сразу её открыл.
   */
  async openFor(
    userId: string,
  ): Promise<{ conversation: ConversationView; bot: PublicUser; created: boolean }> {
    const bot = await this.requireBot();
    if (userId === bot.id) {
      throw new AppError(400, "SUPPORT_SELF", "Бот не может написать сам себе");
    }
    const result = await this.repositories.conversations.findOrCreateDirect(bot.id, userId);
    const history = await this.repositories.messages.listForConversation(result.conversation.id, {
      limit: 1,
    });
    if (history.length === 0) {
      await this.send(bot, result.conversation.id, supportTexts.welcome, supportMenuKeyboard());
    }
    return {
      conversation: await this.chatService.viewConversation(userId, result.conversation.id),
      bot: toPublicUser(bot),
      created: result.created,
    };
  }

  /**
   * Нажатие кнопки бота. Действие приходит кодом, а не текстом: так в истории
   * не остаётся служебных «нажатий», и заодно нельзя прислать что-то лишнее.
   */
  async handleAction(userId: string, conversationId: string, action: string): Promise<void> {
    const bot = await this.requireBot();
    const conversation = await this.getBotConversation(userId, conversationId, bot);
    switch (action) {
      case SUPPORT_ACTION.menu:
        this.pending.delete(userId);
        await this.send(bot, conversation.id, supportTexts.menu, supportMenuKeyboard());
        return;
      case SUPPORT_ACTION.error:
        this.pending.delete(userId);
        await this.send(bot, conversation.id, supportTexts.errorPrompt, supportErrorKeyboard());
        return;
      case SUPPORT_ACTION.idea:
        this.pending.set(userId, { category: "idea" });
        await this.send(bot, conversation.id, supportTexts.ideaPrompt, supportCancelKeyboard());
        return;
      case SUPPORT_ACTION.other:
        this.pending.set(userId, { category: "other" });
        await this.send(bot, conversation.id, supportTexts.otherPrompt, supportCancelKeyboard());
        return;
      case SUPPORT_ACTION.cancel:
        this.pending.delete(userId);
        await this.send(bot, conversation.id, supportTexts.cancelled, supportMenuKeyboard());
        return;
      default: {
        const topic = SUPPORT_ERROR_TOPICS[action];
        if (topic === undefined) {
          throw new AppError(400, "SUPPORT_ACTION_UNKNOWN", "Неизвестное действие бота");
        }
        this.pending.set(userId, { category: "error", topic });
        await this.send(bot, conversation.id, supportTexts.describePrompt, supportCancelKeyboard());
      }
    }
  }

  /** Обработчик потока сообщений: обращение в переписке с ботом или ответ владельца. */
  private async onMessage(message: MessageView): Promise<void> {
    const bot = await this.botUser();
    // Свои же сообщения бота не обрабатываем — иначе он отвечал бы сам себе.
    if (!bot || message.senderId === bot.id) return;
    const conversation = await this.repositories.conversations.findById(message.conversationId);
    if (!conversation) return;
    // Служебная группа: здесь владельцы отвечают на обращения.
    if (conversation.isSupportInbox) {
      await this.relayOwnerReply(bot, message);
      return;
    }
    // Личная переписка с ботом: человек описывает, что случилось.
    if (conversation.type === "direct" && conversation.memberIds.includes(bot.id)) {
      await this.handleUserText(bot, conversation, message);
    }
  }

  /** Человек написал боту: превращаем это в обращение для владельцев. */
  private async handleUserText(
    bot: User,
    conversation: Conversation,
    message: MessageView,
  ): Promise<void> {
    const userId = message.senderId;
    const pending = this.pending.get(userId);
    this.pending.delete(userId);
    // Текст без описания (одно вложение) тоже обращение: пустую строку владельцам
    // показывать нечего, поэтому ставим прочерк вместо неё.
    const details = message.text.trim() || "—";
    await this.fileTicket({
      bot,
      conversationId: conversation.id,
      userId,
      category: pending?.category ?? "other",
      ...(pending?.topic === undefined ? {} : { topic: pending.topic }),
      details,
    });
  }

  /** Обращение уходит в служебную группу, а человек получает подтверждение. */
  private async fileTicket(input: {
    bot: User;
    conversationId: string;
    userId: string;
    category: string;
    topic?: string | undefined;
    details: string;
  }): Promise<void> {
    const inbox = await this.ensureInbox(input.bot);
    const author = await this.repositories.users.findById(input.userId);
    await this.chatService.sendBotMessage({
      conversationId: inbox.id,
      senderId: input.bot.id,
      text: supportTexts.ticket({
        displayName: author?.displayName ?? "Неизвестный",
        username: author?.username ?? null,
        section: supportSectionLabel(input.category, input.topic),
        details: input.details,
      }),
      // Привязка к человеку: по ней находится адресат, когда владелец ответит.
      supportTicket: {
        userId: input.userId,
        category: input.category,
        ...(input.topic === undefined ? {} : { topic: input.topic }),
      },
    }).then((result) => this.events.publishNewMessage(result));
    await this.send(input.bot, input.conversationId, supportTexts.accepted, supportMenuKeyboard());
  }

  /** Владелец ответил на сообщение бота — доставляем ответ человеку. */
  private async relayOwnerReply(bot: User, message: MessageView): Promise<void> {
    const ticket = message.replyTo?.supportTicket;
    if (!ticket) return;
    const text = message.text.trim();
    if (!text) return;
    const [owner, target] = await Promise.all([
      this.repositories.users.findById(message.senderId),
      this.repositories.users.findById(ticket.userId),
    ]);
    if (!owner || !target) return;
    const direct = await this.repositories.conversations.findOrCreateDirect(bot.id, target.id);
    await this.send(
      bot,
      direct.conversation.id,
      supportTexts.ownerReply(owner.displayName, text),
      supportMenuKeyboard(),
    );
  }

  /**
   * Служебная группа: владелец — бот, участники — владельцы Yargram. Отдельная
   * метка `isSupportInbox` держит её вне поиска и приглашений, поэтому обычный
   * человек её не найдёт и не увидит.
   */
  private async ensureInbox(bot: User): Promise<Conversation> {
    const existing = await this.repositories.conversations.findSupportInbox();
    if (existing) return existing;
    const owners = (await this.repositories.users.listAll()).filter(
      (user) => user.isOwner === true && !user.isDeleted && !user.isFrozen,
    );
    return this.repositories.conversations.createGroup({
      ownerId: bot.id,
      title: SUPPORT_INBOX_TITLE,
      description:
        "Служебная группа поддержки. Сюда бот пересылает обращения, а ответ на сообщение бота уходит человеку от вашего имени.",
      memberIds: owners.map((owner) => owner.id),
      isSupportInbox: true,
    });
  }

  private async send(
    bot: User,
    conversationId: string,
    text: string,
    keyboard?: BotKeyboard,
  ): Promise<void> {
    const result = await this.chatService.sendBotMessage({
      conversationId,
      senderId: bot.id,
      text,
      ...(keyboard === undefined ? {} : { keyboard }),
    });
    this.events.publishNewMessage(result);
  }

  /** Переписка с ботом глазами человека: чужая беседа действием не станет. */
  private async getBotConversation(
    userId: string,
    conversationId: string,
    bot: User,
  ): Promise<Conversation> {
    const conversation = await this.repositories.conversations.findById(conversationId);
    if (
      !conversation ||
      conversation.type !== "direct" ||
      !conversation.memberIds.includes(bot.id) ||
      !conversation.memberIds.includes(userId)
    ) {
      throw new AppError(403, "SUPPORT_CONVERSATION_INVALID", "Это не переписка с ботом поддержки");
    }
    return conversation;
  }

  private async requireBot(): Promise<User> {
    const bot = await this.botUser();
    if (!bot) {
      throw new AppError(503, "SUPPORT_BOT_MISSING", "Бот поддержки не настроен");
    }
    return bot;
  }
}
