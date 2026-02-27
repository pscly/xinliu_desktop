import type { UpdaterStatus } from '../../shared/ipc';

export type UpdaterCheckSource = 'startup' | 'manual';

export interface UpdateInfoLike {
  version: string;
}

export interface DownloadProgressLike {
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

export type Unsubscribe = () => void;

export interface AutoUpdaterAdapter {
  configure: (options: {
    allowPrerelease: boolean;
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
  }) => void;

  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => void;

  onUpdateAvailable: (listener: (info: UpdateInfoLike) => void) => Unsubscribe;
  onUpdateNotAvailable: (listener: () => void) => Unsubscribe;
  onDownloadProgress: (listener: (p: DownloadProgressLike) => void) => Unsubscribe;
  onUpdateDownloaded: (listener: (info: UpdateInfoLike) => void) => Unsubscribe;
  onError: (listener: (message: string) => void) => Unsubscribe;
}

export interface UpdaterController {
  getStatus: () => UpdaterStatus;
  checkForUpdates: (options: { source: UpdaterCheckSource }) => Promise<void>;
  installNow: () => void;
  deferInstall: () => void;
  dispose: () => void;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  if (n < 0) {
    return 0;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

function asFiniteNonNegativeOrNull(v: unknown): number | null {
  if (typeof v !== 'number') {
    return null;
  }
  if (!Number.isFinite(v)) {
    return null;
  }
  if (v < 0) {
    return null;
  }
  return v;
}

function asPercent01OrNull(v: unknown): number | null {
  const n = asFiniteNonNegativeOrNull(v);
  if (n === null) {
    return null;
  }
  return clamp01(n / 100);
}

function safeVersionString(v: unknown): string | null {
  if (typeof v !== 'string') {
    return null;
  }
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function isSemverPrerelease(version: string): boolean {
  const trimmed = version.trim();
  const withoutV = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  return /^\d+\.\d+\.\d+-/.test(withoutV);
}

export function createUpdaterController(options: {
  enabled: boolean;
  currentVersion: string;
  releasesUrl: string;
  now?: () => number;
  adapter?: AutoUpdaterAdapter;
  onStatusChanged?: (status: UpdaterStatus) => void;
}): UpdaterController {
  const now = options.now ?? Date.now;

  const state: {
    status: UpdaterStatus;
    disposed: boolean;
    downloadInFlight: boolean;
    unsubs: Unsubscribe[];
  } = {
    status: {
      state: options.enabled ? 'idle' : 'disabled',
      currentVersion: options.currentVersion,
      availableVersion: null,
      progress: null,
      lastCheckedAtMs: null,
      errorMessage: options.enabled ? null : '自动更新仅在安装包中可用',
      releasesUrl: options.releasesUrl,
      deferred: false,
    },
    disposed: false,
    downloadInFlight: false,
    unsubs: [],
  };

  const emit = () => {
    if (state.disposed) {
      return;
    }
    try {
      options.onStatusChanged?.({ ...state.status, progress: state.status.progress ?? null });
    } catch {}
  };

  const setStatus = (patch: Partial<UpdaterStatus>) => {
    state.status = { ...state.status, ...patch };
    emit();
  };

  const markError = (message: string) => {
    const safe = message.trim().length > 0 ? message.trim() : '更新失败';
    setStatus({ state: 'error', errorMessage: safe, progress: null, deferred: false });
  };

  const adapter = options.adapter;
  if (options.enabled && adapter) {
    try {
      adapter.configure({
        allowPrerelease: false,
        autoDownload: false,
        autoInstallOnAppQuit: false,
      });
    } catch {
      markError('更新能力初始化失败');
    }

    state.unsubs.push(
      adapter.onUpdateAvailable((info) => {
        const version = safeVersionString(info?.version) ?? '未知版本';

        if (isSemverPrerelease(version)) {
          setStatus({
            state: 'no_update',
            availableVersion: null,
            errorMessage: null,
            progress: null,
            deferred: false,
          });
          return;
        }

        setStatus({
          state: 'update_available',
          availableVersion: version,
          errorMessage: null,
          progress: null,
          deferred: false,
        });
        void controller.downloadInBackground();
      })
    );
    state.unsubs.push(
      adapter.onUpdateNotAvailable(() => {
        setStatus({
          state: 'no_update',
          availableVersion: null,
          progress: null,
          errorMessage: null,
          deferred: false,
        });
      })
    );
    state.unsubs.push(
      adapter.onDownloadProgress((p) => {
        const percent01 = asPercent01OrNull(p?.percent);
        setStatus({
          state: 'downloading',
          progress: {
            percent01,
            transferred: asFiniteNonNegativeOrNull(p?.transferred),
            total: asFiniteNonNegativeOrNull(p?.total),
            bytesPerSecond: asFiniteNonNegativeOrNull(p?.bytesPerSecond),
          },
          errorMessage: null,
          deferred: false,
        });
      })
    );
    state.unsubs.push(
      adapter.onUpdateDownloaded((info) => {
        const version =
          safeVersionString(info?.version) ?? state.status.availableVersion ?? '未知版本';
        state.downloadInFlight = false;
        setStatus({
          state: 'downloaded',
          availableVersion: version,
          progress: { percent01: 1, transferred: null, total: null, bytesPerSecond: null },
          errorMessage: null,
        });
      })
    );
    state.unsubs.push(
      adapter.onError((_message) => {
        state.downloadInFlight = false;
        markError('更新检查或下载失败');
      })
    );
  }

  const controller: UpdaterController & { downloadInBackground: () => Promise<void> } = {
    getStatus: () => ({ ...state.status, progress: state.status.progress ?? null }),

    checkForUpdates: async ({ source }) => {
      void source;

      setStatus({
        lastCheckedAtMs: now(),
      });

      if (!options.enabled || !adapter) {
        setStatus({
          state: 'disabled',
          errorMessage: '自动更新仅在安装包中可用',
          progress: null,
          availableVersion: null,
          deferred: false,
        });
        return;
      }

      state.downloadInFlight = false;
      setStatus({
        state: 'checking',
        errorMessage: null,
        progress: null,
        availableVersion: null,
        deferred: false,
      });

      try {
        await adapter.checkForUpdates();
      } catch {
        markError('更新检查失败');
      }
    },

    installNow: () => {
      if (!options.enabled || !adapter) {
        markError('当前环境无法安装更新');
        return;
      }
      if (state.status.state !== 'downloaded') {
        markError('当前没有可安装的更新');
        return;
      }
      try {
        adapter.quitAndInstall();
      } catch {
        markError('触发安装失败');
      }
    },

    deferInstall: () => {
      if (state.status.state !== 'downloaded') {
        return;
      }
      setStatus({ deferred: true });
    },

    downloadInBackground: async () => {
      if (!options.enabled || !adapter) {
        return;
      }
      if (state.downloadInFlight) {
        return;
      }
      if (state.status.state === 'downloaded') {
        return;
      }

      state.downloadInFlight = true;
      setStatus({ state: 'downloading', errorMessage: null, deferred: false });
      try {
        await adapter.downloadUpdate();
      } catch {
        state.downloadInFlight = false;
        markError('更新下载失败');
      }
    },

    dispose: () => {
      state.disposed = true;
      for (const off of state.unsubs) {
        try {
          off();
        } catch {}
      }
      state.unsubs = [];
    },
  };

  return controller;
}
