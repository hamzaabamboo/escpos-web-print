# Changelog

## 0.1.0 — 2026-10-16

First release, extracted from the [receipt-printer](https://github.com/hamproductions/receipt-printer) app.

- `layoutForPrinter`: trim, rotate (0/90/180/270), scale to the print head width, margins and feed padding.
- `toBitmap` / `canvasToBitmap`: grayscale with alpha onto white, Atkinson dithering or threshold, MSB-first packing.
- `encodeBitmap`: `ESC @`, optional `ESC 7` heating, `GS v 0` in 24-row strips, optional `ESC J` feed or `GS V` cut.
- `sendParts`: paced chunked writes with abort and progress.
- `requestBluetoothPrinter`: BLE chooser filtered to known printer services (GOOJPRT/PT-210 `18f0/2af1` first), write-with-response preference, disconnect callback.
- `requestSerialPrinter`: Web Serial for USB serial and Bluetooth SPP.
- `requestUsbPrinter`: WebUSB for printer-class and vendor-specific USB printers.
- `printCanvas` / `renderForPrinter`: the whole pipeline in one call.
- Utilities: `mmToDots`, `dotsToMm`, `PAPER_WIDTH`, `textTestPage`, `toHex`, raw command builders.
