export const IPC_NAMESPACE = 'xinliu' as const;

export const IPC_CHANNELS = {
  window: {
    minimize: `${IPC_NAMESPACE}:window:minimize`,
    toggleMaximize: `${IPC_NAMESPACE}:window:toggleMaximize`,
    close: `${IPC_NAMESPACE}:window:close`,
    isMaximized: `${IPC_NAMESPACE}:window:isMaximized`,
  },
  quickCapture: {
    open: `${IPC_NAMESPACE}:quickCapture:open`,
    hide: `${IPC_NAMESPACE}:quickCapture:hide`,
    submit: `${IPC_NAMESPACE}:quickCapture:submit`,
    cancel: `${IPC_NAMESPACE}:quickCapture:cancel`,
  },
  shortcuts: {
    getStatus: `${IPC_NAMESPACE}:shortcuts:getStatus`,
    setConfig: `${IPC_NAMESPACE}:shortcuts:setConfig`,
    resetAll: `${IPC_NAMESPACE}:shortcuts:resetAll`,
    resetOne: `${IPC_NAMESPACE}:shortcuts:resetOne`,
  },
  storageRoot: {
    getStatus: `${IPC_NAMESPACE}:storageRoot:getStatus`,
    chooseAndMigrate: `${IPC_NAMESPACE}:storageRoot:chooseAndMigrate`,
    restartNow: `${IPC_NAMESPACE}:storageRoot:restartNow`,
  },
  closeBehavior: {
    getStatus: `${IPC_NAMESPACE}:closeBehavior:getStatus`,
    setBehavior: `${IPC_NAMESPACE}:closeBehavior:setBehavior`,
    resetCloseToTrayHint: `${IPC_NAMESPACE}:closeBehavior:resetCloseToTrayHint`,
  },
  diagnostics: {
    getStatus: `${IPC_NAMESPACE}:diagnostics:getStatus`,
    setFlowBaseUrl: `${IPC_NAMESPACE}:diagnostics:setFlowBaseUrl`,
    setMemosBaseUrl: `${IPC_NAMESPACE}:diagnostics:setMemosBaseUrl`,
  },
  contextMenu: {
    popupMiddleItem: `${IPC_NAMESPACE}:contextMenu:popupMiddleItem`,
    popupFolder: `${IPC_NAMESPACE}:contextMenu:popupFolder`,
  },
  notes: {
    createDraft: `${IPC_NAMESPACE}:notes:createDraft`,
    upsertDraft: `${IPC_NAMESPACE}:notes:upsertDraft`,
    getDraft: `${IPC_NAMESPACE}:notes:getDraft`,
    listItems: `${IPC_NAMESPACE}:notes:listItems`,
    delete: `${IPC_NAMESPACE}:notes:delete`,
    restore: `${IPC_NAMESPACE}:notes:restore`,
    hardDelete: `${IPC_NAMESPACE}:notes:hardDelete`,
  },
  conflicts: {
    listFlow: `${IPC_NAMESPACE}:conflicts:listFlow`,
    listNotes: `${IPC_NAMESPACE}:conflicts:listNotes`,
    resolveFlowApplyServer: `${IPC_NAMESPACE}:conflicts:resolveFlowApplyServer`,
    resolveFlowKeepLocalCopy: `${IPC_NAMESPACE}:conflicts:resolveFlowKeepLocalCopy`,
    resolveFlowForceOverwrite: `${IPC_NAMESPACE}:conflicts:resolveFlowForceOverwrite`,
  },
  search: {
    query: `${IPC_NAMESPACE}:search:query`,
    rebuildIndex: `${IPC_NAMESPACE}:search:rebuildIndex`,
  },
  fileAccess: {
    showOpenDialog: `${IPC_NAMESPACE}:fileAccess:showOpenDialog`,
    showSaveDialog: `${IPC_NAMESPACE}:fileAccess:showSaveDialog`,
    readTextFile: `${IPC_NAMESPACE}:fileAccess:readTextFile`,
    writeTextFile: `${IPC_NAMESPACE}:fileAccess:writeTextFile`,
  },
  updater: {
    getStatus: `${IPC_NAMESPACE}:updater:getStatus`,
    checkForUpdates: `${IPC_NAMESPACE}:updater:checkForUpdates`,
    installNow: `${IPC_NAMESPACE}:updater:installNow`,
    deferInstall: `${IPC_NAMESPACE}:updater:deferInstall`,
  },
} as const;

