// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { getOrCreateDeviceIdentity } from './deviceIdentity';

function createMemoryStore(): {
  store: import('./deviceIdentity').TextKvStore;
  snapshot: () => Record<string, string>;
} {
  const map: Record<string, string> = {};
  return {
    store: {
      get: async (key) => map[key] ?? null,
      set: async (key, value) => {
        map[key] = value;
      },
    },
    snapshot: () => ({ ...map }),
  };
}

describe('src/main/device/deviceIdentity', () => {
  it('首次生成 deviceId 并持久化，后续保持稳定', async () => {
    const { store, snapshot } = createMemoryStore();
    const randomUUID = vi.fn(() => 'uuid-1');

    const a = await getOrCreateDeviceIdentity({
      store,
      hostname: 'HOST',
      randomUUID,
    });
    const b = await getOrCreateDeviceIdentity({
      store,
      hostname: 'HOST',
      randomUUID,
    });

    expect(a.deviceId).toBe('uuid-1');
    expect(b.deviceId).toBe('uuid-1');
    expect(a.deviceName).toBe('HOST');
    expect(snapshot()).toEqual({ device_id: 'uuid-1' });
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
