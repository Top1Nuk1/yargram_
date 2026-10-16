import { randomUUID } from "node:crypto";
import { toPublicUser } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import { SUPPORT_ACTION, SUPPORT_BOT_USERNAME, SUPPORT_ERROR_TOPICS, SUPPORT_INBOX_TITLE, isSupportCancelCommand, isSupportCommand, isSupportHelpCommand, isSupportStartCommand, parseAskAction, supportCancelKeyboard, supportErrorKeyboard, supportLanguageOf, supportMenuKeyboard, supportReplyKeyboard, supportSectionLabel, supportTexts, } from "./support-bot-texts.js";
/**
 * Бот поддержки Yargram.
 *
 * Как это работает. У бота есть служебный аккаунт (`isBot`), в личной переписке
 * с которым он показывает меню кнопками. Выбор кнопки уходит не сообщением, а
 * отдельным действием, поэтому в истории не остаётся «нажатий». Собрав описание,
 * бот пересылает обращение в **служебную группу** с владельцами; ответ владельца
 * на сообщение бота возвращается человеку с именем того, кто ответил.
 *
 * 🔥 Бот не пишет первым. Пустая переписка — это пустая переписка: клиент
 * показывает в ней кнопку «СТАРТ», человек нажимает её, уходит `/start`, и
 * только тогда появляется приветствие с меню.
 *
 * 🔥 Бот говорит на языке человека (`User.language`) — на том же, на котором у
 * него кнопки интерфейса. Ответ владельца тоже уходит на языке человека, а не
 * владельца: читает его человек.
 *
 * 🔥 Подсказка бота — не переписка, а один живой экран. Каждая следующая
 * подсказка **удаляет** предыдущую: иначе на каждый нажатый пункт в истории
 * копилось бы по сообщению, и через десяток нажатий переписка читалась бы
 * сверху вниз как протокол. Удаляем только то, что бот сам прислал как
 * подсказку: ответ владельца и подтверждение обращения остаются на месте.
 */
