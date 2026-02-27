// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createPathGate } from './pathGate';

describe('src/main/pathGate/pathGate', () => {
  it('拒绝未授权路径（posix 例：/etc/passwd）', () => {
    const gate = createPathGate({ now: () => 1_000_000, ttlMs: 60_000 });
    const grant = gate.createGrant('write', '/tmp/xinliu-export.txt');
    expect(grant).not.toBeNull();
    if (!grant) {
      return;
    }

    const denied = gate.consumeGrant({
      grantId: grant.grantId,
      kind: 'write',
      fileAbsPath: '/etc/passwd',
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe('PATH_MISMATCH');
    }
  });

  it('拒绝未授权路径（win32 例：C:\\Windows\\...）', () => {
    const gate = createPathGate({ now: () => 1_000_000, ttlMs: 60_000 });
    const grant = gate.createGrant('read', 'C:\\Users\\Alice\\Desktop\\note.md');
    expect(grant).not.toBeNull();
    if (!grant) {
      return;
    }

    const denied = gate.consumeGrant({
      grantId: grant.grantId,
      kind: 'read',
      fileAbsPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe('PATH_MISMATCH');
    }
  });

  it('成功消费后必须 one-shot 失效', () => {
    const gate = createPathGate({ now: () => 1_000_000, ttlMs: 60_000 });
    const grant = gate.createGrant('read', '/tmp/a.txt');
    expect(grant).not.toBeNull();
    if (!grant) {
      return;
    }

    const ok1 = gate.consumeGrant({
      grantId: grant.grantId,
      kind: 'read',
      fileAbsPath: '/tmp/a.txt',
    });
    expect(ok1.ok).toBe(true);

    const ok2 = gate.consumeGrant({
      grantId: grant.grantId,
      kind: 'read',
      fileAbsPath: '/tmp/a.txt',
    });
    expect(ok2.ok).toBe(false);
    if (!ok2.ok) {
      expect(ok2.reason).toBe('NOT_FOUND');
    }
  });

  it('过期后必须拒绝', () => {
    let nowMs = 1_000_000;
    const gate = createPathGate({ now: () => nowMs, ttlMs: 10 });
    const grant = gate.createGrant('write', '/tmp/b.txt');
    expect(grant).not.toBeNull();
    if (!grant) {
      return;
    }

    nowMs += 20;
    const denied = gate.consumeGrant({
      grantId: grant.grantId,
      kind: 'write',
      fileAbsPath: '/tmp/b.txt',
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe('EXPIRED');
    }
  });
});
