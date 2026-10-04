/**
 * Временные данные TURN для звонков.
 *
 * 🔥 Зачем отдельный модуль. Свой `coturn` требует root и открытых UDP-портов —
 * на хостинге приложений (shared) этого нет вовсе. Публичные реле вроде
 * Open Relay работают иначе: они выдают **короткоживущие** логин и пароль по
 * HTTP. Такие данные нельзя зашить в сборку (`VITE_TURN_*` на это и не
 * рассчитаны) — их нужно запросить перед звонком отсюда, с сервера.
 *
 * Почему запрос идёт через наш сервер, а не прямо из браузера:
 *   1. ключ сервиса не попадает в фронтенд и не светится в «Сети»;
 *   2. ответ кэшируется один на всех, а не на каждого звонящего;
 *   3. при недоступности сервиса звонок всё равно начнётся — на одном STUN.
 */
/** То, что отдаётся браузеру: совпадает с `RTCIceServer`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Сколько ждать ответа внешнего сервиса. Звонок не должен висеть. */
const REQUEST_TIMEOUT_MS = 5_000;
/** Схемы, которые понимает WebRTC. Всё остальное из ответа выбрасываем. */
const ALLOWED_SCHEMES = ["stun:", "stuns:", "turn:", "turns:"];

interface CacheEntry {
  servers: IceServer[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 🔥 Кэш живёт в памяти процесса и один на всех — это сделано сознательно.
 * Логин и пароль у таких сервисов выдаются на аккаунт, а не на пользователя,
 * поэтому раздавать один набор всем участникам звонка не просто можно, а
 * правильно: иначе каждый звонок тратил бы запрос и время.
 */
export async function fetchTurnIceServers(
  url: string,
  ttlSeconds: number,
  now: () => number = () => Date.now(),
): Promise<IceServer[]> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now()) return cached.servers;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`TURN service responded ${response.status}`);
    const servers = parseIceServers(await response.json());
    cache.set(url, { servers, expiresAt: now() + ttlSeconds * 1000 });
    return servers;
  } catch (error) {
    // ⚠️ Не бросаем наружу: без реле звонок всё равно может состояться
    // напрямую (STUN), а вот упавший из-за TURN звонок — это уже поломка.
    console.warn(
      `TURN credentials unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    // Протухший кэш лучше пустоты: старый пароль может ещё действовать.
    return cached?.servers ?? [];
  }
}

/** Для тестов: сбросить кэш между прогонами. */
export function resetTurnIceServersCache(): void {
  cache.clear();
}

/**
 * Разбор ответа внешнего сервиса.
 *
 * 🔥 Форматы бывают разными: Open Relay/Metered возвращает и голый массив
 * `iceServers`, и объект `{ iceServers: […] }`. Поэтому принимаем оба, а
 * каждую запись проверяем: в `RTCPeerConnection` попадёт только то, что
 * действительно является ICE-сервером — иначе чужой мусор из ответа сломает
 * звонок уже в браузере, и искать причину будет негде.
 */
export function parseIceServers(payload: unknown): IceServer[] {
  const raw = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.iceServers)
      ? payload.iceServers
      : [];

  return raw.flatMap((entry): IceServer[] => {
    if (!isRecord(entry)) return [];
    const urls = normalizeUrls(entry.urls);
    if (!urls) return [];
    const username = typeof entry.username === "string" ? entry.username : undefined;
    const credential = typeof entry.credential === "string" ? entry.credential : undefined;
    return [
      {
        // массив — корректная форма для `RTCIceServer` (string | string[]).
        // Раньше нормализовали к одной строке, но TS не верил, что `urls[0]`
        // не undefined, а выгода от однострочной формы не стоит лишней возни.
        urls,
        ...(username ? { username } : {}),
        ...(credential ? { credential } : {}),
      },
    ];
  });
}

function normalizeUrls(value: unknown): string[] | null {
  const list = (Array.isArray(value) ? value : [value])
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => ALLOWED_SCHEMES.some((scheme) => url.startsWith(scheme)));
  return list.length > 0 ? list : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
