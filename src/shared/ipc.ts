export const IPC_NAMESPACE = 'xinliu' as const;

export const IPC_CHANNELS = {
  window: {
    minimize: `${IPC_NAMESPACE}:window:minimize`,
    toggleMaximize: `${IPC_NAMESPACE}:window:toggleMaximize`,
    close: `${IPC_NAMESPACE}:window:close`,
    isMaximized: `${IPC_NAMESPACE}:window:isMaximized`,
  },
  quickCapture: {
    open: `${IPC_NAMESPACE}:quickCapture:open`,
    hide: `${IPC_NAMESPACE}:quickCapture:hide`,
    submit: `${IPC_NAMESPACE}:quickCapture:submit`,
    cancel: `${IPC_NAMESPACE}:quickCapture:cancel`,
  },
  shortcuts: {
    getStatus: `${IPC_NAMESPACE}:shortcuts:getStatus`,
    setConfig: `${IPC_NAMESPACE}:shortcuts:setConfig`,
    resetAll: `${IPC_NAMESPACE}:shortcuts:resetAll`,
    resetOne: `${IPC_NAMESPACE}:shortcuts:resetOne`,
  },
} as const;

export const IPC_EVENTS = {
  shortcuts: {
    focusSearch: `${IPC_NAMESPACE}:shortcuts:focusSearch`,
  },
} as const;

export type IpcChannelWindow =
  (typeof IPC_CHANNELS.window)[keyof typeof IPC_CHANNELS.window];

export type IpcChannelQuickCapture =
  (typeof IPC_CHANNELS.quickCapture)[keyof typeof IPC_CHANNELS.quickCapture];

export type IpcChannelShortcuts =
  (typeof IPC_CHANNELS.shortcuts)[keyof typeof IPC_CHANNELS.shortcuts];

export type IpcChannel = IpcChannelWindow | IpcChannelQuickCapture | IpcChannelShortcuts;

export type IpcErrorCode =
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'NO_WINDOW'
  | 'INTERNAL_ERROR';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: IpcError;
    };

export type EmptyPayload = Record<string, never>;

export const EMPTY_PAYLOAD: EmptyPayload = {};

export type IpcVoid = null;

export type ShortcutId = 'openQuickCapture' | 'openMainAndFocusSearch';

export type ShortcutRegistrationState = 'registered' | 'unregistered' | 'failed';

export interface ShortcutStatusEntry {
  id: ShortcutId;
  title: string;
  description: string;
  accelerator: string;
  enabled: boolean;
  registrationState: ShortcutRegistrationState;
  registrationMessage: string | null;
}

export interface ShortcutsStatus {
  entries: ShortcutStatusEntry[];
}

export interface ShortcutsSetConfigPayload {
  id: ShortcutId;
  accelerator: string;
  enabled: boolean;
}

export interface ShortcutsResetOnePayload {
  id: ShortcutId;
}

export interface QuickCaptureSubmitPayload {
  content: string;
}
