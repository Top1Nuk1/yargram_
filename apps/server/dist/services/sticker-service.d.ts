import type { AttachmentView, StickerPackView, StickerView } from "../domain/models.js";
import type { MessageView } from "./chat-service.js";
import type { Repositories } from "../repositories/types.js";
import type { RealtimeEvents } from "../realtime/events.js";
/**
 * 🔥 Предел набора — 200 стикеров. Это обещание из интерфейса, и оно же
 * ограничивает то, что сервер согласится принять: счётчик живёт в наборе, а
 * проверка идёт по факту, поэтому гонкой между двумя загрузками не отравлен.
 * Менять число молча нельзя — у человека уже может быть набор на 200.
 */
export declare const STICKER_PACK_LIMIT = 200;
/** Сколько гифок держим в библиотеке: дальше место на диске дороже пользы. */
export declare const GIF_LIMIT = 40;
/** Гифка в библиотеке: за это самое место на диске платит аккаунт. */
export declare const GIF_SIZE_LIMIT: number;
/** Встроенный набор: описан кодом, поэтому править его нельзя никому. */
export declare function isBuiltinPack(packId: string): boolean;
/**
 * 🔥 Встроенный стикер существует, даже если его нет в базе: он описан кодом и
 * лежит в сборке приложения. Отдельная проверка нужна отправке сообщения —
 * иначе она искала бы встроенный стикер в таблице и никого бы не нашла.
 */
export declare function isBuiltinSticker(stickerId: string): boolean;
/**
 * 🔥 Стикеры сообщения — готовые адреса, а не id.
 *
 * Сообщение хранит только `stickerIds`: у встроенных стикеров вложения нет вовсе
 * (это файлы сборки), а у пользовательских вложение своё, и его можно удалить
 * вместе со стикером. Если бы в истории лежали подписанные адреса, они бы
 * протухали, поэтому каждый раз, когда отдаём сообщение, адреса пересобираются
 * заново. Не найденный стикер пропускаем, а не роняем переписку.
 */
export declare function resolveStickerViews(repositories: Pick<Repositories, "stickers" | "attachments">, stickerIds: readonly string[]): Promise<StickerView[]>;
export declare class StickerService {
    private readonly repositories;
    private readonly events;
    constructor(repositories: Repositories, events: RealtimeEvents);
    /** Все наборы человека: встроенные, свои и присланные. */
    listPacks(userId: string): Promise<StickerPackView[]>;
    /**
     * Один набор по id — встроенный, свой или присланный.
     *
     * Отдельный метод нужен клиенту для перечитывания набора: тот хранит
     * `version`, и по сокету приходит «перечитай», а не весь набор.
     */
    getPack(userId: string, packId: string): Promise<StickerPackView>;
    createPack(userId: string, input: {
        title: string;
        emoji?: string | undefined;
    }): Promise<StickerPackView>;
    updatePack(userId: string, packId: string, input: {
        title?: string | undefined;
        emoji?: string | undefined;
    }): Promise<StickerPackView>;
    deletePack(userId: string, packId: string): Promise<void>;
    /**
     * Добавить загруженный файл в свой набор.
     *
     * Файл уже лежит в базе как вложение: загрузка идёт отдельным запросом, как
     * и любая другая картинка. Проверяем тут только две вещи — свой ли набор и
     * не переполнен ли он.
     */
    addSticker(userId: string, packId: string, attachmentId: string, data: Buffer, mimeType: string, emoji?: string | undefined): Promise<StickerPackView>;
    removeSticker(userId: string, packId: string, stickerId: string): Promise<StickerPackView>;
    /**
     * Прислать набор в беседу: сообщение без текста, а получателям набор
     * добавляется автоматически.
     *
     * Встроенный набор прислать нельзя: он и так есть у всех, и сообщение с ним
     * было бы пустым.
     */
    sharePack(userId: string, conversationId: string, packId: string, send: (userId: string, conversationId: string, packId: string) => Promise<{
        message: MessageView;
        memberIds: string[];
    }>): Promise<{
        message: MessageView;
        memberIds: string[];
    }>;
    installPack(userId: string, packId: string): Promise<StickerPackView>;
    uninstallPack(userId: string, packId: string): Promise<void>;
    /** Наборы, к которым у человека есть доступ, — их id нужны для рассылки. */
    private accessiblePackIds;
    /**
     * 🔥 Кому разослать: автору набора и всем, у кого он есть.
     *
     * Именно поэтому событие идёт по списку, а не «всем подряд»: у человека может
     * не быть этого набора, и обновление ему не нужно. Список считаем здесь,
     * потому что событие живёт в `RealtimeEvents` без доступа к базе.
     */
    private notifyPack;
    /**
     * Раздать набор участникам беседы.
     *
     * 🔥 Автора пропускаем: свой набор у него и так есть. Остальным добавляем
     * только если набора ещё не было — и только тем, кому вообще можно писать.
     */
    private installForMembers;
    private toView;
    private stickerView;
    /** Библиотека гифок человека: то, что он загрузил и может слать много раз. */
    listGifs(userId: string): Promise<AttachmentView[]>;
}
/**
 * Анимированный файл — GIF или анимированный WebP.
 *
 * 🔥 Смотрим на сигнатуру файла, а не на расширение: `.webp` встречается и
 * статичный, а `.gif` почти всегда живой. Разбирать контейнер целиком не надо —
 * достаточно первых байтов, где у GIF стоит `GIF89a`, а у анимированного WebP
 *VP8X с флагом `ANIM`.
 */
export declare function isAnimated(data: Buffer, mimeType: string): boolean;
