import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔥 `turnCredentials.ts` запрашивает релей у своего сервера прямо перед звонком
 * и никогда не бросает: даже если сервис упал, звонок должен начаться на одном
 * STUN. Здесь подменяем `request` (он уходит в сеть через `fetch`), чтобы
 * проверить разбор ответа, кэш между вызовами и поведение при сбое.
 */
vi.mock('../../api/client', () => ({
  request: vi.fn(),
}));

import { request } from '../../api/client';
import {
  dynamicIceServers,
  refreshTurnCredentials,
  resetTurnCredentialsCache,
} from './turnCredentials';

const mockedRequest = vi.mocked(request);

afterEach(() => {
  resetTurnCredentialsCache();
  vi.restoreAllMocks();
});

describe('turnCredentials', () => {
  it('без запроса релей пуст', () => {
    expect(dynamicIceServers()).toEqual([]);
  });

  it('сохраняет полученные реле и отдаёт их через dynamicIceServers', async () => {
    mockedRequest.mockResolvedValue({
      iceServers: [{ urls: 'turn:1.2.3.4:3478', username: 'u', credential: 'p' }],
    });

    const servers = await refreshTurnCredentials('tok');
    expect(mockedRequest).toHaveBeenCalledWith('/api/calls/ice-servers', { token: 'tok' });
    expect(servers).toEqual([{ urls: 'turn:1.2.3.4:3478', username: 'u', credential: 'p' }]);
    // Один url нормализуется в строку (форма RTCIceServer).
    expect(dynamicIceServers()).toEqual(servers);
  });

  it('несколько адресов остаются массивом', async () => {
    mockedRequest.mockResolvedValue({
      iceServers: [{ urls: ['turn:1.2.3.4:3478', 'turns:5.6.7.8:5349'] }],
    });
    const servers = await refreshTurnCredentials();
    expect(servers[0]?.urls).toEqual(['turn:1.2.3.4:3478', 'turns:5.6.7.8:5349']);
  });

  it('при сбое сервиса не бросает и оставляет пустой список', async () => {
    mockedRequest.mockRejectedValue(new Error('boom'));
    const servers = await refreshTurnCredentials();
    expect(servers).toEqual([]);
    expect(dynamicIceServers()).toEqual([]);
  });

  it('два одновременных звонка шлют один запрос (общий in-flight)', async () => {
    mockedRequest.mockResolvedValue({
      iceServers: [{ urls: 'turn:1.2.3.4:3478' }],
    });
    const [a, b] = await Promise.all([refreshTurnCredentials(), refreshTurnCredentials()]);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});
