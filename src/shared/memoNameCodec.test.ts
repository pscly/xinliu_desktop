import { describe, expect, it } from 'vitest';

import {
  decodeMemoNameFromKey,
  decodeMemoNameFromRoute,
  encodeMemoNameForKey,
  encodeMemoNameForRoute,
} from './memoNameCodec';

describe('src/shared/memoNameCodec', () => {
  it('route: encode/decode 可 round-trip，且 / 会被编码', () => {
    const memoName = 'memos/123';
    const encoded = encodeMemoNameForRoute(memoName);
    expect(encoded).toBe('memos%2F123');
    expect(decodeMemoNameFromRoute(encoded)).toBe(memoName);
  });

  it('key: base64url(utf8) 可 round-trip，且输出不包含 +/=', () => {
    const memoName = 'memos/123';
    const key = encodeMemoNameForKey(memoName);
    expect(key).not.toMatch(/[+/=]/);
    expect(decodeMemoNameFromKey(key)).toBe(memoName);
  });
});
