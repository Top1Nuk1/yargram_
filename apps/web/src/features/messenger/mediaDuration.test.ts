import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverAudioDuration, finiteDuration, MAX_DURATION_PROBE_BYTES, seekTime } from './mediaDuration';

afterEach(() => vi.unstubAllGlobals());
describe('safe media duration', () => {
  it('rejects invalid metadata and clamps only known finite seeks', () => {
    for (const value of [NaN, Infinity, 0, -1, undefined, '20']) expect(finiteDuration(value)).toBeUndefined();
    expect(finiteDuration(0.25)).toBe(0.25);
    expect(seekTime(12, undefined)).toBeUndefined();
    expect(seekTime(12, Infinity)).toBeUndefined();
    expect(seekTime(Infinity, 30)).toBeUndefined();
    expect(seekTime(40, 30)).toBe(30);
    expect(seekTime(-1, 30)).toBe(0);
  });
  it('does not fetch files above the normal attachment limit or cancelled requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('AudioContext', vi.fn());
    expect(await discoverAudioDuration('/big', MAX_DURATION_PROBE_BYTES + 1, new AbortController().signal)).toBeUndefined();
    const cancelled = new AbortController();
    cancelled.abort();
    expect(await discoverAudioDuration('/cancelled', 1, cancelled.signal)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds actual streamed bytes even when content length is missing', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const read = vi.fn().mockResolvedValue({ done: false, value: { byteLength: MAX_DURATION_PROBE_BYTES + 1 } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: { getReader: () => ({ read, cancel, releaseLock }) } }));
    const context = vi.fn();
    vi.stubGlobal('AudioContext', context);
    expect(await discoverAudioDuration('/lying-size', 100, new AbortController().signal)).toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(context).not.toHaveBeenCalled();
  });
});
