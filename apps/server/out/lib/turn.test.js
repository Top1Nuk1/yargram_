import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTurnIceServers, parseIceServers, resetTurnIceServersCache, } from '../lib/turn.js';
/**
 * 🔥 Модуль `turn.ts` — единственное, что даёт звонкам шанс пройти через
 * симметричный NAT (когда нужен TURN-релей). Проверяем две вещи: разбор
 * ответа сервиса (форматы бывают разными) и сам запрос с кэшем — чтобы один
 * набор реквизитов раздавался всем, а не запрашивался на каждый звонок.
 *
 * `fetch` здесь подменяем через `globalThis`, потому что модуль шлёт настоящий
 * сетевой запрос; в тесте сети нет.
 */
afterEach(() => {
    resetTurnIceServersCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
describe('parseIceServers', () => {
    it('принимает голый массив iceServers', () => {
        const result = parseIceServers([
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: ['turn:1.2.3.4:3478'], username: 'u', credential: 'p' },
        ]);
        expect(result).toHaveLength(2);
        // 🔥 urls всегда массив — это корректная форма для RTCIceServer и не даёт
        // TS сомневаться в том, что элемент не undefined.
        expect(result[0]?.urls).toEqual(['stun:stun.l.google.com:19302']);
        expect(result[1]?.urls).toEqual(['turn:1.2.3.4:3478']);
        expect(result[1]?.username).toBe('u');
        expect(result[1]?.credential).toBe('p');
    });
    it('принимает объект с полем iceServers', () => {
        const result = parseIceServers({ iceServers: [{ urls: 'turn:5.6.7.8:3478' }] });
        expect(result).toHaveLength(1);
        expect(result[0]?.urls).toEqual(['turn:5.6.7.8:3478']);
    });
    it('отбрасывает схемы, которые WebRTC не понимает', () => {
        const result = parseIceServers([
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'http://evil.example.com' },
            { urls: 'turns:9.9.9.9:5349' },
        ]);
        expect(result.map((s) => s.urls)).toEqual([
            ['stun:stun.l.google.com:19302'],
            ['turns:9.9.9.9:5349'],
        ]);
    });
    it('возвращает пустой список на мусор и пропущенный urls', () => {
        expect(parseIceServers(null)).toEqual([]);
        expect(parseIceServers('not-an-object')).toEqual([]);
        expect(parseIceServers([{ credential: 'x' }])).toEqual([]);
        expect(parseIceServers([42])).toEqual([]);
    });
});
describe('fetchTurnIceServers', () => {
    function stubFetch(body, ok = true) {
        const fetchMock = vi.fn().mockResolvedValue({
            ok,
            status: ok ? 200 : 500,
            json: async () => body,
        });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }
    it('запрашивает сервис и возвращает распарсенные серверы', async () => {
        const fetchMock = stubFetch({ iceServers: [{ urls: 'turn:1.2.3.4:3478' }] });
        const servers = await fetchTurnIceServers('https://relay.example/ice', 600);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(servers).toEqual([{ urls: ['turn:1.2.3.4:3478'] }]);
    });
    it('кэширует результат: повторный вызов не уходит в сеть', async () => {
        const fetchMock = stubFetch({ iceServers: [{ urls: 'turn:1.2.3.4:3478' }] });
        const now = () => 1000;
        const first = await fetchTurnIceServers('https://relay.example/ice', 600, now);
        const second = await fetchTurnIceServers('https://relay.example/ice', 600, now);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
    });
    it('при сбое сети возвращает пустой список, а не бросает', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);
        const servers = await fetchTurnIceServers('https://relay.example/ice', 600);
        expect(servers).toEqual([]);
    });
    it('при сбое отдаёт протухший кэш, если он есть', async () => {
        stubFetch({ iceServers: [{ urls: 'turn:1.2.3.4:3478' }] });
        const now = () => 1000;
        const cached = await fetchTurnIceServers('https://relay.example/ice', 600, now);
        // Время прошло, но кэш ещё не протух (ttl 600с, сейчас +2000мс).
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);
        const fallback = await fetchTurnIceServers('https://relay.example/ice', 600, () => 3000);
        expect(fallback).toEqual(cached);
    });
});
//# sourceMappingURL=turn.test.js.map