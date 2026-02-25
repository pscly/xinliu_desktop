import path from 'node:path';

import { resolveStorageLayout } from '../storageLayout';

export const SQLITE_MAIN_DB_FILENAME = 'xinliu.sqlite3';

export function resolveMainDbFileAbsPath(storageRootAbsPath: string): string {
  const layout = resolveStorageLayout(storageRootAbsPath);
  return path.join(layout.dbDirAbsPath, SQLITE_MAIN_DB_FILENAME);
}
