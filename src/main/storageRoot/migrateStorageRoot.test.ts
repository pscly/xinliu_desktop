// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrateStorageRoot, type StorageRootMigrationFsOps } from './migrateStorageRoot';

async function makeTmpDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

async function writeTextFile(absPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf-8');
}

function createNodeFsOps(): StorageRootMigrationFsOps {
  return {
    stat: (p) => fs.stat(p),
    mkdir: async (p, options) => {
      await fs.mkdir(p, options);
    },
    readdir: (p) => fs.readdir(p),
    copyFile: (from, to) => fs.copyFile(from, to),
    rename: (from, to) => fs.rename(from, to),
    rm: (p, options) => fs.rm(p, options),
    unlink: (p) => fs.unlink(p),
  };
}

function withFailingCopyFile(
  base: StorageRootMigrationFsOps,
  failAtCopyFileCall: number
): StorageRootMigrationFsOps {
  let copyCount = 0;
  return {
    ...base,
    copyFile: async (from, to) => {
      copyCount += 1;
      if (copyCount === failAtCopyFileCall) {
        throw new Error('注入失败：copyFile');
      }
      return base.copyFile(from, to);
    },
  };
}

describe('src/main/storageRoot/migrateStorageRoot', () => {
  it('成功迁移：复制主库/WAL/SHM + attachments-cache + logs，旧目录不变', async () => {
    const oldRoot = await makeTmpDir('xinliu-old-');
    const newRoot = await makeTmpDir('xinliu-new-');

    const oldDbFile = path.join(oldRoot, 'db', 'xinliu.sqlite3');
    await writeTextFile(oldDbFile, 'main-db');
    await writeTextFile(`${oldDbFile}-wal`, 'wal');
    await writeTextFile(`${oldDbFile}-shm`, 'shm');

    await writeTextFile(path.join(oldRoot, 'attachments-cache', 'a.txt'), 'cache-a');
    await writeTextFile(path.join(oldRoot, 'attachments-cache', 'nested', 'b.txt'), 'cache-b');
    await writeTextFile(path.join(oldRoot, 'logs', 'app.log'), 'log');

    const res = await migrateStorageRoot({
      oldRootAbsPath: oldRoot,
      newRootAbsPath: newRoot,
      fs: createNodeFsOps(),
      nowMs: () => 1700000000000,
      randomId: () => 'test',
    });

    expect(res.kind).toBe('migrated');
    expect(res.moved.db).toBe(true);
    expect(res.moved.attachmentsCache).toBe(true);
    expect(res.moved.logs).toBe(true);

    await expect(fs.readFile(path.join(newRoot, 'db', 'xinliu.sqlite3'), 'utf-8')).resolves.toBe(
      'main-db'
    );
    await expect(
      fs.readFile(path.join(newRoot, 'db', 'xinliu.sqlite3-wal'), 'utf-8')
    ).resolves.toBe('wal');
    await expect(
      fs.readFile(path.join(newRoot, 'db', 'xinliu.sqlite3-shm'), 'utf-8')
    ).resolves.toBe('shm');

    await expect(
      fs.readFile(path.join(newRoot, 'attachments-cache', 'nested', 'b.txt'), 'utf-8')
    ).resolves.toBe('cache-b');
    await expect(fs.readFile(path.join(newRoot, 'logs', 'app.log'), 'utf-8')).resolves.toBe('log');

    await expect(fs.readFile(path.join(oldRoot, 'db', 'xinliu.sqlite3'), 'utf-8')).resolves.toBe(
      'main-db'
    );
    await expect(
      fs.readFile(path.join(oldRoot, 'attachments-cache', 'a.txt'), 'utf-8')
    ).resolves.toBe('cache-a');
  });

  it('失败可回滚：copyFile 第 N 次失败时，新目录不留 staging/半成品，旧目录保持可用', async () => {
    const oldRoot = await makeTmpDir('xinliu-old-');
    const newRoot = await makeTmpDir('xinliu-new-');

    const oldDbFile = path.join(oldRoot, 'db', 'xinliu.sqlite3');
    await writeTextFile(oldDbFile, 'main-db');
    await writeTextFile(`${oldDbFile}-wal`, 'wal');
    await writeTextFile(`${oldDbFile}-shm`, 'shm');
    await writeTextFile(path.join(oldRoot, 'logs', 'app.log'), 'log');

    const fsOps = withFailingCopyFile(createNodeFsOps(), 2);

    await expect(
      migrateStorageRoot({
        oldRootAbsPath: oldRoot,
        newRootAbsPath: newRoot,
        fs: fsOps,
        nowMs: () => 1700000000000,
        randomId: () => 'test',
      })
    ).rejects.toThrow(/注入失败|迁移失败/);

    await expect(fs.readFile(path.join(oldRoot, 'db', 'xinliu.sqlite3'), 'utf-8')).resolves.toBe(
      'main-db'
    );
    await expect(fs.readFile(path.join(oldRoot, 'logs', 'app.log'), 'utf-8')).resolves.toBe('log');

    await expect(fs.stat(path.join(newRoot, 'db'))).rejects.toThrow();
    await expect(fs.stat(path.join(newRoot, 'logs'))).rejects.toThrow();

    const entries = await fs.readdir(newRoot);
    expect(entries.some((e) => e.startsWith('.xinliu-migrate-staging-'))).toBe(false);
  });

  it('保护：目标目录已包含关键目录时拒绝迁移', async () => {
    const oldRoot = await makeTmpDir('xinliu-old-');
    const newRoot = await makeTmpDir('xinliu-new-');

    await fs.mkdir(path.join(newRoot, 'db'), { recursive: true });

    await expect(
      migrateStorageRoot({
        oldRootAbsPath: oldRoot,
        newRootAbsPath: newRoot,
        fs: createNodeFsOps(),
        nowMs: () => 1700000000000,
        randomId: () => 'test',
      })
    ).rejects.toThrow('目标目录已包含 xinliu 数据结构，请选择空目录');
  });
});
