import type {
  AttachmentView,
  Conversation,
  Sticker,
  StickerPack,
  StickerPackInstall,
  StickerPackView,
  StickerView,
} from "../domain/models.js";
import { toAttachmentView } from "../domain/models.js";
import type { MessageView } from "./chat-service.js";
import { AppError } from "../lib/errors.js";
import type { Repositories } from "../repositories/types.js";
import type { RealtimeEvents } from "../realtime/events.js";

/**
 * 🔥 Предел набора — 200 стикеров. Это обещание из интерфейса, и оно же
 * ограничивает то, что сервер согласится принять: счётчик живёт в наборе, а
 * проверка идёт по факту, поэтому гонкой между двумя загрузками не отравлен.
 * Менять число молча нельзя — у человека уже может быть набор на 200.
 */
export const STICKER_PACK_LIMIT = 200;

/** Сколько знаков оставить в заголовке набора. */
const TITLE_LIMIT = 40;
/** Значок набора: одна-две «эмоции», но обрезаем, чтобы не разъехалась вкладка. */
const EMOJI_LIMIT = 8;
/** Сколько гифок держим в библиотеке: дальше место на диске дороже пользы. */
export const GIF_LIMIT = 40;
/** Гифка в библиотеке: за это самое место на диске платит аккаунт. */
export const GIF_SIZE_LIMIT = 12 * 1024 * 1024;

type BuiltinSticker = {
  id: string;
  emoji: string;
  file: string;
  animated: boolean;
};

/**
 * Встроенные наборы.
 *
 * 🔥 Живут в коде, а не в базе, и это осознанно: набор одинаков у всех, его не
 * нужно раздавать новым аккаунтам и не нужно синхронизировать при обновлении
 * приложения. Хранить его в базе значило бы держать копию, которая со временем
 * разойдётся с кодом — и правки знаков Yargram пришлось бы делать в двух местах.
 *
 * Картинки лежат в сборке приложения (`public/stickers`) и раздаются статикой,
 * поэтому у них нет подписи и срока жизни: в отличие от загруженных файлов они
 * не могут протухнуть и не занимают место в базе.
 */
