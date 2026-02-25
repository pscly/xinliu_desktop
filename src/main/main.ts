import path from 'node:path';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  shell,
  Tray,
} from 'electron';
import type { WebContents } from 'electron';

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

const closeToTray = createCloseToTrayController();

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
    closeToTray.handleWindowClose(event, {
      hide: () => win.hide(),
    }, {
      onFirstCloseToTrayHint: () => showFirstCloseToTrayHintOncePerRun(),
    });
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

app.whenReady().then(() => {
  const indexHtmlPath = path.join(__dirname, '../renderer/index.html');
  const preloadPath = path.join(__dirname, '../preload/index.js');

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

  registerIpcHandlers(ipcMain, {
    getWindowForSender: (sender) =>
      BrowserWindow.fromWebContents(sender as WebContents),
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
  });

  ensureMainWindow();

  const exitCleanupHooks: CleanupHook[] = [
    () => quickCaptureWindowManager.destroy(),
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
        on: (eventName, listener) =>
          tray.on(eventName as never, listener as never),
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
