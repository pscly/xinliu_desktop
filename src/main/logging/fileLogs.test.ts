// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { appendMainLogLine, resolveMainLogFileAbsPath } from './fileLogs';

describe('src/main/logging/fileLogs', () => {
  it('写入日志文件前必须强制脱敏（Authorization/token/绝对路径）', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xinliu-logs-'));

    await appendMainLogLine({
      storageRootAbsPath: tmpRoot,
      line: 'Authorization: Bearer abc.def.ghi token=abc /home/me/a.txt C:\\Users\\me\\a.txt',
    });

    const logFileAbsPath = resolveMainLogFileAbsPath(tmpRoot);
    const content = await fs.readFile(logFileAbsPath, 'utf-8');

    expect(content).toContain('Authorization: Bearer <redacted>');
    expect(content).toContain('token=<redacted>');
    expect(content).toContain('<path>');

    expect(content).not.toContain('abc.def.ghi');
    expect(content).not.toContain('/home/me/a.txt');
    expect(content).not.toContain('C:\\Users\\me\\a.txt');
  });
});
