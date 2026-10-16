import { toBitmap, type BitmapOptions } from './bitmap.js';

/** The canvas produced by `layoutForPrinter`: `OffscreenCanvas` when there is no `document` (e.g. in a worker). */
export type PrintCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Clockwise rotation in degrees. Use 90 or 270 to print a landscape design along the paper. */
export type Rotation = 0 | 90 | 180 | 270;

export type LayoutOptions = {
  /** Printable width in dots, a multiple of 8. Defaults to 384 (58mm paper). See `PAPER_WIDTH`. */
  printWidth?: number;
  /** Clockwise rotation. Defaults to 0. */
  rotate?: Rotation;
  /** Crops blank borders first so the content fills the full width. Defaults to true. */
  trim?: boolean;
  /** Channel value (0–255) at or above which a pixel counts as blank when trimming. Defaults to 245. */
  trimThreshold?: number;
  /** Blank dots on both sides across the paper. Defaults to 0. */
  margin?: number;
  /** Blank dots before the content along the feed direction. Defaults to 0. */
  paddingBefore?: number;
  /** Blank dots after the content along the feed direction. Defaults to 0. */
  paddingAfter?: number;
};

type Source = CanvasImageSource & { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Fits an image to the paper: trims blank borders, rotates, scales to the printable width and adds margins.
 * The result is exactly `printWidth` dots wide on a white background.
 *
 * @example
 * const canvas = layoutForPrinter(ticket, { rotate: 90, margin: 12, paddingAfter: 96 });
 *
 * @param source Any canvas-drawable source with `width` and `height`.
 * @param options Width, rotation, trimming and margins.
 */
export function layoutForPrinter(source: Source, options: LayoutOptions = {}): PrintCanvas {
  const printWidth = options.printWidth ?? 384;
  const rotate = options.rotate ?? 0;
  const margin = options.margin ?? 0;
  const paddingBefore = options.paddingBefore ?? 0;
  const paddingAfter = options.paddingAfter ?? 0;
  if (!Number.isInteger(printWidth) || printWidth < 8 || printWidth % 8 !== 0) {
    throw new RangeError('printWidth must be a positive multiple of 8 dots.');
  }
  if (![0, 90, 180, 270].includes(rotate)) {
    throw new RangeError('rotate must be 0, 90, 180 or 270.');
  }
  for (const [name, value] of [['margin', margin], ['paddingBefore', paddingBefore], ['paddingAfter', paddingAfter]] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer.`);
    }
  }
  if (printWidth - margin * 2 < 8) {
    throw new RangeError('margin leaves no printable width.');
  }

  const box = options.trim === false ? { x: 0, y: 0, width: source.width, height: source.height } : contentBox(source, options.trimThreshold ?? 245);
  const across = printWidth - margin * 2;
  const sideways = rotate === 90 || rotate === 270;
  const scale = across / (sideways ? box.height : box.width);
  const length = Math.max(1, Math.round((sideways ? box.width : box.height) * scale));

  const canvas = createCanvas(printWidth, paddingBefore + length + paddingAfter);
  const context = getContext(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(margin + across / 2, paddingBefore + length / 2);
  context.rotate((rotate * Math.PI) / 180);
  const drawWidth = sideways ? length : across;
  const drawHeight = sideways ? across : length;
  context.drawImage(source, box.x, box.y, box.width, box.height, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return canvas;
}

/**
 * Reads a canvas and converts it to a 1-bit bitmap.
 *
 * @param canvas Typically the result of `layoutForPrinter`.
 * @param options Dithering mode and threshold.
 */
export function canvasToBitmap(canvas: PrintCanvas, options?: BitmapOptions) {
  return toBitmap(getContext(canvas).getImageData(0, 0, canvas.width, canvas.height), options);
}

/**
 * Finds the bounding box of non-blank pixels. Useful for trimming logos with transparent or white margins.
 *
 * @param source Any canvas-drawable source with `width` and `height`.
 * @param threshold Channel value at or above which a pixel counts as blank. Defaults to 245.
 * @returns The box in source pixels, or the whole image when it is blank.
 */
export function contentBox(source: Source, threshold = 245): Box {
  const canvas = createCanvas(source.width, source.height);
  const context = getContext(canvas);
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const ink = data[offset + 3] > 16 && (data[offset] < threshold || data[offset + 1] < threshold || data[offset + 2] < threshold);
      if (ink) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < 0 ? { x: 0, y: 0, width: canvas.width, height: canvas.height } : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function createCanvas(width: number, height: number): PrintCanvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

function getContext(canvas: PrintCanvas): Context2D {
  const context = canvas.getContext('2d', { willReadFrequently: true }) as Context2D | null;
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  return context;
}
