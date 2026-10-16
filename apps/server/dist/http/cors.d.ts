import type { IncomingHttpHeaders } from "node:http";
import type { Request } from "express";
import type { CorsOptionsDelegate } from "cors";
/**
 * Так выглядит запрос для `cors`, когда его вызывает `socket.io`: это не
 * express-запрос, а сырой узел-запрос (или его обёртка). Нужны из него только
 * заголовки, поэтому описываем минимум — иначе пришлось бы тянуть тип из
 * внутренностей `engine.io`.
 */
type SocketCorsRequest = {
    headers: IncomingHttpHeaders;
};
export declare function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[], requestHost?: string): boolean;
export declare function createCorsOptions(allowedOrigins: readonly string[]): CorsOptionsDelegate<Request>;
/**
 * CORS для socket.io.
 *
 * 🔥 Хост запроса здесь обязателен — без него ломается realtime на своём адресе.
 *
 * `socket.io` передаёт эти настройки в `cors` и **отклоняет хендшейк**, если
 * источник не разрешён: клиент получает не «пустой» ответ, а ошибку связи, и в
 * интерфейсе загорается «Нет realtime-связи» (заодно пропадают сообщения в
 * живом режиме, «печатает…» и звонки). Заметно это только на своём адресе —
 * при открытии приложения по его же домену, потому что `Origin` в этом случае
 * равен домену, которого в `CORS_ORIGINS` нет.
 *
 * Раньше здесь вызывался `isOriginAllowed(origin, allowedOrigins)` **без
 * третьего аргумента**, и правило «источник совпал с хостом запроса — свой»
 * не срабатывало. Через HTTP-мидлварь (`createCorsOptions` выше, плюс
 * отдельная ветка с `req.hostname` в `isOriginAllowed`) тот же случай уже был
 * закрыт — поэтому ломались только сокеты.
 *
 * Поэтому берём ровно ту же проверку, что и в HTTP-ветке, и тоже передаём
 * `Host`. Делегат-функция (а не готовый объект) нужен именно ради доступа к
 * запросу: `origin`-колбэк формы `(origin, cb)` хост не получает вообще.
 */
export declare function createSocketCorsOptions(allowedOrigins: readonly string[]): CorsOptionsDelegate<SocketCorsRequest>;
export {};
