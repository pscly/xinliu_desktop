/// <reference types="vite/client" />

import type {
  IpcResult,
  IpcVoid,
  ShortcutId,
  ShortcutsSetConfigPayload,
  ShortcutsStatus,
} from '../shared/ipc';

declare global {
  interface Window {
    xinliu?: {
      versions: {
        electron: string;
        chrome: string;
        node: string;
      };
      window: {
        minimize: () => Promise<IpcResult<IpcVoid>>;
        toggleMaximize: () => Promise<IpcResult<IpcVoid>>;
        close: () => Promise<IpcResult<IpcVoid>>;
        isMaximized: () => Promise<IpcResult<boolean>>;
      };
      shortcuts: {
        getStatus: () => Promise<IpcResult<ShortcutsStatus>>;
        setConfig: (payload: ShortcutsSetConfigPayload) => Promise<IpcResult<IpcVoid>>;
        resetAll: () => Promise<IpcResult<IpcVoid>>;
        resetOne: (id: ShortcutId) => Promise<IpcResult<IpcVoid>>;
        onFocusSearch: (listener: () => void) => () => void;
      };
    };
  }
}

export {};