export const IPC_EVENTS = {
  shortcuts: {
    focusSearch: `${IPC_NAMESPACE}:shortcuts:focusSearch`,
  },
  contextMenu: {
    didSelect: `${IPC_NAMESPACE}:contextMenu:didSelect`,
  },
  updater: {
    statusChanged: `${IPC_NAMESPACE}:updater:statusChanged`,
  },
} as const;

export type IpcChannelWindow = (typeof IPC_CHANNELS.window)[keyof typeof IPC_CHANNELS.window];

export type IpcChannelQuickCapture =
  (typeof IPC_CHANNELS.quickCapture)[keyof typeof IPC_CHANNELS.quickCapture];

export type IpcChannelShortcuts =
  (typeof IPC_CHANNELS.shortcuts)[keyof typeof IPC_CHANNELS.shortcuts];

export type IpcChannelStorageRoot =
  (typeof IPC_CHANNELS.storageRoot)[keyof typeof IPC_CHANNELS.storageRoot];

export type IpcChannelCloseBehavior =
  (typeof IPC_CHANNELS.closeBehavior)[keyof typeof IPC_CHANNELS.closeBehavior];

export type IpcChannelDiagnostics =
  (typeof IPC_CHANNELS.diagnostics)[keyof typeof IPC_CHANNELS.diagnostics];

export type IpcChannelContextMenu =
  (typeof IPC_CHANNELS.contextMenu)[keyof typeof IPC_CHANNELS.contextMenu];

export type IpcChannelNotes = (typeof IPC_CHANNELS.notes)[keyof typeof IPC_CHANNELS.notes];

export type IpcChannelConflicts =
  (typeof IPC_CHANNELS.conflicts)[keyof typeof IPC_CHANNELS.conflicts];

export type IpcChannelSearch = (typeof IPC_CHANNELS.search)[keyof typeof IPC_CHANNELS.search];

export type IpcChannelFileAccess =
  (typeof IPC_CHANNELS.fileAccess)[keyof typeof IPC_CHANNELS.fileAccess];

export type IpcChannelUpdater = (typeof IPC_CHANNELS.updater)[keyof typeof IPC_CHANNELS.updater];

export type IpcChannel =
  | IpcChannelWindow
  | IpcChannelQuickCapture
  | IpcChannelShortcuts
  | IpcChannelStorageRoot
  | IpcChannelCloseBehavior
  | IpcChannelDiagnostics
  | IpcChannelContextMenu
  | IpcChannelNotes
  | IpcChannelConflicts
  | IpcChannelSearch
  | IpcChannelFileAccess
  | IpcChannelUpdater;

export type UpdaterState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'update_available'
  | 'no_update'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdaterProgress {
  percent01: number | null;
  transferred: number | null;
  total: number | null;
  bytesPerSecond: number | null;
}

export interface UpdaterStatus {
  state: UpdaterState;
  currentVersion: string;
  availableVersion: string | null;
  progress: UpdaterProgress | null;
  lastCheckedAtMs: number | null;
  errorMessage: string | null;
  releasesUrl: string;
  deferred: boolean;
}

export interface UpdaterStatusChangedPayload {
  status: UpdaterStatus;
}

export type IpcErrorCode =
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'NO_WINDOW'
  | 'PERMISSION_DENIED'
  | 'INTERNAL_ERROR';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: IpcError;
    };

export type EmptyPayload = Record<string, never>;

export const EMPTY_PAYLOAD: EmptyPayload = {};