const BUILTIN_PACKS: ReadonlyArray<{
  id: string;
  title: string;
  emoji: string;
  stickers: BuiltinSticker[];
}> = [
  {
    id: "builtin-yargram",
    title: "Yargram",
    emoji: "🔵",
    stickers: [
      { id: "yargram-logo", emoji: "🔵", file: "yargram/logo.png", animated: false },
      { id: "yargram-logo-pulse", emoji: "💫", file: "yargram/logo-pulse.webp", animated: true },
      { id: "yargram-star", emoji: "⭐", file: "yargram/star.png", animated: false },
      { id: "yargram-star-spin", emoji: "🌟", file: "yargram/star-spin.webp", animated: true },
      { id: "yargram-star-accent", emoji: "💜", file: "yargram/star-accent.png", animated: false },
      { id: "yargram-rosette", emoji: "✔️", file: "yargram/rosette.png", animated: false },
      { id: "yargram-snowflake", emoji: "❄️", file: "yargram/snowflake.png", animated: false },
      { id: "yargram-snowflake-spin", emoji: "🌨️", file: "yargram/snowflake-spin.webp", animated: true },
      { id: "yargram-heart", emoji: "❤️", file: "yargram/heart.png", animated: false },
      { id: "yargram-heart-beat", emoji: "💓", file: "yargram/heart-beat.webp", animated: true },
      { id: "yargram-heart-brand", emoji: "💙", file: "yargram/heart-brand.png", animated: false },
      { id: "yargram-plate", emoji: "🟦", file: "yargram/plate.png", animated: false },
      { id: "yargram-star-plate", emoji: "🏷️", file: "yargram/star-plate.png", animated: false },
      { id: "yargram-scam", emoji: "🚫", file: "yargram/scam.png", animated: false },
      { id: "yargram-fake", emoji: "⚠️", file: "yargram/fake.png", animated: false },
      { id: "yargram-bot", emoji: "🤖", file: "yargram/bot.png", animated: false },
    ],
  },
  {
    id: "builtin-smiles",
    title: "Смайлы",
    emoji: "😀",
    stickers: [
      { id: "smile-smile", emoji: "😀", file: "smiles/smile.png", animated: false },
      { id: "smile-laugh", emoji: "😄", file: "smiles/laugh.png", animated: false },
      { id: "smile-wink", emoji: "😉", file: "smiles/wink.png", animated: false },
      { id: "smile-sad", emoji: "😔", file: "smiles/sad.png", animated: false },
      { id: "smile-cry", emoji: "😢", file: "smiles/cry.png", animated: false },
      { id: "smile-angry", emoji: "😠", file: "smiles/angry.png", animated: false },
      { id: "smile-surprised", emoji: "😲", file: "smiles/surprised.png", animated: false },
      { id: "smile-kiss", emoji: "😘", file: "smiles/kiss.png", animated: false },
      { id: "smile-think", emoji: "🤔", file: "smiles/think.png", animated: false },
      { id: "smile-sleep", emoji: "😴", file: "smiles/sleep.png", animated: false },
      { id: "smile-cool", emoji: "😎", file: "smiles/cool.png", animated: false },
      { id: "smile-joy", emoji: "😂", file: "smiles/joy.png", animated: false },
      { id: "smile-shy", emoji: "😊", file: "smiles/shy.png", animated: false },
      { id: "smile-tongue", emoji: "😜", file: "smiles/tongue.png", animated: false },
      { id: "smile-neutral", emoji: "😐", file: "smiles/neutral.png", animated: false },
      { id: "smile-scared", emoji: "😨", file: "smiles/scared.png", animated: false },
      { id: "smile-sick", emoji: "🤢", file: "smiles/sick.png", animated: false },
      { id: "smile-robot", emoji: "🤖", file: "smiles/robot.png", animated: false },
      { id: "smile-ghost", emoji: "👻", file: "smiles/ghost.png", animated: false },
      { id: "smile-in-love", emoji: "😍", file: "smiles/in-love.png", animated: false },
      { id: "smile-star-eyes", emoji: "🤩", file: "smiles/star-eyes.png", animated: false },
      { id: "smile-dizzy", emoji: "😵", file: "smiles/dizzy.png", animated: false },
      { id: "smile-party", emoji: "🎉", file: "smiles/party.png", animated: false },
      { id: "smile-smirk", emoji: "😏", file: "smiles/smirk.png", animated: false },
    ],
  },
  {
    id: "builtin-reactions",
    title: "Реакции",
    emoji: "⚡",
    stickers: [
      { id: "react-heart", emoji: "❤️", file: "reactions/heart.webp", animated: true },
      { id: "react-broken-heart", emoji: "💔", file: "reactions/broken-heart.png", animated: false },
      { id: "react-star", emoji: "⭐", file: "reactions/star.webp", animated: true },
      { id: "react-fire", emoji: "🔥", file: "reactions/fire.webp", animated: true },
      { id: "react-confetti", emoji: "🎉", file: "reactions/confetti.webp", animated: true },
      { id: "react-sparkles", emoji: "✨", file: "reactions/sparkles.webp", animated: true },
      { id: "react-plus-one", emoji: "➕", file: "reactions/plus-one.png", animated: false },
      { id: "react-thanks", emoji: "🙏", file: "reactions/thanks.png", animated: false },
      { id: "react-coffee", emoji: "☕", file: "reactions/coffee.png", animated: false },
      { id: "react-gift", emoji: "🎁", file: "reactions/gift.png", animated: false },
      { id: "react-balloon", emoji: "🎈", file: "reactions/balloon.png", animated: false },
      { id: "react-moon", emoji: "🌙", file: "reactions/moon.png", animated: false },
      { id: "react-message", emoji: "💬", file: "reactions/message.png", animated: false },
    ],
  },
  {
    id: "builtin-animals",
    title: "Зверята",
    emoji: "🐾",
    stickers: [
      { id: "animal-cat", emoji: "🐱", file: "animals/cat.png", animated: false },
      { id: "animal-dog", emoji: "🐶", file: "animals/dog.png", animated: false },
      { id: "animal-fox", emoji: "🦊", file: "animals/fox.png", animated: false },
      { id: "animal-bear", emoji: "🐻", file: "animals/bear.png", animated: false },
      { id: "animal-panda", emoji: "🐼", file: "animals/panda.png", animated: false },
      { id: "animal-hamster", emoji: "🐹", file: "animals/hamster.png", animated: false },
      { id: "animal-frog", emoji: "🐸", file: "animals/frog.png", animated: false },
      { id: "animal-chick", emoji: "🐥", file: "animals/chick.png", animated: false },
      { id: "animal-lion", emoji: "🦁", file: "animals/lion.png", animated: false },
      { id: "animal-bunny", emoji: "🐰", file: "animals/bunny.png", animated: false },
      { id: "animal-penguin", emoji: "🐧", file: "animals/penguin.png", animated: false },
      { id: "animal-monkey", emoji: "🐒", file: "animals/monkey.png", animated: false },
    ],
  },
];

