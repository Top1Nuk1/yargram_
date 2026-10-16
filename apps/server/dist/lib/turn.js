/** Сколько ждать ответа внешнего сервиса. Звонок не должен висеть. */
const REQUEST_TIMEOUT_MS = 5_000;
/** Схемы, которые понимает WebRTC. Всё остальное из ответа выбрасываем. */
const ALLOWED_SCHEMES = ["stun:", "stuns:", "turn:", "turns:"];
const cache = new Map();
/**
 * 🔥 Кэш живёт в памяти процесса и один на всех — это сделано сознательно.
 * Логин и пароль у таких сервисов выдаются на аккаунт, а не на пользователя,
 * поэтому раздавать один набор всем участникам звонка не просто можно, а
 * правильно: иначе каждый звонок тратил бы запрос и время.
 */
export async function fetchTurnIceServers(url, ttlSeconds, now = () => Date.now()) {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now())
        return cached.servers;
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: { accept: "application/json" },
        });
        if (!response.ok)
            throw new Error(`TURN service responded ${response.status}`);
        const servers = parseIceServers(await response.json());
        cache.set(url, { servers, expiresAt: now() + ttlSeconds * 1000 });
        return servers;
    }
    catch (error) {
        // ⚠️ Не бросаем наружу: без реле звонок всё равно может состояться
        // напрямую (STUN), а вот упавший из-за TURN звонок — это уже поломка.
        console.warn(`TURN credentials unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
        // Протухший кэш лучше пустоты: старый пароль может ещё действовать.
        return cached?.servers ?? [];
    }
}
/** Для тестов: сбросить кэш между прогонами. */
export function resetTurnIceServersCache() {
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
export function parseIceServers(payload) {
    const raw = Array.isArray(payload)
        ? payload
        : isRecord(payload) && Array.isArray(payload.iceServers)
            ? payload.iceServers
            : [];
    return raw.flatMap((entry) => {
        if (!isRecord(entry))
            return [];
        const urls = normalizeUrls(entry.urls);
        if (!urls)
            return [];
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
function normalizeUrls(value) {
    const list = (Array.isArray(value) ? value : [value])
        .filter((url) => typeof url === "string")
        .map((url) => url.trim())
        .filter((url) => ALLOWED_SCHEMES.some((scheme) => url.startsWith(scheme)));
    return list.length > 0 ? list : null;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=turn.js.map