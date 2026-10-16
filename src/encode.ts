import type { Bitmap } from './bitmap.js';
import { cut, feedDots, heating, initialize, rasterImage, type CutMode } from './commands.js';

export type EncodeOptions = {
  /** Rows per `GS v 0` block. Defaults to 24, which small printer buffers handle reliably. */
  stripHeight?: number;
  /** Sends `ESC 7` with this heating time (1–255) after `ESC @`. Omit or 0 to keep the printer default. */
  heatingTime?: number;
  /** Dots to feed after the image (`ESC J`), or before the cut when `cut` is set. Defaults to 0. */
  feedAfter?: number;
  /** Defaults to `none`. */
  cut?: CutMode;
};

/**
 * Encodes a bitmap as ESC/POS: `ESC @`, optional `ESC 7`, the image in `GS v 0` strips, then an optional feed or cut.
 * Each strip is a separate part so `sendParts` can pause between them.
 *
 * @param bitmap The image to print, at most the printer's width in dots.
 * @param options Strip height, heating, trailing feed and cut.
 * @returns Byte parts in sending order.
 */
export function encodeBitmap(bitmap: Bitmap, options: EncodeOptions = {}) {
  const stripHeight = options.stripHeight ?? 24;
  const cutMode = options.cut ?? 'none';
  const feedAfter = options.feedAfter ?? 0;
  if (!Number.isInteger(stripHeight) || stripHeight < 1) {
    throw new RangeError('stripHeight must be a positive integer.');
  }

  const parts = [options.heatingTime ? concat([initialize(), heating(options.heatingTime)]) : initialize()];
  for (let top = 0; top < bitmap.height; top += stripHeight) {
    parts.push(rasterImage(bitmap, top, Math.min(stripHeight, bitmap.height - top)));
  }
  const ending = cutMode === 'none' ? feedDots(feedAfter) : cut(cutMode, feedAfter);
  if (ending.length > 0) {
    parts.push(ending);
  }
  return parts;
}

/**
 * Joins byte parts into one buffer, e.g. to save a `.bin` file.
 *
 * @param parts Byte arrays in order.
 */
export function concat(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
