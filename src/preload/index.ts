import { contextBridge, ipcRenderer } from 'electron';

import { EMPTY_PAYLOAD, IPC_CHANNELS, IPC_EVENTS } from '../shared/ipc';
import type {
  ContextMenuDidSelectPayload,
  ContextMenuPopupFolderPayload,
  ContextMenuPopupMiddleItemPayload,
  DiagnosticsStatus,
  IpcErrorCode,
  IpcResult,
  IpcVoid,
  QuickCaptureSubmitPayload,
  ShortcutId,
  ShortcutsResetOnePayload,
  ShortcutsSetConfigPayload,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  StorageRootStatus,
} from '../shared/ipc';

function ipcError<T>(code: IpcErrorCode, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } };
}

async function invokeIpc<T>(channel: string, payload: unknown): Promise<IpcResult<T>> {
  try {
    const result = (await ipcRenderer.invoke(channel, payload)) as unknown;
    if (typeof result === 'object' && result !== null && 'ok' in result) {
      return result as IpcResult<T>;
    }
    return ipcError('INTERNAL_ERROR', 'IPC 返回格式不正确');
  } catch {
    return ipcError('INTERNAL_ERROR', 'IPC 调用失败');
  }
}

contextBridge.exposeInMainWorld('xinliu', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  window: {
    minimize: () => invokeIpc<IpcVoid>(IPC_CHANNELS.window.minimize, EMPTY_PAYLOAD),
    toggleMaximize: () =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.window.toggleMaximize, EMPTY_PAYLOAD),
    close: () => invokeIpc<IpcVoid>(IPC_CHANNELS.window.close, EMPTY_PAYLOAD),
    isMaximized: () => invokeIpc<boolean>(IPC_CHANNELS.window.isMaximized, EMPTY_PAYLOAD),
  },
  quickCapture: {
    open: () => invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.open, EMPTY_PAYLOAD),
    hide: () => invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.hide, EMPTY_PAYLOAD),
    submit: (content: string) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.submit, { content } satisfies QuickCaptureSubmitPayload),
    cancel: () => invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.cancel, EMPTY_PAYLOAD),
  },
  shortcuts: {
    getStatus: () =>
      invokeIpc<ShortcutsStatus>(IPC_CHANNELS.shortcuts.getStatus, EMPTY_PAYLOAD),
    setConfig: (payload: ShortcutsSetConfigPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.shortcuts.setConfig, payload),
    resetAll: () => invokeIpc<IpcVoid>(IPC_CHANNELS.shortcuts.resetAll, EMPTY_PAYLOAD),
    resetOne: (id: ShortcutId) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.shortcuts.resetOne, { id } satisfies ShortcutsResetOnePayload),
    onFocusSearch: (listener: () => void) => {
      const wrapped = () => {
        try {
          listener();
        } catch (error) {
          console.warn(`[shortcuts] focusSearch listener 异常：${String(error)}`);
        }
      };
      ipcRenderer.on(IPC_EVENTS.shortcuts.focusSearch, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.shortcuts.focusSearch, wrapped);
      };
    },
  },
  storageRoot: {
    getStatus: () =>
      invokeIpc<StorageRootStatus>(IPC_CHANNELS.storageRoot.getStatus, EMPTY_PAYLOAD),
    chooseAndMigrate: () =>
      invokeIpc<StorageRootChooseAndMigrateResult>(
        IPC_CHANNELS.storageRoot.chooseAndMigrate,
        EMPTY_PAYLOAD
      ),
    restartNow: () => invokeIpc<IpcVoid>(IPC_CHANNELS.storageRoot.restartNow, EMPTY_PAYLOAD),
  },
  diagnostics: {
    getStatus: () =>
      invokeIpc<DiagnosticsStatus>(IPC_CHANNELS.diagnostics.getStatus, EMPTY_PAYLOAD),
  },
  contextMenu: {
    popupMiddleItem: (itemId: string) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.contextMenu.popupMiddleItem, {
        itemId,
      } satisfies ContextMenuPopupMiddleItemPayload),
    popupFolder: (folderId: string) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.contextMenu.popupFolder, {
        folderId,
      } satisfies ContextMenuPopupFolderPayload),
    onCommand: (listener: (payload: ContextMenuDidSelectPayload) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => {
        try {
          listener(payload as ContextMenuDidSelectPayload);
        } catch (error) {
          console.warn(`[contextMenu] didSelect listener 异常：${String(error)}`);
        }
      };
      ipcRenderer.on(IPC_EVENTS.contextMenu.didSelect, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.contextMenu.didSelect, wrapped);
      };
    },
  },
});
