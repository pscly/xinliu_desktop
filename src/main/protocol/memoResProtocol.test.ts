// @vitest-environment node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createMemoResHandler } from './memoResProtocol';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-memo-res-'));
}

async function writeFileEnsuringDir(absPath: string, data: Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  await fsp.writeFile(absPath, data);
}

describe('src/main/protocol/memoResProtocol', () => {
  it('成功：白名单目录文件可读取（memo-res://<cacheKey>）', async () => {
    const root = makeTempDir();
    const relpath = 'attachments-cache/a.png';
    const abs = path.join(root, 'attachments-cache', 'a.png');
    await writeFileEnsuringDir(abs, Buffer.from('PNGDATA'));

    const resolveCacheKey = vi.fn(async () => relpath);
    const handler = createMemoResHandler({
      storageRootAbsPath: root,
      resolveCacheKey,
      readFile: (p) => fsp.readFile(p),
      lstat: (p) => fsp.lstat(p),
    });

    const res = await handler('memo-res://att_abc');
    expect(res.statusCode).toBe(200);
    expect(res.data.toString('utf-8')).toBe('PNGDATA');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Content-Disposition']).toBe('inline');
    expect(resolveCacheKey).toHaveBeenCalledWith('att_abc');
  });

  it('成功：支持 memo-res:///cacheKey（pathname 形态）', async () => {
    const root = makeTempDir();
    const relpath = 'attachments/a.png';
    const abs = path.join(root, 'attachments', 'a.png');
    await writeFileEnsuringDir(abs, Buffer.from('X'));

    const handler = createMemoResHandler({
      storageRootAbsPath: root,
      resolveCacheKey: async () => relpath,
      readFile: (p) => fsp.readFile(p),
      lstat: (p) => fsp.lstat(p),
    });

    const res = await handler('memo-res:///att_abc');
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('拒绝：cacheKey 不透明约束（含 /、..、% 等）必须 400', async () => {
    const root = makeTempDir();
    const handler = createMemoResHandler({
      storageRootAbsPath: root,
      resolveCacheKey: async () => 'attachments-cache/a.png',
      readFile: async () => Buffer.from('X'),
      lstat: (p) => fsp.lstat(p),
    });

    const urls = [
      'memo-res://../x',
      'memo-res://a/b',
      'memo-res:///a/b',
      'memo-res://a%2Fb',
      'memo-res://a%b',
      'memo-res://a\\b',
    ];

    for (const u of urls) {
      const res = await handler(u);
      expect(res.statusCode).toBe(400);
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    }
  });

  it('拒绝：非白名单目录 relpath 必须 403', async () => {
    const root = makeTempDir();
    const readFile = vi.fn(async () => Buffer.from('X'));

    const handler = createMemoResHandler({
      storageRootAbsPath: root,
      resolveCacheKey: async () => 'logs/a.txt',
      readFile,
      lstat: (p) => fsp.lstat(p),
    });

    const res = await handler('memo-res://att_abc');
    expect(res.statusCode).toBe(403);
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('拒绝：路径链路出现 symlink/junction 必须 403（创建失败则用 lstat stub 回退）', async () => {
    const root = makeTempDir();
    await fsp.mkdir(path.join(root, 'attachments-cache'), { recursive: true });

    const linkDirRel = 'attachments-cache/linkdir';
    const linkDirAbs = path.join(root, 'attachments-cache', 'linkdir');

    let lstat = (p: string) => fsp.lstat(p);
    try {
      const outsideDir = path.join(root, '..', `outside-${Date.now()}`);
      await fsp.mkdir(outsideDir, { recursive: true });

      const linkType: fs.symlink.Type | undefined =
        process.platform === 'win32' ? 'junction' : 'dir';
      await fsp.symlink(outsideDir, linkDirAbs, linkType);
    } catch {
      const realLstat = lstat;
      lstat = async (p: string) => {
        if (path.resolve(p) === path.resolve(linkDirAbs)) {
          return { isSymbolicLink: () => true } as unknown as fs.Stats;
        }
        return realLstat(p);
      };
    }

    const readFile = vi.fn(async () => Buffer.from('X'));
    const handler = createMemoResHandler({
      storageRootAbsPath: root,
      resolveCacheKey: async () => `${linkDirRel}/a.txt`,
      readFile,
      lstat,
    });

    const res = await handler('memo-res://att_abc');
    expect(res.statusCode).toBe(403);
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('MIME/Disposition：png 内联；exe/未知扩展强制 attachment', async () => {
    const root = makeTempDir();

    const pngAbs = path.join(root, 'attachments-cache', 'a.png');
    const exeAbs = path.join(root, 'attachments-cache', 'a.exe');
    const binAbs = path.join(root, 'attachments-cache', 'a.bin');
    await writeFileEnsuringDir(pngAbs, Buffer.from('P'));
    await writeFileEnsuringDir(exeAbs, Buffer.from('E'));
    await writeFileEnsuringDir(binAbs, Buffer.from('B'));

    const handler = createMemoResHandler({
      storageRootAbsPath: root,
      resolveCacheKey: async (cacheKey) => {
        if (cacheKey === 'k_png') {
          return 'attachments-cache/a.png';
        }
        if (cacheKey === 'k_exe') {
          return 'attachments-cache/a.exe';
        }
        if (cacheKey === 'k_bin') {
          return 'attachments-cache/a.bin';
        }
        return null;
      },
      readFile: (p) => fsp.readFile(p),
      lstat: (p) => fsp.lstat(p),
    });

    const png = await handler('memo-res://k_png');
    expect(png.statusCode).toBe(200);
    expect(png.headers['Content-Type']).toBe('image/png');
    expect(png.headers['Content-Disposition']).toBe('inline');

    const exe = await handler('memo-res://k_exe');
    expect(exe.statusCode).toBe(200);
    expect(exe.headers['Content-Disposition']).toBe('attachment');

    const bin = await handler('memo-res://k_bin');
    expect(bin.statusCode).toBe(200);
    expect(bin.headers['Content-Disposition']).toBe('attachment');
  });
});
