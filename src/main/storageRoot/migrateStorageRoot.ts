import path from 'node:path';

import { resolveMainDbFileAbsPath, SQLITE_MAIN_DB_FILENAME } from '../db/paths';
import { resolveStorageLayout, STORAGE_ROOT_DIRS } from '../storageLayout';

export interface StorageRootMigrationFsOps {
  stat: (absPath: string) => Promise<{ isFile: () => boolean; isDirectory: () => boolean }>;
  mkdir: (dirAbsPath: string, options: { recursive: boolean }) => Promise<void>;
  readdir: (dirAbsPath: string) => Promise<string[]>;
  copyFile: (fromAbsPath: string, toAbsPath: string) => Promise<void>;
  rename: (fromAbsPath: string, toAbsPath: string) => Promise<void>;
  rm: (absPath: string, options: { recursive: boolean; force: boolean }) => Promise<void>;
  unlink: (absPath: string) => Promise<void>;
}

export type MigrateStorageRootOutcome = {
  kind: 'migrated';
  moved: {
    db: boolean;
    attachmentsCache: boolean;
    logs: boolean;
  };
};

function normalizeAbsPath(p: string): string {
  const resolved = path.resolve(p);
  if (!path.isAbsolute(resolved)) {
    throw new Error('路径必须是绝对路径');
  }
  return resolved;
}

