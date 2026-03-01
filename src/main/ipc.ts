import path from 'node:path';

import { EMPTY_PAYLOAD, IPC_CHANNELS } from '../shared/ipc';
import type {
  CloseBehavior,
  CloseBehaviorSetPayload,
  CloseBehaviorStatus,
  CollectionsListChildrenPayload,
  CollectionsListResult,
  CollectionsListRootsPayload,
  CollectionsMovePayload,
  CollectionsMoveResult,
  ContextMenuPopupFolderPayload,
  ContextMenuPopupMiddleItemPayload,
  DiagnosticsSetFlowBaseUrlPayload,
  DiagnosticsSetMemosBaseUrlPayload,
  DiagnosticsStatus,
  EmptyPayload,
  FileAccessReadTextFilePayload,
  FileAccessReadTextFileResult,
  FileAccessShowOpenDialogPayload,
  FileAccessShowOpenDialogResult,
  FileAccessShowSaveDialogPayload,
  FileAccessShowSaveDialogResult,
  FileAccessWriteTextFilePayload,
  FileDialogFilter,
  FlowConflictListResult,
  FlowConflictResolvePayload,
  FlowConflictResolveResult,
  IpcChannel,
  IpcErrorCode,
  IpcResult,
  IpcVoid,
  NotesConflictListResult,
  NotesCreateDraftPayload,
  NotesCreateDraftResult,
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
  SearchQueryPayload,
  SearchQueryResult,
  SearchRebuildIndexResult,
  ShortcutId,
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
} from '../shared/ipc';

import type { PathGate } from './pathGate/pathGate';

export interface IpcMainInvokeEventLike {
  sender: unknown;
}

export type IpcMainHandler = (
  event: IpcMainInvokeEventLike,
  payload: unknown
) => unknown | Promise<unknown>;

export interface IpcMainLike {
  handle: (channel: string, handler: IpcMainHandler) => void;
}

export interface BrowserWindowLike {
  minimize: () => void;
  isMaximized: () => boolean;
  maximize: () => void;
  unmaximize: () => void;
  close: () => void;
}

export interface RegisterIpcHandlersDeps {
  getWindowForSender: (sender: unknown) => BrowserWindowLike | null;
  quickCapture: {
    open: () => void | Promise<void>;
    hide: () => void | Promise<void>;
    submit: (content: string) => void | Promise<void>;
    cancel: () => void | Promise<void>;
  };
  shortcuts: {
    getStatus: () => ShortcutsStatus;
    setConfig: (payload: ShortcutsSetConfigPayload) => void;
    resetAll: () => void;
    resetOne: (id: ShortcutId) => void;
  };
  storageRoot: {
    getStatus: () => StorageRootStatus | Promise<StorageRootStatus>;
    chooseAndMigrate: () =>
      | StorageRootChooseAndMigrateResult
      | Promise<StorageRootChooseAndMigrateResult>;
    restartNow: () => void | Promise<void>;
  };
  closeBehavior: {
    getStatus: () => CloseBehaviorStatus | Promise<CloseBehaviorStatus>;
    setBehavior: (payload: CloseBehaviorSetPayload) => void | Promise<void>;
    resetCloseToTrayHint: () => void | Promise<void>;
  };
  diagnostics: {
    getStatus: () => DiagnosticsStatus | Promise<DiagnosticsStatus>;
    setFlowBaseUrl: (payload: DiagnosticsSetFlowBaseUrlPayload) => void | Promise<void>;
    setMemosBaseUrl: (payload: DiagnosticsSetMemosBaseUrlPayload) => void | Promise<void>;
  };
  collections: {
    listRoots: (
      payload: CollectionsListRootsPayload
    ) => CollectionsListResult | Promise<CollectionsListResult>;
    listChildren: (
      payload: CollectionsListChildrenPayload
    ) => CollectionsListResult | Promise<CollectionsListResult>;
    move: (
      payload: CollectionsMovePayload
    ) => CollectionsMoveResult | Promise<CollectionsMoveResult>;
  };
  todo?: {
    listItems: (
      payload: TodoListItemsPayload
    ) => TodoListItemsResult | Promise<TodoListItemsResult>;
    toggleComplete: (
      payload: TodoIdPayload
    ) => TodoToggleCompleteResult | Promise<TodoToggleCompleteResult>;
    softDelete: (payload: TodoIdPayload) => IpcVoid | Promise<IpcVoid>;
    restore: (payload: TodoIdPayload) => IpcVoid | Promise<IpcVoid>;
    hardDelete: (payload: TodoIdPayload) => IpcVoid | Promise<IpcVoid>;
    bulkComplete: (payload: TodoBulkIdsPayload) => IpcVoid | Promise<IpcVoid>;
    bulkDelete: (payload: TodoBulkIdsPayload) => IpcVoid | Promise<IpcVoid>;
  };
  pathGate: PathGate;
  fileAccess: {
    showOpenDialog: (options: {
      win: unknown;
      title: string | null;
      filters: FileDialogFilter[] | null;
    }) => Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog: (options: {
      win: unknown;
      title: string | null;
      defaultPath: string | null;
      filters: FileDialogFilter[] | null;
    }) => Promise<{ canceled: boolean; filePath: string | undefined }>;
    readTextFile: (fileAbsPath: string) => Promise<string>;
    writeTextFile: (fileAbsPath: string, content: string) => Promise<void>;
  };
  notes?: {
    createDraft: (
      payload: NotesCreateDraftPayload
    ) => NotesCreateDraftResult | Promise<NotesCreateDraftResult>;
    upsertDraft: (payload: NotesUpsertDraftPayload) => void | Promise<void>;
    getDraft: (payload: NotesGetDraftPayload) => NotesGetDraftResult | Promise<NotesGetDraftResult>;
    listItems: (
      payload: NotesListItemsPayload
    ) => NotesListItemsResult | Promise<NotesListItemsResult>;
    delete: (payload: NotesIdPayload) => NotesDeleteResult | Promise<NotesDeleteResult>;
    restore: (payload: NotesIdPayload) => NotesRestoreResult | Promise<NotesRestoreResult>;
    hardDelete: (payload: NotesIdPayload) => NotesHardDeleteResult | Promise<NotesHardDeleteResult>;
  };
  conflicts: {
    listFlow: () => FlowConflictListResult | Promise<FlowConflictListResult>;
    listNotes: () => NotesConflictListResult | Promise<NotesConflictListResult>;
    resolveFlowApplyServer: (
      payload: FlowConflictResolvePayload
    ) => FlowConflictResolveResult | Promise<FlowConflictResolveResult>;
    resolveFlowKeepLocalCopy: (
      payload: FlowConflictResolvePayload
    ) => FlowConflictResolveResult | Promise<FlowConflictResolveResult>;
    resolveFlowForceOverwrite: (
      payload: FlowConflictResolvePayload
    ) => FlowConflictResolveResult | Promise<FlowConflictResolveResult>;
  };
  contextMenu: {
    popupMiddleItem: (options: { win: BrowserWindowLike; itemId: string }) => void | Promise<void>;
    popupFolder: (options: { win: BrowserWindowLike; folderId: string }) => void | Promise<void>;
  };
  search: {
    query: (payload: SearchQueryPayload) => SearchQueryResult | Promise<SearchQueryResult>;
    rebuildIndex: () => SearchRebuildIndexResult | Promise<SearchRebuildIndexResult>;
  };
  updater: {
    getStatus: () => UpdaterStatus | Promise<UpdaterStatus>;
    checkForUpdates: () => void | Promise<void>;
    installNow: () => void | Promise<void>;
    deferInstall: () => void | Promise<void>;
  };
  now?: () => number;
}

