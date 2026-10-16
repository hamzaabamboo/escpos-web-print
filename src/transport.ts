/** A connected printer. Implement this to add another connection type (WebUSB, WebSocket bridge, Node serial…). */
export type Transport = {
  /** Human-readable name for the UI. */
  label: string;
  /** Device name reported by the hardware, if any. Store it to filter the chooser next time. */
  deviceName: string | null;
  /** Largest write the connection accepts in one call. */
  maxChunkSize: number;
  /** Writes one chunk. Resolve once the connection has accepted it. */
  write: (chunk: Uint8Array) => Promise<void>;
  /** Disconnects. */
  close: () => Promise<void>;
};

export type SendOptions = {
  /** Bytes per write. Capped at `transport.maxChunkSize`, which is also the default. Lower it if output is garbled. */
  chunkSize?: number;
  /** Pause after every write, in ms. Defaults to 40. */
  chunkDelay?: number;
  /** Pause after every part (e.g. each raster strip) so the paper motor keeps up, in ms. Defaults to 50. */
  partDelay?: number;
  /** Pause after the last part before resolving, in ms. Defaults to 300. */
  flushDelay?: number;
  /** Aborts sending with an `AbortError`. */
  signal?: AbortSignal;
  /** Called after every write with bytes sent so far and the total. */
  onProgress?: (sent: number, total: number) => void;
};

/**
 * Sends byte parts in paced chunks. Cheap printers have small buffers and no flow control,
 * so unpaced writes overflow them and print nothing or garbage.
 *
 * @param transport A connected printer.
 * @param parts Byte parts, e.g. from `encodeBitmap`.
 * @param options Chunk size, pacing, abort signal and progress callback.
 */
export async function sendParts(transport: Transport, parts: Uint8Array[], options: SendOptions = {}) {
  const chunkSize = Math.min(Math.floor(options.chunkSize ?? transport.maxChunkSize), transport.maxChunkSize);
  const chunkDelay = options.chunkDelay ?? 40;
  const partDelay = options.partDelay ?? 50;
  const flushDelay = options.flushDelay ?? 300;
  const { signal } = options;
  if (!Number.isFinite(chunkSize) || chunkSize < 1) {
    throw new RangeError('chunkSize must be at least 1.');
  }

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  let sent = 0;
  for (const part of parts) {
    for (let offset = 0; offset < part.length; offset += chunkSize) {
      throwIfAborted(signal);
      const chunk = part.subarray(offset, Math.min(offset + chunkSize, part.length));
      await transport.write(chunk);
      sent += chunk.length;
      options.onProgress?.(sent, total);
      await wait(chunkDelay, signal);
    }
    await wait(partDelay, signal);
  }
  await wait(flushDelay, signal);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Printing was aborted.', 'AbortError');
  }
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Printing was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