export class SupportBotService {
    repositories;
    chatService;
    events;
    /** Кто чего ждёт: раздел выбирается кнопкой, а описание человек пишет сам. */
    pending = new Map();
    /**
     * Подсказка, которую бот прислал последней: беседа → id сообщения. Её и
     * удаляем, когда приходит время показать следующую. Карта живёт до
     * перезапуска сервера: после него удалять будет нечего, и подсказка просто
     * останется в истории — потеря мелкая, а лишней сложности не заводим.
     */
    prompts = new Map();
    unsubscribe = null;
    constructor(repositories, chatService, events) {
        this.repositories = repositories;
        this.chatService = chatService;
        this.events = events;
    }
    /**
     * Подписка на поток сообщений. Один обработчик на всё: сообщения в переписке
     * с ботом (обращение) и сообщения в служебной группе (ответ владельца).
     * Подписка не мешает остальным слушателям — их у событий может быть много.
     */
    start() {
        if (this.unsubscribe)
            return;
        this.unsubscribe = this.events.onNewMessage((event) => {
            void this.onMessage(event.message).catch((error) => {
                console.error("Бот поддержки не смог обработать сообщение", error);
            });
        });
    }
    stop() {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
    /** Служебный аккаунт бота. `null` — бота ещё не завели скриптом. */
    async botUser() {
        return this.repositories.users.findByUsername(SUPPORT_BOT_USERNAME);
    }
    /**
     * Открыть переписку с поддержкой: заводит её при первом обращении и отдаёт
     * готовый вид беседы, чтобы клиент сразу её открыл.
     *
     * 🔥 Ничего не отправляет. Раньше бот здоровался здесь же, и переписка
     * начиналась с сообщения, которого человек не просил; теперь первым шагом
     * идёт кнопка «СТАРТ» в клиенте, а за ней — `/start` от человека.
     */
    async openFor(userId) {
        const bot = await this.requireBot();
        if (userId === bot.id) {
            throw new AppError(400, "SUPPORT_SELF", "Бот не может написать сам себе");
        }
        const result = await this.repositories.conversations.findOrCreateDirect(bot.id, userId);
        return {
            conversation: await this.chatService.viewConversation(userId, result.conversation.id),
            bot: toPublicUser(bot),
            created: result.created,
        };
    }
    /**
     * Нажатие кнопки бота. Действие приходит кодом, а не текстом: так в истории
     * не остаётся служебных «нажатий», и заодно нельзя прислать что-то лишнее.
     *
     * Каждый шаг заменяет прошлую подсказку — см. `replacePrompt`.
     */
    async handleAction(userId, conversationId, action) {
        const bot = await this.requireBot();
        const conversation = await this.getBotConversation(userId, conversationId, bot);
        const language = await this.languageOf(userId);
        const texts = supportTexts(language);
        // «Спросить ещё»: номер и раздел обращения приехали в самой кнопке, поэтому
        // состояние не нужно — старая кнопка в истории работает и после перезапуска.
        const ask = parseAskAction(action);
        if (ask) {
            this.pending.set(userId, {
                category: ask.category,
                ...(ask.topic === undefined ? {} : { topic: ask.topic }),
                code: ask.code,
            });
            await this.replacePrompt(bot, conversation.id, texts.askPrompt(ask.code), supportCancelKeyboard(language));
            return;
        }
        switch (action) {
            case SUPPORT_ACTION.menu:
                this.pending.delete(userId);
                await this.replacePrompt(bot, conversation.id, texts.menu, supportMenuKeyboard(language));
                return;
            case SUPPORT_ACTION.error:
                this.pending.delete(userId);
                await this.replacePrompt(bot, conversation.id, texts.errorPrompt, supportErrorKeyboard(language));
                return;
            case SUPPORT_ACTION.idea:
                this.pending.set(userId, { category: "idea" });
                await this.replacePrompt(bot, conversation.id, texts.ideaPrompt, supportCancelKeyboard(language));
                return;
            case SUPPORT_ACTION.other:
                this.pending.set(userId, { category: "other" });
                await this.replacePrompt(bot, conversation.id, texts.otherPrompt, supportCancelKeyboard(language));
                return;
            case SUPPORT_ACTION.cancel:
                this.pending.delete(userId);
                await this.replacePrompt(bot, conversation.id, texts.cancelled, supportMenuKeyboard(language));
                return;
            default: {
                const topic = SUPPORT_ERROR_TOPICS[action];
                if (topic === undefined) {
                    throw new AppError(400, "SUPPORT_ACTION_UNKNOWN", "Неизвестное действие бота");
                }
                this.pending.set(userId, { category: "error", topic });
                await this.replacePrompt(bot, conversation.id, texts.describePrompt, supportCancelKeyboard(language));
            }
        }
    }
    /** Обработчик потока сообщений: обращение в переписке с ботом или ответ владельца. */
    async onMessage(message) {
        const bot = await this.botUser();
        // Свои же сообщения бота не обрабатываем — иначе он отвечал бы сам себе.
        if (!bot || message.senderId === bot.id)
            return;
        const conversation = await this.repositories.conversations.findById(message.conversationId);
        if (!conversation)
            return;
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
    /** Человек написал боту: команда показывает меню, остальное — обращение. */
    async handleUserText(bot, conversation, message) {
        const userId = message.senderId;
        const language = await this.languageOf(userId);
        const texts = supportTexts(language);
        // Команды проверяем раньше всего: «/start» посреди описания — это просьба
        // начать заново, а не текст обращения, и владельцам он не нужен.
        if (isSupportStartCommand(message.text)) {
            this.pending.delete(userId);
            await this.replacePrompt(bot, conversation.id, texts.welcome, supportMenuKeyboard(language));
            return;
        }
        if (isSupportCancelCommand(message.text)) {
            this.pending.delete(userId);
            await this.replacePrompt(bot, conversation.id, texts.cancelled, supportMenuKeyboard(language));
            return;
        }
        if (isSupportCommand(message.text)) {
            // Незнакомая команда — это просьба о помощи, а не обращение: «/frobnicate»
            // владельцам ничего не объяснит, а человеку нужен ответ.
            this.pending.delete(userId);
            await this.replacePrompt(bot, conversation.id, isSupportHelpCommand(message.text) ? texts.help : texts.unknownCommand, supportMenuKeyboard(language));
            return;
        }
        const pending = this.pending.get(userId);
        this.pending.delete(userId);
        const details = message.text.trim();
        // Приложенный файл без подписи — тоже обращение: снимок экрана часто и есть
        // весь рассказ. А вот пустое сообщение отправлять владельцам нечего.
        const attachmentIds = (message.attachments ?? []).map((attachment) => attachment.id);
        if (!details && attachmentIds.length === 0) {
            await this.replacePrompt(bot, conversation.id, texts.noText, supportCancelKeyboard(language));
            return;
        }
        await this.fileTicket({
            bot,
            conversationId: conversation.id,
            userId,
            category: pending?.category ?? "other",
            ...(pending?.topic === undefined ? {} : { topic: pending.topic }),
            details: details || texts.noDetails,
            attachmentIds,
            // Продолжение обращения сохраняет прежний номер, новое получает свой.
            code: pending?.code ?? newTicketCode(),
            followUp: pending?.code !== undefined,
            language,
        });
    }
    /** Обращение уходит в служебную группу, а человек получает подтверждение. */
    async fileTicket(input) {
        const texts = supportTexts(input.language);
        const inbox = await this.ensureInbox(input.bot);
        const author = await this.repositories.users.findById(input.userId);
        await this.chatService
            .sendBotMessage({
            conversationId: inbox.id,
            senderId: input.bot.id,
            text: texts.ticket({
                displayName: author?.displayName ?? "—",
                username: author?.username ?? null,
                section: supportSectionLabel(input.language, input.category, input.topic),
                code: input.code,
                details: input.details,
            }),
            // Снимок экрана едет вместе с обращением: подпись на файл собирается
            // заново на того, кто смотрит, поэтому владельцы увидят его как обычно.
            ...(input.attachmentIds.length === 0 ? {} : { attachmentIds: input.attachmentIds }),
            // Привязка к человеку: по ней находится адресат, когда владелец ответит.
            supportTicket: {
                userId: input.userId,
                category: input.category,
                ...(input.topic === undefined ? {} : { topic: input.topic }),
                code: input.code,
            },
        })
            .then((result) => this.events.publishNewMessage(result));
        // Подсказка «опишите подробнее» заменяется подтверждением: она своё отслужила.
        await this.replacePrompt(input.bot, input.conversationId, input.followUp ? texts.followUpAccepted(input.code) : texts.accepted(input.code), supportMenuKeyboard(input.language));
    }
    /** Владелец ответил на сообщение бота — доставляем ответ человеку. */
    async relayOwnerReply(bot, message) {
        const ticket = message.replyTo?.supportTicket;
        if (!ticket)
            return;
        const text = message.text.trim();
        if (!text)
            return;
        const [owner, target] = await Promise.all([
            this.repositories.users.findById(message.senderId),
            this.repositories.users.findById(ticket.userId),
        ]);
        if (!owner || !target)
            return;
        // Язык — человека, а не владельца: ответ читает он, и кнопки под ответом
        // тоже должны быть на его языке.
        const language = supportLanguageOf(target.language);
        const texts = supportTexts(language);
        // У обращений, отправленных до появления номеров, своего кода нет — выдаём.
        const code = ticket.code ?? newTicketCode();
        const direct = await this.repositories.conversations.findOrCreateDirect(bot.id, target.id);
        await this.send(bot, direct.conversation.id, texts.ownerReply(owner.displayName, code, text), supportReplyKeyboard(language, {
            code,
            category: ticket.category,
            ...(ticket.topic === undefined ? {} : { topic: ticket.topic }),
        }));
    }
    /**
     * Служебная группа: владелец — бот, участники — владельцы Yargram. Отдельная
     * метка `isSupportInbox` держит её вне поиска и приглашений, поэтому обычный
     * человек её не найдёт и не увидит.
     */
    async ensureInbox(bot) {
        const existing = await this.repositories.conversations.findSupportInbox();
        if (existing)
            return existing;
        const owners = (await this.repositories.users.listAll()).filter((user) => user.isOwner === true && !user.isDeleted && !user.isFrozen);
        return this.repositories.conversations.createGroup({
            ownerId: bot.id,
            title: SUPPORT_INBOX_TITLE,
            description: "Служебная группа поддержки. Сюда бот пересылает обращения, а ответ на сообщение бота уходит человеку от вашего имени.",
            memberIds: owners.map((owner) => owner.id),
            isSupportInbox: true,
        });
    }
    /** Язык человека: по нему бот и говорит. Аккаунта нет — русский. */
    async languageOf(userId) {
        const user = await this.repositories.users.findById(userId);
        return supportLanguageOf(user?.language);
    }
    /** Отправить сообщение от бота, ничего не удаляя. */
    async send(bot, conversationId, text, keyboard) {
        const result = await this.chatService.sendBotMessage({
            conversationId,
            senderId: bot.id,
            text,
            ...(keyboard === undefined ? {} : { keyboard }),
        });
        this.events.publishNewMessage(result);
    }
    /**
     * Показать следующую подсказку вместо прошлой: удалить старую и прислать новую.
     *
     * 🔥 Удаляем только ту подсказку, которую бот прислал сам и последней. Ответ
     * владельца идёт мимо этой карты (`send`) — его человек не должен терять,
     * нажав после прочтения любую кнопку.
     */
    async replacePrompt(bot, conversationId, text, keyboard) {
        const previousId = this.prompts.get(conversationId);
        this.prompts.delete(conversationId);
        if (previousId !== undefined) {
            await this.deleteQuietly(bot, conversationId, previousId);
        }
        const result = await this.chatService.sendBotMessage({
            conversationId,
            senderId: bot.id,
            text,
            ...(keyboard === undefined ? {} : { keyboard }),
        });
        this.prompts.set(conversationId, result.message.id);
        this.events.publishNewMessage(result);
    }
    /**
     * Удалить сообщение бота, не падая, если его уже нет.
     *
     * Сообщение могло исчезнуть само: человек удалил переписку, сервер
     * перезапустился и карта подсказок опустела, — а прошлый id остался. Ошибка
     * удаления здесь ничего не значит: новую подсказку всё равно надо показать.
     */
    async deleteQuietly(bot, conversationId, messageId) {
        try {
            const deleted = await this.chatService.deleteMessage(bot.id, conversationId, messageId);
            this.events.publishDeletedMessage(deleted);
        }
        catch (error) {
            console.warn("Бот поддержки не смог убрать прошлую подсказку", error);
        }
    }
    /** Переписка с ботом глазами человека: чужая беседа действием не станет. */
    async getBotConversation(userId, conversationId, bot) {
        const conversation = await this.repositories.conversations.findById(conversationId);
        if (!conversation ||
            conversation.type !== "direct" ||
            !conversation.memberIds.includes(bot.id) ||
            !conversation.memberIds.includes(userId)) {
            throw new AppError(403, "SUPPORT_CONVERSATION_INVALID", "Это не переписка с ботом поддержки");
        }
        return conversation;
    }
    async requireBot() {
        const bot = await this.botUser();
        if (!bot) {
            throw new AppError(503, "SUPPORT_BOT_MISSING", "Бот поддержки не настроен");
        }
        return bot;
    }
}
/**
 * Номер обращения: четыре знака из случайного id.
 *
 * Не порядковый счётчик и не id сообщения: счётчик пришлось бы где-то хранить и
 * синхронизировать, а id сообщения известен только **после** создания записи —
 * а номер нужен уже в её тексте. Случайные четыре знака дают 65 536 вариантов:
 * в одной переписке повторов практически не бывает, а большего и не нужно —
 * номер нужен лишь для того, чтобы человек и владельцы говорили об одном и том
 * же обращении.
 */
function newTicketCode() {
    return randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
}
//# sourceMappingURL=support-bot-service.js.map