function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value };
}

function err(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateEmptyPayload(payload: unknown): IpcResult<EmptyPayload> {
  if (payload === undefined) {
    return ok(EMPTY_PAYLOAD);
  }
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (Object.keys(payload).length !== 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok(EMPTY_PAYLOAD);
}

function normalizeDialogAbsFilePath(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }
  if (path.win32.isAbsolute(trimmed)) {
    return path.win32.normalize(trimmed);
  }
  return null;
}

function basenameForAbsPath(absPath: string): string {
  if (path.win32.isAbsolute(absPath)) {
    return path.win32.basename(absPath);
  }
  return path.basename(absPath);
}

function normalizeOptionalStringField(value: unknown): IpcResult<string | null> {
  if (value === undefined || value === null) {
    return ok(null);
  }
  if (typeof value !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = value.trim();
  return ok(trimmed.length > 0 ? trimmed : null);
}

function validateFileDialogFilters(value: unknown): IpcResult<FileDialogFilter[] | null> {
  if (value === undefined || value === null) {
    return ok(null);
  }
  if (!Array.isArray(value)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const normalized: FileDialogFilter[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) {
      return err('VALIDATION_ERROR', '参数不合法');
    }
    const name = item['name'];
    const extensions = item['extensions'];
    if (typeof name !== 'string' || !Array.isArray(extensions)) {
      return err('VALIDATION_ERROR', '参数不合法');
    }
    const nameTrimmed = name.trim();
    if (nameTrimmed.length === 0) {
      return err('VALIDATION_ERROR', '参数不合法');
    }

    const exts: string[] = [];
    for (const ext of extensions) {
      if (typeof ext !== 'string') {
        return err('VALIDATION_ERROR', '参数不合法');
      }
      const extTrimmed = ext.trim();
      if (extTrimmed.length === 0) {
        return err('VALIDATION_ERROR', '参数不合法');
      }
      exts.push(extTrimmed);
    }

    normalized.push({ name: nameTrimmed, extensions: exts });
  }
  return ok(normalized);
}

function validateFileAccessShowOpenDialogPayload(
  payload: unknown
): IpcResult<FileAccessShowOpenDialogPayload> {
  if (payload === undefined) {
    return ok({ title: null, filters: null });
  }
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const titleRes = normalizeOptionalStringField(payload['title']);
  if (!titleRes.ok) {
    return titleRes;
  }

  const filtersRes = validateFileDialogFilters(payload['filters']);
  if (!filtersRes.ok) {
    return filtersRes;
  }

  return ok({ title: titleRes.value, filters: filtersRes.value });
}

function validateFileAccessShowSaveDialogPayload(
  payload: unknown
): IpcResult<FileAccessShowSaveDialogPayload> {
  if (payload === undefined) {
    return ok({ title: null, defaultPath: null, filters: null });
  }
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const titleRes = normalizeOptionalStringField(payload['title']);
  if (!titleRes.ok) {
    return titleRes;
  }

  const defaultPathRes = normalizeOptionalStringField(payload['defaultPath']);
  if (!defaultPathRes.ok) {
    return defaultPathRes;
  }

  const filtersRes = validateFileDialogFilters(payload['filters']);
  if (!filtersRes.ok) {
    return filtersRes;
  }

  return ok({
    title: titleRes.value,
    defaultPath: defaultPathRes.value,
    filters: filtersRes.value,
  });
}

function validateFileAccessReadTextFilePayload(
  payload: unknown
): IpcResult<FileAccessReadTextFilePayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const grantId = payload['grantId'];
  const filePath = payload['filePath'];
  if (typeof grantId !== 'string' || typeof filePath !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const grantIdTrimmed = grantId.trim();
  const filePathTrimmed = filePath.trim();
  if (grantIdTrimmed.length === 0 || filePathTrimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ grantId: grantIdTrimmed, filePath: filePathTrimmed });
}

function validateFileAccessWriteTextFilePayload(
  payload: unknown
): IpcResult<FileAccessWriteTextFilePayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const grantId = payload['grantId'];
  const filePath = payload['filePath'];
  const content = payload['content'];
  if (typeof grantId !== 'string' || typeof filePath !== 'string' || typeof content !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const grantIdTrimmed = grantId.trim();
  const filePathTrimmed = filePath.trim();
  if (grantIdTrimmed.length === 0 || filePathTrimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ grantId: grantIdTrimmed, filePath: filePathTrimmed, content });
}