async function pathExists(fs: StorageRootMigrationFsOps, absPath: string): Promise<boolean> {
  try {
    await fs.stat(absPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(fs: StorageRootMigrationFsOps, dirAbsPath: string): Promise<void> {
  await fs.mkdir(dirAbsPath, { recursive: true });
}

async function copyDirRecursive(options: {
  fs: StorageRootMigrationFsOps;
  fromDirAbsPath: string;
  toDirAbsPath: string;
}): Promise<void> {
  const { fs } = options;
  await ensureDir(fs, options.toDirAbsPath);

  const entries = await fs.readdir(options.fromDirAbsPath);
  for (const name of entries) {
    const from = path.join(options.fromDirAbsPath, name);
    const to = path.join(options.toDirAbsPath, name);
    const st = await fs.stat(from);
    if (st.isDirectory()) {
      await copyDirRecursive({ fs, fromDirAbsPath: from, toDirAbsPath: to });
      continue;
    }
    if (st.isFile()) {
      await ensureDir(fs, path.dirname(to));
      await fs.copyFile(from, to);
    }
  }
}

async function safeRmRf(fs: StorageRootMigrationFsOps, absPath: string): Promise<void> {
  try {
    await fs.rm(absPath, { recursive: true, force: true });
  } catch {
  }
}

async function safeUnlink(fs: StorageRootMigrationFsOps, absPath: string): Promise<void> {
  try {
    await fs.unlink(absPath);
  } catch {
  }
}

async function cleanupCommittedTargets(
  fs: StorageRootMigrationFsOps,
  targets: Array<{ absPath: string; kind: 'dir' | 'file' }>
): Promise<void> {
  for (const t of targets.reverse()) {
    if (t.kind === 'dir') {
      await safeRmRf(fs, t.absPath);
    } else {
      await safeUnlink(fs, t.absPath);
    }
  }
}

export async function migrateStorageRoot(options: {
  oldRootAbsPath: string;
  newRootAbsPath: string;
  fs: StorageRootMigrationFsOps;
  nowMs?: () => number;
  randomId?: () => string;
}): Promise<MigrateStorageRootOutcome> {
  const fs = options.fs;
  const nowMs = options.nowMs ?? Date.now;
  const randomId = options.randomId ?? (() => Math.random().toString(16).slice(2));

  const oldRoot = normalizeAbsPath(options.oldRootAbsPath);
  const newRoot = normalizeAbsPath(options.newRootAbsPath);
  if (oldRoot === newRoot) {
    throw new Error('新旧目录不能相同');
  }

  await ensureDir(fs, newRoot);

  const layoutNew = resolveStorageLayout(newRoot);
  const conflicts = [
    layoutNew.dbDirAbsPath,
    layoutNew.attachmentsCacheDirAbsPath,
    layoutNew.logsDirAbsPath,
  ];
  for (const c of conflicts) {
    if (await pathExists(fs, c)) {
      throw new Error('目标目录已包含 xinliu 数据结构，请选择空目录');
    }
  }

  const stagingDirAbsPath = path.join(
    newRoot,
    `.xinliu-migrate-staging-${nowMs()}-${randomId()}`
  );

  const committedTargets: Array<{ absPath: string; kind: 'dir' | 'file' }> = [];
  let movedDb = false;
  let movedAttachmentsCache = false;
  let movedLogs = false;

  try {
    await ensureDir(fs, stagingDirAbsPath);

    const layoutOld = resolveStorageLayout(oldRoot);
    const layoutStaging = resolveStorageLayout(stagingDirAbsPath);

    const oldDbFile = resolveMainDbFileAbsPath(oldRoot);
    const oldWalFile = `${oldDbFile}-wal`;
    const oldShmFile = `${oldDbFile}-shm`;

    const stagingDbDir = layoutStaging.dbDirAbsPath;
    const stagingDbFile = path.join(stagingDbDir, SQLITE_MAIN_DB_FILENAME);
    const stagingWalFile = `${stagingDbFile}-wal`;
    const stagingShmFile = `${stagingDbFile}-shm`;

    const hasDb = await pathExists(fs, oldDbFile);
    const hasWal = await pathExists(fs, oldWalFile);
    const hasShm = await pathExists(fs, oldShmFile);
    if (hasDb || hasWal || hasShm) {
      await ensureDir(fs, stagingDbDir);
      if (hasDb) {
        await fs.copyFile(oldDbFile, stagingDbFile);
      }
      if (hasWal) {
        await fs.copyFile(oldWalFile, stagingWalFile);
      }
      if (hasShm) {
        await fs.copyFile(oldShmFile, stagingShmFile);
      }
    }

    if (await pathExists(fs, layoutOld.attachmentsCacheDirAbsPath)) {
      await copyDirRecursive({
        fs,
        fromDirAbsPath: layoutOld.attachmentsCacheDirAbsPath,
        toDirAbsPath: layoutStaging.attachmentsCacheDirAbsPath,
      });
    }

    if (await pathExists(fs, layoutOld.logsDirAbsPath)) {
      await copyDirRecursive({
        fs,
        fromDirAbsPath: layoutOld.logsDirAbsPath,
        toDirAbsPath: layoutStaging.logsDirAbsPath,
      });
    }

    if (await pathExists(fs, layoutStaging.dbDirAbsPath)) {
      await fs.rename(layoutStaging.dbDirAbsPath, layoutNew.dbDirAbsPath);
      committedTargets.push({ absPath: layoutNew.dbDirAbsPath, kind: 'dir' });
      movedDb = true;
    }
    if (await pathExists(fs, layoutStaging.attachmentsCacheDirAbsPath)) {
      await fs.rename(
        layoutStaging.attachmentsCacheDirAbsPath,
        layoutNew.attachmentsCacheDirAbsPath
      );
      committedTargets.push({ absPath: layoutNew.attachmentsCacheDirAbsPath, kind: 'dir' });
      movedAttachmentsCache = true;
    }
    if (await pathExists(fs, layoutStaging.logsDirAbsPath)) {
      await fs.rename(layoutStaging.logsDirAbsPath, layoutNew.logsDirAbsPath);
      committedTargets.push({ absPath: layoutNew.logsDirAbsPath, kind: 'dir' });
      movedLogs = true;
    }

    await safeRmRf(fs, stagingDirAbsPath);

    return {
      kind: 'migrated',
      moved: {
        db: movedDb,
        attachmentsCache: movedAttachmentsCache,
        logs: movedLogs,
      },
    };
  } catch (error) {
    await cleanupCommittedTargets(fs, committedTargets);
    await safeRmRf(fs, stagingDirAbsPath);

    const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '迁移失败';
    throw new Error(message);
  }
}

export const __test__ = {
  pathExists,
  copyDirRecursive,
  normalizeAbsPath,
  STORAGE_ROOT_DIRS,
};