const builtinPacksById = new Map(BUILTIN_PACKS.map((pack) => [pack.id, pack]));

/**
 * 🔥 Встроенные стикеры — по id, без похода в базу. Их ровно несколько десятков
 * и они не меняются, поэтому держать вторую копию ради поиска незачем: карта
 * строится один раз при загрузке модуля.
 */
const builtinStickersById = new Map<string, StickerView>(
  BUILTIN_PACKS.flatMap((pack) =>
    pack.stickers.map(
      (sticker): [string, StickerView] => [
        sticker.id,
        {
          id: sticker.id,
          packId: pack.id,
          emoji: sticker.emoji,
          animated: sticker.animated,
          url: `/app/stickers/${sticker.file}`,
        },
      ],
    ),
  ),
);

/** Встроенный набор: описан кодом, поэтому править его нельзя никому. */
export function isBuiltinPack(packId: string): boolean {
  return builtinPacksById.has(packId);
}

/**
 * 🔥 Встроенный стикер существует, даже если его нет в базе: он описан кодом и
 * лежит в сборке приложения. Отдельная проверка нужна отправке сообщения —
 * иначе она искала бы встроенный стикер в таблице и никого бы не нашла.
 */
export function isBuiltinSticker(stickerId: string): boolean {
  return builtinStickersById.has(stickerId);
}

function builtinView(packId: string): StickerPackView {
  const pack = builtinPacksById.get(packId);
  if (!pack) throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
  return {
    id: pack.id,
    title: pack.title,
    emoji: pack.emoji,
    version: 1,
    mine: false,
    builtin: true,
    updatedAt: "",
    stickers: pack.stickers.map((sticker) => builtinStickersById.get(sticker.id) as StickerView),
  };
}

/**
 * 🔥 Стикеры сообщения — готовые адреса, а не id.
 *
 * Сообщение хранит только `stickerIds`: у встроенных стикеров вложения нет вовсе
 * (это файлы сборки), а у пользовательских вложение своё, и его можно удалить
 * вместе со стикером. Если бы в истории лежали подписанные адреса, они бы
 * протухали, поэтому каждый раз, когда отдаём сообщение, адреса пересобираются
 * заново. Не найденный стикер пропускаем, а не роняем переписку.
 */
