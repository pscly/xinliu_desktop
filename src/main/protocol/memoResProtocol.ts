import path from 'node:path';
import type { Stats } from 'node:fs';

import { fromRelpath, STORAGE_ROOT_DIRS } from '../storageLayout';

export const MEMO_RES_SCHEME = 'memo-res' as const;

export interface MemoResProtocolResponse {
  statusCode: number;
  headers: Record<string, string>;
  data: Buffer;
}

export interface MemoResCoreDependencies {
  storageRootAbsPath: string;
  resolveCacheKey: (cacheKey: string) => Promise<string | null>;

  reportCacheKeyAccessed?: (cacheKey: string) => Promise<void>;

  readFile: (absPath: string) => Promise<Buffer>;
  lstat: (absPath: string) => Promise<Stats>;
}

export interface MemoResProtocolLike {
  registerBufferProtocol: (
    scheme: string,
    handler: (request: { url: string }, callback: (response: MemoResProtocolResponse) => void) => void
  ) => void;
}

function emptyResponse(statusCode: number, headers: Record<string, string> = {}): MemoResProtocolResponse {
  return {
    statusCode,
    headers,
    data: Buffer.from(''),
  };
}

function isHighRiskExtension(extLowerNoDot: string): boolean {
  return [
    'exe',
    'dll',
    'bat',
    'cmd',
    'ps1',
    'vbs',
    'js',
    'msi',
    'com',
    'scr',
    'jar',
    'hta',
    'reg',
  ].includes(extLowerNoDot);
}

function safeInlineMimeForExtension(extLowerNoDot: string): string | null {
  switch (extLowerNoDot) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function normalizeExtLowerNoDot(absPath: string): string {
  const ext = path.extname(absPath).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

function isSafeOpaqueCacheKey(cacheKey: string): boolean {
  if (cacheKey.length < 3 || cacheKey.length > 200) {
    return false;
  }
  if (cacheKey.includes('/') || cacheKey.includes('\\')) {
    return false;
  }
  if (cacheKey.includes('%')) {
    return false;
  }
  if (cacheKey.includes('\u0000')) {
    return false;
  }
  return /^[A-Za-z0-9_-]+$/.test(cacheKey);
}

function parseCacheKeyFromMemoResUrl(requestUrl: string):
  | { ok: true; cacheKey: string }
  | { ok: false; statusCode: number } {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return { ok: false, statusCode: 400 };
  }

  if (parsed.protocol !== `${MEMO_RES_SCHEME}:`) {
    return { ok: false, statusCode: 400 };
  }

  if ((parsed.username ?? '').length > 0 || (parsed.password ?? '').length > 0) {
    return { ok: false, statusCode: 400 };
  }
  if ((parsed.port ?? '').length > 0) {
    return { ok: false, statusCode: 400 };
  }
  if ((parsed.search ?? '').length > 0 || (parsed.hash ?? '').length > 0) {
    return { ok: false, statusCode: 400 };
  }

  const hostKey = (parsed.hostname ?? '').trim();
  const pathname = parsed.pathname ?? '';

  let candidate = hostKey;
  if (candidate.length === 0) {
    const stripped = pathname.replace(/^\/+/, '');
    if (stripped.length === 0) {
      return { ok: false, statusCode: 404 };
    }
    if (stripped.includes('/')) {
      return { ok: false, statusCode: 400 };
    }
    candidate = stripped;
  } else {
    if (pathname !== '' && pathname !== '/') {
      return { ok: false, statusCode: 400 };
    }
  }

  if (!isSafeOpaqueCacheKey(candidate)) {
    return { ok: false, statusCode: 400 };
  }

  return { ok: true, cacheKey: candidate };
}

function isRelpathUnderWhitelistedDirs(relpath: string): boolean {
  const first = relpath.split('/')[0] ?? '';
  return first === STORAGE_ROOT_DIRS.attachmentsCache || first === STORAGE_ROOT_DIRS.attachments;
}

async function assertNoSymlinkInPathChain(args: {
  rootAbsPath: string;
  targetAbsPath: string;
  lstat: (absPath: string) => Promise<Stats>;
}): Promise<void> {
  const root = path.resolve(args.rootAbsPath);
  const target = path.resolve(args.targetAbsPath);
  const rel = path.relative(root, target);

  if (rel === '' || rel === '.' || rel.startsWith('..')) {
    throw Object.assign(new Error('路径越界'), { code: 'EOUTSIDE' });
  }

  const parts = rel.split(path.sep).filter((p) => p.length > 0);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const st = await args.lstat(current);
    if (st.isSymbolicLink()) {
      throw Object.assign(new Error('拒绝 symlink'), { code: 'ESYMLINK' });
    }
  }
}

export function createMemoResHandler(deps: MemoResCoreDependencies): (requestUrl: string) => Promise<MemoResProtocolResponse> {
  return async (requestUrl: string) => {
    const parsed = parseCacheKeyFromMemoResUrl(requestUrl);
    if (!parsed.ok) {
      return emptyResponse(parsed.statusCode, {
        'X-Content-Type-Options': 'nosniff',
      });
    }

    const cacheKey = parsed.cacheKey;
    const relpath = await deps.resolveCacheKey(cacheKey);
    if (!relpath) {
      return emptyResponse(404, {
        'X-Content-Type-Options': 'nosniff',
      });
    }

    if (!isRelpathUnderWhitelistedDirs(relpath)) {
      return emptyResponse(403, {
        'X-Content-Type-Options': 'nosniff',
      });
    }

    let absPath: string;
    try {
      absPath = fromRelpath(deps.storageRootAbsPath, relpath);
    } catch {
      return emptyResponse(404, {
        'X-Content-Type-Options': 'nosniff',
      });
    }

    try {
      await assertNoSymlinkInPathChain({
        rootAbsPath: deps.storageRootAbsPath,
        targetAbsPath: absPath,
        lstat: deps.lstat,
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'ENOENT') {
        return emptyResponse(404, { 'X-Content-Type-Options': 'nosniff' });
      }
      if (code === 'ESYMLINK' || code === 'EOUTSIDE') {
        return emptyResponse(403, { 'X-Content-Type-Options': 'nosniff' });
      }
      return emptyResponse(500, { 'X-Content-Type-Options': 'nosniff' });
    }

    let data: Buffer;
    try {
      data = await deps.readFile(absPath);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'ENOENT') {
        return emptyResponse(404, { 'X-Content-Type-Options': 'nosniff' });
      }
      return emptyResponse(500, { 'X-Content-Type-Options': 'nosniff' });
    }

    try {
      await deps.reportCacheKeyAccessed?.(cacheKey);
    } catch (error) {
      void error;
    }

    const ext = normalizeExtLowerNoDot(absPath);
    const safeInlineMime = safeInlineMimeForExtension(ext);
    const isHighRisk = isHighRiskExtension(ext);

    const contentType = safeInlineMime ?? 'application/octet-stream';
    const contentDisposition = safeInlineMime && !isHighRisk ? 'inline' : 'attachment';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'X-Content-Type-Options': 'nosniff',
      },
      data,
    };
  };
}

export function installMemoResProtocol(
  protocol: MemoResProtocolLike,
  deps: MemoResCoreDependencies
): void {
  const handler = createMemoResHandler(deps);

  protocol.registerBufferProtocol(MEMO_RES_SCHEME, (request, callback) => {
    void handler(request.url)
      .then((res) => callback(res))
      .catch(() => {
        callback(
          emptyResponse(500, {
            'X-Content-Type-Options': 'nosniff',
          })
        );
      });
  });
}
