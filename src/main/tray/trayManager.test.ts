// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createCloseToTrayController, installTrayManager, runCleanupHooks } from './trayManager';

import type { TrayLike, TrayMenuTemplateItem } from './trayManager';

function createFakeTray(): TrayLike {
  return {
    setToolTip: () => {},
    setContextMenu: () => {},
    on: () => {},
    destroy: () => {},
  };
}

describe('src/main/tray/trayManager', () => {
  it('窗口 close 事件：默认 preventDefault + hide（不退出）', () => {
    const controller = createCloseToTrayController();

    const event = { preventDefault: vi.fn() };
    const win = { hide: vi.fn() };

    controller.handleWindowClose(event, win);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(win.hide).toHaveBeenCalledOnce();
    expect(controller.isExitRequested()).toBe(false);
  });

  it('首次关闭：提示回调只会触发一次（同一进程生命周期）', () => {
    const controller = createCloseToTrayController();

    const hint = vi.fn();

    const event1 = { preventDefault: vi.fn() };
    const win1 = { hide: vi.fn() };
    controller.handleWindowClose(event1, win1, { onFirstCloseToTrayHint: hint });

    const event2 = { preventDefault: vi.fn() };
    const win2 = { hide: vi.fn() };
    controller.handleWindowClose(event2, win2, { onFirstCloseToTrayHint: hint });

    expect(event1.preventDefault).toHaveBeenCalledOnce();
    expect(win1.hide).toHaveBeenCalledOnce();
    expect(event2.preventDefault).toHaveBeenCalledOnce();
    expect(win2.hide).toHaveBeenCalledOnce();
    expect(hint).toHaveBeenCalledOnce();
  });

  it('窗口 close 事件：closeBehavior=quit 时不 hide 且触发 onCloseToQuit', () => {
    const controller = createCloseToTrayController();
    controller.setCloseBehavior('quit');

    const event = { preventDefault: vi.fn() };
    const win = { hide: vi.fn() };
    const onCloseToQuit = vi.fn();

    controller.handleWindowClose(event, win, { onCloseToQuit });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
    expect(onCloseToQuit).toHaveBeenCalledOnce();
    expect(controller.isExitRequested()).toBe(true);
  });

  it('resetCloseToTrayHint：重置后提示可再次触发', () => {
    const controller = createCloseToTrayController();

    const hint = vi.fn();

    const event1 = { preventDefault: vi.fn() };
    const win1 = { hide: vi.fn() };
    controller.handleWindowClose(event1, win1, { onFirstCloseToTrayHint: hint });

    const event2 = { preventDefault: vi.fn() };
    const win2 = { hide: vi.fn() };
    controller.handleWindowClose(event2, win2, { onFirstCloseToTrayHint: hint });

    controller.resetCloseToTrayHint();

    const event3 = { preventDefault: vi.fn() };
    const win3 = { hide: vi.fn() };
    controller.handleWindowClose(event3, win3, { onFirstCloseToTrayHint: hint });

    expect(hint).toHaveBeenCalledTimes(2);
  });

  it('托盘 Exit：触发后必须执行所有 cleanup hooks', async () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const cleanup3 = vi.fn();
    const cleanupHooks = [cleanup1, cleanup2, cleanup3];

    let capturedTemplate: TrayMenuTemplateItem[] = [];

    installTrayManager({
      iconPath: '/tmp/tray.ico',
      tooltip: '心流',
      createTray: () => createFakeTray(),
      buildMenu: (template) => {
        capturedTemplate = template;
        return { template };
      },
      onToggleMainWindow: () => {},
      onQuickCapture: () => {},
      onSyncNowMemos: async () => undefined,
      onSyncNowFlow: async () => undefined,
      onOpenSettings: () => {},
      onExit: async () => {
        await runCleanupHooks(cleanupHooks);
      },
    });

    const exitItem = capturedTemplate.find(
      (item): item is Extract<TrayMenuTemplateItem, { type: 'item' }> =>
        item.type === 'item' && item.label === '退出'
    );
    expect(exitItem).toBeTruthy();

    await exitItem?.click();

    expect(cleanup1).toHaveBeenCalledOnce();
    expect(cleanup2).toHaveBeenCalledOnce();
    expect(cleanup3).toHaveBeenCalledOnce();
  });
});
