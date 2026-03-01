/// <reference types="vite/client" />

import type {
  CloseBehaviorSetPayload,
  CloseBehaviorStatus,
  ContextMenuDidSelectPayload,
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
  SearchQueryPayload,
  SearchQueryResult,
  SearchRebuildIndexResult,
  ShortcutId,
  ShortcutsSetConfigPayload,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  StorageRootStatus,
  UpdaterStatus,
} from '../shared/ipc';

declare global {
  interface Window {
    xinliu?: {
      versions: {
        electron: string;
        chrome: string;
        node: string;
      };
      window: {
        minimize: () => Promise<IpcResult<IpcVoid>>;
        toggleMaximize: () => Promise<IpcResult<IpcVoid>>;
        close: () => Promise<IpcResult<IpcVoid>>;
        isMaximized: () => Promise<IpcResult<boolean>>;
      };
      quickCapture: {
        open: () => Promise<IpcResult<IpcVoid>>;
        hide: () => Promise<IpcResult<IpcVoid>>;
        submit: (content: string) => Promise<IpcResult<IpcVoid>>;
        cancel: () => Promise<IpcResult<IpcVoid>>;
      };
      shortcuts: {
        getStatus: () => Promise<IpcResult<ShortcutsStatus>>;
        setConfig: (payload: ShortcutsSetConfigPayload) => Promise<IpcResult<IpcVoid>>;
        resetAll: () => Promise<IpcResult<IpcVoid>>;
        resetOne: (id: ShortcutId) => Promise<IpcResult<IpcVoid>>;
        onFocusSearch: (listener: () => void) => () => void;
      };
      storageRoot: {
        getStatus: () => Promise<IpcResult<StorageRootStatus>>;
        chooseAndMigrate: () => Promise<IpcResult<StorageRootChooseAndMigrateResult>>;
        restartNow: () => Promise<IpcResult<IpcVoid>>;
      };
      closeBehavior: {
        getStatus: () => Promise<IpcResult<CloseBehaviorStatus>>;
        setBehavior: (payload: CloseBehaviorSetPayload) => Promise<IpcResult<IpcVoid>>;
        resetCloseToTrayHint: () => Promise<IpcResult<IpcVoid>>;
      };
      diagnostics: {
        getStatus: () => Promise<IpcResult<DiagnosticsStatus>>;
      };
      notes?: {
        createDraft: (
          payload: NotesCreateDraftPayload
        ) => Promise<IpcResult<NotesCreateDraftResult>>;
        upsertDraft: (payload: NotesUpsertDraftPayload) => Promise<IpcResult<IpcVoid>>;
        getDraft: (payload: NotesGetDraftPayload) => Promise<IpcResult<NotesGetDraftResult>>;
        listItems: (payload: NotesListItemsPayload) => Promise<IpcResult<NotesListItemsResult>>;
        delete: (payload: NotesIdPayload) => Promise<IpcResult<NotesDeleteResult>>;
        restore: (payload: NotesIdPayload) => Promise<IpcResult<NotesRestoreResult>>;
        hardDelete: (payload: NotesIdPayload) => Promise<IpcResult<NotesHardDeleteResult>>;
      };
      conflicts?: {
        listFlow: () => Promise<IpcResult<FlowConflictListResult>>;
        listNotes: () => Promise<IpcResult<NotesConflictListResult>>;
        resolveFlowApplyServer: (
          payload: FlowConflictResolvePayload
        ) => Promise<IpcResult<FlowConflictResolveResult>>;
        resolveFlowKeepLocalCopy: (
          payload: FlowConflictResolvePayload
        ) => Promise<IpcResult<FlowConflictResolveResult>>;
        resolveFlowForceOverwrite: (
          payload: FlowConflictResolvePayload
        ) => Promise<IpcResult<FlowConflictResolveResult>>;
      };
      search: {
        query: (payload: SearchQueryPayload) => Promise<IpcResult<SearchQueryResult>>;
        rebuildIndex: () => Promise<IpcResult<SearchRebuildIndexResult>>;
      };
      fileAccess: {
        showOpenDialog: (
          payload?: FileAccessShowOpenDialogPayload
        ) => Promise<IpcResult<FileAccessShowOpenDialogResult>>;
        showSaveDialog: (
          payload?: FileAccessShowSaveDialogPayload
        ) => Promise<IpcResult<FileAccessShowSaveDialogResult>>;
        readTextFile: (
          payload: FileAccessReadTextFilePayload
        ) => Promise<IpcResult<FileAccessReadTextFileResult>>;
        writeTextFile: (payload: FileAccessWriteTextFilePayload) => Promise<IpcResult<IpcVoid>>;
      };
      contextMenu: {
        popupMiddleItem: (itemId: string) => Promise<IpcResult<IpcVoid>>;
        popupFolder: (folderId: string) => Promise<IpcResult<IpcVoid>>;
        onCommand: (listener: (payload: ContextMenuDidSelectPayload) => void) => () => void;
      };
      updater: {
        getStatus: () => Promise<IpcResult<UpdaterStatus>>;
        checkForUpdates: () => Promise<IpcResult<IpcVoid>>;
        installNow: () => Promise<IpcResult<IpcVoid>>;
        deferInstall: () => Promise<IpcResult<IpcVoid>>;
        onStatusChanged: (listener: (status: UpdaterStatus) => void) => () => void;
      };
    };
  }
}

export {};
