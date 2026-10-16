# escpos-web-print

Print images to cheap ESC/POS thermal receipt printers straight from the browser, over **Web Bluetooth**, **Web Serial** or **WebUSB**. No drivers, no backend, no runtime dependencies.

Draw anything on a `<canvas>` (text in any language, logos, QR codes, photos) and the library lays it out for the paper, dithers it to 1-bit, encodes it as ESC/POS raster commands and sends it in paced chunks that small printer buffers can keep up with.

- Zero runtime dependencies, ESM only, `sideEffects: false`, about 27 KB of unminified JS including JSDoc
- Tree-shakeable: use only the encoder, only a transport, or the one-call `printCanvas`
- Works with GOOJPRT PT-210 / Zjiang / "MTP-II" style 58mm Bluetooth printers out of the box, plus any ESC/POS printer that accepts `GS v 0`
- Typed, documented with JSDoc

```sh
npm install escpos-web-print
```

Or straight from GitHub: `npm install github:hamzaabamboo/escpos-web-print#v0.1.1`.

## Quick start

```ts
import { printCanvas, requestBluetoothPrinter } from 'escpos-web-print';

button.addEventListener('click', async () => {
  const printer = await requestBluetoothPrinter();
  await printCanvas(printer, canvas, { rotate: 90, paddingAfter: 96 });
});
```

`requestBluetoothPrinter` must run inside a user gesture (a click). The browser shows its device chooser, filtered to devices that advertise a known printer service.

A complete page with no build step is in [`examples/index.html`](examples/index.html). Run it with `npm run build && npx serve .` and open `/examples/`.

Without a bundler, import from a CDN:

```html
<script type="module">
  import { printCanvas, requestBluetoothPrinter } from 'https://esm.sh/escpos-web-print@0.1.1';
</script>
```

## Browser support

| API | Chrome / Edge desktop | Chrome Android | Safari / Firefox |
| --- | --- | --- | --- |
| Web Bluetooth (`requestBluetoothPrinter`) | Yes | Yes | No |
| Web Serial (`requestSerialPrinter`) | Yes | No | No |
| WebUSB (`requestUsbPrinter`) | Yes | Yes | No |

Both need a secure context: HTTPS or `http://localhost`.

## How it works

```
canvas ──layoutForPrinter──▶ printer-width canvas ──canvasToBitmap──▶ 1-bit bitmap
       (trim, rotate, scale, margins)            (grayscale + dithering)

bitmap ──encodeBitmap──▶ ESC/POS parts ──sendParts──▶ Transport (BLE / Serial / yours)
       (ESC @, GS v 0 strips, feed/cut)  (paced chunks)
```

Every stage is exported, so you can stop anywhere: preview the bitmap, save the bytes to a file, or plug in your own transport. The reasoning behind each step is in [docs/methodology.md](docs/methodology.md). Printer models, UUIDs and troubleshooting are in [docs/hardware.md](docs/hardware.md).

## Recipes

### Print a landscape ticket along the paper

```ts
await printCanvas(printer, ticketCanvas, {
  rotate: 90,          // landscape design printed lengthwise
  margin: 12,          // 1.5mm on both paper edges
  paddingBefore: 48,   // 6mm blank before
  paddingAfter: 96     // 12mm blank after, so the print clears the tear bar
});
```

Sizes are in printer dots. At 203 dpi, 8 dots = 1mm; use `mmToDots(12)` if you think in millimetres.

### Remember the printer between visits

```ts
const printer = await requestBluetoothPrinter({ namePrefix: localStorage.printerName });
if (printer.deviceName) localStorage.printerName = printer.deviceName;
```

### Printer missing from the chooser

Some printers don't advertise their service. Show every nearby device instead:

```ts
await requestBluetoothPrinter({ acceptAllDevices: true });
```

### Preview or save without printing

```ts
import { concat, renderForPrinter } from 'escpos-web-print';

const { canvas, bitmap, parts } = renderForPrinter(ticketCanvas, { rotate: 90 });
const file = new Blob([concat(parts)], { type: 'application/octet-stream' });
```

### Test the connection without graphics

```ts
import { sendParts, textTestPage } from 'escpos-web-print';

await sendParts(printer, textTestPage());
```

If the text prints but images don't, the connection is fine and the problem is in the image path.

### Use a serial port (USB or Bluetooth SPP)

```ts
import { printCanvas, requestSerialPrinter } from 'escpos-web-print';

const printer = await requestSerialPrinter({ baudRate: 9600 });
await printCanvas(printer, canvas);
```

### USB

Which function to use depends on how the printer identifies itself over USB:

- **USB serial (CDC)**: it shows up as a serial port. Use `requestSerialPrinter`.
- **USB printer class or vendor-specific**: use WebUSB.

```ts
import { printCanvas, requestUsbPrinter, USB_PRINTER_CLASS } from 'escpos-web-print';

const printer = await requestUsbPrinter({ filters: [{ classCode: USB_PRINTER_CLASS }] });
await printCanvas(printer, canvas);
```

