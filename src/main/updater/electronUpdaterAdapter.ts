import type {
  DownloadProgressLike,
  AutoUpdaterAdapter,
  UpdateInfoLike,
  Unsubscribe,
} from './updaterController';

import { autoUpdater } from 'electron-updater';

type UpdaterEventName =
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error';

type Listener = (...args: unknown[]) => void;

function on(eventName: UpdaterEventName, listener: Listener): Unsubscribe {
  autoUpdater.on(eventName, listener as never);
  return () => {
    try {
      autoUpdater.removeListener(eventName, listener as never);
    } catch {}
  };
}

function setUpdaterProp(key: string, value: unknown): void {
  const target = autoUpdater as unknown as Record<string, unknown>;
  target[key] = value;
}

function toUpdateInfoLike(raw: unknown): UpdateInfoLike {
  if (typeof raw === 'object' && raw !== null && 'version' in raw) {
    const v = (raw as { version: unknown }).version;
    if (typeof v === 'string') {
      return { version: v };
    }
  }
  return { version: '未知版本' };
}

function toDownloadProgressLike(raw: unknown): DownloadProgressLike {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const r = raw as Record<string, unknown>;
  return {
    percent: typeof r.percent === 'number' ? r.percent : undefined,
    transferred: typeof r.transferred === 'number' ? r.transferred : undefined,
    total: typeof r.total === 'number' ? r.total : undefined,
    bytesPerSecond: typeof r.bytesPerSecond === 'number' ? r.bytesPerSecond : undefined,
  };
}

export function createElectronUpdaterAdapter(): AutoUpdaterAdapter {
  return {
    configure: ({ allowPrerelease, autoDownload, autoInstallOnAppQuit }) => {
      autoUpdater.allowPrerelease = allowPrerelease;
      autoUpdater.autoDownload = autoDownload;
      setUpdaterProp('autoInstallOnAppQuit', autoInstallOnAppQuit);
      setUpdaterProp('allowDowngrade', false);
    },
    checkForUpdates: async () => {
      await autoUpdater.checkForUpdates();
    },
    downloadUpdate: async () => {
      await autoUpdater.downloadUpdate();
    },
    quitAndInstall: () => {
      autoUpdater.quitAndInstall();
    },
    onUpdateAvailable: (listener) =>
      on('update-available', (info: unknown) => {
        listener(toUpdateInfoLike(info));
      }),
    onUpdateNotAvailable: (listener) => on('update-not-available', () => listener()),
    onDownloadProgress: (listener) =>
      on('download-progress', (p: unknown) => {
        listener(toDownloadProgressLike(p));
      }),
    onUpdateDownloaded: (listener) =>
      on('update-downloaded', (info: unknown) => {
        listener(toUpdateInfoLike(info));
      }),
    onError: (listener) =>
      on('error', (err: unknown) => {
        const msg = typeof err === 'string' ? err : '更新异常';
        listener(msg);
      }),
  };
}
