import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, Notification, shell, Tray } from 'electron';
import type { WebContents } from 'electron';

import { registerIpcHandlers } from './ipc';
import { buildSecureBrowserWindowOptions, installNavigationGuards } from './security';
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
  registerIpcHandlers(ipcMain, {
    getWindowForSender: (sender) =>
      BrowserWindow.fromWebContents(sender as WebContents),
  });

  ensureMainWindow();

  const exitCleanupHooks: CleanupHook[] = [];

  const onQuickCapture = () => {
    const win = ensureMainWindow();
    win.show();
    win.focus();
  };

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