function validateShortcutId(value: unknown): value is ShortcutId {
  return value === 'openQuickCapture' || value === 'openMainAndFocusSearch';
}

function validateCloseBehavior(value: unknown): value is CloseBehavior {
  return value === 'hide' || value === 'quit';
}

function validateCloseBehaviorSetPayload(payload: unknown): IpcResult<CloseBehaviorSetPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const behavior = payload['behavior'];
  if (!validateCloseBehavior(behavior)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ behavior });
}

function validateDiagnosticsSetBaseUrlPayload(
  payload: unknown
): IpcResult<DiagnosticsSetFlowBaseUrlPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const baseUrl = payload['baseUrl'];
  if (typeof baseUrl !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({ baseUrl });
}

function validateShortcutsSetConfigPayload(payload: unknown): IpcResult<ShortcutsSetConfigPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const id = payload['id'];
  const accelerator = payload['accelerator'];
  const enabled = payload['enabled'];

  if (!validateShortcutId(id)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof accelerator !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof enabled !== 'boolean') {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const trimmed = accelerator.trim();
  if (enabled && trimmed.length === 0) {
    return err('VALIDATION_ERROR', '快捷键不能为空');
  }

  return ok({ id, accelerator: trimmed, enabled });
}

function validateShortcutsResetOnePayload(payload: unknown): IpcResult<ShortcutsResetOnePayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const id = payload['id'];
  if (!validateShortcutId(id)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ id });
}

function validateQuickCaptureSubmitPayload(payload: unknown): IpcResult<QuickCaptureSubmitPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const content = payload['content'];
  if (typeof content !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ content });
}

function validateContextMenuPopupMiddleItemPayload(
  payload: unknown
): IpcResult<ContextMenuPopupMiddleItemPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const itemId = payload['itemId'];
  if (typeof itemId !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = itemId.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ itemId: trimmed });
}

function validateContextMenuPopupFolderPayload(
  payload: unknown
): IpcResult<ContextMenuPopupFolderPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const folderId = payload['folderId'];
  if (typeof folderId !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = folderId.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ folderId: trimmed });
}

function validateCollectionsPagination(
  payload: Record<string, unknown>
): IpcResult<{ limit: number; offset: number }> {
  const limit = payload['limit'];
  const offset = payload['offset'];
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0 || limit > 500) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ limit, offset });
}

function validateCollectionsListRootsPayload(
  payload: unknown
): IpcResult<CollectionsListRootsPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const page = validateCollectionsPagination(payload);
  if (!page.ok) {
    return page;
  }
  return ok(page.value);
}

function validateCollectionsListChildrenPayload(
  payload: unknown
): IpcResult<CollectionsListChildrenPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const parentId = payload['parentId'];
  if (typeof parentId !== 'string' || parentId.trim().length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const page = validateCollectionsPagination(payload);
  if (!page.ok) {
    return page;
  }

  return ok({ parentId: parentId.trim(), limit: page.value.limit, offset: page.value.offset });
}

function validateCollectionsMovePayload(payload: unknown): IpcResult<CollectionsMovePayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const itemId = payload['itemId'];
  const newParentId = payload['newParentId'];

  if (typeof itemId !== 'string' || itemId.trim().length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  if (
    newParentId !== null &&
    (typeof newParentId !== 'string' || newParentId.trim().length === 0)
  ) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({
    itemId: itemId.trim(),
    newParentId: newParentId === null ? null : newParentId.trim(),
  });
}

