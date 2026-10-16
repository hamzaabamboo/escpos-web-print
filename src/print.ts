import type { BitmapOptions } from './bitmap.js';
import { encodeBitmap, type EncodeOptions } from './encode.js';
import { canvasToBitmap, layoutForPrinter, type LayoutOptions } from './layout.js';
import { sendParts, type SendOptions, type Transport } from './transport.js';

/** Every option of the pipeline: layout, bitmap conversion, ESC/POS encoding and sending. */
export type PrintOptions = LayoutOptions & BitmapOptions & EncodeOptions & SendOptions;

/**
 * Runs layout, bitmap conversion and encoding without sending anything.
 * Use it for previews, for saving the bytes to a file, or for your own transport.
 *
 * @param source Any canvas-drawable source with `width` and `height` (canvas, image, bitmap).
 * @param options Layout, bitmap and encoding options.
 * @returns The laid-out canvas, its 1-bit bitmap and the ESC/POS byte parts.
 */
export function renderForPrinter(source: CanvasImageSource & { width: number; height: number }, options: PrintOptions = {}) {
  const canvas = layoutForPrinter(source, options);
  const bitmap = canvasToBitmap(canvas, options);
  const parts = encodeBitmap(bitmap, options);
  return { canvas, bitmap, parts };
}

/**
 * Lays out, dithers, encodes and sends an image to a connected printer in one call.
 *
 * @example
 * const printer = await requestBluetoothPrinter();
 * await printCanvas(printer, canvas, { rotate: 90, paddingAfter: 96 });
 *
 * @param transport A connected printer from `requestBluetoothPrinter`, `requestSerialPrinter` or your own `Transport`.
 * @param source Any canvas-drawable source with `width` and `height`.
 * @param options Layout, bitmap, encoding and sending options.
 * @returns The ESC/POS byte parts that were sent.
 */
export async function printCanvas(transport: Transport, source: CanvasImageSource & { width: number; height: number }, options: PrintOptions = {}) {
  const { parts } = renderForPrinter(source, options);
  await sendParts(transport, parts, options);
  return parts;
}
