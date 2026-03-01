import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  protocol,
  shell,
  Tray,
} from 'electron';
import type { WebContents } from 'electron';

import Database from 'better-sqlite3';

import { IPC_EVENTS } from '../shared/ipc';
import { normalizeBaseUrl } from '../shared/url';
import { registerIpcHandlers } from './ipc';
import { createQuickCaptureController } from './quickCapture/quickCaptureController';
import { createQuickCaptureWindowManager } from './quickCapture/quickCaptureWindowManager';
import { buildSecureBrowserWindowOptions, installNavigationGuards } from './security';
import {
  createShortcutsManager,
  installShortcutsCleanupOnWillQuit,
} from './shortcuts/shortcutManager';
import {
  createCloseToTrayController,
  installTrayManager,
  type CleanupHook,
  runCleanupHooks,
} from './tray/trayManager';

import { readStorageRootStatus, writeStorageRootConfig } from './storageRoot/storageRootConfig';
import { migrateStorageRoot } from './storageRoot/migrateStorageRoot';
import { installMemoResProtocol } from './protocol/memoResProtocol';
import { resolveMainDbFileAbsPath } from './db/paths';
import { openSqliteDatabase, closeSqliteDatabase } from './db/sqlite';
import { applyMigrations } from './db/migrations';
import { createDiagnosticsController } from './diagnostics/diagnosticsController';
import { popupFolderContextMenu, popupMiddleItemContextMenu } from './menu/contextMenu';
import { queryGlobalSearch, rebuildGlobalSearchIndex } from './search/globalSearch';
import { createPathGate } from './pathGate/pathGate';
import { createUpdaterController } from './updater/updaterController';
import { createElectronUpdaterAdapter } from './updater/electronUpdaterAdapter';
import { createCollectionsRepo } from './collections/collectionsRepo';
import { createTodoRepo } from './todo/todoRepo';
import { createNotesDraftRepo } from './notes/notesDraftRepo';
import { createNotesListRepo } from './notes/notesListRepo';
import { createNotesConflictsService } from './notes/notesConflicts';
import {
  listFlowConflicts,
  resolveFlowConflictApplyServer,
  resolveFlowConflictForceOverride,
  resolveFlowConflictKeepLocalCopy,
} from './flow/flowConflicts';
import {
  readCloseBehaviorStatus,
  writeCloseBehavior,
  writeCloseToTrayHintShown,
} from './userSettings/closeBehaviorSettings';
import {
  readBackendSettingsStatus,
  writeFlowBaseUrlRaw,
  writeMemosBaseUrlRaw,
} from './userSettings/backendSettings';
import { createTokenStore } from './auth/tokenStore';
import { getOrCreateDeviceIdentityFromConfig } from './device/deviceIdentityConfig';
import { createSyncController } from './sync/syncController';

const closeToTray = createCloseToTrayController();

// E2E/CI 可复现的干净 userData：避免被本机历史 user_settings 影响。
// - `XINLIU_USER_DATA_DIR`：显式指定 userData 目录（最高优先级）。
// - `XINLIU_E2E=1`：自动选择一个全新的临时 userData 目录。
// 说明：必须在 app.whenReady() 之前 setPath，才能影响后续 getPath('userData')。
(() => {
  const explicitDir = (process.env.XINLIU_USER_DATA_DIR ?? '').trim();
  const e2eEnabled = (process.env.XINLIU_E2E ?? '').trim() === '1';
  if (!e2eEnabled && explicitDir.length === 0) {
    return;
  }

  const runIdRaw = (process.env.XINLIU_E2E_RUN_ID ?? crypto.randomUUID()).trim();
  const runId = runIdRaw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

  const userDataDirAbsPath =
    explicitDir.length > 0
      ? explicitDir
      : path.join(os.tmpdir(), `xinliu-e2e-user-data-${runId || 'run'}`);

  try {
    fsSync.mkdirSync(userDataDirAbsPath, { recursive: true });
  } catch (error) {
    console.warn('创建 E2E userData 目录失败', { error: String(error) });
  }

  try {
    app.setPath('userData', userDataDirAbsPath);
  } catch (error) {
    console.warn('设置 E2E userData 目录失败', { error: String(error) });
  }
})();

type WithMainDb = <T>(run: (db: Database.Database) => T) => T;

let withMainDbRef: WithMainDb | null = null;
let e2eCollectionsSeeded = false;
let e2eCollectionsFallbackWarned = false;
let e2eTodoSeeded = false;
let e2eTodoFallbackWarned = false;

