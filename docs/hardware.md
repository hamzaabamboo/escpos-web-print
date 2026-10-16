# Hardware notes

## Tested printer

| | |
| --- | --- |
| Model | FUNFANG "Mini BT Thermal Receipt Printer", sold on Amazon Japan. Electronics and protocol match the GOOJPRT PT-210. |
| Paper | 58mm thermal roll |
| Print head | 48mm, 203 dpi, **384 dots** across |
| Interfaces | Bluetooth (BLE and Classic SPP), USB |
| Cutter | None (tear bar only) |
| Command set | ESC/POS subset, no Japanese code page |
| Host | Desktop Chrome on macOS |

## Connections

### Web Bluetooth (BLE) — recommended

The printer exposes a BLE GATT service that accepts raw ESC/POS bytes on a write characteristic. Chrome can connect directly from the page, without pairing in the operating system.

Known services, tried in this order (`PRINTER_SERVICES`):

| Service | Write characteristic | Seen on |
| --- | --- | --- |
| `000018f0-0000-1000-8000-00805f9b34fb` | `00002af1-…` | GOOJPRT / PT-210 / PT-220 / Zjiang / POS-58 BLE |
| `49535343-fe7d-4ae5-8fa9-9fafd205e455` | `49535343-8841-43f4-a8d4-ecbe34729bb3` | MTP-2 / MTP-3 (Microchip ISSC transparent UART) |
| `0000ff00-0000-1000-8000-00805f9b34fb` | `0000ff02-…` | PeriPage, FoMemo and PT-210 alternates |
| `0000ffe0-0000-1000-8000-00805f9b34fb` | `0000ffe1-…` | Generic HM-10 / JDY BLE modules |
| `0000ae30-0000-1000-8000-00805f9b34fb` | first writable | "Cat" mini printers |
| `e7810a71-73ae-499d-8c15-faa9aef0c3f2` | first writable | Nordic-UART-like modules |
| `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | first writable | Nordic UART Service |

Chrome only lets a page touch services it listed in `optionalServices` when the chooser opened. If your printer uses a service that isn't listed, pass it in `services`; otherwise the library can't even discover it.

On the tested printer, writes only produced output once `18f0/2af1` was in the list. Before that, the connection succeeded and the paper fed, but nothing was printed, because the data went to a characteristic the print engine ignores.

Writes use *write with response* when the characteristic supports it, so each chunk is acknowledged before the next. *Write without response* is used only when it is the only option. Chunks are at most 182 bytes (`BLE_MAX_CHUNK`), a typical negotiated MTU minus ATT overhead. Lower it to 20 on adapters stuck at the default 23-byte MTU.

### Web Serial (Bluetooth SPP)

Once the printer is paired with the OS it appears as a serial port (on macOS, `/dev/cu.<name>`). Chrome 117+ lists paired SPP devices in `requestPort()` without extra options. The baud rate is ignored.

### USB

A USB printer identifies itself in one of two ways, and the API depends on which:

| Device reports | Browser API | Function |
| --- | --- | --- |
| USB serial (CDC ACM) | Web Serial | `requestSerialPrinter` |
| Printer class (`0x07`) or vendor-specific | WebUSB | `requestUsbPrinter` |

`requestUsbPrinter` opens the device, picks the first interface with a bulk OUT endpoint (printer-class interfaces first), claims it and sends the same ESC/POS bytes with `transferOut`.

WebUSB can only claim an interface that no OS driver holds:

| OS | Default owner of printer-class interfaces | What to do |
| --- | --- | --- |
| Windows | `usbprint.sys` | Install WinUSB for the device (e.g. with Zadig); the printer then stops working as a Windows printer. |
| Linux | `usblp` kernel module | Unbind it, blacklist it, or add a udev rule giving the browser user access. |
| macOS | Nothing, unless a CUPS printer queue is configured for it | Remove the CUPS queue if claiming fails. |
| Android | Nothing | Works; Chrome asks for permission. |

The tested printer's USB port did not appear as a serial port on macOS, so it most likely reports the printer class. Its USB connection has not been tested with `requestUsbPrinter`.

## Things that look like bugs but are hardware

| Observation | Explanation |
| --- | --- |
| Self-test prints, app output is blank | Data reaches the printer but not the print engine: wrong BLE characteristic, or bytes arriving faster than the buffer drains. |
| Paper feeds the exact length of the image, all blank | The printer parsed the `GS v 0` headers (that is why it feeds) but burned no dots: thermal paper upside down, non-thermal paper, or a flat battery. Scratch the paper with a fingernail: the side that darkens must face the head. |
| Blank margin at the end looks shorter than requested | The tear bar sits several mm past the print head. The last printed line is still inside the printer when the feed stops. Raise `paddingAfter`. |
| `cut` does nothing | No cutter. The PT-210 SDK documents its cut as a no-op. |
| Japanese / CJK text prints as `?` | No Japanese code page. Render text on a canvas and print it as an image (which is what this library does). |
| Faint print | `ESC 7` heating time too low for the paper, or low battery. Try `heatingTime: 200`. |

## Self-test

Turn the printer off, hold FEED and turn it on. It prints its configuration with no host involved. If this page is blank, the problem is paper, battery or hardware, and no code will fix it.
