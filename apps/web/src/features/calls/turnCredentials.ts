/**
 * Реле для звонков, когда своего `coturn` нет.
 *
 * 🔥 Зачем отдельный модуль. Свой `coturn` требует root и открытых UDP-портов —
 * на хостинге приложений этого нет вовсе. Публичные реле (Open Relay и
 * подобные) вместо постоянного пароля выдают **временные** логин и пароль, и
 * вшивать их в сборку бессмысленно: они протухают. Поэтому данные запрашиваются
 * у своего сервера прямо перед звонком — ключ сервиса остаётся на сервере и не
 * светится в «Сети» у пользователя.
 *
 * 🔥 Почему кэш в модуле, а не в состоянии React. `RTCPeerConnection`
 * создаётся синхронно в глубине хука звонка, и протаскивать туда асинхронное
 * состояние пришлось бы через полфайла. Кэш же один на всё приложение: логин и
 * пароль выдаются на аккаунт, а не на участника, так что раздавать один набор
 * всем собеседникам правильно.
 */
import { request } from '../../api/client';

/** Последние полученные реле. Пусто — значит их просто нет. */
let dynamicServers: RTCIceServer[] | null = null;
/** Запрос в полёте: чтобы два одновременных звонка не отправили два запроса. */
let inFlight: Promise<RTCIceServer[]> | null = null;

/** Реле, полученные с сервера. Пустой список, если их не настроили. */
export function dynamicIceServers(): RTCIceServer[] {
  return dynamicServers ?? [];
}

/**
 * Обновить данные реле. 🔥 Никогда не бросает: если сервер недоступен или
 * сервис не настроен, звонок всё равно должен начаться — на одном STUN, как
 * раньше. Упавший из-за реле звонок был бы настоящей поломкой.
 */
export async function refreshTurnCredentials(token?: string): Promise<RTCIceServer[]> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const payload = await request<{ iceServers?: unknown }>('/api/calls/ice-servers', {
        ...(token ? { token } : {}),
      });
      dynamicServers = sanitizeIceServers(payload.iceServers);
    } catch {
      // Оставляем прежние: протухший пароль всё ещё может сработать, а вот
      // затирать рабочие данные пустотой из-за одного сбоя сети не стоит.
      dynamicServers ??= [];
    }
    return dynamicServers;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Для тестов: сбросить кэш между прогонами. */
export function resetTurnCredentialsCache(): void {
  dynamicServers = null;
  inFlight = null;
}

/**
 * В `RTCPeerConnection` попадёт только похожее на ICE-сервер: чужой мусор из
 * ответа сломал бы звонок уже в браузере, где искать причину негде.
 */
function sanitizeIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  const allowed = ['stun:', 'stuns:', 'turn:', 'turns:'];
  return value.flatMap((entry: unknown): RTCIceServer[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const candidate = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls])
      .filter((url): url is string => typeof url === 'string')
      .map((url) => url.trim())
      .filter((url) => allowed.some((scheme) => url.startsWith(scheme)));
    if (urls.length === 0) return [];
    return [
      {
        urls: urls.length === 1 ? urls[0] : urls,
        ...(typeof candidate.username === 'string' ? { username: candidate.username } : {}),
        ...(typeof candidate.credential === 'string' ? { credential: candidate.credential } : {}),
      },
    ];
  });
}
