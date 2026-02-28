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
import { createNotesDraftRepo } from './notes/notesDraftRepo';
import {
  readCloseBehaviorStatus,
  writeCloseBehavior,
  writeCloseToTrayHintShown,
} from './userSettings/closeBehaviorSettings';

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

  const diagnostics = createDiagnosticsController();

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
      return run(db);
    } finally {
      closeSqliteDatabase(db);
    }
  };

  withMainDbRef = withMainDb;

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
      listItems: () => {
        throw new Error('Notes.listItems 未实现');
      },
      delete: () => {
        throw new Error('Notes.delete 未实现');
      },
      restore: () => {
        throw new Error('Notes.restore 未实现');
      },
      hardDelete: () => {
        throw new Error('Notes.hardDelete 未实现');
      },
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
  ];

  const onSyncNowMemos = async () => undefined;
  const onSyncNowFlow = async () => undefined;

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