export async function resolveStickerViews(
  repositories: Pick<Repositories, "stickers" | "attachments">,
  stickerIds: readonly string[],
): Promise<StickerView[]> {
  if (stickerIds.length === 0) return [];
  const views: StickerView[] = [];
  for (const stickerId of stickerIds) {
    const builtin = builtinStickersById.get(stickerId);
    if (builtin) {
      views.push(builtin);
      continue;
    }
    const sticker = await repositories.stickers.findById(stickerId);
    if (sticker) views.push(await stickerViewFor(repositories, sticker));
  }
  return views;
}

async function stickerViewFor(
  repositories: Pick<Repositories, "attachments">,
  sticker: Sticker,
): Promise<StickerView> {
  const base = {
    id: sticker.id,
    packId: sticker.packId,
    emoji: sticker.emoji,
    animated: sticker.animated,
  };
  if (sticker.imageUrl) return { ...base, url: sticker.imageUrl };
  if (!sticker.attachmentId) return { ...base, url: "" };
  const attachment = await repositories.attachments.findById(sticker.attachmentId);
  // Файл стикера удалён, а сам стикер остался: показываем его как битый, чтобы
  // сообщение не рассыпалось, и не роняем всю переписку.
  if (!attachment) return { ...base, url: "" };
  return { ...base, url: toAttachmentView(attachment).url };
}

export class StickerService {
  constructor(
    private readonly repositories: Repositories,
    private readonly events: RealtimeEvents,
  ) {}

  /** Все наборы человека: встроенные, свои и присланные. */
  async listPacks(userId: string): Promise<StickerPackView[]> {
    const builtin = BUILTIN_PACKS.map((pack) => builtinView(pack.id));
    const [mine, installs] = await Promise.all([
      this.repositories.stickerPacks.listOwnedBy(userId),
      this.repositories.stickerInstalls.listForUser(userId),
    ]);
    const shared = await this.repositories.stickerPacks.findManyByIds(
      installs.map((install) => install.packId),
    );
    // Набор, который прислали, может оказаться и собственным: тогда он уже есть
    // в `mine`, и второй раз показывать его нельзя.
    const sharedViews = await Promise.all(
      shared
        .filter((pack) => pack.ownerId !== userId)
        .map((pack) => this.toView(pack, installs, userId)),
    );
    const own = await Promise.all(mine.map((pack) => this.toView(pack, installs, userId)));
    return [...builtin, ...own, ...sharedViews];
  }

  /**
   * Один набор по id — встроенный, свой или присланный.
   *
   * Отдельный метод нужен клиенту для перечитывания набора: тот хранит
   * `version`, и по сокету приходит «перечитай», а не весь набор.
   */
  async getPack(userId: string, packId: string): Promise<StickerPackView> {
    if (isBuiltinPack(packId)) return builtinView(packId);
    const pack = await this.repositories.stickerPacks.findById(packId);
    if (!pack) throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
    if (pack.ownerId === userId) {
      return this.toView(pack, await this.repositories.stickerInstalls.listForUser(userId), userId);
    }
    const install = await this.repositories.stickerInstalls.find(userId, packId);
    // Чужой набор виден только если человек его оставил себе. Иначе его можно
    // было бы подсмотреть, зная id, — а это ровно то, чего шаринг не должен давать.
    if (!install) throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
    return this.toView(pack, [install], userId);
  }

  async createPack(
    userId: string,
    input: { title: string; emoji?: string | undefined },
  ): Promise<StickerPackView> {
    const title = cleanTitle(input.title);
    const pack = await this.repositories.stickerPacks.create({
      ownerId: userId,
      title,
      emoji: cleanEmoji(input.emoji) || "🙂",
    });
    await this.notifyPack(pack.id, userId);
    return this.toView(pack, [], userId);
  }

