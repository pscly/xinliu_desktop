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
  },
  contextMenu: {
    popupMiddleItem: `${IPC_NAMESPACE}:contextMenu:popupMiddleItem`,
    popupFolder: `${IPC_NAMESPACE}:contextMenu:popupFolder`,
  },
  notes: {
    listItems: `${IPC_NAMESPACE}:notes:listItems`,
    delete: `${IPC_NAMESPACE}:notes:delete`,
    restore: `${IPC_NAMESPACE}:notes:restore`,
    hardDelete: `${IPC_NAMESPACE}:notes:hardDelete`,
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
} as const;

export const IPC_EVENTS = {
  shortcuts: {
    focusSearch: `${IPC_NAMESPACE}:shortcuts:focusSearch`,
  },
  contextMenu: {
    didSelect: `${IPC_NAMESPACE}:contextMenu:didSelect`,
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

export type IpcChannelSearch = (typeof IPC_CHANNELS.search)[keyof typeof IPC_CHANNELS.search];

export type IpcChannelFileAccess =
  (typeof IPC_CHANNELS.fileAccess)[keyof typeof IPC_CHANNELS.fileAccess];

export type IpcChannel =
  | IpcChannelWindow
  | IpcChannelQuickCapture
  | IpcChannelShortcuts
  | IpcChannelStorageRoot
  | IpcChannelCloseBehavior
  | IpcChannelDiagnostics
  | IpcChannelContextMenu
  | IpcChannelNotes
  | IpcChannelSearch
  | IpcChannelFileAccess;

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