WebUSB can only claim an interface no OS driver owns. On Windows, replace the `usbprint` driver with WinUSB (e.g. with Zadig). On Linux, unbind `usblp` or add a udev rule. On macOS it usually works unless a CUPS queue uses the printer. See [docs/hardware.md](docs/hardware.md#usb).

### Bring your own transport

Anything with this shape works with `sendParts` and `printCanvas`: a WebSocket bridge, Node serialport, a print server.

```ts
import type { Transport } from 'escpos-web-print';

const transport: Transport = {
  label: 'My bridge',
  deviceName: null,
  maxChunkSize: 512,
  write: (chunk) => socket.send(chunk),
  close: async () => socket.close()
};
```

### Use the low-level pieces

```ts
import { canvasToBitmap, encodeBitmap, layoutForPrinter, sendParts } from 'escpos-web-print';

const laidOut = layoutForPrinter(image, { printWidth: 576 }); // 80mm paper
const bitmap = canvasToBitmap(laidOut, { dither: 'threshold', threshold: 200 });
const parts = encodeBitmap(bitmap, { cut: 'full', feedAfter: 40 });
await sendParts(printer, parts, { chunkSize: 100, chunkDelay: 20 });
```

## API

All functions are documented with JSDoc in the published types. Summary:

### High level

| Export | Description |
| --- | --- |
| `printCanvas(transport, source, options?)` | Layout, dither, encode and send in one call. Returns the parts sent. |
| `renderForPrinter(source, options?)` | Same pipeline without sending. Returns `{ canvas, bitmap, parts }`. |

`options` combines `LayoutOptions`, `BitmapOptions`, `EncodeOptions` and `SendOptions`.

### Layout — `layoutForPrinter(source, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `printWidth` | `384` | Printable dots across the paper. `PAPER_WIDTH['58mm']` = 384, `PAPER_WIDTH['80mm']` = 576. |
| `rotate` | `0` | Clockwise degrees: `0`, `90`, `180`, `270`. |
| `trim` | `true` | Crop blank borders first so content fills the width. |
| `trimThreshold` | `245` | Channel value treated as blank when trimming. |
| `margin` | `0` | Blank dots on both paper edges. |
| `paddingBefore` / `paddingAfter` | `0` | Blank dots before / after along the feed. |

Also: `contentBox(source, threshold?)` returns the bounding box of non-blank pixels (handy for trimming logos).

### Bitmap — `canvasToBitmap(canvas, options?)`, `toBitmap(imageData, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `dither` | `'atkinson'` | `'atkinson'` for photos and logos, `'threshold'` for line art. |
| `threshold` | `128` | Gray level below which a dot is black. |

### Encoding — `encodeBitmap(bitmap, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `stripHeight` | `24` | Rows per `GS v 0` block. |
| `heatingTime` | none | Sends `ESC 7` (darker print on PT-210 class printers). |
| `feedAfter` | `0` | Dots to feed after the image. |
| `cut` | `'none'` | `'full'` or `'partial'` for printers with a cutter. |

Raw command builders: `initialize`, `heating`, `rasterImage`, `feedDots`, `feedLines`, `cut`, `text`, `concat`.

### Sending — `sendParts(transport, parts, options?)`

| Option | Default | Meaning |
| --- | --- | --- |
| `chunkSize` | transport max | Bytes per write. |
| `chunkDelay` | `40` | ms after each write. |
| `partDelay` | `50` | ms after each part (each raster strip). |
| `flushDelay` | `300` | ms after the last part. |
| `signal` | none | `AbortSignal` to cancel. |
| `onProgress` | none | `(sent, total) => void`. |

### Transports

| Export | Description |
| --- | --- |
| `requestBluetoothPrinter(options?)` | BLE chooser and connect. Options: `namePrefix`, `acceptAllDevices`, `services`, `maxChunkSize`, `onDisconnect`. |
| `requestSerialPrinter(options?)` | Serial chooser and connect. Options: `baudRate`, `filters`, `maxChunkSize`, `onDisconnect`. |
| `requestUsbPrinter(options?)` | WebUSB chooser and connect for non-serial USB printers. Options: `filters`, `maxChunkSize`, `onDisconnect`. |
| `isBluetoothSupported()`, `isSerialSupported()`, `isUsbSupported()` | Feature detection. |
| `PRINTER_SERVICES`, `BLE_MAX_CHUNK`, `USB_PRINTER_CLASS` | Known printer GATT services, the default BLE write size, the USB printer class code. |

### Utilities

`mmToDots`, `dotsToMm`, `DEFAULT_DPI`, `PAPER_WIDTH`, `textTestPage`, `toHex`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Printer not in the chooser | It doesn't advertise a known service | `acceptAllDevices: true`, power-cycle the printer, disconnect it from phone apps |
| Paper feeds but nothing prints | Data goes to the wrong BLE characteristic, or the paper is upside down | Check `PRINTER_SERVICES` covers your printer; run the printer's self-test; scratch the paper (the side that darkens faces the head) |
| Garbage or the print stops halfway | Buffer overflow | Lower `chunkSize` (try 100, then 20) or raise `chunkDelay` |
| Print too faint | Low heat or low battery | `heatingTime: 200`, charge the printer |
| Text and logo cut off at the edges | Content wider than the head | Use the right `printWidth`, add `margin` |
| Print ends inside the printer | No feed after the image | Raise `paddingAfter` |

More in [docs/hardware.md](docs/hardware.md).

## Sources

- GOOJPRT PT-210 SDK documentation: constants (BLE and SPP UUIDs, 384-dot width), BLE/SPP transport pacing, raster strips and `ESC 7` heating. <https://goojprt-pt210-sdk.readthedocs.io/en/latest/>
- Web Bluetooth receipt printer spike by Jorgelig-Labs: the `18F0`/`2AF1` service for PT-220/Goojprt-class printers, the list of common printer GATT services, write-with-response preference. <https://github.com/Jorgelig-Labs/web-bluetooth-receipt-printer-spike>
- Chrome for Developers, "Serial over Bluetooth on the web": Web Serial support for Bluetooth RFCOMM/SPP. <https://developer.chrome.com/blog/serial-over-bluetooth>
- Field testing with a FUNFANG 58mm BT/USB printer (PT-210 clone) from desktop Chrome on macOS, from the [receipt-printer](https://github.com/hamproductions/receipt-printer) app this library was extracted from.

## License

MIT
