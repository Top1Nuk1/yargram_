import type { IncomingHttpHeaders } from "node:http";
import type { Request } from "express";
import type { CorsOptions, CorsOptionsDelegate } from "cors";

/**
 * Так выглядит запрос для `cors`, когда его вызывает `socket.io`: это не
 * express-запрос, а сырой узел-запрос (или его обёртка). Нужны из него только
 * заголовки, поэтому описываем минимум — иначе пришлось бы тянуть тип из
 * внутренностей `engine.io`.
 */
type SocketCorsRequest = { headers: IncomingHttpHeaders };

function normalizeHostname(host: string | undefined): string | undefined {
  if (!host) return undefined;
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0]?.toLowerCase();
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets as [number, number, number, number];
  return (
    first === 127 ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function parseOrigin(origin: string): URL | null {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  requestHost?: string,
): boolean {
  if (!origin) return true;
  const normalizedOrigin = origin.replace(/\/$/, "");
  if (allowedOrigins.includes(normalizedOrigin)) return true;

  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (isLocalOrPrivateHostname(hostname)) return true;

  const currentHostname = normalizeHostname(requestHost);
  if (currentHostname !== undefined && hostname === currentHostname) return true;

  return allowedOrigins.some((candidate) => parseOrigin(candidate)?.hostname.toLowerCase() === hostname);
}

export function createCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptionsDelegate<Request> {
  return (request, callback) => {
    const origin = request.header("Origin");
    const allowed = isOriginAllowed(origin, allowedOrigins, request.header("Host"));
    const options: CorsOptions = {
      origin: allowed,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    };
    callback(null, options);
  };
}

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
export function createSocketCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptionsDelegate<SocketCorsRequest> {
  return (request, callback) => {
    const origin = request.headers.origin;
    // Тот же разбор, что и у HTTP-CORS, включая правило «источник совпал с
    // хостом запроса — свой». `request.headers.host` доступен только здесь:
    // колбэк формы `(origin, cb)` запрос не получает, поэтому и был разрыв.
    if (!isOriginAllowed(origin, allowedOrigins, request.headers.host)) {
      callback(new Error("Origin is not allowed"));
      return;
    }
    const options: CorsOptions = {
      // `true` — отразить источник запроса (а не `*`): с `credentials: true`
      // браузер отвергает звёздочку, и вход с куками перестал бы работать.
      origin: true,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    };
    callback(null, options);
  };
}
