// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type { ShortcutDefinition } from './shortcutManager';
import { createShortcutsManager, installShortcutsCleanupOnWillQuit } from './shortcutManager';

function createFakeGlobalShortcut(options?: {
  registerResult?: boolean;
}) {
  const registered = new Set<string>();
  const registerResult = options?.registerResult ?? true;

  return {
    register: (accelerator: string, _callback: () => void) => {
      if (!registerResult) {
        return false;
      }
      registered.add(accelerator);
      return true;
    },
    unregister: (accelerator: string) => {
      registered.delete(accelerator);
    },
    unregisterAll: () => {
      registered.clear();
    },
    isRegistered: (accelerator: string) => registered.has(accelerator),
  };
}

describe('src/main/shortcuts/shortcutManager', () => {
  it('注册失败可见：当 register() 返回 false 时，状态应标记 failed 并提供提示', () => {
    const globalShortcut = createFakeGlobalShortcut({ registerResult: false });
    const action = vi.fn();

    const definitions: ShortcutDefinition[] = [
      {
        id: 'openQuickCapture',
        title: '打开快捕窗',
        description: '触发快速捕获入口',
        defaultAccelerator: 'CommandOrControl+Shift+Q',
        action,
      },
    ];

    const mgr = createShortcutsManager({
      globalShortcut,
      definitions,
    });

    mgr.registerAll();

    const status = mgr.getStatus();
    expect(status.entries.length).toBe(1);
    expect(status.entries[0]?.registrationState).toBe('failed');
    expect(status.entries[0]?.registrationMessage).toContain('注册失败');
  });

  it('变更快捷键：修改 accelerator 后必须注销旧 accelerator，避免残留注册', () => {
    const globalShortcut = createFakeGlobalShortcut();

    const definitions: ShortcutDefinition[] = [
      {
        id: 'openQuickCapture',
        title: '打开快捕窗',
        description: '触发快速捕获入口',
        defaultAccelerator: 'CommandOrControl+Shift+Q',
        action: () => {},
      },
    ];

    const mgr = createShortcutsManager({
      globalShortcut,
      definitions,
    });

    mgr.registerAll();
    expect(globalShortcut.isRegistered('CommandOrControl+Shift+Q')).toBe(true);

    mgr.setConfig({
      id: 'openQuickCapture',
      accelerator: 'CommandOrControl+Alt+Q',
      enabled: true,
    });

    expect(globalShortcut.isRegistered('CommandOrControl+Shift+Q')).toBe(false);
    expect(globalShortcut.isRegistered('CommandOrControl+Alt+Q')).toBe(true);
  });

  it('will-quit 注销：触发 will-quit 时必须 unregisterAll()', () => {
    const globalShortcut = createFakeGlobalShortcut();

    const definitions: ShortcutDefinition[] = [
      {
        id: 'openQuickCapture',
        title: '打开快捕窗',
        description: '触发快速捕获入口',
        defaultAccelerator: 'CommandOrControl+Shift+Q',
        action: () => {},
      },
    ];

    const mgr = createShortcutsManager({
      globalShortcut,
      definitions,
    });

    const unregisterAllSpy = vi.spyOn(globalShortcut, 'unregisterAll');

    const listeners: Record<string, (() => void)[]> = {};
    const app = {
      on: (eventName: 'will-quit', listener: () => void) => {
        listeners[eventName] ??= [];
        listeners[eventName].push(listener);
      },
    };

    installShortcutsCleanupOnWillQuit(app, mgr);

    for (const listener of listeners['will-quit'] ?? []) {
      listener();
    }

    expect(unregisterAllSpy).toHaveBeenCalledOnce();
  });
});
