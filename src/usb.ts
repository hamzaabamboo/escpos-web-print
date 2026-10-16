import type { Transport } from './transport.js';

/** USB class code of printer interfaces. */
export const USB_PRINTER_CLASS = 0x07;

export type UsbOptions = {
  /** Narrows the device chooser. Defaults to every device; `[{ classCode: USB_PRINTER_CLASS }]` lists only printer-class devices. */
  filters?: { vendorId?: number; productId?: number; classCode?: number }[];
  /** Largest bulk transfer in bytes. Defaults to 512. */
  maxChunkSize?: number;
  /** Called when the device is unplugged. */
  onDisconnect?: () => void;
};

type Endpoint = { endpointNumber: number; direction: 'in' | 'out'; type: 'bulk' | 'interrupt' | 'isochronous' };
type Alternate = { interfaceClass: number; endpoints: Endpoint[] };
type Interface = { interfaceNumber: number; alternates: Alternate[] };

type Device = {
  productName?: string;
  configuration: { interfaces: Interface[] } | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (value: number) => Promise<void>;
  claimInterface: (value: number) => Promise<void>;
  releaseInterface: (value: number) => Promise<void>;
  transferOut: (endpoint: number, data: Uint8Array) => Promise<{ status: string }>;
};

type UsbApi = {
  requestDevice: (options: { filters: NonNullable<UsbOptions['filters']> }) => Promise<Device>;
  addEventListener: (type: 'disconnect', listener: (event: { device: Device }) => void) => void;
  removeEventListener: (type: 'disconnect', listener: (event: { device: Device }) => void) => void;
};

/** True when the browser exposes WebUSB (desktop Chrome/Edge, Android Chrome). */
export function isUsbSupported() {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Opens the browser's USB chooser and connects to a printer that is not a serial device (USB printer class or vendor-specific).
 * Claims the first interface with a bulk OUT endpoint, preferring printer-class interfaces.
 * Fails with a `SecurityError` or `NetworkError` when an OS driver already owns the interface (common on Windows and Linux).
 * Must be called from a user gesture such as a click.
 *
 * @param options Chooser filters, chunk size and disconnect callback.
 * @returns A connected `Transport`.
 */
export async function requestUsbPrinter(options: UsbOptions = {}): Promise<Transport> {
  const usb = (globalThis.navigator as Navigator & { usb?: UsbApi } | undefined)?.usb;
  if (!usb) {
    throw new Error('WebUSB is not available. Use desktop Chrome or Edge over HTTPS or localhost.');
  }

  const device = await usb.requestDevice({ filters: options.filters ?? [] });
  await device.open();
  if (!device.configuration) {
    await device.selectConfiguration(1);
  }

  const candidates = (device.configuration?.interfaces ?? [])
    .map((item) => ({ item, alternate: item.alternates[0], endpoint: item.alternates[0]?.endpoints.find((entry) => entry.direction === 'out' && entry.type === 'bulk') }))
    .filter((candidate) => candidate.endpoint)
    .sort((a, b) => Number(b.alternate.interfaceClass === USB_PRINTER_CLASS) - Number(a.alternate.interfaceClass === USB_PRINTER_CLASS));
  const target = candidates[0];
  if (!target?.endpoint) {
    await device.close();
    throw new Error('The selected USB device has no bulk OUT endpoint.');
  }
  try {
    await device.claimInterface(target.item.interfaceNumber);
  } catch (error) {
    await device.close();
    throw error;
  }

  const endpoint = target.endpoint.endpointNumber;
  const handleDisconnect = (event: { device: Device }) => {
    if (event.device === device) {
      usb.removeEventListener('disconnect', handleDisconnect);
      options.onDisconnect?.();
    }
  };
  usb.addEventListener('disconnect', handleDisconnect);

  return {
    label: device.productName || 'USB printer',
    deviceName: device.productName || null,
    maxChunkSize: options.maxChunkSize ?? 512,
    write: async (chunk) => {
      const result = await device.transferOut(endpoint, chunk);
      if (result.status !== 'ok') {
        throw new Error(`USB transfer failed: ${result.status}`);
      }
    },
    close: async () => {
      usb.removeEventListener('disconnect', handleDisconnect);
      await device.releaseInterface(target.item.interfaceNumber).catch(() => undefined);
      await device.close().catch(() => undefined);
    }
  };
}
