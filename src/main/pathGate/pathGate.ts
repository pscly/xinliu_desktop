import crypto from 'node:crypto';
import path from 'node:path';

export type PathGateGrantKind = 'read' | 'write';

export type PathGateConsumeDeniedReason =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'ALREADY_CONSUMED'
  | 'KIND_MISMATCH'
  | 'PATH_MISMATCH'
  | 'INVALID_PATH';

export type PathGateConsumeOutcome =
  | {
      ok: true;
      grantedFileAbsPath: string;
    }
  | {
      ok: false;
      reason: PathGateConsumeDeniedReason;
    };

interface ComparableAbsPath {
  scheme: 'posix' | 'win32';
  value: string;
}

function normalizeComparableAbsPath(input: string): ComparableAbsPath | null {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw.length === 0) {
    return null;
  }

  if (path.win32.isAbsolute(raw)) {
    let normalized = path.win32.normalize(raw).replaceAll('/', '\\');
    if (/^[a-zA-Z]:/.test(normalized)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1);
    }
    return { scheme: 'win32', value: normalized.toLowerCase() };
  }

  const resolved = path.resolve(raw);
  if (!path.isAbsolute(resolved)) {
    return null;
  }
  return { scheme: 'posix', value: resolved };
}

function newGrantId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return crypto.randomBytes(16).toString('hex');
  }
}

export interface PathGateGrant {
  grantId: string;
  kind: PathGateGrantKind;
  fileAbsPath: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface CreatePathGateOptions {
  ttlMs?: number;
  now?: () => number;
}

export interface PathGate {
  createGrant: (kind: PathGateGrantKind, fileAbsPath: string) => PathGateGrant | null;

  consumeGrant: (options: {
    grantId: string;
    kind: PathGateGrantKind;
    fileAbsPath: string;
  }) => PathGateConsumeOutcome;
}

export function createPathGate(options: CreatePathGateOptions = {}): PathGate {
  const ttlMs =
    typeof options.ttlMs === 'number' && Number.isFinite(options.ttlMs)
      ? Math.max(1, Math.floor(options.ttlMs))
      : 5 * 60 * 1000;
  const now = options.now ?? (() => Date.now());

  const grants = new Map<
    string,
    {
      kind: PathGateGrantKind;
      fileAbsPath: string;
      comparable: ComparableAbsPath;
      createdAtMs: number;
      expiresAtMs: number;
      consumed: boolean;
    }
  >();

  const createGrant = (kind: PathGateGrantKind, fileAbsPath: string): PathGateGrant | null => {
    const comparable = normalizeComparableAbsPath(fileAbsPath);
    if (!comparable) {
      return null;
    }

    const createdAtMs = now();
    const expiresAtMs = createdAtMs + ttlMs;
    const grantId = newGrantId();

    grants.set(grantId, {
      kind,
      fileAbsPath,
      comparable,
      createdAtMs,
      expiresAtMs,
      consumed: false,
    });

    return { grantId, kind, fileAbsPath, createdAtMs, expiresAtMs };
  };

  const consumeGrant = (input: {
    grantId: string;
    kind: PathGateGrantKind;
    fileAbsPath: string;
  }): PathGateConsumeOutcome => {
    const comparable = normalizeComparableAbsPath(input.fileAbsPath);
    if (!comparable) {
      return { ok: false, reason: 'INVALID_PATH' };
    }

    const grant = grants.get(input.grantId);
    if (!grant) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const nowMs = now();
    if (nowMs > grant.expiresAtMs) {
      grants.delete(input.grantId);
      return { ok: false, reason: 'EXPIRED' };
    }

    if (grant.consumed) {
      grants.delete(input.grantId);
      return { ok: false, reason: 'ALREADY_CONSUMED' };
    }

    if (grant.kind !== input.kind) {
      return { ok: false, reason: 'KIND_MISMATCH' };
    }

    if (
      grant.comparable.scheme !== comparable.scheme ||
      grant.comparable.value !== comparable.value
    ) {
      return { ok: false, reason: 'PATH_MISMATCH' };
    }

    grant.consumed = true;
    grants.delete(input.grantId);
    return { ok: true, grantedFileAbsPath: grant.fileAbsPath };
  };

  return { createGrant, consumeGrant };
}