  async updatePack(
    userId: string,
    packId: string,
    input: { title?: string | undefined; emoji?: string | undefined },
  ): Promise<StickerPackView> {
    if (isBuiltinPack(packId)) {
      throw new AppError(403, "STICKER_PACK_READONLY", "Built-in sticker packs cannot be changed");
    }
    const pack = await this.repositories.stickerPacks.update(packId, userId, {
      ...(input.title === undefined ? {} : { title: cleanTitle(input.title) }),
      ...(input.emoji === undefined ? {} : { emoji: cleanEmoji(input.emoji) }),
    });
    await this.notifyPack(packId, userId);
    return this.toView(pack, [], userId);
  }

  async deletePack(userId: string, packId: string): Promise<void> {
    if (isBuiltinPack(packId)) {
      throw new AppError(403, "STICKER_PACK_READONLY", "Built-in sticker packs cannot be deleted");
    }
    await this.repositories.stickerPacks.delete(packId, userId);
    await this.repositories.stickers.deleteForPack(packId);
    // Набор мог остаться в переписке у других — карточка в истории перестанет
    // открываться, и без записи о нём клиент не поймёт, что именно исчезло.
    await this.repositories.stickerInstalls.deleteForPack(packId);
    await this.notifyPack(packId, userId);
  }

  /**
   * Добавить загруженный файл в свой набор.
   *
   * Файл уже лежит в базе как вложение: загрузка идёт отдельным запросом, как
   * и любая другая картинка. Проверяем тут только две вещи — свой ли набор и
   * не переполнен ли он.
   */
  async addSticker(
    userId: string,
    packId: string,
    attachmentId: string,
    data: Buffer,
    mimeType: string,
    emoji?: string | undefined,
  ): Promise<StickerPackView> {
    if (isBuiltinPack(packId)) {
      throw new AppError(403, "STICKER_PACK_READONLY", "Built-in sticker packs cannot be changed");
    }
    const pack = await this.repositories.stickerPacks.findById(packId);
    if (!pack || pack.ownerId !== userId) {
      throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
    }
    const count = await this.repositories.stickers.countForPack(packId);
    if (count >= STICKER_PACK_LIMIT) {
      // 🔥 409, а не 400: запрос правильный, сервер просто не может его
      // выполнить. 400 клиент читает как «файл не тот», и человек не понял бы,
      // что набор просто полон.
      throw new AppError(
        409,
        "STICKER_PACK_FULL",
        `A sticker pack holds at most ${STICKER_PACK_LIMIT} stickers`,
      );
    }
    const attachment = await this.repositories.attachments.findById(attachmentId);
    if (!attachment || attachment.ownerId !== userId) {
      throw new AppError(404, "ATTACHMENT_NOT_FOUND", "The sticker file was not found");
    }
    if (attachment.kind !== "sticker") {
      throw new AppError(400, "STICKER_FILE_INVALID", "Only sticker uploads can join a pack");
    }
    await this.repositories.stickers.create({
      packId,
      attachmentId,
      emoji: cleanEmoji(emoji) || "🙂",
      animated: isAnimated(data, mimeType),
    });
    const updated = await this.repositories.stickerPacks.bumpVersion(packId);
    await this.notifyPack(packId, userId);
    return this.toView(updated, [], userId);
  }

  async removeSticker(userId: string, packId: string, stickerId: string): Promise<StickerPackView> {
    if (isBuiltinPack(packId)) {
      throw new AppError(403, "STICKER_PACK_READONLY", "Built-in sticker packs cannot be changed");
    }
    const pack = await this.repositories.stickerPacks.findById(packId);
    if (!pack || pack.ownerId !== userId) {
      throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
    }
    const removed = await this.repositories.stickers.delete(stickerId, packId);
    if (!removed) throw new AppError(404, "STICKER_NOT_FOUND", "Sticker not found");
    if (removed.attachmentId) {
      // Файл удаляем вместе со стикером: иначе он навсегда останется на диске,
      // и на 200 мест хватит сотен таких «осиротевших» картинок.
      await this.repositories.attachments.delete(removed.attachmentId);
    }
    const updated = await this.repositories.stickerPacks.bumpVersion(packId);
    await this.notifyPack(packId, userId);
    return this.toView(updated, [], userId);
  }

