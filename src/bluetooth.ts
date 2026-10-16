import type { Transport } from './transport.js';

/** A GATT service that may carry printer data, with its write characteristic when known. */
export type PrinterService = {
  /** Full 128-bit service UUID, lowercase. */
  service: string;
  /** Write characteristic UUID. When omitted, the first writable characteristic of the service is used. */
  characteristic?: string;
};

/**
 * BLE services used by common thermal printers, tried in order.
 * `18f0/2af1` is the GOOJPRT/PT-210/Zjiang family, `49535343…` is the Microchip ISSC transparent UART (MTP-2/3).
 */
export const PRINTER_SERVICES: readonly PrinterService[] = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
  { service: '0000ae30-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2' },
  { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e' }
];

/** Default largest BLE write in bytes: a typical negotiated MTU minus ATT overhead. Lower it (e.g. to 20) on old adapters. */
export const BLE_MAX_CHUNK = 182;

export type BluetoothOptions = {
  /** Also lists devices whose name starts with this, e.g. the name stored from a previous connection. */
  namePrefix?: string;
  /** Lists every nearby BLE device instead of only printers. Use when the printer does not advertise its service. */
  acceptAllDevices?: boolean;
  /** Services to look for. Defaults to `PRINTER_SERVICES`. */
  services?: readonly PrinterService[];
  /** Largest write in bytes. Defaults to `BLE_MAX_CHUNK`. */
  maxChunkSize?: number;
  /** Called when the printer disconnects (powered off, out of range). */
  onDisconnect?: () => void;
};

type Characteristic = {
  uuid: string;
  service: { uuid: string };
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse: (value: Uint8Array) => Promise<void>;
};

type GattService = {
  getCharacteristic: (uuid: string) => Promise<Characteristic>;
  getCharacteristics: () => Promise<Characteristic[]>;
};

type GattServer = {
  connected: boolean;
  connect: () => Promise<GattServer>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<GattService>;
  getPrimaryServices: () => Promise<GattService[]>;
};

type Device = {
  name?: string;
  gatt?: GattServer;
  addEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
  removeEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
};

type RequestOptions =
  | { acceptAllDevices: true; optionalServices: string[] }
  | { filters: ({ services: string[] } | { namePrefix: string })[]; optionalServices: string[] };

type BluetoothApi = { requestDevice: (options: RequestOptions) => Promise<Device> };

/** True when the browser exposes Web Bluetooth (desktop Chrome/Edge, Android Chrome). */
export function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Opens the browser's Bluetooth chooser and connects to a BLE thermal printer.
 * Must be called from a user gesture such as a click.
 *
 * @example
 * const printer = await requestBluetoothPrinter({ onDisconnect: () => console.log('gone') });
 *
 * @param options Chooser filters, services, chunk size and disconnect callback.
 * @returns A connected `Transport`.
 */
export async function requestBluetoothPrinter(options: BluetoothOptions = {}): Promise<Transport> {
  const bluetooth = (globalThis.navigator as Navigator & { bluetooth?: BluetoothApi } | undefined)?.bluetooth;
  if (!bluetooth) {
    throw new Error('Web Bluetooth is not available. Use desktop Chrome or Edge over HTTPS or localhost.');
  }

  const known = options.services ?? PRINTER_SERVICES;
  const optionalServices = known.map((entry) => entry.service);
  const device = await bluetooth.requestDevice(
    options.acceptAllDevices
      ? { acceptAllDevices: true, optionalServices }
      : {
          filters: [...optionalServices.map((service) => ({ services: [service] })), ...(options.namePrefix ? [{ namePrefix: options.namePrefix }] : [])],
          optionalServices
        }
  );
  if (!device.gatt) {
    throw new Error('The selected device does not support GATT.');
  }

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  let characteristic: Characteristic;
  try {
    characteristic = await findWritableCharacteristic(server, known);
  } catch (error) {
    server.disconnect();
    throw error;
  }

  const handleDisconnect = () => {
    device.removeEventListener('gattserverdisconnected', handleDisconnect);
    options.onDisconnect?.();
  };
  device.addEventListener('gattserverdisconnected', handleDisconnect);

  const withoutResponse = characteristic.properties.writeWithoutResponse && !characteristic.properties.write;
  return {
    label: device.name || 'Bluetooth printer',
    deviceName: device.name || null,
    maxChunkSize: options.maxChunkSize ?? BLE_MAX_CHUNK,
    write: (chunk) => (withoutResponse ? characteristic.writeValueWithoutResponse(chunk) : characteristic.writeValueWithResponse(chunk)),
    close: async () => {
      device.removeEventListener('gattserverdisconnected', handleDisconnect);
      server.disconnect();
    }
  };
}

async function findWritableCharacteristic(server: GattServer, known: readonly PrinterService[]) {
  for (const entry of known) {
    if (!entry.characteristic) {
      continue;
    }
    try {
      return await (await server.getPrimaryService(entry.service)).getCharacteristic(entry.characteristic);
    } catch {
      continue;
    }
  }
  for (const service of await server.getPrimaryServices().catch(() => [])) {
    const characteristics = await service.getCharacteristics().catch(() => []);
    const writable = characteristics.find((item) => item.properties.write || item.properties.writeWithoutResponse);
    if (writable) {
      return writable;
    }
  }
  throw new Error('No writable printer characteristic was found on this device.');
}