export type IpcVoid = null;

export const CONTEXT_MENU_COMMANDS = {
  open: 'open',
  moveTo: 'moveTo',
  delete: 'delete',
  export: 'export',
  newChild: 'newChild',
  rename: 'rename',
  move: 'move',
} as const;

export type ContextMenuCommand = (typeof CONTEXT_MENU_COMMANDS)[keyof typeof CONTEXT_MENU_COMMANDS];

export interface ContextMenuPopupMiddleItemPayload {
  itemId: string;
}

export interface ContextMenuPopupFolderPayload {
  folderId: string;
}

export type ContextMenuTarget =
  | {
      kind: 'middleItem';
      itemId: string;
    }
  | {
      kind: 'folder';
      folderId: string;
    };

export interface ContextMenuDidSelectPayload {
  target: ContextMenuTarget;
  command: ContextMenuCommand;
}

export type ShortcutId = 'openQuickCapture' | 'openMainAndFocusSearch';

export type ShortcutRegistrationState = 'registered' | 'unregistered' | 'failed';

export interface ShortcutStatusEntry {
  id: ShortcutId;
  title: string;
  description: string;
  accelerator: string;
  enabled: boolean;
  registrationState: ShortcutRegistrationState;
  registrationMessage: string | null;
}

export interface ShortcutsStatus {
  entries: ShortcutStatusEntry[];
}

export interface ShortcutsSetConfigPayload {
  id: ShortcutId;
  accelerator: string;
  enabled: boolean;
}

export interface ShortcutsResetOnePayload {
  id: ShortcutId;
}

export interface QuickCaptureSubmitPayload {
  content: string;
}

export interface StorageRootStatus {
  storageRootAbsPath: string;
  isDefault: boolean;
}

export type CloseBehavior = 'hide' | 'quit';

export interface CloseBehaviorStatus {
  behavior: CloseBehavior;
  closeToTrayHintShown: boolean;
}

