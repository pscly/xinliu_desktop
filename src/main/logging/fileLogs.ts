import fs from 'node:fs/promises';
import path from 'node:path';

import { redactForLogs } from '../../shared/redaction';

import { resolveStorageLayout } from '../storageLayout';

/**
 * 解析主日志文件路径（仅 main 侧使用）。
 *
 * 注意：renderer 不允许直接读取此路径；也不要把绝对路径写入日志内容。
 */
export function resolveMainLogFileAbsPath(storageRootAbsPath: string): string {
  const layout = resolveStorageLayout(storageRootAbsPath);
  return path.join(layout.logsDirAbsPath, 'main.log');
}

function normalizeOneLine(input: string): string {
  return input.replace(/\r?\n/g, '\\n');
}

/**
 * 追加写入一行日志到 <root>/logs/main.log。
 *
 * 强制脱敏：写入前必须经过 redactForLogs（禁止在此复制正则）。
 */
export async function appendMainLogLine(options: {
  storageRootAbsPath: string;
  line: string;
  now?: () => Date;
}): Promise<void> {
  const now = options.now ?? (() => new Date());
  const logFileAbsPath = resolveMainLogFileAbsPath(options.storageRootAbsPath);

  await fs.mkdir(path.dirname(logFileAbsPath), { recursive: true });

  const oneLine = normalizeOneLine(options.line);
  const redacted = redactForLogs(oneLine);
  const prefix = now().toISOString();
  await fs.appendFile(logFileAbsPath, `${prefix} ${redacted}\n`, 'utf-8');
}
