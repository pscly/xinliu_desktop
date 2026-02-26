import { EMPTY_PAYLOAD, IPC_CHANNELS } from '../shared/ipc';
import type {
  ContextMenuPopupFolderPayload,
  ContextMenuPopupMiddleItemPayload,
  DiagnosticsStatus,
  EmptyPayload,
  IpcChannel,
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

export interface IpcMainInvokeEventLike {
  sender: unknown;
}

export type IpcMainHandler = (
  event: IpcMainInvokeEventLike,
  payload: unknown
) => unknown | Promise<unknown>;

export interface IpcMainLike {
  handle: (channel: string, handler: IpcMainHandler) => void;
}

export interface BrowserWindowLike {
  minimize: () => void;
  isMaximized: () => boolean;
  maximize: () => void;
  unmaximize: () => void;
  close: () => void;
}

export interface RegisterIpcHandlersDeps {
  getWindowForSender: (sender: unknown) => BrowserWindowLike | null;
  quickCapture: {
    open: () => void | Promise<void>;
    hide: () => void | Promise<void>;
    submit: (content: string) => void | Promise<void>;
    cancel: () => void | Promise<void>;
  };
  shortcuts: {
    getStatus: () => ShortcutsStatus;
    setConfig: (payload: ShortcutsSetConfigPayload) => void;
    resetAll: () => void;
    resetOne: (id: ShortcutId) => void;
  };
  storageRoot: {
    getStatus: () => StorageRootStatus | Promise<StorageRootStatus>;
    chooseAndMigrate: () =>
      | StorageRootChooseAndMigrateResult
      | Promise<StorageRootChooseAndMigrateResult>;
    restartNow: () => void | Promise<void>;
  };
  diagnostics: {
    getStatus: () => DiagnosticsStatus | Promise<DiagnosticsStatus>;
  };
  contextMenu: {
    popupMiddleItem: (options: {
      win: BrowserWindowLike;
      itemId: string;
    }) => void | Promise<void>;
    popupFolder: (options: {
      win: BrowserWindowLike;
      folderId: string;
    }) => void | Promise<void>;
  };
  now?: () => number;
}

function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value };
}

function err(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateEmptyPayload(payload: unknown): IpcResult<EmptyPayload> {
  if (payload === undefined) {
    return ok(EMPTY_PAYLOAD);
  }
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (Object.keys(payload).length !== 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok(EMPTY_PAYLOAD);
}

function validateShortcutId(value: unknown): value is ShortcutId {
  return value === 'openQuickCapture' || value === 'openMainAndFocusSearch';
}

function validateShortcutsSetConfigPayload(
  payload: unknown
): IpcResult<ShortcutsSetConfigPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const id = payload['id'];
  const accelerator = payload['accelerator'];
  const enabled = payload['enabled'];

  if (!validateShortcutId(id)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof accelerator !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof enabled !== 'boolean') {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const trimmed = accelerator.trim();
  if (enabled && trimmed.length === 0) {
    return err('VALIDATION_ERROR', '快捷键不能为空');
  }

  return ok({ id, accelerator: trimmed, enabled });
}

function validateShortcutsResetOnePayload(
  payload: unknown
): IpcResult<ShortcutsResetOnePayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const id = payload['id'];
  if (!validateShortcutId(id)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ id });
}

function validateQuickCaptureSubmitPayload(
  payload: unknown
): IpcResult<QuickCaptureSubmitPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const content = payload['content'];
  if (typeof content !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ content });
}

function validateContextMenuPopupMiddleItemPayload(
  payload: unknown
): IpcResult<ContextMenuPopupMiddleItemPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const itemId = payload['itemId'];
  if (typeof itemId !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = itemId.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ itemId: trimmed });
}

function validateContextMenuPopupFolderPayload(
  payload: unknown
): IpcResult<ContextMenuPopupFolderPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const folderId = payload['folderId'];
  if (typeof folderId !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = folderId.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ folderId: trimmed });
}

function createRateLimiter(options: {
  windowMs: number;
  max: number;
  now: () => number;
}) {
  const buckets = new Map<string, { resetAt: number; count: number }>();

  const allow = (key: string) => {
    const now = options.now();
    const current = buckets.get(key);
    if (!current || now >= current.resetAt) {
      buckets.set(key, { resetAt: now + options.windowMs, count: 1 });
      return true;
    }

    if (current.count >= options.max) {
      return false;
    }

    current.count += 1;
    return true;
  };

  return { allow };
}

function toIpcResult<T>(
  input: unknown,
  fallbackMessage: string
): IpcResult<T> {
  if (
    typeof input === 'object' &&
    input !== null &&
    'ok' in input &&
    (input as { ok: unknown }).ok === true
  ) {
    return input as IpcResult<T>;
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    'ok' in input &&
    (input as { ok: unknown }).ok === false
  ) {
    return input as IpcResult<T>;
  }
  return err('INTERNAL_ERROR', fallbackMessage) as IpcResult<T>;
}

