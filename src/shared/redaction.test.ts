import { describe, expect, it } from 'vitest';

import { redactForLogs } from './redaction';

describe('src/shared/redaction', () => {
  it('应脱敏 Authorization Bearer', () => {
    const out = redactForLogs('Authorization: Bearer abc.def.ghi');
    expect(out).toBe('Authorization: Bearer <redacted>');
  });

  it('应脱敏 token / access_token', () => {
    expect(redactForLogs('token=abc')).toBe('token=<redacted>');
    expect(redactForLogs('access_token: abc')).toBe('access_token: <redacted>');
  });

  it('应脱敏绝对路径（Windows/Posix）', () => {
    expect(redactForLogs('C:\\Users\\me\\a.txt')).toBe('<path>');
    expect(redactForLogs('/home/me/a.txt')).toBe('<path>');
  });
});
