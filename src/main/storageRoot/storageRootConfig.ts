import path from 'node:path';

import type { StorageRootStatus } from '../../shared/ipc';

export interface StorageRootConfigFileShapeV1 {
  schemaVersion: 1;
  storageRootAbsPath: string;
  updatedAtMs: number;
}

export interface StorageRootConfigFsOps {
  readFile: (fileAbsPath: string) => Promise<string>;
  writeFile: (fileAbsPath: string, content: string) => Promise<void>;
  mkdir: (dirAbsPath: string, options: { recursive: boolean }) => Promise<void>;
  rename: (fromAbsPath: string, toAbsPath: string) => Promise<void>;
  rm: (absPath: string, options: { force: boolean }) => Promise<void>;
}

export function resolveStorageRootConfigFileAbsPath(userDataDirAbsPath: string): string {
  return path.join(path.resolve(userDataDirAbsPath), 'storage-root.json');
}

function normalizeStorageRootAbsPath(input: string): string {
  const resolved = path.resolve(input);
  if (!path.isAbsolute(resolved)) {
    throw new Error('storageRootAbsPath 必须是绝对路径');
  }
  return resolved;
}

function isShapeV1(value: unknown): value is StorageRootConfigFileShapeV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v['schemaVersion'] === 1 &&
    typeof v['storageRootAbsPath'] === 'string' &&
    typeof v['updatedAtMs'] === 'number'
  );
}

export function resolveDefaultStorageRootAbsPath(userDataDirAbsPath: string): string {
  return path.join(path.resolve(userDataDirAbsPath), 'storage-root');
}

export async function readStorageRootStatus(options: {
  userDataDirAbsPath: string;
  fs: StorageRootConfigFsOps;
}): Promise<StorageRootStatus> {
  const configFileAbsPath = resolveStorageRootConfigFileAbsPath(options.userDataDirAbsPath);
  const defaultRoot = resolveDefaultStorageRootAbsPath(options.userDataDirAbsPath);

  try {
    const raw = await options.fs.readFile(configFileAbsPath);
    const parsed = JSON.parse(raw) as unknown;
    if (!isShapeV1(parsed)) {
      return { storageRootAbsPath: defaultRoot, isDefault: true };
    }
    const normalized = normalizeStorageRootAbsPath(parsed.storageRootAbsPath);
    return { storageRootAbsPath: normalized, isDefault: false };
  } catch {
    return { storageRootAbsPath: defaultRoot, isDefault: true };
  }
}

export async function writeStorageRootConfig(options: {
  userDataDirAbsPath: string;
  storageRootAbsPath: string;
  fs: StorageRootConfigFsOps;
  nowMs?: () => number;
}): Promise<void> {
  const nowMs = options.nowMs ?? Date.now;
  const configFileAbsPath = resolveStorageRootConfigFileAbsPath(options.userDataDirAbsPath);
  const normalized = normalizeStorageRootAbsPath(options.storageRootAbsPath);

  const content: StorageRootConfigFileShapeV1 = {
    schemaVersion: 1,
    storageRootAbsPath: normalized,
    updatedAtMs: nowMs(),
  };

  const dir = path.dirname(configFileAbsPath);
  await options.fs.mkdir(dir, { recursive: true });

  const tmp = `${configFileAbsPath}.tmp-${nowMs()}`;
  await options.fs.writeFile(tmp, `${JSON.stringify(content, null, 2)}\n`);

  try {
    await options.fs.rename(tmp, configFileAbsPath);
  } catch {
    try {
      await options.fs.rm(configFileAbsPath, { force: true });
    } catch {
    }
    try {
      await options.fs.rename(tmp, configFileAbsPath);
    } catch {
      await options.fs.writeFile(configFileAbsPath, `${JSON.stringify(content, null, 2)}\n`);
      await options.fs.rm(tmp, { force: true });
    }
  }
}