  /**
   * Прислать набор в беседу: сообщение без текста, а получателям набор
   * добавляется автоматически.
   *
   * Встроенный набор прислать нельзя: он и так есть у всех, и сообщение с ним
   * было бы пустым.
   */
  async sharePack(
    userId: string,
    conversationId: string,
    packId: string,
    send: (userId: string, conversationId: string, packId: string) => Promise<{
      message: MessageView;
      memberIds: string[];
    }>,
  ): Promise<{ message: MessageView; memberIds: string[] }> {
    if (isBuiltinPack(packId)) {
      throw new AppError(400, "STICKER_PACK_BUILTIN", "Built-in packs are available to everyone");
    }
    const pack = await this.repositories.stickerPacks.findById(packId);
    if (!pack) throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
    // 🔥 Пустой набор прислать нельзя. Сообщение с ним шло бы без текста и
    // без файлов, то есть в переписке появилась бы пустая карточка, а у
    // получателя — набор без единого стикера. Автору скажем честно: набор
    // пуст, добавлять пока нечего.
    if ((await this.repositories.stickers.countForPack(pack.id)) === 0) {
      throw new AppError(400, "STICKER_PACK_EMPTY", "An empty sticker pack cannot be shared");
    }
    const conversation = await this.repositories.conversations.findById(conversationId);
    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }
    // Присылать может и не владелец набора: человек мог получить его в подарок
    // и переслать дальше. Ограничение — только на запрет блокировки и группы,
    // и этим занимается `chatService.sendMessage`.
    const result = await send(userId, conversationId, packId);
    await this.installForMembers(conversation, pack, userId);
    return result;
  }

  async installPack(userId: string, packId: string): Promise<StickerPackView> {
    if (isBuiltinPack(packId)) return builtinView(packId);
    const pack = await this.repositories.stickerPacks.findById(packId);
    if (!pack) throw new AppError(404, "STICKER_PACK_NOT_FOUND", "Sticker pack not found");
    const { install, created } = await this.repositories.stickerInstalls.install({
      userId,
      packId,
      sharedByUserId: pack.ownerId,
    });
    // Повторная установка — не новость: набор могли прислать в чат, где он уже
    // есть, и лишнее событие заставило бы клиент перечитывать набор зря.
    if (created) await this.notifyPack(packId, userId);
    return this.toView(pack, [install], userId);
  }

  async uninstallPack(userId: string, packId: string): Promise<void> {
    if (isBuiltinPack(packId)) {
      throw new AppError(403, "STICKER_PACK_READONLY", "Built-in sticker packs cannot be removed");
    }
    await this.repositories.stickerInstalls.uninstall(userId, packId);
  }

  /** Наборы, к которым у человека есть доступ, — их id нужны для рассылки. */
  private async accessiblePackIds(userId: string): Promise<Set<string>> {
    const [mine, installs] = await Promise.all([
      this.repositories.stickerPacks.listOwnedBy(userId),
      this.repositories.stickerInstalls.listForUser(userId),
    ]);
    return new Set([
      ...BUILTIN_PACKS.map((pack) => pack.id),
      ...mine.map((pack) => pack.id),
      ...installs.map((install) => install.packId),
    ]);
  }

  /**
   * 🔥 Кому разослать: автору набора и всем, у кого он есть.
   *
   * Именно поэтому событие идёт по списку, а не «всем подряд»: у человека может
   * не быть этого набора, и обновление ему не нужно. Список считаем здесь,
   * потому что событие живёт в `RealtimeEvents` без доступа к базе.
   */
  private async notifyPack(packId: string, changedByUserId: string): Promise<void> {
    const pack = await this.repositories.stickerPacks.findById(packId);
    const version = pack?.version ?? 1;
    const userIds = new Set<string>([changedByUserId]);
    const installs = await this.repositories.stickerInstalls.listForPack(packId);
    for (const install of installs) userIds.add(install.userId);
    for (const userId of userIds) {
      this.events.publishStickerPack({
        packId,
        version,
        ...(userId === changedByUserId ? {} : { sharedWithUserId: userId }),
      });
    }
  }

  /**
   * Раздать набор участникам беседы.
   *
   * 🔥 Автора пропускаем: свой набор у него и так есть. Остальным добавляем
   * только если набора ещё не было — и только тем, кому вообще можно писать.
   */
  private async installForMembers(
    conversation: Conversation,
    pack: StickerPack,
    sharedByUserId: string,
  ): Promise<StickerPackInstall[]> {
    const installs: StickerPackInstall[] = [];
    for (const memberId of conversation.memberIds) {
      if (memberId === sharedByUserId) continue;
      const { install, created } = await this.repositories.stickerInstalls.install({
        userId: memberId,
        packId: pack.id,
        sharedByUserId,
      });
      installs.push(install);
      if (created) {
        this.events.publishStickerPack({
          packId: pack.id,
          version: pack.version,
          sharedWithUserId: memberId,
        });
      }
    }
    return installs;
  }

  private async toView(
    pack: StickerPack,
    installs: StickerPackInstall[],
    userId: string,
  ): Promise<StickerPackView> {
    const stickers = await this.repositories.stickers.listForPack(pack.id);
    const mine = installs.filter((install) => install.userId === userId);
    const sharedBy = mine[0]?.sharedByUserId;
    return {
      id: pack.id,
      title: pack.title,
      emoji: pack.emoji,
      version: pack.version,
      mine: pack.ownerId === userId,
      builtin: false,
      ...(sharedBy && sharedBy !== pack.ownerId ? { sharedByUserId: sharedBy } : {}),
      updatedAt: pack.updatedAt,
      stickers: await Promise.all(stickers.map((sticker) => this.stickerView(sticker))),
    };
  }

  private async stickerView(sticker: Sticker): Promise<StickerView> {
    return stickerViewFor(this.repositories, sticker);
  }

  /** Библиотека гифок человека: то, что он загрузил и может слать много раз. */
  async listGifs(userId: string): Promise<AttachmentView[]> {
    const all = await this.repositories.attachments.listByOwner(userId);
    return all
      .filter((attachment) => attachment.kind === "gif")
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .map((attachment) => toAttachmentView(attachment));
  }
}

