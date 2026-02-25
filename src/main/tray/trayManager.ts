export interface CloseEventLike {
  preventDefault: () => void;
}

export interface CloseToTrayWindowLike {
  hide: () => void;
}

export interface CloseToTrayController {
  requestExit: () => void;
  isExitRequested: () => boolean;
  handleWindowClose: (
    event: CloseEventLike,
    win: CloseToTrayWindowLike,
    options?: {
      onFirstCloseToTrayHint?: () => void | Promise<void>;
    }
  ) => void;
}

export function createCloseToTrayController(): CloseToTrayController {
  let exitRequested = false;
  let hintedOnce = false;

  return {
    requestExit: () => {
      exitRequested = true;
    },
    isExitRequested: () => exitRequested,
    handleWindowClose: (event, win, options) => {
      if (exitRequested) {
        return;
      }

      event.preventDefault();
      win.hide();

      if (hintedOnce) {
        return;
      }
      hintedOnce = true;

      const hint = options?.onFirstCloseToTrayHint;
      if (!hint) {
        return;
      }
      try {
        const result = hint();
        void Promise.resolve(result);
      } catch {
      }
    },
  };
}

export type CleanupHook = () => void | Promise<void>;

export async function runCleanupHooks(
  hooks: CleanupHook[],
  options: {
    logger?: {
      warn?: (message: string, meta?: Record<string, unknown>) => void;
    };
  } = {}
): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      options.logger?.warn?.('退出清理 hook 执行失败', { error: String(error) });
    }
  }
}

export interface TrayLike {
  setToolTip: (tooltip: string) => void;
  setContextMenu: (menu: unknown) => void;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  destroy?: () => void;
}

export type TrayMenuTemplateItem =
  | { type: 'separator' }
  | {
      type: 'item';
      label: string;
      click: () => void | Promise<void>;
    };

export interface TrayManagerDeps {
  iconPath: string;
  tooltip: string;
  createTray: (iconPath: string) => TrayLike;
  buildMenu: (template: TrayMenuTemplateItem[]) => unknown;

  onToggleMainWindow: () => void;
  onQuickCapture: () => void | Promise<void>;
  onSyncNowMemos: () => void | Promise<void>;
  onSyncNowFlow: () => void | Promise<void>;
  onOpenSettings: () => void | Promise<void>;
  onExit: () => void | Promise<void>;
}

export interface TrayManager {
  tray: TrayLike;
  destroy: () => void;
}

export function installTrayManager(deps: TrayManagerDeps): TrayManager {
  const tray = deps.createTray(deps.iconPath);
  tray.setToolTip(deps.tooltip);

  const template: TrayMenuTemplateItem[] = [
    {
      type: 'item',
      label: '显示/隐藏主窗口',
      click: () => deps.onToggleMainWindow(),
    },
    { type: 'separator' },
    {
      type: 'item',
      label: '快速捕获',
      click: () => deps.onQuickCapture(),
    },
    { type: 'separator' },
    {
      type: 'item',
      label: '立即同步（Memos）',
      click: () => deps.onSyncNowMemos(),
    },
    {
      type: 'item',
      label: '立即同步（Flow）',
      click: () => deps.onSyncNowFlow(),
    },
    { type: 'separator' },
    {
      type: 'item',
      label: '打开设置',
      click: () => deps.onOpenSettings(),
    },
    { type: 'separator' },
    {
      type: 'item',
      label: '退出',
      click: () => deps.onExit(),
    },
  ];

  const menu = deps.buildMenu(template);
  tray.setContextMenu(menu);

  tray.on?.('click', () => {
    deps.onToggleMainWindow();
  });

  return {
    tray,
    destroy: () => tray.destroy?.(),
  };
}
