import type { Transport } from './transport.js';

export type SerialOptions = {
  /** Baud rate for wired serial adapters. Ignored by Bluetooth SPP and USB CDC. Defaults to 9600. */
  baudRate?: number;
  /** Narrows the port chooser. */
  filters?: { usbVendorId?: number; usbProductId?: number; bluetoothServiceClassId?: string }[];
  /** Largest write in bytes. Defaults to 512. */
  maxChunkSize?: number;
  /** Called when the port disappears. */
  onDisconnect?: () => void;
};

type Port = {
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  addEventListener: (type: 'disconnect', listener: () => void) => void;
  removeEventListener: (type: 'disconnect', listener: () => void) => void;
};

type SerialApi = { requestPort: (options?: { filters?: SerialOptions['filters'] }) => Promise<Port> };

/** True when the browser exposes Web Serial (desktop Chrome/Edge). */
export function isSerialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/**
 * Opens the browser's serial port chooser and connects to a printer over USB serial or Bluetooth SPP.
 * Must be called from a user gesture such as a click.
 *
 * @param options Baud rate, chooser filters, chunk size and disconnect callback.
 * @returns A connected `Transport`.
 */
export async function requestSerialPrinter(options: SerialOptions = {}): Promise<Transport> {
  const serial = (globalThis.navigator as Navigator & { serial?: SerialApi } | undefined)?.serial;
  if (!serial) {
    throw new Error('Web Serial is not available. Use desktop Chrome or Edge over HTTPS or localhost.');
  }

  const port = await serial.requestPort(options.filters ? { filters: options.filters } : undefined);
  if (!port.writable) {
    await port.open({ baudRate: options.baudRate ?? 9600 });
  }

  const handleDisconnect = () => {
    port.removeEventListener('disconnect', handleDisconnect);
    options.onDisconnect?.();
  };
  port.addEventListener('disconnect', handleDisconnect);

  return {
    label: 'Serial printer',
    deviceName: null,
    maxChunkSize: options.maxChunkSize ?? 512,
    write: async (chunk) => {
      if (!port.writable) {
        throw new Error('The serial port is not writable.');
      }
      const writer = port.writable.getWriter();
      try {
        await writer.write(chunk);
      } finally {
        writer.releaseLock();
      }
    },
    close: async () => {
      port.removeEventListener('disconnect', handleDisconnect);
      await port.close().catch(() => undefined);
    }
  };
}
