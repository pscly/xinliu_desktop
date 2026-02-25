import path from 'node:path';

export const STORAGE_ROOT_DIRS = {
  db: 'db',
  attachments: 'attachments',
  attachmentsCache: 'attachments-cache',
  logs: 'logs',
  tmp: 'tmp',
  exports: 'exports',
} as const;

export type StorageRootDirKey = keyof typeof STORAGE_ROOT_DIRS;

export interface StorageLayout {
  rootAbsPath: string;
  dbDirAbsPath: string;
  attachmentsDirAbsPath: string;
  attachmentsCacheDirAbsPath: string;
  logsDirAbsPath: string;
  tmpDirAbsPath: string;
  exportsDirAbsPath: string;
}

function normalizeRootAbsPath(rootAbsPath: string): string {
  const normalized = path.resolve(rootAbsPath);
  if (!path.isAbsolute(normalized)) {
    throw new Error('rootAbsPath 必须是绝对路径');
  }
  return normalized;
}

function validateRelpath(relpath: string): void {
  if (relpath.length === 0) {
    throw new Error('relpath 不能为空');
  }

  if (relpath.includes('\\')) {
    throw new Error('relpath 只能使用 / 作为分隔符');
  }

  if (relpath.startsWith('/')) {
    throw new Error('relpath 不能以 / 开头');
  }

  if (/^[A-Za-z]:/.test(relpath)) {
    throw new Error('relpath 不能包含盘符');
  }

  if (relpath.includes('\u0000')) {
    throw new Error('relpath 包含非法字符');
  }

  const parts = relpath.split('/');
  if (parts.some((p) => p.length === 0)) {
    throw new Error('relpath 不能包含空路径段');
  }

  if (parts.some((p) => p === '.')) {
    throw new Error('relpath 不能包含 .');
  }

  if (parts.some((p) => p === '..')) {
    throw new Error('relpath 不能包含 ..');
  }
}

export function toRelpath(rootAbsPath: string, absPath: string): string {
  const root = normalizeRootAbsPath(rootAbsPath);
  const abs = path.resolve(absPath);

  const rel = path.relative(root, abs);
  const relPosix = rel.replaceAll('\\', '/');
  validateRelpath(relPosix);

  if (relPosix === '' || relPosix === '.') {
    throw new Error('absPath 不能指向 root 本身');
  }
  if (relPosix.startsWith('..')) {
    throw new Error('absPath 不在 root 目录下');
  }

  return relPosix;
}

export function fromRelpath(rootAbsPath: string, relpath: string): string {
  const root = normalizeRootAbsPath(rootAbsPath);
  validateRelpath(relpath);

  const parts = relpath.split('/').filter((p) => p.length > 0);
  const abs = path.resolve(root, ...parts);

  const relAgain = path.relative(root, abs).replaceAll('\\', '/');
  if (relAgain.startsWith('..') || relAgain === '' || relAgain === '.') {
    throw new Error('relpath 不在 root 目录下');
  }

  return abs;
}

export function resolveStorageLayout(rootAbsPath: string): StorageLayout {
  const root = normalizeRootAbsPath(rootAbsPath);

  const dbDirAbsPath = path.join(root, STORAGE_ROOT_DIRS.db);
  const attachmentsDirAbsPath = path.join(root, STORAGE_ROOT_DIRS.attachments);
  const attachmentsCacheDirAbsPath = path.join(root, STORAGE_ROOT_DIRS.attachmentsCache);
  const logsDirAbsPath = path.join(root, STORAGE_ROOT_DIRS.logs);
  const tmpDirAbsPath = path.join(root, STORAGE_ROOT_DIRS.tmp);
  const exportsDirAbsPath = path.join(root, STORAGE_ROOT_DIRS.exports);

  return {
    rootAbsPath: root,
    dbDirAbsPath,
    attachmentsDirAbsPath,
    attachmentsCacheDirAbsPath,
    logsDirAbsPath,
    tmpDirAbsPath,
    exportsDirAbsPath,
  };
}
