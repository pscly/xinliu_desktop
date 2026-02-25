import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  STORAGE_ROOT_DIRS,
  fromRelpath,
  resolveStorageLayout,
  toRelpath,
} from './storageLayout';

describe('src/main/storageLayout', () => {
  it('resolveStorageLayout: 目录布局与合同一致', () => {
    const root = path.resolve('/tmp/xinliu-root');
    const layout = resolveStorageLayout(root);

    expect(path.basename(layout.dbDirAbsPath)).toBe(STORAGE_ROOT_DIRS.db);
    expect(path.basename(layout.attachmentsDirAbsPath)).toBe(STORAGE_ROOT_DIRS.attachments);
    expect(path.basename(layout.attachmentsCacheDirAbsPath)).toBe(STORAGE_ROOT_DIRS.attachmentsCache);
    expect(path.basename(layout.logsDirAbsPath)).toBe(STORAGE_ROOT_DIRS.logs);
    expect(path.basename(layout.tmpDirAbsPath)).toBe(STORAGE_ROOT_DIRS.tmp);
    expect(path.basename(layout.exportsDirAbsPath)).toBe(STORAGE_ROOT_DIRS.exports);
  });

  it('relpath round-trip: fromRelpath(toRelpath(x)) == x', () => {
    const root = path.resolve('/tmp/xinliu-root');
    const abs = path.join(root, STORAGE_ROOT_DIRS.attachmentsCache, 'a', 'b.txt');

    const rel = toRelpath(root, abs);
    expect(rel).toBe('attachments-cache/a/b.txt');

    const absAgain = fromRelpath(root, rel);
    expect(absAgain).toBe(path.resolve(abs));
  });

  it('toRelpath: absPath 不在 root 下必须拒绝', () => {
    const root = path.resolve('/tmp/xinliu-root');
    const outside = path.resolve(root, '..', 'outside.txt');
    expect(() => toRelpath(root, outside)).toThrow();
  });

  it('fromRelpath: 禁止 .. 与绝对路径', () => {
    const root = path.resolve('/tmp/xinliu-root');
    expect(() => fromRelpath(root, '../a')).toThrow();
    expect(() => fromRelpath(root, '/etc/passwd')).toThrow();
  });

  it('fromRelpath: 禁止空段与 .（canonical relpath）', () => {
    const root = path.resolve('/tmp/xinliu-root');
    expect(() => fromRelpath(root, 'a//b')).toThrow();
    expect(() => fromRelpath(root, 'a/./b')).toThrow();
    expect(() => fromRelpath(root, 'a/')).toThrow();
  });
});
