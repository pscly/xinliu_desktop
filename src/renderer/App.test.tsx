import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CloseBehaviorSetPayload,
  CloseBehaviorStatus,
  DiagnosticsStatus,
  FileAccessReadTextFileResult,
  FileAccessShowOpenDialogResult,
  FileAccessShowSaveDialogResult,
  IpcResult,
  IpcVoid,
  SearchQueryResult,
  SearchRebuildIndexResult,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  UpdaterStatus,
} from '../shared/ipc';

import { App } from './App';

afterEach(() => {
  cleanup();
});

function buildXinliuStub(overrides: {
  showSaveDialog?: NonNullable<NonNullable<Window['xinliu']>['fileAccess']>['showSaveDialog'];
  writeTextFile?: NonNullable<NonNullable<Window['xinliu']>['fileAccess']>['writeTextFile'];
}): NonNullable<Window['xinliu']> {
  return {
    versions: { electron: '0', chrome: '0', node: '0' },
    window: {
      minimize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      toggleMaximize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      close: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      isMaximized: async () => ({ ok: true, value: false }) satisfies IpcResult<boolean>,
    },
    quickCapture: {
      open: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      hide: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      submit: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      cancel: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
    },
    shortcuts: {
      getStatus: async () =>
        ({ ok: true, value: { entries: [] } }) satisfies IpcResult<ShortcutsStatus>,
      setConfig: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      resetAll: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      resetOne: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      onFocusSearch: () => () => {},
    },
    fileAccess: {
      showOpenDialog: async () =>
        ({
          ok: true,
          value: { kind: 'cancelled' },
        }) satisfies IpcResult<FileAccessShowOpenDialogResult>,
      showSaveDialog:
        overrides.showSaveDialog ??
        (async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowSaveDialogResult>),
      readTextFile: async () =>
        ({ ok: true, value: { content: '' } }) satisfies IpcResult<FileAccessReadTextFileResult>,
      writeTextFile:
        overrides.writeTextFile ??
        (async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>),
    },
    storageRoot: {
      getStatus: async () =>
        ({
          ok: true,
          value: { storageRootAbsPath: '/tmp/xinliu', isDefault: true },
        }) satisfies IpcResult<{
          storageRootAbsPath: string;
          isDefault: boolean;
        }>,
      chooseAndMigrate: async () =>
        ({ ok: true, value: { kind: 'cancelled' } }) satisfies IpcResult<{ kind: 'cancelled' }>,
      restartNow: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
    },
    closeBehavior: {
      getStatus: async () =>
        ({
          ok: true,
          value: { behavior: 'hide', closeToTrayHintShown: false } satisfies CloseBehaviorStatus,
        }) satisfies IpcResult<CloseBehaviorStatus>,
      setBehavior: async (_payload: CloseBehaviorSetPayload) =>
        ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      resetCloseToTrayHint: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
    },
    diagnostics: {
      getStatus: async () =>
        ({
          ok: true,
          value: {
            flowBaseUrl: 'https://xl.pscly.cc',
            memosBaseUrl: null,
            notesProvider: null,
            notesProviderKind: null,
            lastDegradeReason: null,
            lastRequestIds: { memos_request_id: null, flow_request_id: null },
          } satisfies DiagnosticsStatus,
        }) satisfies IpcResult<DiagnosticsStatus>,
    },
    contextMenu: {
      popupMiddleItem: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      popupFolder: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      onCommand: () => () => {},
    },
    search: {
      query: async () =>
        ({
          ok: true,
          value: {
            mode: 'fallback',
            ftsAvailable: false,
            degradedReason: 'test',
            page: 0,
            pageSize: 20,
            hasMore: false,
            items: [],
          } satisfies SearchQueryResult,
        }) satisfies IpcResult<SearchQueryResult>,
      rebuildIndex: async () =>
        ({
          ok: true,
          value: {
            ok: true,
            ftsAvailable: false,
            rebuilt: false,
            message: 'test',
          } satisfies SearchRebuildIndexResult,
        }) satisfies IpcResult<SearchRebuildIndexResult>,
    },
    updater: {
      getStatus: async () =>
        ({
          ok: true,
          value: {
            state: 'disabled',
            currentVersion: '0.0.0',
            availableVersion: null,
            progress: null,
            lastCheckedAtMs: null,
            errorMessage: '自动更新仅在安装包中可用',
            releasesUrl: 'https://example.com/releases',
            deferred: false,
          } satisfies UpdaterStatus,
        }) satisfies IpcResult<UpdaterStatus>,
      checkForUpdates: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      installNow: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      deferInstall: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      onStatusChanged: () => () => {},
    },
  };
}

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

    fireEvent.click(screen.getByTestId('titlebar-quick-capture'));

    fireEvent.click(screen.getByTestId('nav-settings'));
    expect(screen.getAllByText('设置').length).toBeGreaterThan(0);
    expect(screen.getByTestId('settings-close-behavior')).toBeTruthy();
    expect(screen.getByTestId('close-behavior-hide')).toBeTruthy();
    expect(screen.getByTestId('close-behavior-quit')).toBeTruthy();
    expect(screen.getByTestId('close-to-tray-hint-reset')).toBeTruthy();
    expect(screen.getByTestId('settings-updater')).toBeTruthy();
    expect(screen.getByTestId('check-updates')).toBeTruthy();
    expect(screen.getByTestId('settings-shortcuts')).toBeTruthy();
    expect(screen.getByTestId('diagnostics-panel')).toBeTruthy();
    expect(screen.getByTestId('diagnostics-copy-flow-request-id')).toBeTruthy();
    expect(screen.getByTestId('diagnostics-copy-memos-request-id')).toBeTruthy();
    fireEvent.click(screen.getByTestId('nav-conflicts'));
    expect(screen.getAllByText('冲突').length).toBeGreaterThan(0);
  });

  it('设置页：更新区块必须包含关键 data-testid（disabled 提示也要可定位）', async () => {
    window.xinliu = buildXinliuStub({});

    render(<App />);
    fireEvent.click(screen.getByTestId('nav-settings'));

    expect(await screen.findByTestId('settings-updater')).toBeTruthy();
    expect(screen.getByTestId('check-updates')).toBeTruthy();
    expect(screen.getByTestId('update-open-releases')).toBeTruthy();
    expect(screen.getByTestId('update-current-version')).toBeTruthy();
    expect(screen.getByTestId('update-status')).toBeTruthy();
    expect(screen.getByTestId('update-disabled-hint')).toBeTruthy();

    delete window.xinliu;
  });

  it('设置页：下载完成态必须出现“安装并重启/稍后再说”按钮', async () => {
    const stub = buildXinliuStub({});
    stub.updater.getStatus = async () =>
      ({
        ok: true,
        value: {
          state: 'downloaded',
          currentVersion: '0.0.1',
          availableVersion: '0.0.2',
          progress: { percent01: 1, transferred: null, total: null, bytesPerSecond: null },
          lastCheckedAtMs: 123,
          errorMessage: null,
          releasesUrl: 'https://example.com/releases',
          deferred: false,
        } satisfies UpdaterStatus,
      }) satisfies IpcResult<UpdaterStatus>;

    window.xinliu = stub;

    render(<App />);
    fireEvent.click(screen.getByTestId('nav-settings'));

    expect(await screen.findByTestId('update-downloaded')).toBeTruthy();
    expect(screen.getByTestId('update-install-now')).toBeTruthy();
    expect(screen.getByTestId('update-defer')).toBeTruthy();

    delete window.xinliu;
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
        minimize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        toggleMaximize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        close: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        isMaximized: async () => ({ ok: true, value: false }) satisfies IpcResult<boolean>,
      },
      quickCapture: {
        open: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        hide: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        submit: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        cancel: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      shortcuts: {
        getStatus: async () =>
          ({ ok: true, value: fakeShortcutsStatus }) satisfies IpcResult<ShortcutsStatus>,
        setConfig: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetAll: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetOne: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        onFocusSearch: () => () => {},
      },
      fileAccess: {
        showOpenDialog: async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowOpenDialogResult>,
        showSaveDialog: async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowSaveDialogResult>,
        readTextFile: async () =>
          ({ ok: true, value: { content: '' } }) satisfies IpcResult<FileAccessReadTextFileResult>,
        writeTextFile: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      storageRoot: {
        getStatus: async () =>
          ({
            ok: true,
            value: { storageRootAbsPath: '/tmp/xinliu', isDefault: true },
          }) satisfies IpcResult<{
            storageRootAbsPath: string;
            isDefault: boolean;
          }>,
        chooseAndMigrate: async () =>
          ({ ok: true, value: { kind: 'cancelled' } }) satisfies IpcResult<{ kind: 'cancelled' }>,
        restartNow: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      closeBehavior: {
        getStatus: async () =>
          ({
            ok: true,
            value: { behavior: 'hide', closeToTrayHintShown: false } satisfies CloseBehaviorStatus,
          }) satisfies IpcResult<CloseBehaviorStatus>,
        setBehavior: async (_payload: CloseBehaviorSetPayload) =>
          ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetCloseToTrayHint: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      diagnostics: {
        getStatus: async () =>
          ({
            ok: true,
            value: {
              flowBaseUrl: 'https://xl.pscly.cc',
              memosBaseUrl: null,
              notesProvider: null,
              notesProviderKind: null,
              lastDegradeReason: null,
              lastRequestIds: { memos_request_id: null, flow_request_id: null },
            } satisfies DiagnosticsStatus,
          }) satisfies IpcResult<DiagnosticsStatus>,
      },
      contextMenu: {
        popupMiddleItem: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        popupFolder: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        onCommand: () => () => {},
      },
      search: {
        query: async () =>
          ({
            ok: true,
            value: {
              mode: 'fallback',
              ftsAvailable: false,
              degradedReason: 'test',
              page: 0,
              pageSize: 20,
              hasMore: false,
              items: [],
            } satisfies SearchQueryResult,
          }) satisfies IpcResult<SearchQueryResult>,
        rebuildIndex: async () =>
          ({
            ok: true,
            value: {
              ok: true,
              ftsAvailable: false,
              rebuilt: false,
              message: 'test',
            } satisfies SearchRebuildIndexResult,
          }) satisfies IpcResult<SearchRebuildIndexResult>,
      },
      updater: buildXinliuStub({}).updater,
    };

    render(<App />);

    fireEvent.click(screen.getByTestId('nav-settings'));

    expect(
      await screen.findByTestId('settings-shortcut-openQuickCapture-register-failed')
    ).toBeTruthy();

    delete window.xinliu;
  });

  it('应用内按钮兜底：点击快捕按钮会调用 quickCapture.open', () => {
    const open = async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>;
    const spy = vi.fn(open);

    window.xinliu = {
      versions: { electron: '0', chrome: '0', node: '0' },
      window: {
        minimize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        toggleMaximize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        close: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        isMaximized: async () => ({ ok: true, value: false }) satisfies IpcResult<boolean>,
      },
      quickCapture: {
        open: spy,
        hide: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        submit: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        cancel: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      shortcuts: {
        getStatus: async () =>
          ({ ok: true, value: { entries: [] } }) satisfies IpcResult<ShortcutsStatus>,
        setConfig: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetAll: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetOne: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        onFocusSearch: () => () => {},
      },
      fileAccess: {
        showOpenDialog: async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowOpenDialogResult>,
        showSaveDialog: async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowSaveDialogResult>,
        readTextFile: async () =>
          ({ ok: true, value: { content: '' } }) satisfies IpcResult<FileAccessReadTextFileResult>,
        writeTextFile: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      storageRoot: {
        getStatus: async () =>
          ({
            ok: true,
            value: { storageRootAbsPath: '/tmp/xinliu', isDefault: true },
          }) satisfies IpcResult<{
            storageRootAbsPath: string;
            isDefault: boolean;
          }>,
        chooseAndMigrate: async () =>
          ({ ok: true, value: { kind: 'cancelled' } }) satisfies IpcResult<{ kind: 'cancelled' }>,
        restartNow: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      closeBehavior: {
        getStatus: async () =>
          ({
            ok: true,
            value: { behavior: 'hide', closeToTrayHintShown: false } satisfies CloseBehaviorStatus,
          }) satisfies IpcResult<CloseBehaviorStatus>,
        setBehavior: async (_payload: CloseBehaviorSetPayload) =>
          ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetCloseToTrayHint: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      diagnostics: {
        getStatus: async () =>
          ({
            ok: true,
            value: {
              flowBaseUrl: 'https://xl.pscly.cc',
              memosBaseUrl: null,
              notesProvider: null,
              notesProviderKind: null,
              lastDegradeReason: null,
              lastRequestIds: { memos_request_id: null, flow_request_id: null },
            } satisfies DiagnosticsStatus,
          }) satisfies IpcResult<DiagnosticsStatus>,
      },
      contextMenu: {
        popupMiddleItem: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        popupFolder: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        onCommand: () => () => {},
      },
      search: {
        query: async () =>
          ({
            ok: true,
            value: {
              mode: 'fallback',
              ftsAvailable: false,
              degradedReason: 'test',
              page: 0,
              pageSize: 20,
              hasMore: false,
              items: [],
            } satisfies SearchQueryResult,
          }) satisfies IpcResult<SearchQueryResult>,
        rebuildIndex: async () =>
          ({
            ok: true,
            value: {
              ok: true,
              ftsAvailable: false,
              rebuilt: false,
              message: 'test',
            } satisfies SearchRebuildIndexResult,
          }) satisfies IpcResult<SearchRebuildIndexResult>,
      },
      updater: buildXinliuStub({}).updater,
    };

    render(<App />);
    fireEvent.click(screen.getByTestId('titlebar-quick-capture'));

    expect(spy).toHaveBeenCalledTimes(1);

    delete window.xinliu;
  });

  it('设置页：迁移成功后必须提示重启且可立即重启', async () => {
    const chooseAndMigrate = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            kind: 'migrated',
            oldStorageRootAbsPath: '/tmp/xinliu-old',
            newStorageRootAbsPath: '/tmp/xinliu-new',
            moved: { db: true, attachmentsCache: true, logs: true },
            restartRequired: true,
          },
        }) satisfies IpcResult<StorageRootChooseAndMigrateResult>
    );
    const restartNow = vi.fn(async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>);

    window.xinliu = {
      versions: { electron: '0', chrome: '0', node: '0' },
      window: {
        minimize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        toggleMaximize: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        close: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        isMaximized: async () => ({ ok: true, value: false }) satisfies IpcResult<boolean>,
      },
      quickCapture: {
        open: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        hide: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        submit: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        cancel: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      shortcuts: {
        getStatus: async () =>
          ({ ok: true, value: { entries: [] } }) satisfies IpcResult<ShortcutsStatus>,
        setConfig: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetAll: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetOne: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        onFocusSearch: () => () => {},
      },
      fileAccess: {
        showOpenDialog: async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowOpenDialogResult>,
        showSaveDialog: async () =>
          ({
            ok: true,
            value: { kind: 'cancelled' },
          }) satisfies IpcResult<FileAccessShowSaveDialogResult>,
        readTextFile: async () =>
          ({ ok: true, value: { content: '' } }) satisfies IpcResult<FileAccessReadTextFileResult>,
        writeTextFile: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      storageRoot: {
        getStatus: async () =>
          ({
            ok: true,
            value: { storageRootAbsPath: '/tmp/xinliu', isDefault: true },
          }) satisfies IpcResult<{
            storageRootAbsPath: string;
            isDefault: boolean;
          }>,
        chooseAndMigrate,
        restartNow,
      },
      closeBehavior: {
        getStatus: async () =>
          ({
            ok: true,
            value: { behavior: 'hide', closeToTrayHintShown: false } satisfies CloseBehaviorStatus,
          }) satisfies IpcResult<CloseBehaviorStatus>,
        setBehavior: async (_payload: CloseBehaviorSetPayload) =>
          ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        resetCloseToTrayHint: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      },
      diagnostics: {
        getStatus: async () =>
          ({
            ok: true,
            value: {
              flowBaseUrl: 'https://xl.pscly.cc',
              memosBaseUrl: null,
              notesProvider: null,
              notesProviderKind: null,
              lastDegradeReason: null,
              lastRequestIds: { memos_request_id: null, flow_request_id: null },
            } satisfies DiagnosticsStatus,
          }) satisfies IpcResult<DiagnosticsStatus>,
      },
      contextMenu: {
        popupMiddleItem: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        popupFolder: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
        onCommand: () => () => {},
      },
      search: {
        query: async () =>
          ({
            ok: true,
            value: {
              mode: 'fallback',
              ftsAvailable: false,
              degradedReason: 'test',
              page: 0,
              pageSize: 20,
              hasMore: false,
              items: [],
            } satisfies SearchQueryResult,
          }) satisfies IpcResult<SearchQueryResult>,
        rebuildIndex: async () =>
          ({
            ok: true,
            value: {
              ok: true,
              ftsAvailable: false,
              rebuilt: false,
              message: 'test',
            } satisfies SearchRebuildIndexResult,
          }) satisfies IpcResult<SearchRebuildIndexResult>,
      },
      updater: buildXinliuStub({}).updater,
    };

    render(<App />);
    fireEvent.click(screen.getByTestId('nav-settings'));

    expect(await screen.findByTestId('settings-storage-root')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '更改目录' }));
    expect(chooseAndMigrate).toHaveBeenCalledTimes(1);

    expect(await screen.findByTestId('settings-restart-required')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '立即重启' }));
    expect(restartNow).toHaveBeenCalledTimes(1);

    delete window.xinliu;
  });

  it('分享/导出：必须先 showSaveDialog 再 writeTextFile（纯文本）', async () => {
    const showSaveDialog = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            kind: 'granted',
            grantId: 'grant_1',
            filePath: '/tmp/xinliu-export.txt',
            fileName: 'xinliu-export.txt',
          },
        }) satisfies IpcResult<FileAccessShowSaveDialogResult>
    );

    const writeTextFile = vi.fn(
      async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>
    );

    window.xinliu = buildXinliuStub({ showSaveDialog, writeTextFile });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '导出纯文本' }));

    await waitFor(() => {
      expect(showSaveDialog).toHaveBeenCalledTimes(1);
      expect(writeTextFile).toHaveBeenCalledTimes(1);
    });

    expect(showSaveDialog.mock.invocationCallOrder[0]).toBeLessThan(
      writeTextFile.mock.invocationCallOrder[0]
    );

    expect(writeTextFile).toHaveBeenCalledWith({
      grantId: 'grant_1',
      filePath: '/tmp/xinliu-export.txt',
      content: expect.stringContaining('心流'),
    });

    delete window.xinliu;
  });

  it('分享/导出：取消保存对话框后不得写文件', async () => {
    const showSaveDialog = vi.fn(
      async () =>
        ({
          ok: true,
          value: { kind: 'cancelled' },
        }) satisfies IpcResult<FileAccessShowSaveDialogResult>
    );
    const writeTextFile = vi.fn(
      async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>
    );

    window.xinliu = buildXinliuStub({ showSaveDialog, writeTextFile });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '导出纯文本' }));

    await waitFor(() => {
      expect(showSaveDialog).toHaveBeenCalledTimes(1);
    });

    expect(writeTextFile).toHaveBeenCalledTimes(0);

    delete window.xinliu;
  });

  it('分享/导出：写入失败时必须提供复制兜底按钮', async () => {
    const showSaveDialog = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            kind: 'granted',
            grantId: 'grant_1',
            filePath: '/tmp/xinliu-export.txt',
            fileName: 'xinliu-export.txt',
          },
        }) satisfies IpcResult<FileAccessShowSaveDialogResult>
    );

    const writeTextFile = vi.fn(
      async () =>
        ({
          ok: false,
          error: { code: 'PERMISSION_DENIED', message: '写入被拒绝' },
        }) satisfies IpcResult<IpcVoid>
    );

    window.xinliu = buildXinliuStub({ showSaveDialog, writeTextFile });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '导出纯文本' }));

    await waitFor(() => {
      expect(screen.getByText(/PERMISSION_DENIED/)).toBeTruthy();
    });

    expect(screen.getByTestId('export-copy')).toBeTruthy();

    delete window.xinliu;
  });
});
