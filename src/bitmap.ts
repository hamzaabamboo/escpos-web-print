/** RGBA pixels, e.g. the result of `CanvasRenderingContext2D.getImageData`. */
export type ImageDataLike = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

/** A 1-bit image packed MSB-first, 8 pixels per byte, the layout `GS v 0` expects. A set bit is a black dot. */
export type Bitmap = {
  /** Width in dots. */
  width: number;
  /** Height in dots. */
  height: number;
  /** `ceil(width / 8)`. */
  bytesPerRow: number;
  /** `bytesPerRow * height` bytes, row by row. */
  data: Uint8Array;
};

/**
 * How gray is turned into black and white dots.
 * - `atkinson`: error diffusion that keeps photos and gradients readable and text crisp.
 * - `threshold`: every pixel darker than `threshold` becomes black. Best for pure line art.
 */
export type DitherMode = 'atkinson' | 'threshold';

export type BitmapOptions = {
  /** Defaults to `atkinson`. */
  dither?: DitherMode;
  /** Gray level (0–255) below which a pixel is black. Defaults to 128. Raise it (e.g. 200) to make thin anti-aliased text bolder in `threshold` mode. */
  threshold?: number;
};

const ATKINSON_SPREAD = [
  [1, 0],
  [2, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [0, 2]
] as const;

/**
 * Converts RGBA pixels to a packed 1-bit bitmap. Transparent pixels count as white paper.
 *
 * @param image RGBA pixel data.
 * @param options Dithering mode and threshold.
 * @returns A bitmap ready for `encodeBitmap` or `rasterImage`.
 */
export function toBitmap(image: ImageDataLike, options: BitmapOptions = {}): Bitmap {
  const { width, height } = image;
  const dither = options.dither ?? 'atkinson';
  const threshold = options.threshold ?? 128;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Image width and height must be positive integers.');
  }
  if (image.data.length < width * height * 4) {
    throw new RangeError('Image data must be RGBA with width * height * 4 bytes.');
  }

  const gray = toGray(image);
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = gray[index];
      const black = value < threshold;
      if (black) {
        data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
      if (dither === 'atkinson') {
        const error = (value - (black ? 0 : 255)) / 8;
        for (const [dx, dy] of ATKINSON_SPREAD) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny < height) {
            gray[ny * width + nx] += error;
          }
        }
      }
    }
  }

  return { width, height, bytesPerRow, data };
}

function toGray({ width, height, data }: ImageDataLike) {
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;
    const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    gray[index] = luminance * alpha + 255 * (1 - alpha);
  }
  return gray;
}
