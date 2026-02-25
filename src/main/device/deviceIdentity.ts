import crypto from 'node:crypto';
import os from 'node:os';

export interface TextKvStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
}

export interface CreateDeviceIdentityOptions {
  store: TextKvStore;
  deviceIdKey?: string;
  hostname?: string;
  randomUUID?: () => string;
}

export async function getOrCreateDeviceIdentity(
  options: CreateDeviceIdentityOptions
): Promise<DeviceIdentity> {
  const key = options.deviceIdKey ?? 'device_id';
  const hostname = options.hostname ?? os.hostname();
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());

  let deviceId = await options.store.get(key);
  if (!deviceId) {
    deviceId = randomUUID();
    await options.store.set(key, deviceId);
  }

  const deviceName = hostname;
  return { deviceId, deviceName };
}
