import { afterEach, describe, expect, it, vi } from 'vitest';
import { iceServers } from './callSettings';

/**
 * 🔥 Список ICE-серверов — то, из-за чего звонки работают или не работают вовсе.
 * Без `turn` часть собеседников (мобильный интернет, симметричный NAT) не
 * соединится никогда, поэтому здесь важно, чтобы адрес релея действительно
 * доезжал до браузера, а не терялся по дороге.
 *
 * `import.meta.env` в тестах подменяем через `vi.stubEnv` — Vite подставляет
 * туда переменные `VITE_*` при сборке.
 */
describe('iceServers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('без настроенного релея оставляет только публичный STUN', () => {
    vi.stubEnv('VITE_TURN_URL', '');
    expect(iceServers()).toEqual([
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
        ],
      },
    ]);
  });

  it('добавляет TURN вместе с логином и паролем', () => {
    vi.stubEnv('VITE_TURN_URL', 'turn:203.0.113.7:3478');
    vi.stubEnv('VITE_TURN_USERNAME', 'yargram');
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret');

    const servers = iceServers();
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({
      urls: ['turn:203.0.113.7:3478'],
      username: 'yargram',
      credential: 'secret',
    });
  });

  it('принимает несколько адресов через запятую и чистит пробелы', () => {
    vi.stubEnv('VITE_TURN_URL', 'turn:1.2.3.4:3478, turns:5.6.7.8:5349');
    expect(iceServers()[1]?.urls).toEqual(['turn:1.2.3.4:3478', 'turns:5.6.7.8:5349']);
  });

  it('без логина не подставляет пустые username и credential', () => {
    vi.stubEnv('VITE_TURN_URL', 'turn:203.0.113.7:3478');
    vi.stubEnv('VITE_TURN_USERNAME', '');
    vi.stubEnv('VITE_TURN_CREDENTIAL', '');

    const relay = iceServers()[1] as RTCIceServer;
    expect(relay).toEqual({ urls: ['turn:203.0.113.7:3478'] });
    expect('username' in relay).toBe(false);
    expect('credential' in relay).toBe(false);
  });
});
