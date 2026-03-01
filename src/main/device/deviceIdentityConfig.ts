import path from 'node:path';

import type { DeviceIdentity } from './deviceIdentity';

export interface DeviceIdentityConfigFileShapeV1 {
  schemaVersion: 1;
  deviceId: string;
  updatedAtMs: number;
}

export interface DeviceIdentityConfigFsOps {
  readFile: (fileAbsPath: string) => Promise<string>;
  writeFile: (fileAbsPath: string, content: string) => Promise<void>;
  mkdir: (dirAbsPath: string, options: { recursive: boolean }) => Promise<void>;
  rename: (fromAbsPath: string, toAbsPath: string) => Promise<void>;
  rm: (absPath: string, options: { force: boolean }) => Promise<void>;
}

export function resolveDeviceIdentityFileAbsPath(userDataDirAbsPath: string): string {
  return path.join(path.resolve(userDataDirAbsPath), 'device-identity.json');
}

function isShapeV1(value: unknown): value is DeviceIdentityConfigFileShapeV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v['schemaVersion'] === 1 &&
    typeof v['deviceId'] === 'string' &&
    typeof v['updatedAtMs'] === 'number'
  );
}

function safeParseDeviceId(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 8) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

export async function getOrCreateDeviceIdentityFromConfig(options: {
  userDataDirAbsPath: string;
  fs: DeviceIdentityConfigFsOps;
  hostname: string;
  randomUUID: () => string;
  nowMs?: () => number;
}): Promise<DeviceIdentity> {
  const nowMs = options.nowMs ?? Date.now;
  const fileAbsPath = resolveDeviceIdentityFileAbsPath(options.userDataDirAbsPath);

  try {
    const raw = await options.fs.readFile(fileAbsPath);
    const parsed = JSON.parse(raw) as unknown;
    if (isShapeV1(parsed)) {
      const id = safeParseDeviceId(parsed.deviceId);
      if (id) {
        return { deviceId: id, deviceName: options.hostname };
      }
    }
  } catch {}

  const deviceId = options.randomUUID();
  const content: DeviceIdentityConfigFileShapeV1 = {
    schemaVersion: 1,
    deviceId,
    updatedAtMs: nowMs(),
  };

  const dir = path.dirname(fileAbsPath);
  await options.fs.mkdir(dir, { recursive: true });
  const tmp = `${fileAbsPath}.tmp-${nowMs()}`;
  await options.fs.writeFile(tmp, `${JSON.stringify(content, null, 2)}\n`);

  try {
    await options.fs.rename(tmp, fileAbsPath);
  } catch {
    try {
      await options.fs.rm(fileAbsPath, { force: true });
    } catch {}
    try {
      await options.fs.rename(tmp, fileAbsPath);
    } catch {
      await options.fs.writeFile(fileAbsPath, `${JSON.stringify(content, null, 2)}\n`);
      await options.fs.rm(tmp, { force: true });
    }
  }

  return { deviceId, deviceName: options.hostname };
}
