import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CloseBehaviorSetPayload,
  CloseBehaviorStatus,
  DiagnosticsStatus,
  FlowConflictListResult,
  FlowConflictResolveResult,
  FileAccessReadTextFileResult,
  FileAccessShowOpenDialogResult,
  FileAccessShowSaveDialogResult,
  IpcResult,
  IpcVoid,
  NotesConflictListResult,
  NotesGetDraftResult,
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

type XinliuNotesApi = NonNullable<NonNullable<Window['xinliu']>['notes']>;

function buildXinliuStub(overrides: {
  showSaveDialog?: NonNullable<NonNullable<Window['xinliu']>['fileAccess']>['showSaveDialog'];
  writeTextFile?: NonNullable<NonNullable<Window['xinliu']>['fileAccess']>['writeTextFile'];
  createDraft?: XinliuNotesApi['createDraft'];
  upsertDraft?: XinliuNotesApi['upsertDraft'];
  getDraft?: XinliuNotesApi['getDraft'];
  listFlowConflicts?: NonNullable<NonNullable<Window['xinliu']>['conflicts']>['listFlow'];
  listNotesConflicts?: NonNullable<NonNullable<Window['xinliu']>['conflicts']>['listNotes'];
  resolveFlowApplyServer?: NonNullable<
    NonNullable<Window['xinliu']>['conflicts']
  >['resolveFlowApplyServer'];
  resolveFlowKeepLocalCopy?: NonNullable<
    NonNullable<Window['xinliu']>['conflicts']
  >['resolveFlowKeepLocalCopy'];
  resolveFlowForceOverwrite?: NonNullable<
    NonNullable<Window['xinliu']>['conflicts']
  >['resolveFlowForceOverwrite'];
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
    notes: {
      createDraft:
        overrides.createDraft ??
        (async () =>
          ({ ok: true, value: { localUuid: 'draft_1' } }) satisfies IpcResult<{
            localUuid: string;
          }>),
      upsertDraft:
        overrides.upsertDraft ??
        (async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>),
      getDraft:
        overrides.getDraft ??
        (async ({ localUuid }) =>
          ({
            ok: true,
            value: {
              draft: {
                localUuid,
                content: '# 新笔记\n',
                syncStatus: 'DIRTY',
                updatedAtMs: 2,
                createdAtMs: 1,
              },
            },
          }) satisfies IpcResult<NotesGetDraftResult>),
      listItems: async () =>
        ({ ok: true, value: { items: [], hasMore: false } }) satisfies IpcResult<{
          items: [];
          hasMore: boolean;
        }>,
      delete: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      restore: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
      hardDelete: async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>,
    },
    conflicts: {
      listFlow:
        overrides.listFlowConflicts ??
        (async () =>
          ({ ok: true, value: { items: [] } }) satisfies IpcResult<FlowConflictListResult>),
      listNotes:
        overrides.listNotesConflicts ??
        (async () =>
          ({ ok: true, value: { items: [] } }) satisfies IpcResult<NotesConflictListResult>),
      resolveFlowApplyServer:
        overrides.resolveFlowApplyServer ??
        (async ({ outboxId }) =>
          ({
            ok: true,
            value: {
              outboxId,
              resolved: true,
              strategy: 'apply_server',
              bumpedClientUpdatedAtMs: null,
              copiedEntityId: null,
            } satisfies FlowConflictResolveResult,
          }) satisfies IpcResult<FlowConflictResolveResult>),
      resolveFlowKeepLocalCopy:
        overrides.resolveFlowKeepLocalCopy ??
        (async ({ outboxId }) =>
          ({
            ok: true,
            value: {
              outboxId,
              resolved: true,
              strategy: 'keep_local_copy',
              bumpedClientUpdatedAtMs: null,
              copiedEntityId: 'copy_local_id',
            } satisfies FlowConflictResolveResult,
          }) satisfies IpcResult<FlowConflictResolveResult>),
      resolveFlowForceOverwrite:
        overrides.resolveFlowForceOverwrite ??
        (async ({ outboxId }) =>
          ({
            ok: true,
            value: {
              outboxId,
              resolved: true,
              strategy: 'force_overwrite',
              bumpedClientUpdatedAtMs: 123,
              copiedEntityId: null,
            } satisfies FlowConflictResolveResult,
          }) satisfies IpcResult<FlowConflictResolveResult>),
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

  it('冲突中心：进入冲突路由后渲染 Flow/Notes 两类真实列表', async () => {
    const listFlow = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            items: [
              {
                outboxId: 'obx_render_1',
                resource: 'todo_item',
                op: 'upsert',
                entityId: 'todo_1',
                clientUpdatedAtMs: 10,
                updatedAtMs: 11,
                requestId: 'req_render_1',
                localData: { title: '本地版本' },
                serverSnapshot: { id: 'todo_1', title: '服务端版本' },
              },
            ],
          } satisfies FlowConflictListResult,
        }) satisfies IpcResult<FlowConflictListResult>
    );

    const listNotes = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            items: [
              {
                localUuid: 'memo_copy_1',
                originalLocalUuid: 'memo_original_1',
                conflictRequestId: 'memo_req_1',
                updatedAtMs: 22,
                copyContent: '副本正文',
                originalContent: '原文正文',
              },
            ],
          } satisfies NotesConflictListResult,
        }) satisfies IpcResult<NotesConflictListResult>
    );

    window.xinliu = buildXinliuStub({
      listFlowConflicts: listFlow,
      listNotesConflicts: listNotes,
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('nav-conflicts'));

    expect(await screen.findByTestId('conflicts-flow-list')).toBeTruthy();
    expect(await screen.findByTestId('conflicts-notes-list')).toBeTruthy();

    expect(screen.getByTestId('conflicts-flow-item-obx_render_1')).toBeTruthy();
    expect(screen.getByTestId('conflicts-flow-apply-server-obx_render_1')).toBeTruthy();
    expect(screen.getByTestId('conflicts-flow-keep-local-obx_render_1')).toBeTruthy();
    expect(screen.getByTestId('conflicts-flow-force-overwrite-obx_render_1')).toBeTruthy();

    expect(screen.getByTestId('conflicts-notes-item-memo_copy_1')).toBeTruthy();
    expect(screen.getByTestId('conflicts-notes-compare-memo_copy_1')).toBeTruthy();
    expect(screen.getByTestId('conflicts-notes-copy-memo_copy_1')).toBeTruthy();

    delete window.xinliu;
  });

  it('冲突中心：点击 apply_server 会调用裁决并刷新列表', async () => {
    const listFlow = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            items: [
              {
                outboxId: 'obx_apply_1',
                resource: 'todo_item',
                op: 'upsert',
                entityId: 'todo_apply_1',
                clientUpdatedAtMs: 100,
                updatedAtMs: 101,
                requestId: 'req_apply_1',
                localData: { title: 'local' },
                serverSnapshot: { title: 'server' },
              },
            ],
          } satisfies FlowConflictListResult,
        }) satisfies IpcResult<FlowConflictListResult>
    );
    const listNotes = vi.fn(
      async () =>
        ({
          ok: true,
          value: { items: [] } satisfies NotesConflictListResult,
        }) satisfies IpcResult<NotesConflictListResult>
    );
    const resolveApply = vi.fn(
      async ({ outboxId }: { outboxId: string }) =>
        ({
          ok: true,
          value: {
            outboxId,
            resolved: true,
            strategy: 'apply_server',
            bumpedClientUpdatedAtMs: null,
            copiedEntityId: null,
          } satisfies FlowConflictResolveResult,
        }) satisfies IpcResult<FlowConflictResolveResult>
    );

    window.xinliu = buildXinliuStub({
      listFlowConflicts: listFlow,
      listNotesConflicts: listNotes,
      resolveFlowApplyServer: resolveApply,
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('nav-conflicts'));

    const applyBtn = await screen.findByTestId('conflicts-flow-apply-server-obx_apply_1');
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(resolveApply).toHaveBeenCalledTimes(1);
    });
    expect(resolveApply).toHaveBeenCalledWith({ outboxId: 'obx_apply_1' });

    await waitFor(() => {
      expect(listFlow.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(listNotes.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    delete window.xinliu;
  });

  it('冲突中心：force_overwrite 必须二次确认后才执行', async () => {
    const listFlow = vi.fn(
      async () =>
        ({
          ok: true,
          value: {
            items: [
              {
                outboxId: 'obx_force_1',
                resource: 'todo_item',
                op: 'upsert',
                entityId: 'todo_force_1',
                clientUpdatedAtMs: 200,
                updatedAtMs: 201,
                requestId: 'req_force_1',
                localData: { title: 'local force' },
                serverSnapshot: { title: 'server force' },
              },
            ],
          } satisfies FlowConflictListResult,
        }) satisfies IpcResult<FlowConflictListResult>
    );
    const resolveForce = vi.fn(
      async ({ outboxId }: { outboxId: string }) =>
        ({
          ok: true,
          value: {
            outboxId,
            resolved: true,
            strategy: 'force_overwrite',
            bumpedClientUpdatedAtMs: 999,
            copiedEntityId: null,
          } satisfies FlowConflictResolveResult,
        }) satisfies IpcResult<FlowConflictResolveResult>
    );

    window.xinliu = buildXinliuStub({
      listFlowConflicts: listFlow,
      resolveFlowForceOverwrite: resolveForce,
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('nav-conflicts'));

    const forceBtn = await screen.findByTestId('conflicts-flow-force-overwrite-obx_force_1');
    fireEvent.click(forceBtn);

    const confirmBtn = await screen.findByTestId('conflicts-flow-force-confirm-obx_force_1');
    expect(screen.getByTestId('conflicts-flow-force-confirm-panel-obx_force_1')).toBeTruthy();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(resolveForce).toHaveBeenCalledTimes(1);
    });
    expect(resolveForce).toHaveBeenCalledWith({ outboxId: 'obx_force_1' });

    await waitFor(() => {
      expect(screen.queryByTestId('conflicts-flow-force-confirm-panel-obx_force_1')).toBeNull();
    });

    delete window.xinliu;
  });

  it('Notes 编辑器：可以新建草稿并进入可编辑状态', async () => {
    const createDraft = vi.fn(
      async () =>
        ({ ok: true, value: { localUuid: 'draft_local_1' } }) satisfies IpcResult<{
          localUuid: string;
        }>
    );
    const getDraft = vi.fn(
      async ({ localUuid }: { localUuid: string }) =>
        ({
          ok: true,
          value: {
            draft: {
              localUuid,
              content: '# 新笔记\n',
              syncStatus: 'DIRTY',
              updatedAtMs: 2,
              createdAtMs: 1,
            },
          },
        }) satisfies IpcResult<NotesGetDraftResult>
    );

    window.xinliu = buildXinliuStub({
      createDraft: createDraft as XinliuNotesApi['createDraft'],
      getDraft: getDraft as XinliuNotesApi['getDraft'],
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('notes-new'));

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledTimes(1);
    });
    expect(createDraft).toHaveBeenCalledWith({ content: '# 新笔记\n' });

    const input = screen.getByTestId('notes-editor-input') as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('# 新笔记\n');

    await waitFor(() => {
      expect(screen.getByTestId('notes-save-status').textContent ?? '').toContain('本地已保存');
    });

    delete window.xinliu;
  });

  it('Notes 编辑器：输入后会 debounce 调用 autosave（避免每次按键都 IPC）', async () => {
    const createDraft = vi.fn(
      async () =>
        ({ ok: true, value: { localUuid: 'draft_local_1' } }) satisfies IpcResult<{
          localUuid: string;
        }>
    );
    const upsertDraft = vi.fn(async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>);
    const getDraft = vi.fn(
      async ({ localUuid }: { localUuid: string }) =>
        ({
          ok: true,
          value: {
            draft: {
              localUuid,
              content: '# 新笔记\n',
              syncStatus: 'DIRTY',
              updatedAtMs: 2,
              createdAtMs: 1,
            },
          },
        }) satisfies IpcResult<NotesGetDraftResult>
    );

    window.xinliu = buildXinliuStub({
      createDraft: createDraft as XinliuNotesApi['createDraft'],
      upsertDraft: upsertDraft as XinliuNotesApi['upsertDraft'],
      getDraft: getDraft as XinliuNotesApi['getDraft'],
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('notes-new'));

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledTimes(1);
    });

    const input = screen.getByTestId('notes-editor-input');

    fireEvent.change(input, { target: { value: '# 新笔记\n第一行' } });
    expect(screen.getByTestId('notes-save-status').textContent ?? '').toContain('本地修改待保存');

    await waitFor(
      () => {
        expect(upsertDraft).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 }
    );
    expect(upsertDraft).toHaveBeenLastCalledWith({
      localUuid: 'draft_local_1',
      content: '# 新笔记\n第一行',
    });

    fireEvent.change(input, { target: { value: '# 新笔记\n第二行' } });
    fireEvent.change(input, { target: { value: '# 新笔记\n第三行' } });

    await waitFor(
      () => {
        expect(upsertDraft).toHaveBeenCalledTimes(2);
      },
      { timeout: 2500 }
    );
    expect(upsertDraft).toHaveBeenLastCalledWith({
      localUuid: 'draft_local_1',
      content: '# 新笔记\n第三行',
    });

    delete window.xinliu;
  });

  it('Notes 编辑器：sync 状态文案会按 getDraft 返回值更新', async () => {
    const createDraft = vi.fn(
      async () =>
        ({ ok: true, value: { localUuid: 'draft_local_1' } }) satisfies IpcResult<{
          localUuid: string;
        }>
    );
    const upsertDraft = vi.fn(async () => ({ ok: true, value: null }) satisfies IpcResult<IpcVoid>);
    const getDraft = vi
      .fn<XinliuNotesApi['getDraft']>()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          draft: {
            localUuid: 'draft_local_1',
            content: '# 新笔记\n',
            syncStatus: 'SYNCING',
            updatedAtMs: 2,
            createdAtMs: 1,
          },
        },
      })
      .mockResolvedValue({
        ok: true,
        value: {
          draft: {
            localUuid: 'draft_local_1',
            content: '# 新笔记\n更新后',
            syncStatus: 'FAILED',
            updatedAtMs: 3,
            createdAtMs: 1,
          },
        },
      });

    window.xinliu = buildXinliuStub({
      createDraft: createDraft as XinliuNotesApi['createDraft'],
      upsertDraft: upsertDraft as XinliuNotesApi['upsertDraft'],
      getDraft,
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('notes-new'));

    await waitFor(() => {
      expect(screen.getByTestId('notes-save-status').textContent ?? '').toContain('同步中');
    });

    fireEvent.change(screen.getByTestId('notes-editor-input'), {
      target: { value: '# 新笔记\n更新后' },
    });

    await waitFor(
      () => {
        expect(upsertDraft).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('notes-save-status').textContent ?? '').toContain('同步失败');
      },
      { timeout: 3000 }
    );

    delete window.xinliu;
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
