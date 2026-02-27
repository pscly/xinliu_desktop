// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type {
  AutoUpdaterAdapter,
  DownloadProgressLike,
  Unsubscribe,
  UpdateInfoLike,
} from './updaterController';
import { createUpdaterController } from './updaterController';

function createFakeAdapter() {
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {
    'update-available': [],
    'update-not-available': [],
    'download-progress': [],
    'update-downloaded': [],
    error: [],
  };

  const on = (eventName: keyof typeof listeners, cb: (arg?: unknown) => void): Unsubscribe => {
    listeners[eventName].push(cb);
    return () => {
      const arr = listeners[eventName];
      const idx = arr.indexOf(cb);
      if (idx >= 0) {
        arr.splice(idx, 1);
      }
    };
  };

  const adapter: AutoUpdaterAdapter = {
    configure: () => {},
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(() => undefined),
    onUpdateAvailable: (listener) =>
      on('update-available', (arg) => listener(arg as UpdateInfoLike)),
    onUpdateNotAvailable: (listener) => on('update-not-available', () => listener()),
    onDownloadProgress: (listener) =>
      on('download-progress', (arg) => listener(arg as DownloadProgressLike)),
    onUpdateDownloaded: (listener) =>
      on('update-downloaded', (arg) => listener(arg as UpdateInfoLike)),
    onError: (listener) => on('error', (arg) => listener(String(arg ?? ''))),
  };

  const emit = (eventName: keyof typeof listeners, payload?: unknown) => {
    for (const cb of listeners[eventName]) {
      cb(payload);
    }
  };

  return { adapter, emit };
}

describe('src/main/updater/updaterController', () => {
  it('disabled：未打包环境下可解释回退', async () => {
    const { adapter } = createFakeAdapter();
    const onStatusChanged = vi.fn();

    const ctl = createUpdaterController({
      enabled: false,
      currentVersion: '0.0.0',
      releasesUrl: 'https://example.com/releases',
      adapter,
      onStatusChanged,
      now: () => 123,
    });

    await ctl.checkForUpdates({ source: 'manual' });
    const status = ctl.getStatus();
    expect(status.state).toBe('disabled');
    expect(status.errorMessage).toContain('安装包');
    expect(status.lastCheckedAtMs).toBe(123);
  });

  it('update-available -> download-progress -> update-downloaded：状态机可推进', async () => {
    const { adapter, emit } = createFakeAdapter();
    const onStatusChanged = vi.fn();

    const ctl = createUpdaterController({
      enabled: true,
      currentVersion: '0.0.1',
      releasesUrl: 'https://example.com/releases',
      adapter,
      onStatusChanged,
      now: () => 1,
    });

    await ctl.checkForUpdates({ source: 'manual' });
    expect(ctl.getStatus().state).toBe('checking');

    emit('update-available', { version: '0.0.2' } satisfies UpdateInfoLike);
    expect(['update_available', 'downloading']).toContain(ctl.getStatus().state);
    expect(ctl.getStatus().availableVersion).toBe('0.0.2');

    emit('download-progress', {
      percent: 10,
      transferred: 100,
      total: 1000,
      bytesPerSecond: 50,
    } satisfies DownloadProgressLike);
    expect(ctl.getStatus().state).toBe('downloading');
    expect(ctl.getStatus().progress?.percent01).toBeCloseTo(0.1);

    emit('update-downloaded', { version: '0.0.2' } satisfies UpdateInfoLike);
    expect(ctl.getStatus().state).toBe('downloaded');
    expect(ctl.getStatus().progress?.percent01).toBe(1);
  });

  it('stable-only：收到 prerelease 版本时必须忽略且不得触发下载', async () => {
    const { adapter, emit } = createFakeAdapter();

    const ctl = createUpdaterController({
      enabled: true,
      currentVersion: '0.0.1',
      releasesUrl: 'https://example.com/releases',
      adapter,
      now: () => 1,
    });

    await ctl.checkForUpdates({ source: 'manual' });
    expect(ctl.getStatus().state).toBe('checking');

    emit('update-available', { version: '0.0.2-beta.1' } satisfies UpdateInfoLike);
    expect(ctl.getStatus().state).toBe('no_update');
    expect(adapter.downloadUpdate).not.toHaveBeenCalled();
  });

  it('error：错误可见且可重试（再次 check 进入 checking）', async () => {
    const { adapter, emit } = createFakeAdapter();

    const ctl = createUpdaterController({
      enabled: true,
      currentVersion: '0.0.1',
      releasesUrl: 'https://example.com/releases',
      adapter,
      now: () => 1,
    });

    emit('error', 'boom');
    expect(ctl.getStatus().state).toBe('error');
    expect(ctl.getStatus().errorMessage).toBeTruthy();

    await ctl.checkForUpdates({ source: 'manual' });
    expect(ctl.getStatus().state).toBe('checking');
  });
});
