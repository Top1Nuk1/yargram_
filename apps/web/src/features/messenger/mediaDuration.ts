import { fixWebmDuration } from '@fix-webm-duration/fix';

// Match the normal attachment limit; never download unbounded media to probe it.
export const MAX_DURATION_PROBE_BYTES = 100 * 1024 * 1024;

export function finiteDuration(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function seekTime(value: number, duration: number | undefined): number | undefined {
  if (!finiteDuration(duration) || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(value, duration!));
}

/** MediaRecorder WebM often has no duration header. Decode a complete, bounded
 * response without seeking the live player (large seeks can jump it to the end).
 * Failure leaves duration unknown and playback remains available.
 */
export async function discoverAudioDuration(url: string, size: number, signal: AbortSignal): Promise<{ duration: number; blob?: Blob } | undefined> {
  if (size > MAX_DURATION_PROBE_BYTES || size < 0 || signal.aborted) return undefined;
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass) return undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 30_000);
  let context: AudioContext | undefined;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) return undefined;
    const declaredLength = Number(response.headers.get('content-length'));
    if (declaredLength > MAX_DURATION_PROBE_BYTES) return undefined;
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > MAX_DURATION_PROBE_BYTES || controller.signal.aborted) {
          await reader.cancel();
          return undefined;
        }
        chunks.push(result.value as Uint8Array<ArrayBuffer>);
      }
    } finally {
      reader.releaseLock();
    }
    if (!bytes || controller.signal.aborted) return undefined;
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/webm' });
    const buffer = await blob.arrayBuffer();
    const webm = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    const isWebm = webm.length === 4 && webm[0] === 0x1a && webm[1] === 0x45 && webm[2] === 0xdf && webm[3] === 0xa3;
    if (controller.signal.aborted) return undefined;
    context = new AudioContextClass();
    const decoded = await context.decodeAudioData(buffer);
    const duration = finiteDuration(decoded.duration);
    if (!duration || controller.signal.aborted) return undefined;
    const repaired = isWebm ? await fixWebmDuration(blob, duration * 1000, { logger: false }) : undefined;
    return controller.signal.aborted ? undefined : { duration, blob: repaired };
  } catch {
    return undefined;
  } finally {
    controller.abort();
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    if (context) void context.close().catch(() => undefined);
  }
}