type E2eCollectionItem = {
  id: string;
  itemType: 'folder';
  parentId: string | null;
  name: string;
  color: string | null;
  refType: null;
  refId: null;
  sortOrder: number;
  clientUpdatedAtMs: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

let e2eCollectionsFallbackItemsById: Record<string, E2eCollectionItem> | null = null;

const E2E_COLLECTION_ROOT_ID = 'e2e_folder_root';
const E2E_COLLECTION_CHILD_ID = 'e2e_folder_child';
const E2E_COLLECTION_TARGET_ID = 'e2e_folder_target';

const E2E_TODO_LIST_ID = 'e2e_todo_list_inbox';
const E2E_TODO_ITEM_1_ID = 'e2e_todo_item_1';
const E2E_TODO_ITEM_2_ID = 'e2e_todo_item_2';

function seedE2eCollectionsTreeIfNeeded(db: Database.Database): void {
  if ((process.env.XINLIU_E2E ?? '').trim() !== '1') {
    return;
  }
  if (e2eCollectionsSeeded) {
    return;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  db.prepare(
    `
      INSERT OR IGNORE INTO collection_items (
        id,
        item_type,
        parent_id,
        name,
        color,
        ref_type,
        ref_id,
        sort_order,
        client_updated_at_ms,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @item_type,
        @parent_id,
        @name,
        NULL,
        NULL,
        NULL,
        @sort_order,
        @client_updated_at_ms,
        @created_at,
        @updated_at,
        NULL
      )
    `
  ).run({
    id: E2E_COLLECTION_ROOT_ID,
    item_type: 'folder',
    parent_id: null,
    name: 'E2E Root Folder',
    sort_order: 0,
    client_updated_at_ms: nowMs,
    created_at: nowIso,
    updated_at: nowIso,
  });

  db.prepare(
    `
      INSERT OR IGNORE INTO collection_items (
        id,
        item_type,
        parent_id,
        name,
        color,
        ref_type,
        ref_id,
        sort_order,
        client_updated_at_ms,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @item_type,
        @parent_id,
        @name,
        NULL,
        NULL,
        NULL,
        @sort_order,
        @client_updated_at_ms,
        @created_at,
        @updated_at,
        NULL
      )
    `
  ).run({
    id: E2E_COLLECTION_CHILD_ID,
    item_type: 'folder',
    parent_id: E2E_COLLECTION_ROOT_ID,
    name: 'E2E Child Folder',
    sort_order: 0,
    client_updated_at_ms: nowMs + 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  db.prepare(
    `
      INSERT OR IGNORE INTO collection_items (
        id,
        item_type,
        parent_id,
        name,
        color,
        ref_type,
        ref_id,
        sort_order,
        client_updated_at_ms,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @item_type,
        @parent_id,
        @name,
        NULL,
        NULL,
        NULL,
        @sort_order,
        @client_updated_at_ms,
        @created_at,
        @updated_at,
        NULL
      )
    `
  ).run({
    id: E2E_COLLECTION_TARGET_ID,
    item_type: 'folder',
    parent_id: null,
    name: 'E2E Target Folder',
    sort_order: 1,
    client_updated_at_ms: nowMs + 2,
    created_at: nowIso,
    updated_at: nowIso,
  });

  e2eCollectionsSeeded = true;
}

function seedE2eTodoIfNeeded(db: Database.Database): void {
  if ((process.env.XINLIU_E2E ?? '').trim() !== '1') {
    return;
  }
  if (e2eTodoSeeded) {
    return;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  db.prepare(
    `
      INSERT OR IGNORE INTO todo_lists (
        id,
        name,
        color,
        sort_order,
        archived,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @name,
        NULL,
        @sort_order,
        0,
        @client_updated_at_ms,
        @updated_at,
        NULL
      )
    `
  ).run({
    id: E2E_TODO_LIST_ID,
    name: 'E2E Inbox',
    sort_order: 0,
    client_updated_at_ms: nowMs,
    updated_at: nowIso,
  });

  const insertItem = db.prepare(
    `
      INSERT OR IGNORE INTO todo_items (
        id,
        list_id,
        parent_id,
        title,
        note,
        status,
        priority,
        due_at_local,
        completed_at_local,
        sort_order,
        tags_json,
        is_recurring,
        rrule,
        dtstart_local,
        tzid,
        reminders_json,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @list_id,
        NULL,
        @title,
        '',
        'todo',
        0,
        NULL,
        NULL,
        @sort_order,
        '[]',
        0,
        NULL,
        NULL,
        'Asia/Shanghai',
        '[]',
        @client_updated_at_ms,
        @updated_at,
        NULL
      )
    `
  );

  insertItem.run({
    id: E2E_TODO_ITEM_1_ID,
    list_id: E2E_TODO_LIST_ID,
    title: 'E2E Todo #1',
    sort_order: 0,
    client_updated_at_ms: nowMs + 1,
    updated_at: nowIso,
  });

  insertItem.run({
    id: E2E_TODO_ITEM_2_ID,
    list_id: E2E_TODO_LIST_ID,
    title: 'E2E Todo #2（用于删除/恢复/硬删）',
    sort_order: 1,
    client_updated_at_ms: nowMs + 2,
    updated_at: nowIso,
  });

  e2eTodoSeeded = true;
}

function isE2eCollectionsFallbackError(error: unknown): boolean {
  if ((process.env.XINLIU_E2E ?? '').trim() !== '1') {
    return false;
  }
  const message = String(error);
  return (
    message.includes('Module did not self-register') && message.includes('better_sqlite3.node')
  );
}

function isE2eTodoFallbackError(error: unknown): boolean {
  if ((process.env.XINLIU_E2E ?? '').trim() !== '1') {
    return false;
  }
  const message = String(error);
  return (
    message.includes('Module did not self-register') && message.includes('better_sqlite3.node')
  );
}

type E2eTodoItem = {
  id: string;
  listId: string;
  title: string;
  note: string;
  status: string;
  completedAtLocal: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

let e2eTodoFallbackItemsById: Record<string, E2eTodoItem> | null = null;

function getE2eTodoFallbackItemsById(): Record<string, E2eTodoItem> {
  if (e2eTodoFallbackItemsById) {
    return e2eTodoFallbackItemsById;
  }
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  e2eTodoFallbackItemsById = {
    [E2E_TODO_ITEM_1_ID]: {
      id: E2E_TODO_ITEM_1_ID,
      listId: E2E_TODO_LIST_ID,
      title: 'E2E Todo #1',
      note: '',
      status: 'todo',
      completedAtLocal: null,
      updatedAt: nowIso,
      deletedAt: null,
    },
    [E2E_TODO_ITEM_2_ID]: {
      id: E2E_TODO_ITEM_2_ID,
      listId: E2E_TODO_LIST_ID,
      title: 'E2E Todo #2（用于删除/恢复/硬删）',
      note: '',
      status: 'todo',
      completedAtLocal: null,
      updatedAt: nowIso,
      deletedAt: null,
    },
  };
  return e2eTodoFallbackItemsById;
}

function isTodoCompleted(item: { status: string; completedAtLocal: string | null }): boolean {
  if (item.completedAtLocal) {
    return true;
  }
  const s = item.status.trim().toLowerCase();
  return s === 'done' || s === 'completed';
}

function listTodoItemsFromE2eFallback(args: {
  scope: 'active' | 'completed' | 'trash';
  limit: number;
  offset: number;
}) {
  const byId = getE2eTodoFallbackItemsById();
  const rows = Object.values(byId)
    .filter((item) => {
      const deleted = item.deletedAt !== null;
      const completed = isTodoCompleted(item);
      if (args.scope === 'trash') return deleted;
      if (deleted) return false;
      return args.scope === 'completed' ? completed : !completed;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const paged = rows.slice(args.offset, args.offset + args.limit + 1);
  return {
    items: paged.slice(0, args.limit).map((item) => ({
      id: item.id,
      listId: item.listId,
      title: item.title,
      note: item.note,
      completed: isTodoCompleted(item),
      status: item.status,
      completedAtLocal: item.completedAtLocal,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    })),
    hasMore: paged.length > args.limit,
  };
}

function toggleTodoCompleteInE2eFallback(id: string): { id: string; completed: boolean } {
  const byId = getE2eTodoFallbackItemsById();
  const item = byId[id];
  if (!item || item.deletedAt !== null) {
    throw new Error('todo item 不存在');
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const completed = !isTodoCompleted(item);
  byId[id] = {
    ...item,
    status: completed ? 'done' : 'todo',
    completedAtLocal: completed ? nowIso : null,
    updatedAt: nowIso,
  };

  return { id, completed };
}

function softDeleteTodoInE2eFallback(id: string): void {
  const byId = getE2eTodoFallbackItemsById();
  const item = byId[id];
  if (!item || item.deletedAt !== null) {
    throw new Error('todo item 不存在');
  }
  const nowIso = new Date(Date.now()).toISOString();
  byId[id] = { ...item, deletedAt: nowIso, updatedAt: nowIso };
}

function restoreTodoInE2eFallback(id: string): void {
  const byId = getE2eTodoFallbackItemsById();
  const item = byId[id];
  if (!item || item.deletedAt === null) {
    throw new Error('todo item 不存在');
  }
  const nowIso = new Date(Date.now()).toISOString();
  byId[id] = { ...item, deletedAt: null, updatedAt: nowIso };
}

function hardDeleteTodoInE2eFallback(id: string): void {
  const byId = getE2eTodoFallbackItemsById();
  const item = byId[id];
  if (!item) {
    throw new Error('todo item 不存在');
  }
  if (item.deletedAt === null) {
    throw new Error('只能彻底删除回收站中的 todo item');
  }
  delete byId[id];
}

function bulkCompleteTodoInE2eFallback(ids: string[]): void {
  for (const id of ids) {
    const byId = getE2eTodoFallbackItemsById();
    const item = byId[id];
    if (!item || item.deletedAt !== null) {
      continue;
    }
    if (isTodoCompleted(item)) {
      continue;
    }
    toggleTodoCompleteInE2eFallback(id);
  }
}

function bulkDeleteTodoInE2eFallback(ids: string[]): void {
  for (const id of ids) {
    const byId = getE2eTodoFallbackItemsById();
    const item = byId[id];
    if (!item || item.deletedAt !== null) {
      continue;
    }
    softDeleteTodoInE2eFallback(id);
  }
}

function withTodoDbOrE2eFallback<T>(runDb: () => T, runFallback: () => T): T {
  try {
    return runDb();
  } catch (error) {
    if (!isE2eTodoFallbackError(error)) {
      throw error;
    }
    if (!e2eTodoFallbackWarned) {
      console.warn('Todo E2E 回退到内存数据（better-sqlite3 在 Playwright/Electron 环境加载失败）');
      e2eTodoFallbackWarned = true;
    }
    return runFallback();
  }
}

function getE2eCollectionsFallbackItemsById(): Record<string, E2eCollectionItem> {
  if (e2eCollectionsFallbackItemsById) {
    return e2eCollectionsFallbackItemsById;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  e2eCollectionsFallbackItemsById = {
    [E2E_COLLECTION_ROOT_ID]: {
      id: E2E_COLLECTION_ROOT_ID,
      itemType: 'folder',
      parentId: null,
      name: 'E2E Root Folder',
      color: null,
      refType: null,
      refId: null,
      sortOrder: 0,
      clientUpdatedAtMs: nowMs,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    },
    [E2E_COLLECTION_CHILD_ID]: {
      id: E2E_COLLECTION_CHILD_ID,
      itemType: 'folder',
      parentId: E2E_COLLECTION_ROOT_ID,
      name: 'E2E Child Folder',
      color: null,
      refType: null,
      refId: null,
      sortOrder: 0,
      clientUpdatedAtMs: nowMs + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    },
    [E2E_COLLECTION_TARGET_ID]: {
      id: E2E_COLLECTION_TARGET_ID,
      itemType: 'folder',
      parentId: null,
      name: 'E2E Target Folder',
      color: null,
      refType: null,
      refId: null,
      sortOrder: 1,
      clientUpdatedAtMs: nowMs + 2,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    },
  };
  return e2eCollectionsFallbackItemsById;
}

function listCollectionsFromE2eFallback(args: {
  parentId: string | null;
  limit: number;
  offset: number;
}) {
  const byId = getE2eCollectionsFallbackItemsById();
  const rows = Object.values(byId)
    .filter((item) => item.deletedAt === null && item.parentId === args.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const paged = rows.slice(args.offset, args.offset + args.limit + 1);
  return {
    items: paged.slice(0, args.limit),
    hasMore: paged.length > args.limit,
  };
}

function moveCollectionInE2eFallback(itemId: string, newParentId: string | null) {
  const byId = getE2eCollectionsFallbackItemsById();
  const item = byId[itemId];
  if (!item || item.deletedAt !== null) {
    throw new Error('collection item 不存在');
  }

  if (newParentId !== null) {
    const parent = byId[newParentId];
    if (!parent) {
      throw new Error('parent 不存在');
    }
    if (parent.deletedAt !== null) {
      throw new Error('parent 必须是未删除的 folder');
    }
    if (parent.itemType !== 'folder') {
      throw new Error('parent 必须是 folder');
    }
  }

  if (newParentId === itemId) {
    throw new Error('不能把 parent_id 设置为自己');
  }

  if (newParentId !== null && item.itemType === 'folder') {
    let cursor: string | null = newParentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === itemId) {
        throw new Error('不能把 folder 移动到其子孙节点下');
      }
      if (visited.has(cursor)) {
        break;
      }
      visited.add(cursor);
      cursor = byId[cursor]?.parentId ?? null;
    }
  }

  const nowMs = Date.now();
  const nextClientUpdatedAtMs = Math.max(nowMs, item.clientUpdatedAtMs + 1);
  byId[itemId] = {
    ...item,
    parentId: newParentId,
    clientUpdatedAtMs: nextClientUpdatedAtMs,
    updatedAt: new Date(nextClientUpdatedAtMs).toISOString(),
  };

  return {
    itemId,
    parentId: newParentId,
  };
}

function withCollectionsDbOrE2eFallback<T>(runDb: () => T, runFallback: () => T): T {
  try {
    return runDb();
  } catch (error) {
    if (!isE2eCollectionsFallbackError(error)) {
      throw error;
    }
    if (!e2eCollectionsFallbackWarned) {
      console.warn(
        'Collections E2E 回退到内存数据（better-sqlite3 在 Playwright/Electron 环境加载失败）'
      );
      e2eCollectionsFallbackWarned = true;
    }
    return runFallback();
  }
}

let mainWindow: BrowserWindow | null = null;
let trayManager: ReturnType<typeof installTrayManager> | null = null;

function showFirstCloseToTrayHintOncePerRun(): void {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({
    title: '心流',
    body: '已最小化到托盘。右键托盘图标可退出应用。',
  }).show();
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(
    buildSecureBrowserWindowOptions({
      width: 1200,
      height: 780,
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
      },
    })
  );

  installNavigationGuards(win.webContents, {
    openExternal: (url) => shell.openExternal(url),
  });

  const indexHtmlPath = path.join(__dirname, '../renderer/index.html');
  void win.loadFile(indexHtmlPath);

  win.on('close', (event) => {
    closeToTray.handleWindowClose(
      event,
      {
        hide: () => win.hide(),
      },
      {
        onCloseToQuit: () => app.quit(),
        onFirstCloseToTrayHint: () => {
          try {
            withMainDbRef?.((db) => writeCloseToTrayHintShown(db, true));
          } catch (error) {
            console.warn(String(error));
          }
          showFirstCloseToTrayHintOncePerRun();
        },
      }
    );
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  mainWindow = createMainWindow();
  return mainWindow;
}

function toggleMainWindow(): void {
  const win = ensureMainWindow();
  if (win.isVisible()) {
    win.hide();
    return;
  }
  win.show();
  win.focus();
}

app.whenReady().then(async () => {
  const indexHtmlPath = path.join(__dirname, '../renderer/index.html');
  const preloadPath = path.join(__dirname, '../preload/index.js');

  const storageRootConfigFs = {
    readFile: async (fileAbsPath: string) => fs.readFile(fileAbsPath, 'utf-8'),
    writeFile: async (fileAbsPath: string, content: string) =>
      fs.writeFile(fileAbsPath, content, 'utf-8'),
    mkdir: async (dirAbsPath: string, options: { recursive: boolean }) => {
      await fs.mkdir(dirAbsPath, options);
    },
    rename: async (fromAbsPath: string, toAbsPath: string) => fs.rename(fromAbsPath, toAbsPath),
    rm: async (absPath: string, options: { force: boolean }) =>
      fs.rm(absPath, { force: options.force }),
  };

  const storageRootMigrationFs = {
    stat: (p: string) => fs.stat(p),
    mkdir: async (p: string, options: { recursive: boolean }) => {
      await fs.mkdir(p, options);
    },
    readdir: (p: string) => fs.readdir(p),
    copyFile: (from: string, to: string) => fs.copyFile(from, to),
    rename: (from: string, to: string) => fs.rename(from, to),
    rm: (p: string, options: { recursive: boolean; force: boolean }) => fs.rm(p, options),
    unlink: (p: string) => fs.unlink(p),
  };

  const userDataDirAbsPath = app.getPath('userData');
  const storageRootStatus = await readStorageRootStatus({
    userDataDirAbsPath,
    fs: storageRootConfigFs,
  });

  installMemoResProtocol(protocol, {
    storageRootAbsPath: storageRootStatus.storageRootAbsPath,
    resolveCacheKey: async (cacheKey) => {
      const dbFileAbsPath = resolveMainDbFileAbsPath(storageRootStatus.storageRootAbsPath);

      try {
        await fs.stat(dbFileAbsPath);
      } catch {
        return null;
      }

      let db: Database.Database | null = null;
      try {
        db = new Database(dbFileAbsPath, {
          readonly: true,
          fileMustExist: true,
        });

        const row = db
          .prepare(
            `
              SELECT cache_relpath, local_relpath
              FROM memo_attachments
              WHERE cache_key = ?
              LIMIT 1
            `
          )
          .get(cacheKey) as
          | { cache_relpath?: string | null; local_relpath?: string | null }
          | undefined;

        const cacheRelpath = typeof row?.cache_relpath === 'string' ? row.cache_relpath.trim() : '';
        if (cacheRelpath.length > 0) {
          return cacheRelpath;
        }

        const localRelpath = typeof row?.local_relpath === 'string' ? row.local_relpath.trim() : '';
        if (localRelpath.length > 0) {
          return localRelpath;
        }

        return null;
      } catch {
        return null;
      } finally {
        try {
          db?.close();
        } catch {}
      }
    },
    reportCacheKeyAccessed: async (cacheKey) => {
      const dbFileAbsPath = resolveMainDbFileAbsPath(storageRootStatus.storageRootAbsPath);

      try {
        await fs.stat(dbFileAbsPath);
      } catch {
        return;
      }

      let db: Database.Database | null = null;
      try {
        db = new Database(dbFileAbsPath, {
          readonly: false,
          fileMustExist: true,
          timeout: 50,
        });
        db.prepare(
          `
            UPDATE memo_attachments
            SET last_access_at_ms = @last_access_at_ms
            WHERE cache_key = @cache_key
          `
        ).run({
          cache_key: cacheKey,
          last_access_at_ms: Date.now(),
        });
      } catch {
        return;
      } finally {
        try {
          db?.close();
        } catch {}
      }
    },
    readFile: (absPath) => fs.readFile(absPath),
    lstat: (absPath) => fs.lstat(absPath),
  });

  const quickCaptureWindowManager = createQuickCaptureWindowManager({
    preloadPath,
    indexHtmlPath,
    isExitRequested: () => closeToTray.isExitRequested(),
  });

  const quickCaptureController = createQuickCaptureController({
    ensureWindow: () => quickCaptureWindowManager.ensureWindow(),
    saveQuickCapture: async () => undefined,
  });

  const onQuickCapture = () => {
    quickCaptureController.open();
  };

  const onOpenMainAndFocusSearch = () => {
    const win = ensureMainWindow();
    win.show();
    win.focus();
    try {
      win.webContents.send(IPC_EVENTS.shortcuts.focusSearch);
    } catch (error) {
      console.warn('发送 focusSearch 事件失败', { error: String(error) });
    }
  };

  const shortcutsManager = createShortcutsManager({
    globalShortcut,
    definitions: [
      {
        id: 'openQuickCapture',
        title: '打开快捕窗',
        description: '打开快速捕获入口（当前复用托盘“快速捕获”回调）',
        defaultAccelerator: 'CommandOrControl+Shift+Q',
        action: onQuickCapture,
      },
      {
        id: 'openMainAndFocusSearch',
        title: '打开主窗并聚焦搜索框',
        description: '显示主窗口并将焦点移动到搜索输入框',
        defaultAccelerator: 'CommandOrControl+K',
        action: onOpenMainAndFocusSearch,
      },
    ],
  });

  shortcutsManager.registerAll();
  installShortcutsCleanupOnWillQuit(app, shortcutsManager);

  const pathGate = createPathGate();

  const releasesUrl = 'https://github.com/pscly/xinliu_desktop/releases';
  const updater = createUpdaterController({
    enabled: app.isPackaged,
    currentVersion: app.getVersion(),
    releasesUrl,
    adapter: app.isPackaged ? createElectronUpdaterAdapter() : undefined,
    onStatusChanged: (status) => {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.webContents.send(IPC_EVENTS.updater.statusChanged, { status });
        } catch {}
      }
    },
  });

  const withMainDb: WithMainDb = <T>(run: (db: Database.Database) => T): T => {
    const dbFileAbsPath = resolveMainDbFileAbsPath(storageRootStatus.storageRootAbsPath);
    const { db } = openSqliteDatabase({
      dbFileAbsPath,
      busyTimeoutMs: 2000,
    });
    try {
      applyMigrations(db);
      seedE2eCollectionsTreeIfNeeded(db);
      seedE2eTodoIfNeeded(db);
      return run(db);
    } finally {
      closeSqliteDatabase(db);
    }
  };

  withMainDbRef = withMainDb;

  const initialBackendSettings = (() => {
    try {
      return withMainDb((db) => readBackendSettingsStatus(db));
    } catch (error) {
      console.warn(String(error));
      return { flowBaseUrlRaw: null, memosBaseUrlRaw: null };
    }
  })();

  const diagnostics = createDiagnosticsController({
    flowBaseUrlRaw: initialBackendSettings.flowBaseUrlRaw,
    memosBaseUrlRaw: initialBackendSettings.memosBaseUrlRaw,
  });

  const initialCloseBehaviorStatus = (() => {
    try {
      return withMainDb((db) => readCloseBehaviorStatus(db));
    } catch (error) {
      console.warn(String(error));
      return { behavior: 'hide' as const, closeToTrayHintShown: false };
    }
  })();

  closeToTray.setCloseBehavior(initialCloseBehaviorStatus.behavior);
  closeToTray.setCloseToTrayHintShown(initialCloseBehaviorStatus.closeToTrayHintShown);

  const tokenStore = createTokenStore({
    service: 'cc.pscly.xinliu.desktop',
    account: 'flow_token',
  });

  const deviceIdentity = await getOrCreateDeviceIdentityFromConfig({
    userDataDirAbsPath,
    fs: storageRootConfigFs,
    hostname: os.hostname(),
    randomUUID: () => crypto.randomUUID(),
  });

  const sleepMs = async (ms: number) => {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, Math.floor(ms))));
  };

  const withMainDbAsync = async <T>(run: (db: Database.Database) => Promise<T>): Promise<T> => {
    const dbFileAbsPath = resolveMainDbFileAbsPath(storageRootStatus.storageRootAbsPath);
    const { db } = openSqliteDatabase({
      dbFileAbsPath,
      busyTimeoutMs: 2000,
    });
    try {
      applyMigrations(db);
      seedE2eCollectionsTreeIfNeeded(db);
      seedE2eTodoIfNeeded(db);
      return await run(db);
    } finally {
      closeSqliteDatabase(db);
    }
  };

  const syncController = createSyncController({
    getFlowBaseUrl: () => diagnostics.getStatus().flowBaseUrl,
    getMemosBaseUrl: () => diagnostics.getStatus().memosBaseUrl,
    getToken: () => tokenStore.getToken(),
    getDeviceIdentity: () => deviceIdentity,
    getStorageRootAbsPath: () => storageRootStatus.storageRootAbsPath,
    withMainDbAsync,
    sleepMs,
  });

  syncController.start();

  registerIpcHandlers(ipcMain, {
    getWindowForSender: (sender) => BrowserWindow.fromWebContents(sender as WebContents),
    quickCapture: {
      open: () => quickCaptureController.open(),
      hide: () => quickCaptureController.hide(),
      submit: (content) => quickCaptureController.submit(content),
      cancel: () => quickCaptureController.cancel(),
    },
    shortcuts: {
      getStatus: () => shortcutsManager.getStatus(),
      setConfig: (payload) => shortcutsManager.setConfig(payload),
      resetAll: () => shortcutsManager.resetAll(),
      resetOne: (id) => shortcutsManager.resetOne(id),
    },
    storageRoot: {
      getStatus: async () => {
        const userDataDirAbsPath = app.getPath('userData');
        return readStorageRootStatus({
          userDataDirAbsPath,
          fs: storageRootConfigFs,
        });
      },
      chooseAndMigrate: async () => {
        const userDataDirAbsPath = app.getPath('userData');
        const status = await readStorageRootStatus({
          userDataDirAbsPath,
          fs: storageRootConfigFs,
        });

        const oldRootAbsPath = status.storageRootAbsPath;
        const win = ensureMainWindow();
        win.show();
        win.focus();

        const picked = await dialog.showOpenDialog(win, {
          title: '选择数据存储目录',
          buttonLabel: '使用此目录',
          properties: ['openDirectory', 'createDirectory'],
        });

        if (picked.canceled || picked.filePaths.length === 0) {
          return { kind: 'cancelled' } as const;
        }

        const newRootAbsPath = path.resolve(picked.filePaths[0] ?? '');
        if (newRootAbsPath.length === 0) {
          return { kind: 'cancelled' } as const;
        }
        if (path.resolve(oldRootAbsPath) === newRootAbsPath) {
          return { kind: 'cancelled' } as const;
        }

        const migrated = await migrateStorageRoot({
          oldRootAbsPath,
          newRootAbsPath,
          fs: storageRootMigrationFs,
        });

        await writeStorageRootConfig({
          userDataDirAbsPath,
          storageRootAbsPath: newRootAbsPath,
          fs: storageRootConfigFs,
        });

        return {
          kind: 'migrated',
          oldStorageRootAbsPath: oldRootAbsPath,
          newStorageRootAbsPath: newRootAbsPath,
          moved: migrated.moved,
          restartRequired: true,
        } as const;
      },
      restartNow: async () => {
        app.relaunch();
        app.exit(0);
      },
    },
    closeBehavior: {
      getStatus: () => {
        try {
          return withMainDb((db) => readCloseBehaviorStatus(db));
        } catch (error) {
          console.warn(String(error));
          return { behavior: 'hide', closeToTrayHintShown: false };
        }
      },
      setBehavior: ({ behavior }) => {
        try {
          withMainDb((db) => writeCloseBehavior(db, behavior));
        } catch (error) {
          console.warn(String(error));
        }
        closeToTray.setCloseBehavior(behavior);
      },
      resetCloseToTrayHint: () => {
        try {
          withMainDb((db) => writeCloseToTrayHintShown(db, false));
        } catch (error) {
          console.warn(String(error));
        }
        closeToTray.resetCloseToTrayHint();
      },
    },
    diagnostics: {
      getStatus: () => diagnostics.getStatus(),
      setFlowBaseUrl: ({ baseUrl }) => {
        const normalized = normalizeBaseUrl(baseUrl);
        try {
          withMainDb((db) => writeFlowBaseUrlRaw(db, normalized));
        } catch {
          throw new Error('保存 Flow Base URL 失败，请稍后重试');
        }
        diagnostics.setFlowBaseUrlRaw(normalized);
      },
      setMemosBaseUrl: ({ baseUrl }) => {
        const trimmed = baseUrl.trim();
        const normalized = trimmed.length > 0 ? normalizeBaseUrl(trimmed) : null;
        try {
          withMainDb((db) => writeMemosBaseUrlRaw(db, normalized));
        } catch {
          throw new Error('保存 Memos Base URL 失败，请稍后重试');
        }
        diagnostics.setMemosBaseUrlRaw(normalized);
      },
    },
    sync: {
      getStatus: () => syncController.getStatus(),
      syncNowFlow: async () => syncController.syncNowFlow(),
      syncNowMemos: async () => syncController.syncNowMemos(),
    },
    collections: {
      listRoots: ({ limit, offset }) =>
        withCollectionsDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const items = createCollectionsRepo(db).listCollectionItems({
                parentId: null,
                includeDeleted: false,
                limit: limit + 1,
                offset,
              });
              return {
                items: items.slice(0, limit),
                hasMore: items.length > limit,
              };
            }),
          () =>
            listCollectionsFromE2eFallback({
              parentId: null,
              limit,
              offset,
            })
        ),
      listChildren: ({ parentId, limit, offset }) =>
        withCollectionsDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const items = createCollectionsRepo(db).listCollectionItems({
                parentId,
                includeDeleted: false,
                limit: limit + 1,
                offset,
              });
              return {
                items: items.slice(0, limit),
                hasMore: items.length > limit,
              };
            }),
          () =>
            listCollectionsFromE2eFallback({
              parentId,
              limit,
              offset,
            })
        ),
      move: ({ itemId, newParentId }) =>
        withCollectionsDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const repo = createCollectionsRepo(db);
              repo.patchCollectionItem({ id: itemId, parentId: newParentId });
              return {
                itemId,
                parentId: newParentId,
              };
            }),
          () => moveCollectionInE2eFallback(itemId, newParentId)
        ),
    },
    todo: {
      listItems: ({ scope, limit, offset }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const repo = createTodoRepo(db);
              const raw = repo.listTodoItems({ includeArchivedLists: false, includeDeleted: true });

              const filtered = raw.filter((item) => {
                const deleted = item.deletedAt !== null;
                const completed = isTodoCompleted({
                  status: item.status,
                  completedAtLocal: item.completedAtLocal,
                });
                if (scope === 'trash') {
                  return deleted;
                }
                if (deleted) {
                  return false;
                }
                return scope === 'completed' ? completed : !completed;
              });

              const paged = filtered.slice(offset, offset + limit + 1);
              return {
                items: paged.slice(0, limit).map((item) => ({
                  id: item.id,
                  listId: item.listId,
                  title: item.title,
                  note: item.note,
                  completed: isTodoCompleted({
                    status: item.status,
                    completedAtLocal: item.completedAtLocal,
                  }),
                  status: item.status,
                  completedAtLocal: item.completedAtLocal,
                  updatedAt: item.updatedAt,
                  deletedAt: item.deletedAt,
                })),
                hasMore: paged.length > limit,
              };
            }),
          () => listTodoItemsFromE2eFallback({ scope, limit, offset })
        ),
      toggleComplete: ({ id }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const repo = createTodoRepo(db);
              const existing = repo.getTodoItem(id);
              if (!existing || existing.deletedAt !== null) {
                throw new Error('todo item 不存在');
              }
              const nowIso = new Date(Date.now()).toISOString();
              const completed = isTodoCompleted({
                status: existing.status,
                completedAtLocal: existing.completedAtLocal,
              });

              const nextCompleted = !completed;
              repo.patchTodoItem({
                id,
                status: nextCompleted ? 'done' : 'todo',
                completedAtLocal: nextCompleted ? nowIso : null,
              });
              return { id, completed: nextCompleted };
            }),
          () => toggleTodoCompleteInE2eFallback(id)
        ),
      softDelete: ({ id }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              createTodoRepo(db).deleteTodoItem(id);
              return null;
            }),
          () => {
            softDeleteTodoInE2eFallback(id);
            return null;
          }
        ),
      restore: ({ id }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              createTodoRepo(db).restoreTodoItem(id);
              return null;
            }),
          () => {
            restoreTodoInE2eFallback(id);
            return null;
          }
        ),
      hardDelete: ({ id }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              createTodoRepo(db).hardDeleteTodoItem(id);
              return null;
            }),
          () => {
            hardDeleteTodoInE2eFallback(id);
            return null;
          }
        ),
      bulkComplete: ({ ids }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const repo = createTodoRepo(db);
              for (const id of ids) {
                const item = repo.getTodoItem(id);
                if (!item || item.deletedAt !== null) {
                  continue;
                }
                if (
                  isTodoCompleted({ status: item.status, completedAtLocal: item.completedAtLocal })
                ) {
                  continue;
                }
                repo.patchTodoItem({
                  id,
                  status: 'done',
                  completedAtLocal: new Date(Date.now()).toISOString(),
                });
              }
              return null;
            }),
          () => {
            bulkCompleteTodoInE2eFallback(ids);
            return null;
          }
        ),
      bulkDelete: ({ ids }) =>
        withTodoDbOrE2eFallback(
          () =>
            withMainDb((db) => {
              const repo = createTodoRepo(db);
              for (const id of ids) {
                repo.deleteTodoItem(id);
              }
              return null;
            }),
          () => {
            bulkDeleteTodoInE2eFallback(ids);
            return null;
          }
        ),
    },
    notes: {
      createDraft: ({ content }) =>
        withMainDb((db) => {
          return createNotesDraftRepo(db).createDraft(content);
        }),
      upsertDraft: ({ localUuid, content }) => {
        withMainDb((db) => {
          createNotesDraftRepo(db).upsertDraft(localUuid, content);
        });
      },
      getDraft: ({ localUuid }) =>
        withMainDb((db) => {
          const draft = createNotesDraftRepo(db).getDraft(localUuid);
          if (!draft) {
            return { draft: null };
          }
          return {
            draft: {
              localUuid: draft.localUuid,
              content: draft.content,
              syncStatus: draft.syncStatus,
              updatedAtMs: draft.updatedAtMs,
              createdAtMs: draft.createdAtMs,
            },
          };
        }),
      listItems: ({ scope, page, pageSize }) =>
        withMainDb((db) => {
          return createNotesListRepo(db).listItems({ scope, page, pageSize });
        }),
      delete: ({ id, provider }) => {
        withMainDb((db) => {
          createNotesListRepo(db).deleteItem({ id, provider });
        });
        return null;
      },
      restore: ({ id, provider }) => {
        withMainDb((db) => {
          createNotesListRepo(db).restoreItem({ id, provider });
        });
        return null;
      },
      hardDelete: ({ id, provider }) => {
        withMainDb((db) => {
          createNotesListRepo(db).hardDeleteItem({ id, provider });
        });
        return null;
      },
    },
    conflicts: {
      listFlow: () =>
        withMainDb((db) => {
          return { items: listFlowConflicts(db) };
        }),
      listNotes: () =>
        withMainDb((db) => {
          return createNotesConflictsService(db).listNotesConflicts();
        }),
      resolveFlowApplyServer: ({ outboxId }) =>
        withMainDb((db) => {
          const res = resolveFlowConflictApplyServer(db, { outboxId });
          return {
            outboxId: res.outboxId,
            resolved: true,
            strategy: 'apply_server',
            bumpedClientUpdatedAtMs: null,
            copiedEntityId: null,
          };
        }),
      resolveFlowKeepLocalCopy: ({ outboxId }) =>
        withMainDb((db) => {
          const res = resolveFlowConflictKeepLocalCopy(db, { outboxId });
          return {
            outboxId: res.outboxId,
            resolved: true,
            strategy: 'keep_local_copy',
            bumpedClientUpdatedAtMs: null,
            copiedEntityId: res.newEntityId,
          };
        }),
      resolveFlowForceOverwrite: ({ outboxId }) =>
        withMainDb((db) => {
          const res = resolveFlowConflictForceOverride(db, { outboxId });
          return {
            outboxId: res.outboxId,
            resolved: true,
            strategy: 'force_overwrite',
            bumpedClientUpdatedAtMs: res.nextClientUpdatedAtMs,
            copiedEntityId: null,
          };
        }),
    },
    pathGate,
    fileAccess: {
      showOpenDialog: async ({ win, title, filters }) => {
        const picked = await dialog.showOpenDialog(win as BrowserWindow, {
          title: title ?? undefined,
          filters: filters ?? undefined,
          properties: ['openFile'],
        });
        return { canceled: picked.canceled, filePaths: picked.filePaths };
      },
      showSaveDialog: async ({ win, title, defaultPath, filters }) => {
        const picked = await dialog.showSaveDialog(win as BrowserWindow, {
          title: title ?? undefined,
          defaultPath: defaultPath ?? undefined,
          filters: filters ?? undefined,
        });
        return { canceled: picked.canceled, filePath: picked.filePath };
      },
      readTextFile: (fileAbsPath) => fs.readFile(fileAbsPath, 'utf-8'),
      writeTextFile: (fileAbsPath, content) => fs.writeFile(fileAbsPath, content, 'utf-8'),
    },
    contextMenu: {
      popupMiddleItem: ({ win, itemId }) =>
        popupMiddleItemContextMenu({ win: win as BrowserWindow, itemId }),
      popupFolder: ({ win, folderId }) =>
        popupFolderContextMenu({ win: win as BrowserWindow, folderId }),
    },
    search: {
      query: (payload) => withMainDb((db) => queryGlobalSearch(db, payload)),
      rebuildIndex: () => withMainDb((db) => rebuildGlobalSearchIndex(db)),
    },
    updater: {
      getStatus: () => updater.getStatus(),
      checkForUpdates: async () => {
        await updater.checkForUpdates({ source: 'manual' });
      },
      installNow: () => updater.installNow(),
      deferInstall: () => updater.deferInstall(),
    },
  });

  ensureMainWindow();

  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_EVENTS.updater.statusChanged, { status: updater.getStatus() });
    }
  } catch {}

  if (app.isPackaged) {
    setTimeout(() => {
      void updater.checkForUpdates({ source: 'startup' });
    }, 1500);
  }

  const exitCleanupHooks: CleanupHook[] = [
    () => quickCaptureWindowManager.destroy(),
    () => updater.dispose(),
    () => syncController.stop(),
  ];

  const onSyncNowMemos = async () => {
    await syncController.syncNowMemos();
  };
  const onSyncNowFlow = async () => {
    await syncController.syncNowFlow();
  };

  const trayIconPath = path.join(app.getAppPath(), 'assets', 'tray.ico');
  trayManager = installTrayManager({
    iconPath: trayIconPath,
    tooltip: '心流',
    createTray: (iconPath) => {
      const tray = new Tray(iconPath);
      return {
        setToolTip: (tooltip) => tray.setToolTip(tooltip),
        setContextMenu: (menu) => tray.setContextMenu(menu as Menu | null),
        on: (eventName, listener) => tray.on(eventName as never, listener as never),
        destroy: () => tray.destroy(),
      };
    },
    buildMenu: (template) =>
      Menu.buildFromTemplate(
        template.map((item) => {
          if (item.type === 'separator') {
            return { type: 'separator' };
          }
          return {
            label: item.label,
            click: () => {
              void item.click();
            },
          };
        }) as Electron.MenuItemConstructorOptions[]
      ),
    onToggleMainWindow: () => toggleMainWindow(),
    onQuickCapture,
    onSyncNowMemos,
    onSyncNowFlow,
    onOpenSettings: () => {
      const win = ensureMainWindow();
      win.show();
      win.focus();
    },
    onExit: async () => {
      closeToTray.requestExit();

      await runCleanupHooks(exitCleanupHooks, {
        logger: {
          warn: (message, meta) => {
            console.warn(message, meta);
          },
        },
      });

      trayManager?.destroy();
      trayManager = null;

      app.quit();
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureMainWindow();
    }
  });
});

app.on('before-quit', () => {
  closeToTray.requestExit();
});

app.on('window-all-closed', () => {});
