/// <reference types="vite/client" />

import type {
  ContextMenuDidSelectPayload,
  DiagnosticsStatus,
  IpcResult,
  IpcVoid,
  ShortcutId,
  ShortcutsSetConfigPayload,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  StorageRootStatus,
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
      quickCapture: {
        open: () => Promise<IpcResult<IpcVoid>>;
        hide: () => Promise<IpcResult<IpcVoid>>;
        submit: (content: string) => Promise<IpcResult<IpcVoid>>;
        cancel: () => Promise<IpcResult<IpcVoid>>;
      };
      shortcuts: {
        getStatus: () => Promise<IpcResult<ShortcutsStatus>>;
        setConfig: (payload: ShortcutsSetConfigPayload) => Promise<IpcResult<IpcVoid>>;
        resetAll: () => Promise<IpcResult<IpcVoid>>;
        resetOne: (id: ShortcutId) => Promise<IpcResult<IpcVoid>>;
        onFocusSearch: (listener: () => void) => () => void;
      };
      storageRoot: {
        getStatus: () => Promise<IpcResult<StorageRootStatus>>;
        chooseAndMigrate: () => Promise<IpcResult<StorageRootChooseAndMigrateResult>>;
        restartNow: () => Promise<IpcResult<IpcVoid>>;
      };
      diagnostics: {
        getStatus: () => Promise<IpcResult<DiagnosticsStatus>>;
      };
      contextMenu: {
        popupMiddleItem: (itemId: string) => Promise<IpcResult<IpcVoid>>;
        popupFolder: (folderId: string) => Promise<IpcResult<IpcVoid>>;
        onCommand: (listener: (payload: ContextMenuDidSelectPayload) => void) => () => void;
      };
    };
  }
}

export {};
