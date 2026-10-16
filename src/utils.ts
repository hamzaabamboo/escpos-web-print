import { feedLines, initialize, text } from './commands.js';

/** Resolution of common 58mm and 80mm thermal print heads, in dots per inch. */
export const DEFAULT_DPI = 203;

/** Printable width in dots for common paper sizes at 203 dpi. */
export const PAPER_WIDTH = {
  /** 58mm paper, 48mm printable (GOOJPRT PT-210 and most pocket printers). */
  '58mm': 384,
  /** 80mm paper, 72mm printable. */
  '80mm': 576
} as const;

/**
 * Converts millimetres to printer dots.
 *
 * @param millimetres Length in millimetres.
 * @param dpi Print head resolution. Defaults to 203 dpi (8 dots per mm).
 * @returns The nearest whole number of dots.
 */
export function mmToDots(millimetres: number, dpi = DEFAULT_DPI) {
  return Math.round((millimetres * dpi) / 25.4);
}

/**
 * Converts printer dots to millimetres.
 *
 * @param dots Length in dots.
 * @param dpi Print head resolution. Defaults to 203 dpi.
 * @returns Length in millimetres.
 */
export function dotsToMm(dots: number, dpi = DEFAULT_DPI) {
  return (dots * 25.4) / dpi;
}

/**
 * Builds a plain-text self-test that uses the printer's built-in font instead of raster graphics.
 * If this prints but images do not, the problem is in the image path, not the connection.
 *
 * @param lines ASCII lines to print. Non-ASCII characters become `?`.
 * @returns ESC/POS byte parts ready for `sendParts`.
 */
export function textTestPage(lines: string[] = ['PRINTER TEST', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789']) {
  return [initialize(), ...lines.map(text), feedLines(4)];
}

/**
 * Formats bytes as space-separated hex for logging and debugging.
 *
 * @param bytes Bytes to format.
 * @param limit Maximum number of bytes to include. The rest is summarised.
 * @returns A string such as `1b 40 1d 76 30 00 … (+1152 bytes)`.
 */
export function toHex(bytes: Uint8Array, limit = 64) {
  const shown = Array.from(bytes.subarray(0, limit), (value) => value.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > limit ? `${shown} … (+${bytes.length - limit} bytes)` : shown;
}