/**
 * Анимированный файл — GIF или анимированный WebP.
 *
 * 🔥 Смотрим на сигнатуру файла, а не на расширение: `.webp` встречается и
 * статичный, а `.gif` почти всегда живой. Разбирать контейнер целиком не надо —
 * достаточно первых байтов, где у GIF стоит `GIF89a`, а у анимированного WebP
 *VP8X с флагом `ANIM`.
 */
export function isAnimated(data: Buffer, mimeType: string): boolean {
  if (mimeType === "image/gif") return true;
  if (mimeType !== "image/webp") return false;
  // VP8X — расширенный контейнер, только в нём бывает анимация. Флаг ANIM
  // стоит в первом байте блока, поэтому заголовка на 14 байт достаточно.
  if (data.length < 14 || data.subarray(0, 4).toString("ascii") !== "RIFF") return false;
  if (data.subarray(8, 12).toString("ascii") !== "VP8X") return false;
  return ((data[12] ?? 0) & 0b0000_0010) !== 0;
}

function cleanTitle(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, TITLE_LIMIT);
  if (!trimmed) throw new AppError(400, "STICKER_PACK_TITLE_INVALID", "A pack needs a title");
  return trimmed;
}

function cleanEmoji(value: string | undefined): string {
  if (!value) return "";
  return [...value.trim()].slice(0, EMOJI_LIMIT).join("");
}