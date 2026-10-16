# Methodology

Why each stage of the pipeline exists and why it is built the way it is.

## 1. Raster, not text

Cheap printers ship with a Latin/GB code page and nothing else. Text commands can't print Japanese, emoji or custom fonts, and every model formats them slightly differently. So everything is drawn on a canvas with the fonts you want and sent as a bitmap. The only text command kept is `textTestPage`, which is there for diagnosis.

## 2. Layout (`layoutForPrinter`)

1. **Trim.** Find the bounding box of non-blank pixels (`contentBox`) and crop to it. Designs usually carry their own whitespace; without trimming, that whitespace is scaled into the paper and the useful content gets smaller.
2. **Rotate.** Landscape designs (tickets, labels) are rotated 90° or 270° so they run along the paper, which is endless in the feed direction but only 48mm wide.
3. **Scale to the head.** The cropped content is scaled so its cross-paper size equals `printWidth - 2 × margin`. The output is always exactly `printWidth` dots wide, so the printer never has to clip or wrap.
4. **Pad.** `paddingBefore` / `paddingAfter` add white rows along the feed; `margin` adds white columns at the paper edges.

Rotation is done around the content centre with a single `drawImage`, so all four rotations share one code path.

## 3. Bitmap (`toBitmap`)

The print head can only burn a dot or not burn it. Pixels go through:

1. **Alpha onto white.** Transparent pixels become paper colour: `gray = luminance × α + 255 × (1 − α)`.
2. **Luminance.** ITU-R BT.601 weights: `0.299 R + 0.587 G + 0.114 B`.
3. **1-bit conversion.**
   - `atkinson` (default) diffuses 6/8 of each pixel's error to six neighbours (two right, three below, one two rows down). Dropping a quarter of the error gives higher contrast than Floyd–Steinberg, which suits thermal paper's limited dot gain: logos and photos keep their tones, and pure black text stays crisp because black and white pixels have no error to spread.
   - `threshold` maps every pixel below `threshold` to black, for line art and barcodes.
4. **Packing.** 8 pixels per byte, most significant bit first, rows padded to a whole byte: the layout `GS v 0` expects.

## 4. Encoding (`encodeBitmap`)

```
ESC @                      reset
[ESC 7 n1 n2 n3]           optional heating (darkness)
GS v 0 0 xL xH yL yH data  × N   one block per 24 rows
[ESC J n | GS V m n]       optional feed or cut
```

The image is split into **24-row strips**, each a complete `GS v 0` block, as the PT-210 SDK does. One huge block can exceed the printer's receive buffer before printing starts; small blocks are printed as they arrive, and the paper advances exactly the declared rows per block, so the strips join seamlessly.

No trailing line feed is sent, and the cut defaults to `none`: a stray line feed or a cut on a printer without a cutter only wastes paper. Feed at the end is controlled by `paddingAfter` (blank rows in the image) or `feedAfter` (`ESC J`).

## 5. Sending (`sendParts`)

These printers have small buffers and no flow control over BLE, so bytes are paced:

- Each part (the init, each strip, the ending) is written in chunks of at most `transport.maxChunkSize` bytes.
- 40 ms after every chunk covers a typical BLE connection interval (~30 ms), matching the SDK's `CHUNK_DELAY`.
- 50 ms after every strip gives the paper motor time to advance, matching the SDK's minimum post-strip throttle.
- 300 ms after the last part before the promise resolves, so disconnecting right away doesn't cut the tail.

A 384×1000-dot ticket is about 48 KB; over BLE the pacing delays alone add up to about 13 seconds (268 chunks × 40 ms + 42 strips × 50 ms).

## 6. Transports

A `Transport` has five members: `label`, `deviceName`, `maxChunkSize`, `write(chunk)` and `close()`. BLE, Serial and USB are thin adapters around the browser APIs; anything else (a WebSocket to a print server, Node `serialport`) can implement the same shape and reuse the rest of the pipeline.

## 7. Footprint

- No runtime dependencies. Web Bluetooth and Web Serial types are declared locally with only the members used, so consumers need no `@types` packages.
- ESM with explicit `.js` import specifiers: it loads in browsers and bundlers without transpiling.
- `sideEffects: false` and one function per concern, so bundlers drop whatever you don't import.
