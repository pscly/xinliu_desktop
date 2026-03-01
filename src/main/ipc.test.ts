import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../shared/ipc';
import type { IpcResult } from '../shared/ipc';

import { registerIpcHandlers } from './ipc';
import type { BrowserWindowLike, IpcMainHandler, IpcMainLike } from './ipc';
import { createPathGate } from './pathGate/pathGate';

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
      storageRoot: {
        getStatus: () => ({ storageRootAbsPath: '/tmp/xinliu', isDefault: true }),
        chooseAndMigrate: () => ({ kind: 'cancelled' }),
        restartNow: () => {},
      },
      closeBehavior: {
        getStatus: () => ({ behavior: 'hide', closeToTrayHintShown: false }),
        setBehavior: () => {},
        resetCloseToTrayHint: () => {},
      },
      diagnostics: {
        getStatus: () => ({
          flowBaseUrl: null,
          memosBaseUrl: null,
          notesProvider: null,
          notesProviderKind: null,
          lastDegradeReason: null,
          lastRequestIds: { memos_request_id: null, flow_request_id: null },
        }),
        setFlowBaseUrl: () => {},
        setMemosBaseUrl: () => {},
      },
      collections: {
        listRoots: () => ({ items: [], hasMore: false }),
        listChildren: () => ({ items: [], hasMore: false }),
        move: ({ itemId, newParentId }) => ({ itemId, parentId: newParentId }),
      },
      conflicts: {
        listFlow: () => ({ items: [] }),
        listNotes: () => ({ items: [] }),
        resolveFlowApplyServer: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'apply_server',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowKeepLocalCopy: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'keep_local_copy',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowForceOverwrite: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'force_overwrite',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
      },
      pathGate: createPathGate({ now: () => 0, ttlMs: 60_000 }),
      fileAccess: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
        readTextFile: async () => '',
        writeTextFile: async () => {},
      },
      contextMenu: {
        popupMiddleItem: () => {},
        popupFolder: () => {},
      },
      search: {
        query: () => ({
          mode: 'fallback',
          ftsAvailable: false,
          degradedReason: 'test',
          page: 0,
          pageSize: 20,
          hasMore: false,
          items: [],
        }),
        rebuildIndex: () => ({ ok: true, ftsAvailable: false, rebuilt: false, message: 'test' }),
      },
      updater: {
        getStatus: () => ({
          state: 'disabled',
          currentVersion: '0.0.0',
          availableVersion: null,
          progress: null,
          lastCheckedAtMs: null,
          errorMessage: '自动更新仅在安装包中可用',
          releasesUrl: 'https://example.com/releases',
          deferred: false,
        }),
        checkForUpdates: async () => {},
        installNow: () => {},
        deferInstall: () => {},
      },
      now: () => 0,
    });

    const registered = Array.from(handlers.keys()).sort();
    const expected = [
      ...Object.values(IPC_CHANNELS.window),
      ...Object.values(IPC_CHANNELS.quickCapture),
      ...Object.values(IPC_CHANNELS.shortcuts),
      ...Object.values(IPC_CHANNELS.storageRoot),
      ...Object.values(IPC_CHANNELS.closeBehavior),
      ...Object.values(IPC_CHANNELS.diagnostics),
      ...Object.values(IPC_CHANNELS.contextMenu),
      ...Object.values(IPC_CHANNELS.collections),
      ...Object.values(IPC_CHANNELS.notes),
      ...Object.values(IPC_CHANNELS.conflicts),
      ...Object.values(IPC_CHANNELS.search),
      ...Object.values(IPC_CHANNELS.fileAccess),
      ...Object.values(IPC_CHANNELS.updater),
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
      storageRoot: {
        getStatus: () => ({ storageRootAbsPath: '/tmp/xinliu', isDefault: true }),
        chooseAndMigrate: () => ({ kind: 'cancelled' }),
        restartNow: () => {},
      },
      closeBehavior: {
        getStatus: () => ({ behavior: 'hide', closeToTrayHintShown: false }),
        setBehavior: () => {},
        resetCloseToTrayHint: () => {},
      },
      diagnostics: {
        getStatus: () => ({
          flowBaseUrl: null,
          memosBaseUrl: null,
          notesProvider: null,
          notesProviderKind: null,
          lastDegradeReason: null,
          lastRequestIds: { memos_request_id: null, flow_request_id: null },
        }),
        setFlowBaseUrl: () => {},
        setMemosBaseUrl: () => {},
      },
      collections: {
        listRoots: () => ({ items: [], hasMore: false }),
        listChildren: () => ({ items: [], hasMore: false }),
        move: ({ itemId, newParentId }) => ({ itemId, parentId: newParentId }),
      },
      conflicts: {
        listFlow: () => ({ items: [] }),
        listNotes: () => ({ items: [] }),
        resolveFlowApplyServer: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'apply_server',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowKeepLocalCopy: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'keep_local_copy',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowForceOverwrite: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'force_overwrite',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
      },
      pathGate: createPathGate({ now: () => 0, ttlMs: 60_000 }),
      fileAccess: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
        readTextFile: async () => '',
        writeTextFile: async () => {},
      },
      contextMenu: {
        popupMiddleItem: () => {},
        popupFolder: () => {},
      },
      search: {
        query: () => ({
          mode: 'fallback',
          ftsAvailable: false,
          degradedReason: 'test',
          page: 0,
          pageSize: 20,
          hasMore: false,
          items: [],
        }),
        rebuildIndex: () => ({ ok: true, ftsAvailable: false, rebuilt: false, message: 'test' }),
      },
      updater: {
        getStatus: () => ({
          state: 'disabled',
          currentVersion: '0.0.0',
          availableVersion: null,
          progress: null,
          lastCheckedAtMs: null,
          errorMessage: '自动更新仅在安装包中可用',
          releasesUrl: 'https://example.com/releases',
          deferred: false,
        }),
        checkForUpdates: async () => {},
        installNow: () => {},
        deferInstall: () => {},
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
      storageRoot: {
        getStatus: () => ({ storageRootAbsPath: '/tmp/xinliu', isDefault: true }),
        chooseAndMigrate: () => ({ kind: 'cancelled' }),
        restartNow: () => {},
      },
      closeBehavior: {
        getStatus: () => ({ behavior: 'hide', closeToTrayHintShown: false }),
        setBehavior: () => {},
        resetCloseToTrayHint: () => {},
      },
      diagnostics: {
        getStatus: () => ({
          flowBaseUrl: null,
          memosBaseUrl: null,
          notesProvider: null,
          notesProviderKind: null,
          lastDegradeReason: null,
          lastRequestIds: { memos_request_id: null, flow_request_id: null },
        }),
        setFlowBaseUrl: () => {},
        setMemosBaseUrl: () => {},
      },
      collections: {
        listRoots: () => ({ items: [], hasMore: false }),
        listChildren: () => ({ items: [], hasMore: false }),
        move: ({ itemId, newParentId }) => ({ itemId, parentId: newParentId }),
      },
      conflicts: {
        listFlow: () => ({ items: [] }),
        listNotes: () => ({ items: [] }),
        resolveFlowApplyServer: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'apply_server',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowKeepLocalCopy: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'keep_local_copy',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowForceOverwrite: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'force_overwrite',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
      },
      pathGate: createPathGate({ now: () => 0, ttlMs: 60_000 }),
      fileAccess: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
        readTextFile: async () => '',
        writeTextFile: async () => {},
      },
      contextMenu: {
        popupMiddleItem: () => {},
        popupFolder: () => {},
      },
      search: {
        query: () => ({
          mode: 'fallback',
          ftsAvailable: false,
          degradedReason: 'test',
          page: 0,
          pageSize: 20,
          hasMore: false,
          items: [],
        }),
        rebuildIndex: () => ({ ok: true, ftsAvailable: false, rebuilt: false, message: 'test' }),
      },
      updater: {
        getStatus: () => ({
          state: 'disabled',
          currentVersion: '0.0.0',
          availableVersion: null,
          progress: null,
          lastCheckedAtMs: null,
          errorMessage: '自动更新仅在安装包中可用',
          releasesUrl: 'https://example.com/releases',
          deferred: false,
        }),
        checkForUpdates: async () => {},
        installNow: () => {},
        deferInstall: () => {},
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

  it('IPC 权限门：未授权的绝对路径写入必须拒绝', async () => {
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
      storageRoot: {
        getStatus: () => ({ storageRootAbsPath: '/tmp/xinliu', isDefault: true }),
        chooseAndMigrate: () => ({ kind: 'cancelled' }),
        restartNow: () => {},
      },
      closeBehavior: {
        getStatus: () => ({ behavior: 'hide', closeToTrayHintShown: false }),
        setBehavior: () => {},
        resetCloseToTrayHint: () => {},
      },
      diagnostics: {
        getStatus: () => ({
          flowBaseUrl: null,
          memosBaseUrl: null,
          notesProvider: null,
          notesProviderKind: null,
          lastDegradeReason: null,
          lastRequestIds: { memos_request_id: null, flow_request_id: null },
        }),
        setFlowBaseUrl: () => {},
        setMemosBaseUrl: () => {},
      },
      collections: {
        listRoots: () => ({ items: [], hasMore: false }),
        listChildren: () => ({ items: [], hasMore: false }),
        move: ({ itemId, newParentId }) => ({ itemId, parentId: newParentId }),
      },
      conflicts: {
        listFlow: () => ({ items: [] }),
        listNotes: () => ({ items: [] }),
        resolveFlowApplyServer: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'apply_server',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowKeepLocalCopy: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'keep_local_copy',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
        resolveFlowForceOverwrite: (payload) => ({
          outboxId: payload.outboxId,
          resolved: true,
          strategy: 'force_overwrite',
          bumpedClientUpdatedAtMs: null,
          copiedEntityId: null,
        }),
      },
      pathGate: createPathGate({ now: () => 0, ttlMs: 60_000 }),
      fileAccess: {
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
        readTextFile: async () => '',
        writeTextFile: async () => {},
      },
      contextMenu: {
        popupMiddleItem: () => {},
        popupFolder: () => {},
      },
      search: {
        query: () => ({
          mode: 'fallback',
          ftsAvailable: false,
          degradedReason: 'test',
          page: 0,
          pageSize: 20,
          hasMore: false,
          items: [],
        }),
        rebuildIndex: () => ({ ok: true, ftsAvailable: false, rebuilt: false, message: 'test' }),
      },
      updater: {
        getStatus: () => ({
          state: 'disabled',
          currentVersion: '0.0.0',
          availableVersion: null,
          progress: null,
          lastCheckedAtMs: null,
          errorMessage: '自动更新仅在安装包中可用',
          releasesUrl: 'https://example.com/releases',
          deferred: false,
        }),
        checkForUpdates: async () => {},
        installNow: () => {},
        deferInstall: () => {},
      },
      now: () => 0,
    });

    const handler = handlers.get(IPC_CHANNELS.fileAccess.writeTextFile);
    expect(handler).toBeTypeOf('function');

    const res = (await handler?.(
      { sender: {} },
      {
        grantId: 'bad',
        filePath: '/etc/passwd',
        content: 'x',
      }
    )) as IpcResult<unknown>;

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PERMISSION_DENIED');
    }
  });
});
