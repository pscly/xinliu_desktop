import { EMPTY_PAYLOAD, IPC_CHANNELS } from '../shared/ipc';
import type {
  EmptyPayload,
  IpcChannel,
  IpcErrorCode,
  IpcResult,
  IpcVoid,
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
}

export const __test__ = {
  toIpcResult,
  validateEmptyPayload,
};
