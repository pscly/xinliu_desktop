import { BrowserWindow, shell } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';

import { buildSecureBrowserWindowOptions, installNavigationGuards } from '../security';
import type { QuickCaptureWindowLike } from './quickCaptureTypes';

export interface QuickCaptureWindowManager {
  ensureWindow: () => QuickCaptureWindowLike;
  destroy: () => void;
}

export function createQuickCaptureWindowManager(options: {
  preloadPath: string;
  indexHtmlPath: string;
  isExitRequested: () => boolean;
  browserWindow?: typeof BrowserWindow;
  buildWindowOptions?: (extra: Partial<BrowserWindowConstructorOptions>) => BrowserWindowConstructorOptions;
}): QuickCaptureWindowManager {
  const BrowserWindowCtor = options.browserWindow ?? BrowserWindow;
  const buildOptions = options.buildWindowOptions ?? buildSecureBrowserWindowOptions;

  let win: BrowserWindow | null = null;

  const createWindow = () => {
    const w = new BrowserWindowCtor(
      buildOptions({
        width: 560,
        height: 240,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        webPreferences: {
          preload: options.preloadPath,
        },
      })
    );

    installNavigationGuards(w.webContents, {
      openExternal: (url) => shell.openExternal(url),
    });

    void w.loadFile(options.indexHtmlPath, {
      hash: 'quick-capture',
    });

    w.on('close', (event) => {
      if (options.isExitRequested()) {
        return;
      }
      event.preventDefault();
      w.hide();
    });

    w.on('closed', () => {
      if (win === w) {
        win = null;
      }
    });

    return w;
  };

  return {
    ensureWindow: () => {
      if (win && !win.isDestroyed()) {
        return win;
      }
      win = createWindow();
      return win;
    },
    destroy: () => {
      if (!win) {
        return;
      }
      try {
        win.destroy();
      } catch {
      }
      win = null;
    },
  };
}
