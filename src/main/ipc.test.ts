import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../shared/ipc';
import type { IpcResult } from '../shared/ipc';

import { registerIpcHandlers } from './ipc';
import type { BrowserWindowLike, IpcMainHandler, IpcMainLike } from './ipc';

function createFakeWindow(): BrowserWindowLike {
  return {
    minimize: () => {},
    isMaximized: () => false,
    maximize: () => {},
    unmaximize: () => {},
    close: () => {},
  };
}

describe('src/main/ipc', () => {
  it('IPC 白名单可静态枚举（至少 1 正例 + 1 反例）', () => {
    const handlers = new Map<string, IpcMainHandler>();
    const ipcMain: IpcMainLike = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };

    registerIpcHandlers(ipcMain, {
      getWindowForSender: () => createFakeWindow(),
      quickCapture: {
        open: () => {},
        hide: () => {},
        submit: () => {},
        cancel: () => {},
      },
      shortcuts: {
        getStatus: () => ({ entries: [] }),
        setConfig: () => {},
        resetAll: () => {},
        resetOne: () => {},
      },
      now: () => 0,
    });

    const registered = Array.from(handlers.keys()).sort();
    const expected = [
      ...Object.values(IPC_CHANNELS.window),
      ...Object.values(IPC_CHANNELS.quickCapture),
      ...Object.values(IPC_CHANNELS.shortcuts),
    ].sort();
    expect(registered).toEqual(expected);

    expect(registered.some((c) => c.includes('*'))).toBe(false);
    expect(handlers.has('xinliu:*')).toBe(false);
  });

  it('IPC 参数校验：空 payload 以外一律拒绝（示例）', async () => {
    const handlers = new Map<string, IpcMainHandler>();
    const ipcMain: IpcMainLike = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };

    registerIpcHandlers(ipcMain, {
      getWindowForSender: () => createFakeWindow(),
      quickCapture: {
        open: () => {},
        hide: () => {},
        submit: () => {},
        cancel: () => {},
      },
      shortcuts: {
        getStatus: () => ({ entries: [] }),
        setConfig: () => {},
        resetAll: () => {},
        resetOne: () => {},
      },
      now: () => 0,
    });

    const handler = handlers.get(IPC_CHANNELS.window.minimize);
    expect(handler).toBeTypeOf('function');

    const res = (await handler?.({ sender: {} }, { foo: 1 })) as IpcResult<unknown>;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('IPC 参数校验：quickCapture.submit 必须包含 string content', async () => {
    const handlers = new Map<string, IpcMainHandler>();
    const ipcMain: IpcMainLike = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };

    registerIpcHandlers(ipcMain, {
      getWindowForSender: () => createFakeWindow(),
      quickCapture: {
        open: () => {},
        hide: () => {},
        submit: () => {},
        cancel: () => {},
      },
      shortcuts: {
        getStatus: () => ({ entries: [] }),
        setConfig: () => {},
        resetAll: () => {},
        resetOne: () => {},
      },
      now: () => 0,
    });

    const handler = handlers.get(IPC_CHANNELS.quickCapture.submit);
    expect(handler).toBeTypeOf('function');

    const bad = (await handler?.({ sender: {} }, { content: 123 })) as IpcResult<unknown>;
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