export interface CloseBehaviorSetPayload {
  behavior: CloseBehavior;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface FileAccessShowOpenDialogPayload {
  title?: string | null;
  filters?: FileDialogFilter[] | null;
}

export type FileAccessShowOpenDialogResult =
  | { kind: 'cancelled' }
  | {
      kind: 'granted';
      grantId: string;
      filePath: string;
      fileName: string;
    };

export interface FileAccessShowSaveDialogPayload {
  title?: string | null;
  defaultPath?: string | null;
  filters?: FileDialogFilter[] | null;
}

export type FileAccessShowSaveDialogResult =
  | { kind: 'cancelled' }
  | {
      kind: 'granted';
      grantId: string;
      filePath: string;
      fileName: string;
    };

export interface FileAccessReadTextFilePayload {
  grantId: string;
  filePath: string;
}

export interface FileAccessReadTextFileResult {
  content: string;
}

export interface FileAccessWriteTextFilePayload {
  grantId: string;
  filePath: string;
  content: string;
}

export type GlobalSearchEntityKind =
  | 'memo'
  | 'note'
  | 'todo_item'
  | 'todo_list'
  | 'collection_item';

export interface SearchQueryPayload {
  query: string;
  page: number;
  pageSize: number;
}

export interface SearchResultItem {
  kind: GlobalSearchEntityKind;
  id: string;
  title: string;
  preview: string;
  updatedAtMs: number;
  matchSnippet: string | null;
}

export type SearchQueryMode = 'fts' | 'fallback';

export interface SearchQueryResult {
  mode: SearchQueryMode;
  ftsAvailable: boolean;
  degradedReason: string | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: SearchResultItem[];
}

export interface SearchRebuildIndexResult {
  ok: true;
  ftsAvailable: boolean;
  rebuilt: boolean;
  message: string;
}

export type StorageRootChooseAndMigrateResult =
  | {
      kind: 'cancelled';
    }
  | {
      kind: 'migrated';
      oldStorageRootAbsPath: string;
      newStorageRootAbsPath: string;
      moved: {
        db: boolean;
        attachmentsCache: boolean;
        logs: boolean;
      };
      restartRequired: true;
    };

export type NotesScope = 'timeline' | 'inbox' | 'trash';

export type NotesProvider = 'memos' | 'flow_notes';

export type NotesSyncStatus =
  | 'LOCAL_ONLY'
  | 'DIRTY'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED'
  | 'UNKNOWN'
  | null;

export interface NotesListItemsPayload {
  scope: NotesScope;
  page: number;
  pageSize: number;
}

export interface NotesIdPayload {
  id: string;
  provider: NotesProvider;
}

export interface NotesCreateDraftPayload {
  content: string;
}

export interface NotesCreateDraftResult {
  localUuid: string;
}

export interface NotesUpsertDraftPayload {
  localUuid: string;
  content: string;
}

export interface NotesGetDraftPayload {
  localUuid: string;
}

export interface NotesDraft {
  localUuid: string;
  content: string;
  syncStatus: NotesSyncStatus;
  updatedAtMs: number;
  createdAtMs: number;
}

export interface NotesGetDraftResult {
  draft: NotesDraft | null;
}

export interface NotesListItem {
  id: string;
  provider: NotesProvider;
  title: string;
  preview: string;
  updatedAtMs: number;
  syncStatus: NotesSyncStatus;
}

export interface NotesListItemsResult {
  items: NotesListItem[];
  hasMore: boolean;
}

export type FlowConflictResource =
  | 'note'
  | 'user_setting'
  | 'todo_list'
  | 'todo_item'
  | 'todo_occurrence'
  | 'collection_item';

export type FlowConflictOp = 'upsert' | 'delete';

export interface FlowConflictItem {
  outboxId: string;
  resource: FlowConflictResource;
  op: FlowConflictOp;
  entityId: string;
  clientUpdatedAtMs: number;
  updatedAtMs: number;
  requestId: string | null;
  localData: Record<string, unknown>;
  serverSnapshot: Record<string, unknown> | null;
}

export interface FlowConflictListResult {
  items: FlowConflictItem[];
}

export interface NotesConflictItem {
  localUuid: string;
  originalLocalUuid: string;
  conflictRequestId: string | null;
  updatedAtMs: number;
  copyContent: string;
  originalContent: string | null;
}

export interface NotesConflictListResult {
  items: NotesConflictItem[];
}

export interface FlowConflictResolvePayload {
  outboxId: string;
}

export type FlowConflictResolveStrategy = 'apply_server' | 'keep_local_copy' | 'force_overwrite';

export interface FlowConflictResolveResult {
  outboxId: string;
  resolved: boolean;
  strategy: FlowConflictResolveStrategy;
  bumpedClientUpdatedAtMs: number | null;
  copiedEntityId: string | null;
}

export type NotesDeleteResult = IpcVoid;

export type NotesRestoreResult = IpcVoid;

export type NotesHardDeleteResult = IpcVoid;

export type DiagnosticsNotesProvider = 'memos' | 'flow_notes' | null;

export type DiagnosticsNotesProviderKind = 'direct' | 'fallback' | null;

export type DiagnosticsNotesDegradeReason =
  | 'memos_base_url_invalid'
  | 'memos_unauthorized'
  | 'memos_network_or_timeout';

export interface DiagnosticsStatus {
  flowBaseUrl: string | null;
  memosBaseUrl: string | null;
  notesProvider: DiagnosticsNotesProvider;
  notesProviderKind: DiagnosticsNotesProviderKind;
  lastDegradeReason: DiagnosticsNotesDegradeReason | null;
  lastRequestIds: {
    memos_request_id: string | null;
    flow_request_id: string | null;
  };
}

export interface DiagnosticsSetFlowBaseUrlPayload {
  baseUrl: string;
}

export interface DiagnosticsSetMemosBaseUrlPayload {
  baseUrl: string;
}
