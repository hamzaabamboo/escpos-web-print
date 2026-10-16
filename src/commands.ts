import type { Bitmap } from './bitmap.js';

/** Paper cut after printing. Pocket printers without a cutter ignore cut commands, so `none` is the default. */
export type CutMode = 'none' | 'full' | 'partial';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** `ESC @`: resets the printer to its power-on state. Send it first. */
export function initialize() {
  return new Uint8Array([ESC, 0x40]);
}

/**
 * `ESC 7 n1 n2 n3`: print head heating control on GOOJPRT/PT-210 class printers.
 *
 * @param time Heating time 0–255. Higher is darker and slower.
 * @param maxDots Maximum dots heated at once, 0–7 (in units of 8 dots).
 * @param interval Heating interval 0–255. Lower is faster.
 */
export function heating(time: number, maxDots = 7, interval = 2) {
  return new Uint8Array([ESC, 0x37, byte(maxDots, 'maxDots'), byte(time, 'heating time'), byte(interval, 'interval')]);
}

/**
 * `ESC J n`: feeds paper by `dots` dots (1 dot ≈ 0.125mm at 203 dpi). Returns no bytes for 0.
 *
 * @param dots 0–255.
 */
export function feedDots(dots: number) {
  return dots > 0 ? new Uint8Array([ESC, 0x4a, byte(dots, 'feed')]) : new Uint8Array();
}

/**
 * `ESC d n`: prints the buffer and feeds `lines` text lines.
 *
 * @param lines 0–255.
 */
export function feedLines(lines: number) {
  return new Uint8Array([ESC, 0x64, byte(lines, 'lines')]);
}

/**
 * `GS V m n`: feeds `feed` and cuts. Only for printers with an auto-cutter.
 *
 * @param mode `full` (m = 65) or `partial` (m = 66).
 * @param feed Extra feed before the cut, 0–255.
 */
export function cut(mode: Exclude<CutMode, 'none'>, feed = 0) {
  return new Uint8Array([GS, 0x56, mode === 'full' ? 0x41 : 0x42, byte(feed, 'feed')]);
}

/**
 * ASCII text followed by a line feed, printed in the printer's built-in font.
 * Non-ASCII characters become `?`; render other scripts as raster images instead.
 *
 * @param value The line to print.
 */
export function text(value: string) {
  const bytes = new Uint8Array(value.length + 1);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes[index] = code < 0x80 ? code : 0x3f;
  }
  bytes[value.length] = LF;
  return bytes;
}

/**
 * `GS v 0`: prints rows of a bitmap as one raster image block.
 *
 * @param bitmap Source bitmap.
 * @param top First row to include.
 * @param rows Number of rows. Defaults to the rest of the bitmap.
 */
export function rasterImage(bitmap: Bitmap, top = 0, rows = bitmap.height - top) {
  if (!Number.isInteger(top) || !Number.isInteger(rows) || top < 0 || rows < 1 || top + rows > bitmap.height) {
    throw new RangeError('Raster rows are outside the bitmap.');
  }
  if (bitmap.bytesPerRow > 0xffff || rows > 0xffff) {
    throw new RangeError('Raster image is too large for GS v 0.');
  }
  const output = new Uint8Array(8 + bitmap.bytesPerRow * rows);
  output.set([GS, 0x76, 0x30, 0x00, bitmap.bytesPerRow & 0xff, bitmap.bytesPerRow >> 8, rows & 0xff, rows >> 8]);
  output.set(bitmap.data.subarray(top * bitmap.bytesPerRow, (top + rows) * bitmap.bytesPerRow), 8);
  return output;
}

function byte(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be an integer from 0 to 255.`);
  }
  return value;
}
