import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { IpcResult, IpcVoid, ShortcutsStatus } from '../shared/ipc';

import { App } from './App';

afterEach(() => {
  cleanup();
});

describe('<App />', () => {
  it('可以在不依赖 Electron 的情况下渲染', () => {
    render(<App />);

    expect(screen.getByTestId('titlebar-minimize')).toBeTruthy();
    expect(screen.getByTestId('titlebar-maximize')).toBeTruthy();
    expect(screen.getByTestId('titlebar-close')).toBeTruthy();

    expect(screen.getByTestId('triptych-left')).toBeTruthy();
    expect(screen.getByTestId('triptych-middle')).toBeTruthy();
    expect(screen.getByTestId('triptych-right')).toBeTruthy();

    expect(screen.getByTestId('nav-notes')).toBeTruthy();
    expect(screen.getByTestId('nav-collections')).toBeTruthy();
    expect(screen.getByTestId('nav-todo')).toBeTruthy();
    expect(screen.getByTestId('nav-settings')).toBeTruthy();
    expect(screen.getByTestId('nav-conflicts')).toBeTruthy();

    fireEvent.click(screen.getByTestId('titlebar-minimize'));
    fireEvent.click(screen.getByTestId('titlebar-maximize'));
    fireEvent.click(screen.getByTestId('titlebar-close'));

    fireEvent.click(screen.getByTestId('nav-settings'));
    expect(screen.getAllByText('设置').length).toBeGreaterThan(0);
    expect(screen.getByTestId('settings-shortcuts')).toBeTruthy();
    fireEvent.click(screen.getByTestId('nav-conflicts'));
    expect(screen.getAllByText('冲突').length).toBeGreaterThan(0);
  });

  it('设置页：注册失败必须可见且可定位到对应条目', async () => {
    const fakeShortcutsStatus: ShortcutsStatus = {
      entries: [
        {
          id: 'openQuickCapture',
          title: '打开快捕窗',
          description: '触发快速捕获入口',
          accelerator: 'CommandOrControl+Shift+Q',
          enabled: true,
          registrationState: 'failed',
          registrationMessage: '注册失败（测试注入）',
        },
      ],
    };

    window.xinliu = {
      versions: { electron: '0', chrome: '0', node: '0' },
      window: {
        minimize: async () => ({ ok: true, value: null } satisfies IpcResult<IpcVoid>),
        toggleMaximize: async () => ({ ok: true, value: null } satisfies IpcResult<IpcVoid>),
        close: async () => ({ ok: true, value: null } satisfies IpcResult<IpcVoid>),
        isMaximized: async () => ({ ok: true, value: false } satisfies IpcResult<boolean>),
      },
      shortcuts: {
        getStatus: async () => ({ ok: true, value: fakeShortcutsStatus } satisfies IpcResult<ShortcutsStatus>),
        setConfig: async () => ({ ok: true, value: null } satisfies IpcResult<IpcVoid>),
        resetAll: async () => ({ ok: true, value: null } satisfies IpcResult<IpcVoid>),
        resetOne: async () => ({ ok: true, value: null } satisfies IpcResult<IpcVoid>),
        onFocusSearch: () => () => {},
      },
    };

    render(<App />);

    fireEvent.click(screen.getByTestId('nav-settings'));

    expect(await screen.findByTestId('settings-shortcut-openQuickCapture-register-failed')).toBeTruthy();

    delete window.xinliu;
  });
});
