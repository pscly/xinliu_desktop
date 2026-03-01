import { contextBridge, ipcRenderer } from 'electron';

import { EMPTY_PAYLOAD, IPC_CHANNELS, IPC_EVENTS } from '../shared/ipc';
import type {
  CloseBehaviorSetPayload,
  CloseBehaviorStatus,
  CollectionsListChildrenPayload,
  CollectionsListResult,
  CollectionsListRootsPayload,
  CollectionsMovePayload,
  CollectionsMoveResult,
  ContextMenuDidSelectPayload,
  ContextMenuPopupFolderPayload,
  ContextMenuPopupMiddleItemPayload,
  DiagnosticsSetFlowBaseUrlPayload,
  DiagnosticsSetMemosBaseUrlPayload,
  DiagnosticsStatus,
  FlowConflictListResult,
  FlowConflictResolvePayload,
  FlowConflictResolveResult,
  FileAccessReadTextFilePayload,
  FileAccessReadTextFileResult,
  FileAccessShowOpenDialogPayload,
  FileAccessShowOpenDialogResult,
  FileAccessShowSaveDialogPayload,
  FileAccessShowSaveDialogResult,
  FileAccessWriteTextFilePayload,
  IpcErrorCode,
  IpcResult,
  IpcVoid,
  NotesCreateDraftPayload,
  NotesCreateDraftResult,
  NotesConflictListResult,
  NotesDeleteResult,
  NotesGetDraftPayload,
  NotesGetDraftResult,
  NotesHardDeleteResult,
  NotesIdPayload,
  NotesListItemsPayload,
  NotesListItemsResult,
  NotesRestoreResult,
  NotesUpsertDraftPayload,
  QuickCaptureSubmitPayload,
  ShortcutId,
  SearchQueryPayload,
  SearchQueryResult,
  SearchRebuildIndexResult,
  ShortcutsResetOnePayload,
  ShortcutsSetConfigPayload,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  StorageRootStatus,
  TodoBulkIdsPayload,
  TodoIdPayload,
  TodoListItemsPayload,
  TodoListItemsResult,
  TodoToggleCompleteResult,
  UpdaterStatus,
  UpdaterStatusChangedPayload,
} from '../shared/ipc';

function ipcError<T>(code: IpcErrorCode, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } };
}

async function invokeIpc<T>(channel: string, payload: unknown): Promise<IpcResult<T>> {
  try {
    const result = (await ipcRenderer.invoke(channel, payload)) as unknown;
    if (typeof result === 'object' && result !== null && 'ok' in result) {
      return result as IpcResult<T>;
    }
    return ipcError('INTERNAL_ERROR', 'IPC 返回格式不正确');
  } catch {
    return ipcError('INTERNAL_ERROR', 'IPC 调用失败');
  }
}