function validateSearchQueryPayload(payload: unknown): IpcResult<SearchQueryPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const query = payload['query'];
  const page = payload['page'];
  const pageSize = payload['pageSize'];

  if (typeof query !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const trimmed = query.trim();
  const pageInt = Math.max(0, Math.floor(page));
  const pageSizeInt = Math.max(1, Math.min(50, Math.floor(pageSize)));

  return ok({ query: trimmed, page: pageInt, pageSize: pageSizeInt });
}

function validateNotesListItemsPayload(payload: unknown): IpcResult<NotesListItemsPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const scope = payload['scope'];
  const page = payload['page'];
  const pageSize = payload['pageSize'];

  if (scope !== 'timeline' && scope !== 'inbox' && scope !== 'trash') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof page !== 'number' || !Number.isFinite(page) || !Number.isInteger(page) || page < 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (
    typeof pageSize !== 'number' ||
    !Number.isFinite(pageSize) ||
    !Number.isInteger(pageSize) ||
    pageSize < 0 ||
    pageSize > 200
  ) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({ scope, page, pageSize });
}

function validateNotesIdPayload(payload: unknown): IpcResult<NotesIdPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const id = payload['id'];
  const provider = payload['provider'];

  if (typeof id !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (provider !== 'memos' && provider !== 'flow_notes') {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({ id: trimmed, provider });
}

function validateNotesCreateDraftPayload(payload: unknown): IpcResult<NotesCreateDraftPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const content = payload['content'];
  if (typeof content !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (content.trim().length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ content });
}

function validateNotesUpsertDraftPayload(payload: unknown): IpcResult<NotesUpsertDraftPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const localUuid = payload['localUuid'];
  const content = payload['content'];

  if (typeof localUuid !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const localUuidTrimmed = localUuid.trim();
  if (localUuidTrimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  if (typeof content !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (content.trim().length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({ localUuid: localUuidTrimmed, content });
}

function validateNotesGetDraftPayload(payload: unknown): IpcResult<NotesGetDraftPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const localUuid = payload['localUuid'];
  if (typeof localUuid !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const localUuidTrimmed = localUuid.trim();
  if (localUuidTrimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({ localUuid: localUuidTrimmed });
}

function validateTodoListItemsPayload(payload: unknown): IpcResult<TodoListItemsPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  const scope = payload['scope'];
  const limit = payload['limit'];
  const offset = payload['offset'];

  if (scope !== 'active' && scope !== 'completed' && scope !== 'trash') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0 || limit > 500) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }

  return ok({ scope, limit, offset });
}

function validateTodoIdPayload(payload: unknown): IpcResult<TodoIdPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const id = payload['id'];
  if (typeof id !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ id: trimmed });
}

function validateTodoBulkIdsPayload(payload: unknown): IpcResult<TodoBulkIdsPayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const ids = payload['ids'];
  if (!Array.isArray(ids)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const normalized: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string') {
      return err('VALIDATION_ERROR', '参数不合法');
    }
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      return err('VALIDATION_ERROR', '参数不合法');
    }
    normalized.push(trimmed);
  }
  if (normalized.length === 0 || normalized.length > 200) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ ids: normalized });
}

function validateFlowConflictResolvePayload(
  payload: unknown
): IpcResult<FlowConflictResolvePayload> {
  if (!isPlainObject(payload)) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const outboxId = payload['outboxId'];
  if (typeof outboxId !== 'string') {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  const trimmed = outboxId.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION_ERROR', '参数不合法');
  }
  return ok({ outboxId: trimmed });
}

function createRateLimiter(options: { windowMs: number; max: number; now: () => number }) {
  const buckets = new Map<string, { resetAt: number; count: number }>();

  const allow = (key: string) => {
    const now = options.now();
    const current = buckets.get(key);
    if (!current || now >= current.resetAt) {
      buckets.set(key, { resetAt: now + options.windowMs, count: 1 });
      return true;
    }

    if (current.count >= options.max) {
      return false;
    }

    current.count += 1;
    return true;
  };

  return { allow };
}

function toIpcResult<T>(input: unknown, fallbackMessage: string): IpcResult<T> {
  if (
    typeof input === 'object' &&
    input !== null &&
    'ok' in input &&
    (input as { ok: unknown }).ok === true
  ) {
    return input as IpcResult<T>;
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    'ok' in input &&
    (input as { ok: unknown }).ok === false
  ) {
    return input as IpcResult<T>;
  }
  return err('INTERNAL_ERROR', fallbackMessage) as IpcResult<T>;
}

