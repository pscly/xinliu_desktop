import { contextBridge, ipcRenderer } from 'electron';

import { EMPTY_PAYLOAD, IPC_CHANNELS } from '../shared/ipc';
import type { IpcErrorCode, IpcResult, IpcVoid } from '../shared/ipc';

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
});