contextBridge.exposeInMainWorld('xinliu', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  window: {
    minimize: () => invokeIpc<IpcVoid>(IPC_CHANNELS.window.minimize, EMPTY_PAYLOAD),
    toggleMaximize: () => invokeIpc<IpcVoid>(IPC_CHANNELS.window.toggleMaximize, EMPTY_PAYLOAD),
    close: () => invokeIpc<IpcVoid>(IPC_CHANNELS.window.close, EMPTY_PAYLOAD),
    isMaximized: () => invokeIpc<boolean>(IPC_CHANNELS.window.isMaximized, EMPTY_PAYLOAD),
  },
  quickCapture: {
    open: () => invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.open, EMPTY_PAYLOAD),
    hide: () => invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.hide, EMPTY_PAYLOAD),
    submit: (content: string) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.submit, {
        content,
      } satisfies QuickCaptureSubmitPayload),
    cancel: () => invokeIpc<IpcVoid>(IPC_CHANNELS.quickCapture.cancel, EMPTY_PAYLOAD),
  },
  shortcuts: {
    getStatus: () => invokeIpc<ShortcutsStatus>(IPC_CHANNELS.shortcuts.getStatus, EMPTY_PAYLOAD),
    setConfig: (payload: ShortcutsSetConfigPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.shortcuts.setConfig, payload),
    resetAll: () => invokeIpc<IpcVoid>(IPC_CHANNELS.shortcuts.resetAll, EMPTY_PAYLOAD),
    resetOne: (id: ShortcutId) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.shortcuts.resetOne, {
        id,
      } satisfies ShortcutsResetOnePayload),
    onFocusSearch: (listener: () => void) => {
      const wrapped = () => {
        try {
          listener();
        } catch (error) {
          console.warn(`[shortcuts] focusSearch listener 异常：${String(error)}`);
        }
      };
      ipcRenderer.on(IPC_EVENTS.shortcuts.focusSearch, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.shortcuts.focusSearch, wrapped);
      };
    },
  },
  storageRoot: {
    getStatus: () =>
      invokeIpc<StorageRootStatus>(IPC_CHANNELS.storageRoot.getStatus, EMPTY_PAYLOAD),
    chooseAndMigrate: () =>
      invokeIpc<StorageRootChooseAndMigrateResult>(
        IPC_CHANNELS.storageRoot.chooseAndMigrate,
        EMPTY_PAYLOAD
      ),
    restartNow: () => invokeIpc<IpcVoid>(IPC_CHANNELS.storageRoot.restartNow, EMPTY_PAYLOAD),
  },
  closeBehavior: {
    getStatus: () =>
      invokeIpc<CloseBehaviorStatus>(IPC_CHANNELS.closeBehavior.getStatus, EMPTY_PAYLOAD),
    setBehavior: (payload: CloseBehaviorSetPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.closeBehavior.setBehavior, payload),
    resetCloseToTrayHint: () =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.closeBehavior.resetCloseToTrayHint, EMPTY_PAYLOAD),
  },
  diagnostics: {
    getStatus: () =>
      invokeIpc<DiagnosticsStatus>(IPC_CHANNELS.diagnostics.getStatus, EMPTY_PAYLOAD),
    setFlowBaseUrl: (payload: DiagnosticsSetFlowBaseUrlPayload) =>
      invokeIpc<IpcVoid>(
        IPC_CHANNELS.diagnostics.setFlowBaseUrl,
        payload satisfies DiagnosticsSetFlowBaseUrlPayload
      ),
    setMemosBaseUrl: (payload: DiagnosticsSetMemosBaseUrlPayload) =>
      invokeIpc<IpcVoid>(
        IPC_CHANNELS.diagnostics.setMemosBaseUrl,
        payload satisfies DiagnosticsSetMemosBaseUrlPayload
      ),
  },
  contextMenu: {
    popupMiddleItem: (itemId: string) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.contextMenu.popupMiddleItem, {
        itemId,
      } satisfies ContextMenuPopupMiddleItemPayload),
    popupFolder: (folderId: string) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.contextMenu.popupFolder, {
        folderId,
      } satisfies ContextMenuPopupFolderPayload),
    onCommand: (listener: (payload: ContextMenuDidSelectPayload) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => {
        try {
          listener(payload as ContextMenuDidSelectPayload);
        } catch (error) {
          console.warn(`[contextMenu] didSelect listener 异常：${String(error)}`);
        }
      };
      ipcRenderer.on(IPC_EVENTS.contextMenu.didSelect, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.contextMenu.didSelect, wrapped);
      };
    },
  },
  collections: {
    listRoots: (payload: CollectionsListRootsPayload) =>
      invokeIpc<CollectionsListResult>(
        IPC_CHANNELS.collections.listRoots,
        payload satisfies CollectionsListRootsPayload
      ),
    listChildren: (payload: CollectionsListChildrenPayload) =>
      invokeIpc<CollectionsListResult>(
        IPC_CHANNELS.collections.listChildren,
        payload satisfies CollectionsListChildrenPayload
      ),
    move: (payload: CollectionsMovePayload) =>
      invokeIpc<CollectionsMoveResult>(
        IPC_CHANNELS.collections.move,
        payload satisfies CollectionsMovePayload
      ),
  },
  todo: {
    listItems: (payload: TodoListItemsPayload) =>
      invokeIpc<TodoListItemsResult>(
        IPC_CHANNELS.todo.listItems,
        payload satisfies TodoListItemsPayload
      ),
    toggleComplete: (payload: TodoIdPayload) =>
      invokeIpc<TodoToggleCompleteResult>(
        IPC_CHANNELS.todo.toggleComplete,
        payload satisfies TodoIdPayload
      ),
    softDelete: (payload: TodoIdPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.todo.softDelete, payload satisfies TodoIdPayload),
    restore: (payload: TodoIdPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.todo.restore, payload satisfies TodoIdPayload),
    hardDelete: (payload: TodoIdPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.todo.hardDelete, payload satisfies TodoIdPayload),
    bulkComplete: (payload: TodoBulkIdsPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.todo.bulkComplete, payload satisfies TodoBulkIdsPayload),
    bulkDelete: (payload: TodoBulkIdsPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.todo.bulkDelete, payload satisfies TodoBulkIdsPayload),
  },
  notes: {
    createDraft: (payload: NotesCreateDraftPayload) =>
      invokeIpc<NotesCreateDraftResult>(
        IPC_CHANNELS.notes.createDraft,
        payload satisfies NotesCreateDraftPayload
      ),
    upsertDraft: (payload: NotesUpsertDraftPayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.notes.upsertDraft, payload satisfies NotesUpsertDraftPayload),
    getDraft: (payload: NotesGetDraftPayload) =>
      invokeIpc<NotesGetDraftResult>(
        IPC_CHANNELS.notes.getDraft,
        payload satisfies NotesGetDraftPayload
      ),
    listItems: (payload: NotesListItemsPayload) =>
      invokeIpc<NotesListItemsResult>(
        IPC_CHANNELS.notes.listItems,
        payload satisfies NotesListItemsPayload
      ),
    delete: (payload: NotesIdPayload) =>
      invokeIpc<NotesDeleteResult>(IPC_CHANNELS.notes.delete, payload satisfies NotesIdPayload),
    restore: (payload: NotesIdPayload) =>
      invokeIpc<NotesRestoreResult>(IPC_CHANNELS.notes.restore, payload satisfies NotesIdPayload),
    hardDelete: (payload: NotesIdPayload) =>
      invokeIpc<NotesHardDeleteResult>(
        IPC_CHANNELS.notes.hardDelete,
        payload satisfies NotesIdPayload
      ),
  },
  conflicts: {
    listFlow: () =>
      invokeIpc<FlowConflictListResult>(IPC_CHANNELS.conflicts.listFlow, EMPTY_PAYLOAD),
    listNotes: () =>
      invokeIpc<NotesConflictListResult>(IPC_CHANNELS.conflicts.listNotes, EMPTY_PAYLOAD),
    resolveFlowApplyServer: (payload: FlowConflictResolvePayload) =>
      invokeIpc<FlowConflictResolveResult>(
        IPC_CHANNELS.conflicts.resolveFlowApplyServer,
        payload satisfies FlowConflictResolvePayload
      ),
    resolveFlowKeepLocalCopy: (payload: FlowConflictResolvePayload) =>
      invokeIpc<FlowConflictResolveResult>(
        IPC_CHANNELS.conflicts.resolveFlowKeepLocalCopy,
        payload satisfies FlowConflictResolvePayload
      ),
    resolveFlowForceOverwrite: (payload: FlowConflictResolvePayload) =>
      invokeIpc<FlowConflictResolveResult>(
        IPC_CHANNELS.conflicts.resolveFlowForceOverwrite,
        payload satisfies FlowConflictResolvePayload
      ),
  },
  search: {
    query: (payload: SearchQueryPayload) =>
      invokeIpc<SearchQueryResult>(IPC_CHANNELS.search.query, payload),
    rebuildIndex: () =>
      invokeIpc<SearchRebuildIndexResult>(IPC_CHANNELS.search.rebuildIndex, EMPTY_PAYLOAD),
  },
  fileAccess: {
    showOpenDialog: (payload?: FileAccessShowOpenDialogPayload) =>
      invokeIpc<FileAccessShowOpenDialogResult>(IPC_CHANNELS.fileAccess.showOpenDialog, payload),
    showSaveDialog: (payload?: FileAccessShowSaveDialogPayload) =>
      invokeIpc<FileAccessShowSaveDialogResult>(IPC_CHANNELS.fileAccess.showSaveDialog, payload),
    readTextFile: (payload: FileAccessReadTextFilePayload) =>
      invokeIpc<FileAccessReadTextFileResult>(IPC_CHANNELS.fileAccess.readTextFile, payload),
    writeTextFile: (payload: FileAccessWriteTextFilePayload) =>
      invokeIpc<IpcVoid>(IPC_CHANNELS.fileAccess.writeTextFile, payload),
  },
  updater: {
    getStatus: () => invokeIpc<UpdaterStatus>(IPC_CHANNELS.updater.getStatus, EMPTY_PAYLOAD),
    checkForUpdates: () => invokeIpc<IpcVoid>(IPC_CHANNELS.updater.checkForUpdates, EMPTY_PAYLOAD),
    installNow: () => invokeIpc<IpcVoid>(IPC_CHANNELS.updater.installNow, EMPTY_PAYLOAD),
    deferInstall: () => invokeIpc<IpcVoid>(IPC_CHANNELS.updater.deferInstall, EMPTY_PAYLOAD),
    onStatusChanged: (listener: (status: UpdaterStatus) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => {
        try {
          const p = payload as UpdaterStatusChangedPayload;
          listener(p.status);
        } catch (error) {
          console.warn(`[updater] statusChanged listener 异常：${String(error)}`);
        }
      };
      ipcRenderer.on(IPC_EVENTS.updater.statusChanged, wrapped);
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.updater.statusChanged, wrapped);
      };
    },
  },
});