function makeWindowHandler<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  run: (win: BrowserWindowLike) => T | Promise<T>;
}): IpcMainHandler {
  return async (event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = validateEmptyPayload(payload);
    if (!validated.ok) {
      return validated;
    }

    let win: BrowserWindowLike | null = null;
    try {
      win = options.deps.getWindowForSender(event.sender);
    } catch {
      win = null;
    }
    if (!win) {
      return err('NO_WINDOW', '未找到窗口');
    }

    try {
      const value = await options.run(win);
      return ok(value);
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

function makeHandler<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (validatedPayload: unknown) => T | Promise<T>;
}): IpcMainHandler {
  return async (_event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    try {
      const value = await options.run(validated.value);
      return ok(value);
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

function makeHandlerWithErrorMessage<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (validatedPayload: unknown) => T | Promise<T>;
}): IpcMainHandler {
  return async (_event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    try {
      const value = await options.run(validated.value);
      return ok(value);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string' &&
        (error as { message: string }).message.trim().length > 0
          ? (error as { message: string }).message
          : '操作失败';
      return err('INTERNAL_ERROR', message);
    }
  };
}

function makeWindowHandlerWithPayload<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (win: BrowserWindowLike, validatedPayload: unknown) => T | Promise<T>;
}): IpcMainHandler {
  return async (event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    let win: BrowserWindowLike | null = null;
    try {
      win = options.deps.getWindowForSender(event.sender);
    } catch {
      win = null;
    }
    if (!win) {
      return err('NO_WINDOW', '未找到窗口');
    }

    try {
      const value = await options.run(win, validated.value);
      return ok(value);
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  deps: RegisterIpcHandlersDeps
): void {
  const rateLimiter = createRateLimiter({
    windowMs: 1000,
    max: 60,
    now: deps.now ?? Date.now,
  });

  ipcMain.handle(
    IPC_CHANNELS.window.minimize,
    makeWindowHandler<IpcVoid>({
      channel: IPC_CHANNELS.window.minimize,
      deps,
      rateLimiter,
      run: (win) => {
        win.minimize();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.window.toggleMaximize,
    makeWindowHandler<IpcVoid>({
      channel: IPC_CHANNELS.window.toggleMaximize,
      deps,
      rateLimiter,
      run: (win) => {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.window.close,
    makeWindowHandler<IpcVoid>({
      channel: IPC_CHANNELS.window.close,
      deps,
      rateLimiter,
      run: (win) => {
        win.close();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.window.isMaximized,
    makeWindowHandler<boolean>({
      channel: IPC_CHANNELS.window.isMaximized,
      deps,
      rateLimiter,
      run: (win) => win.isMaximized(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.open,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.open,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.quickCapture.open();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.hide,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.hide,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.quickCapture.hide();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.submit,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.submit,
      deps,
      rateLimiter,
      validate: validateQuickCaptureSubmitPayload,
      run: async (validatedPayload) => {
        const v = validatedPayload as QuickCaptureSubmitPayload;
        await deps.quickCapture.submit(v.content);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.cancel,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.cancel,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.quickCapture.cancel();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.getStatus,
    makeHandler<ShortcutsStatus>({
      channel: IPC_CHANNELS.shortcuts.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: () => deps.shortcuts.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.setConfig,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.shortcuts.setConfig,
      deps,
      rateLimiter,
      validate: validateShortcutsSetConfigPayload,
      run: (validatedPayload) => {
        deps.shortcuts.setConfig(validatedPayload as ShortcutsSetConfigPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.resetAll,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.shortcuts.resetAll,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: () => {
        deps.shortcuts.resetAll();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.resetOne,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.shortcuts.resetOne,
      deps,
      rateLimiter,
      validate: validateShortcutsResetOnePayload,
      run: (validatedPayload) => {
        const v = validatedPayload as ShortcutsResetOnePayload;
        deps.shortcuts.resetOne(v.id);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.storageRoot.getStatus,
    makeHandlerWithErrorMessage<StorageRootStatus>({
      channel: IPC_CHANNELS.storageRoot.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.storageRoot.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.storageRoot.chooseAndMigrate,
    makeHandlerWithErrorMessage<StorageRootChooseAndMigrateResult>({
      channel: IPC_CHANNELS.storageRoot.chooseAndMigrate,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.storageRoot.chooseAndMigrate(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.storageRoot.restartNow,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.storageRoot.restartNow,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.storageRoot.restartNow();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.diagnostics.getStatus,
    makeHandlerWithErrorMessage<DiagnosticsStatus>({
      channel: IPC_CHANNELS.diagnostics.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.diagnostics.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.contextMenu.popupMiddleItem,
    makeWindowHandlerWithPayload<IpcVoid>({
      channel: IPC_CHANNELS.contextMenu.popupMiddleItem,
      deps,
      rateLimiter,
      validate: validateContextMenuPopupMiddleItemPayload,
      run: async (win, validatedPayload) => {
        const v = validatedPayload as ContextMenuPopupMiddleItemPayload;
        await deps.contextMenu.popupMiddleItem({ win, itemId: v.itemId });
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.contextMenu.popupFolder,
    makeWindowHandlerWithPayload<IpcVoid>({
      channel: IPC_CHANNELS.contextMenu.popupFolder,
      deps,
      rateLimiter,
      validate: validateContextMenuPopupFolderPayload,
      run: async (win, validatedPayload) => {
        const v = validatedPayload as ContextMenuPopupFolderPayload;
        await deps.contextMenu.popupFolder({ win, folderId: v.folderId });
        return null;
      },
    })
  );
}

export const __test__ = {
  toIpcResult,
  validateEmptyPayload,
  validateQuickCaptureSubmitPayload,
  validateShortcutsSetConfigPayload,
  validateShortcutsResetOnePayload,
  validateContextMenuPopupMiddleItemPayload,
  validateContextMenuPopupFolderPayload,
};