function makeWindowHandler<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  run: (win: BrowserWindowLike) => T | Promise<T>;
}): IpcMainHandler {
  return async (event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = validateEmptyPayload(payload);
    if (!validated.ok) {
      return validated;
    }

    let win: BrowserWindowLike | null = null;
    try {
      win = options.deps.getWindowForSender(event.sender);
    } catch {
      win = null;
    }
    if (!win) {
      return err('NO_WINDOW', '未找到窗口');
    }

    try {
      const value = await options.run(win);
      return ok(value);
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

function makeHandler<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (validatedPayload: unknown) => T | Promise<T>;
}): IpcMainHandler {
  return async (_event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    try {
      const value = await options.run(validated.value);
      return ok(value);
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

function makeHandlerWithErrorMessage<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (validatedPayload: unknown) => T | Promise<T>;
}): IpcMainHandler {
  return async (_event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    try {
      const value = await options.run(validated.value);
      return ok(value);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string' &&
        (error as { message: string }).message.trim().length > 0
          ? (error as { message: string }).message
          : '操作失败';
      return err('INTERNAL_ERROR', message);
    }
  };
}

function makeWindowHandlerWithPayload<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (win: BrowserWindowLike, validatedPayload: unknown) => T | Promise<T>;
}): IpcMainHandler {
  return async (event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    let win: BrowserWindowLike | null = null;
    try {
      win = options.deps.getWindowForSender(event.sender);
    } catch {
      win = null;
    }
    if (!win) {
      return err('NO_WINDOW', '未找到窗口');
    }

    try {
      const value = await options.run(win, validated.value);
      return ok(value);
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

function makeHandlerIpcResult<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (validatedPayload: unknown) => IpcResult<T> | Promise<IpcResult<T>>;
}): IpcMainHandler {
  return async (_event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    try {
      const result = await options.run(validated.value);
      return toIpcResult<T>(result, '操作失败');
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

function makeWindowHandlerWithPayloadIpcResult<T>(options: {
  channel: IpcChannel;
  deps: RegisterIpcHandlersDeps;
  rateLimiter: { allow: (key: string) => boolean };
  validate: (payload: unknown) => IpcResult<unknown>;
  run: (win: BrowserWindowLike, validatedPayload: unknown) => IpcResult<T> | Promise<IpcResult<T>>;
}): IpcMainHandler {
  return async (event, payload) => {
    if (!options.rateLimiter.allow(options.channel)) {
      return err('RATE_LIMITED', '操作过于频繁');
    }

    const validated = options.validate(payload);
    if (!validated.ok) {
      return validated;
    }

    let win: BrowserWindowLike | null = null;
    try {
      win = options.deps.getWindowForSender(event.sender);
    } catch {
      win = null;
    }
    if (!win) {
      return err('NO_WINDOW', '未找到窗口');
    }

    try {
      const result = await options.run(win, validated.value);
      return toIpcResult<T>(result, '操作失败');
    } catch {
      return err('INTERNAL_ERROR', '操作失败');
    }
  };
}

export function registerIpcHandlers(ipcMain: IpcMainLike, deps: RegisterIpcHandlersDeps): void {
  const rateLimiter = createRateLimiter({
    windowMs: 1000,
    max: 60,
    now: deps.now ?? Date.now,
  });

  ipcMain.handle(
    IPC_CHANNELS.window.minimize,
    makeWindowHandler<IpcVoid>({
      channel: IPC_CHANNELS.window.minimize,
      deps,
      rateLimiter,
      run: (win) => {
        win.minimize();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.window.toggleMaximize,
    makeWindowHandler<IpcVoid>({
      channel: IPC_CHANNELS.window.toggleMaximize,
      deps,
      rateLimiter,
      run: (win) => {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.window.close,
    makeWindowHandler<IpcVoid>({
      channel: IPC_CHANNELS.window.close,
      deps,
      rateLimiter,
      run: (win) => {
        win.close();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.window.isMaximized,
    makeWindowHandler<boolean>({
      channel: IPC_CHANNELS.window.isMaximized,
      deps,
      rateLimiter,
      run: (win) => win.isMaximized(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.open,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.open,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.quickCapture.open();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.hide,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.hide,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.quickCapture.hide();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.submit,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.submit,
      deps,
      rateLimiter,
      validate: validateQuickCaptureSubmitPayload,
      run: async (validatedPayload) => {
        const v = validatedPayload as QuickCaptureSubmitPayload;
        await deps.quickCapture.submit(v.content);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.quickCapture.cancel,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.quickCapture.cancel,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.quickCapture.cancel();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.getStatus,
    makeHandler<ShortcutsStatus>({
      channel: IPC_CHANNELS.shortcuts.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: () => deps.shortcuts.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.setConfig,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.shortcuts.setConfig,
      deps,
      rateLimiter,
      validate: validateShortcutsSetConfigPayload,
      run: (validatedPayload) => {
        deps.shortcuts.setConfig(validatedPayload as ShortcutsSetConfigPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.resetAll,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.shortcuts.resetAll,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: () => {
        deps.shortcuts.resetAll();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.shortcuts.resetOne,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.shortcuts.resetOne,
      deps,
      rateLimiter,
      validate: validateShortcutsResetOnePayload,
      run: (validatedPayload) => {
        const v = validatedPayload as ShortcutsResetOnePayload;
        deps.shortcuts.resetOne(v.id);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.storageRoot.getStatus,
    makeHandlerWithErrorMessage<StorageRootStatus>({
      channel: IPC_CHANNELS.storageRoot.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.storageRoot.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.storageRoot.chooseAndMigrate,
    makeHandlerWithErrorMessage<StorageRootChooseAndMigrateResult>({
      channel: IPC_CHANNELS.storageRoot.chooseAndMigrate,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.storageRoot.chooseAndMigrate(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.storageRoot.restartNow,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.storageRoot.restartNow,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.storageRoot.restartNow();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.closeBehavior.getStatus,
    makeHandler<CloseBehaviorStatus>({
      channel: IPC_CHANNELS.closeBehavior.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.closeBehavior.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.closeBehavior.setBehavior,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.closeBehavior.setBehavior,
      deps,
      rateLimiter,
      validate: validateCloseBehaviorSetPayload,
      run: async (validatedPayload) => {
        await deps.closeBehavior.setBehavior(validatedPayload as CloseBehaviorSetPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.closeBehavior.resetCloseToTrayHint,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.closeBehavior.resetCloseToTrayHint,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.closeBehavior.resetCloseToTrayHint();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.diagnostics.getStatus,
    makeHandlerWithErrorMessage<DiagnosticsStatus>({
      channel: IPC_CHANNELS.diagnostics.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.diagnostics.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.diagnostics.setFlowBaseUrl,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.diagnostics.setFlowBaseUrl,
      deps,
      rateLimiter,
      validate: validateDiagnosticsSetBaseUrlPayload,
      run: async (validatedPayload) => {
        await deps.diagnostics.setFlowBaseUrl(validatedPayload as DiagnosticsSetFlowBaseUrlPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.diagnostics.setMemosBaseUrl,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.diagnostics.setMemosBaseUrl,
      deps,
      rateLimiter,
      validate: validateDiagnosticsSetBaseUrlPayload,
      run: async (validatedPayload) => {
        await deps.diagnostics.setMemosBaseUrl(
          validatedPayload as DiagnosticsSetMemosBaseUrlPayload
        );
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.collections.listRoots,
    makeHandlerWithErrorMessage<CollectionsListResult>({
      channel: IPC_CHANNELS.collections.listRoots,
      deps,
      rateLimiter,
      validate: validateCollectionsListRootsPayload,
      run: async (validatedPayload) => {
        return deps.collections.listRoots(validatedPayload as CollectionsListRootsPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.collections.listChildren,
    makeHandlerWithErrorMessage<CollectionsListResult>({
      channel: IPC_CHANNELS.collections.listChildren,
      deps,
      rateLimiter,
      validate: validateCollectionsListChildrenPayload,
      run: async (validatedPayload) => {
        return deps.collections.listChildren(validatedPayload as CollectionsListChildrenPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.collections.move,
    makeHandlerWithErrorMessage<CollectionsMoveResult>({
      channel: IPC_CHANNELS.collections.move,
      deps,
      rateLimiter,
      validate: validateCollectionsMovePayload,
      run: async (validatedPayload) => {
        return deps.collections.move(validatedPayload as CollectionsMovePayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.listItems,
    makeHandlerWithErrorMessage<TodoListItemsResult>({
      channel: IPC_CHANNELS.todo.listItems,
      deps,
      rateLimiter,
      validate: validateTodoListItemsPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        return deps.todo.listItems(validatedPayload as TodoListItemsPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.toggleComplete,
    makeHandlerWithErrorMessage<TodoToggleCompleteResult>({
      channel: IPC_CHANNELS.todo.toggleComplete,
      deps,
      rateLimiter,
      validate: validateTodoIdPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        return deps.todo.toggleComplete(validatedPayload as TodoIdPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.softDelete,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.todo.softDelete,
      deps,
      rateLimiter,
      validate: validateTodoIdPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        await deps.todo.softDelete(validatedPayload as TodoIdPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.restore,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.todo.restore,
      deps,
      rateLimiter,
      validate: validateTodoIdPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        await deps.todo.restore(validatedPayload as TodoIdPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.hardDelete,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.todo.hardDelete,
      deps,
      rateLimiter,
      validate: validateTodoIdPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        await deps.todo.hardDelete(validatedPayload as TodoIdPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.bulkComplete,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.todo.bulkComplete,
      deps,
      rateLimiter,
      validate: validateTodoBulkIdsPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        await deps.todo.bulkComplete(validatedPayload as TodoBulkIdsPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.todo.bulkDelete,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.todo.bulkDelete,
      deps,
      rateLimiter,
      validate: validateTodoBulkIdsPayload,
      run: async (validatedPayload) => {
        if (!deps.todo) {
          throw new Error('Todo 未实现');
        }
        await deps.todo.bulkDelete(validatedPayload as TodoBulkIdsPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.createDraft,
    makeHandlerWithErrorMessage<NotesCreateDraftResult>({
      channel: IPC_CHANNELS.notes.createDraft,
      deps,
      rateLimiter,
      validate: validateNotesCreateDraftPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        return deps.notes.createDraft(validatedPayload as NotesCreateDraftPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.upsertDraft,
    makeHandlerWithErrorMessage<IpcVoid>({
      channel: IPC_CHANNELS.notes.upsertDraft,
      deps,
      rateLimiter,
      validate: validateNotesUpsertDraftPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        await deps.notes.upsertDraft(validatedPayload as NotesUpsertDraftPayload);
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.getDraft,
    makeHandlerWithErrorMessage<NotesGetDraftResult>({
      channel: IPC_CHANNELS.notes.getDraft,
      deps,
      rateLimiter,
      validate: validateNotesGetDraftPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        return deps.notes.getDraft(validatedPayload as NotesGetDraftPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.listItems,
    makeHandlerWithErrorMessage<NotesListItemsResult>({
      channel: IPC_CHANNELS.notes.listItems,
      deps,
      rateLimiter,
      validate: validateNotesListItemsPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        return deps.notes.listItems(validatedPayload as NotesListItemsPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.delete,
    makeHandlerWithErrorMessage<NotesDeleteResult>({
      channel: IPC_CHANNELS.notes.delete,
      deps,
      rateLimiter,
      validate: validateNotesIdPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        return deps.notes.delete(validatedPayload as NotesIdPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.restore,
    makeHandlerWithErrorMessage<NotesRestoreResult>({
      channel: IPC_CHANNELS.notes.restore,
      deps,
      rateLimiter,
      validate: validateNotesIdPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        return deps.notes.restore(validatedPayload as NotesIdPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.notes.hardDelete,
    makeHandlerWithErrorMessage<NotesHardDeleteResult>({
      channel: IPC_CHANNELS.notes.hardDelete,
      deps,
      rateLimiter,
      validate: validateNotesIdPayload,
      run: async (validatedPayload) => {
        if (!deps.notes) {
          throw new Error('Notes 未实现');
        }
        return deps.notes.hardDelete(validatedPayload as NotesIdPayload);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.conflicts.listFlow,
    makeHandlerWithErrorMessage<FlowConflictListResult>({
      channel: IPC_CHANNELS.conflicts.listFlow,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.conflicts.listFlow(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.conflicts.listNotes,
    makeHandlerWithErrorMessage<NotesConflictListResult>({
      channel: IPC_CHANNELS.conflicts.listNotes,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.conflicts.listNotes(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.conflicts.resolveFlowApplyServer,
    makeHandlerWithErrorMessage<FlowConflictResolveResult>({
      channel: IPC_CHANNELS.conflicts.resolveFlowApplyServer,
      deps,
      rateLimiter,
      validate: validateFlowConflictResolvePayload,
      run: async (validatedPayload) =>
        deps.conflicts.resolveFlowApplyServer(validatedPayload as FlowConflictResolvePayload),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.conflicts.resolveFlowKeepLocalCopy,
    makeHandlerWithErrorMessage<FlowConflictResolveResult>({
      channel: IPC_CHANNELS.conflicts.resolveFlowKeepLocalCopy,
      deps,
      rateLimiter,
      validate: validateFlowConflictResolvePayload,
      run: async (validatedPayload) =>
        deps.conflicts.resolveFlowKeepLocalCopy(validatedPayload as FlowConflictResolvePayload),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.conflicts.resolveFlowForceOverwrite,
    makeHandlerWithErrorMessage<FlowConflictResolveResult>({
      channel: IPC_CHANNELS.conflicts.resolveFlowForceOverwrite,
      deps,
      rateLimiter,
      validate: validateFlowConflictResolvePayload,
      run: async (validatedPayload) =>
        deps.conflicts.resolveFlowForceOverwrite(validatedPayload as FlowConflictResolvePayload),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.contextMenu.popupMiddleItem,
    makeWindowHandlerWithPayload<IpcVoid>({
      channel: IPC_CHANNELS.contextMenu.popupMiddleItem,
      deps,
      rateLimiter,
      validate: validateContextMenuPopupMiddleItemPayload,
      run: async (win, validatedPayload) => {
        const v = validatedPayload as ContextMenuPopupMiddleItemPayload;
        await deps.contextMenu.popupMiddleItem({ win, itemId: v.itemId });
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.contextMenu.popupFolder,
    makeWindowHandlerWithPayload<IpcVoid>({
      channel: IPC_CHANNELS.contextMenu.popupFolder,
      deps,
      rateLimiter,
      validate: validateContextMenuPopupFolderPayload,
      run: async (win, validatedPayload) => {
        const v = validatedPayload as ContextMenuPopupFolderPayload;
        await deps.contextMenu.popupFolder({ win, folderId: v.folderId });
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.search.query,
    makeHandlerWithErrorMessage<SearchQueryResult>({
      channel: IPC_CHANNELS.search.query,
      deps,
      rateLimiter,
      validate: validateSearchQueryPayload,
      run: async (validatedPayload) => {
        const v = validatedPayload as SearchQueryPayload;
        return deps.search.query(v);
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.search.rebuildIndex,
    makeHandlerWithErrorMessage<SearchRebuildIndexResult>({
      channel: IPC_CHANNELS.search.rebuildIndex,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.search.rebuildIndex(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.updater.getStatus,
    makeHandler<UpdaterStatus>({
      channel: IPC_CHANNELS.updater.getStatus,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => deps.updater.getStatus(),
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.updater.checkForUpdates,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.updater.checkForUpdates,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.updater.checkForUpdates();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.updater.installNow,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.updater.installNow,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.updater.installNow();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.updater.deferInstall,
    makeHandler<IpcVoid>({
      channel: IPC_CHANNELS.updater.deferInstall,
      deps,
      rateLimiter,
      validate: validateEmptyPayload,
      run: async () => {
        await deps.updater.deferInstall();
        return null;
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.fileAccess.showOpenDialog,
    makeWindowHandlerWithPayloadIpcResult<FileAccessShowOpenDialogResult>({
      channel: IPC_CHANNELS.fileAccess.showOpenDialog,
      deps,
      rateLimiter,
      validate: validateFileAccessShowOpenDialogPayload,
      run: async (win, validatedPayload) => {
        const v = validatedPayload as FileAccessShowOpenDialogPayload;
        const picked = await deps.fileAccess.showOpenDialog({
          win,
          title: v.title ?? null,
          filters: v.filters ?? null,
        });

        if (picked.canceled || picked.filePaths.length === 0) {
          return ok({ kind: 'cancelled' });
        }

        const rawPicked = typeof picked.filePaths[0] === 'string' ? picked.filePaths[0] : '';
        const fileAbsPath = normalizeDialogAbsFilePath(rawPicked);
        if (!fileAbsPath) {
          return err('INTERNAL_ERROR', '创建授权失败');
        }

        const grant = deps.pathGate.createGrant('read', fileAbsPath);
        if (!grant) {
          return err('INTERNAL_ERROR', '创建授权失败');
        }

        return ok({
          kind: 'granted',
          grantId: grant.grantId,
          filePath: fileAbsPath,
          fileName: basenameForAbsPath(fileAbsPath),
        });
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.fileAccess.showSaveDialog,
    makeWindowHandlerWithPayloadIpcResult<FileAccessShowSaveDialogResult>({
      channel: IPC_CHANNELS.fileAccess.showSaveDialog,
      deps,
      rateLimiter,
      validate: validateFileAccessShowSaveDialogPayload,
      run: async (win, validatedPayload) => {
        const v = validatedPayload as FileAccessShowSaveDialogPayload;
        const picked = await deps.fileAccess.showSaveDialog({
          win,
          title: v.title ?? null,
          defaultPath: v.defaultPath ?? null,
          filters: v.filters ?? null,
        });

        const rawPath = typeof picked.filePath === 'string' ? picked.filePath : '';
        if (picked.canceled || rawPath.trim().length === 0) {
          return ok({ kind: 'cancelled' });
        }

        const fileAbsPath = normalizeDialogAbsFilePath(rawPath);
        if (!fileAbsPath) {
          return err('INTERNAL_ERROR', '创建授权失败');
        }

        const grant = deps.pathGate.createGrant('write', fileAbsPath);
        if (!grant) {
          return err('INTERNAL_ERROR', '创建授权失败');
        }

        return ok({
          kind: 'granted',
          grantId: grant.grantId,
          filePath: fileAbsPath,
          fileName: basenameForAbsPath(fileAbsPath),
        });
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.fileAccess.readTextFile,
    makeHandlerIpcResult<FileAccessReadTextFileResult>({
      channel: IPC_CHANNELS.fileAccess.readTextFile,
      deps,
      rateLimiter,
      validate: validateFileAccessReadTextFilePayload,
      run: async (validatedPayload) => {
        const v = validatedPayload as FileAccessReadTextFilePayload;
        const outcome = deps.pathGate.consumeGrant({
          grantId: v.grantId,
          kind: 'read',
          fileAbsPath: v.filePath,
        });
        if (!outcome.ok) {
          return err('PERMISSION_DENIED', '未授权或已失效');
        }

        const content = await deps.fileAccess.readTextFile(outcome.grantedFileAbsPath);
        return ok({ content });
      },
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.fileAccess.writeTextFile,
    makeHandlerIpcResult<IpcVoid>({
      channel: IPC_CHANNELS.fileAccess.writeTextFile,
      deps,
      rateLimiter,
      validate: validateFileAccessWriteTextFilePayload,
      run: async (validatedPayload) => {
        const v = validatedPayload as FileAccessWriteTextFilePayload;
        const outcome = deps.pathGate.consumeGrant({
          grantId: v.grantId,
          kind: 'write',
          fileAbsPath: v.filePath,
        });
        if (!outcome.ok) {
          return err('PERMISSION_DENIED', '未授权或已失效');
        }

        await deps.fileAccess.writeTextFile(outcome.grantedFileAbsPath, v.content);
        return ok(null);
      },
    })
  );
}

export const __test__ = {
  toIpcResult,
  validateEmptyPayload,
  validateQuickCaptureSubmitPayload,
  validateShortcutsSetConfigPayload,
  validateShortcutsResetOnePayload,
  validateContextMenuPopupMiddleItemPayload,
  validateContextMenuPopupFolderPayload,
  validateCollectionsListRootsPayload,
  validateCollectionsListChildrenPayload,
  validateCollectionsMovePayload,
  validateSearchQueryPayload,
  validateNotesListItemsPayload,
  validateNotesIdPayload,
  validateNotesCreateDraftPayload,
  validateNotesUpsertDraftPayload,
  validateNotesGetDraftPayload,
  validateTodoListItemsPayload,
  validateTodoIdPayload,
  validateTodoBulkIdsPayload,
  validateFlowConflictResolvePayload,
};
