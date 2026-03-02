import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import {
  DndContext,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import type {
  CloseBehaviorStatus,
  CollectionsTreeItem,
  ContextMenuDidSelectPayload,
  DiagnosticsStatus,
  FlowConflictItem,
  NotesListItem,
  NotesScope,
  NotesSyncStatus,
  NotesConflictItem,
  SearchQueryResult,
  SearchResultItem,
  ShortcutId,
  ShortcutStatusEntry,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  StorageRootStatus,
  SyncStatus,
  TodoListItem,
  TodoScope,
  UpdaterStatus,
} from '../shared/ipc';

import { QuickCaptureWindow } from './QuickCaptureWindow';

type RouteKey = 'notes' | 'collections' | 'todo' | 'settings' | 'conflicts';

type RouteMeta = {
  key: RouteKey;
  label: string;
  hint: string;
};

const ROUTES: RouteMeta[] = [
  { key: 'notes', label: 'Notes', hint: '你的笔记与正文视图' },
  { key: 'collections', label: 'Collections', hint: '收藏夹与聚合视图' },
  { key: 'todo', label: 'Todo', hint: '任务与日程（RRULE/occurrences）' },
  { key: 'settings', label: '设置', hint: '账户、同步、外观与快捷键' },
  { key: 'conflicts', label: '冲突', hint: '同步冲突的对比与裁决' },
];

type XinliuWindowApi = NonNullable<Window['xinliu']>['window'];
type XinliuShortcutsApi = NonNullable<Window['xinliu']>['shortcuts'];
type XinliuStorageRootApi = NonNullable<Window['xinliu']>['storageRoot'];
type XinliuCloseBehaviorApi = NonNullable<Window['xinliu']>['closeBehavior'];
type XinliuDiagnosticsApi = NonNullable<Window['xinliu']>['diagnostics'];
type XinliuContextMenuApi = NonNullable<Window['xinliu']>['contextMenu'];
type XinliuCollectionsApi = NonNullable<Window['xinliu']>['collections'];
type XinliuSearchApi = NonNullable<Window['xinliu']>['search'];
type XinliuFileAccessApi = NonNullable<Window['xinliu']>['fileAccess'];
type XinliuUpdaterApi = NonNullable<Window['xinliu']>['updater'];
type XinliuSyncApi = NonNullable<Window['xinliu']>['sync'];
type XinliuNotesApi = NonNullable<Window['xinliu']>['notes'];
type XinliuConflictsApi = NonNullable<Window['xinliu']>['conflicts'];
type XinliuTodoApi = NonNullable<Window['xinliu']>['todo'];

function getXinliuWindowApi(): XinliuWindowApi | undefined {
  return window.xinliu?.window;
}

function getXinliuShortcutsApi(): XinliuShortcutsApi | undefined {
  return window.xinliu?.shortcuts;
}

function getXinliuStorageRootApi(): XinliuStorageRootApi | undefined {
  return window.xinliu?.storageRoot;
}

function getXinliuCloseBehaviorApi(): XinliuCloseBehaviorApi | undefined {
  return window.xinliu?.closeBehavior;
}

function getXinliuDiagnosticsApi(): XinliuDiagnosticsApi | undefined {
  return window.xinliu?.diagnostics;
}

function getXinliuContextMenuApi(): XinliuContextMenuApi | undefined {
  return window.xinliu?.contextMenu;
}

function getXinliuCollectionsApi(): XinliuCollectionsApi | undefined {
  return window.xinliu?.collections;
}

function getXinliuSearchApi(): XinliuSearchApi | undefined {
  return window.xinliu?.search;
}

function getXinliuFileAccessApi(): XinliuFileAccessApi | undefined {
  return window.xinliu?.fileAccess;
}

function getXinliuUpdaterApi(): XinliuUpdaterApi | undefined {
  return window.xinliu?.updater;
}

function getXinliuSyncApi(): XinliuSyncApi | undefined {
  return window.xinliu?.sync;
}

function getXinliuNotesApi(): XinliuNotesApi | undefined {
  return window.xinliu?.notes;
}

function getXinliuConflictsApi(): XinliuConflictsApi | undefined {
  return window.xinliu?.conflicts;
}

function getXinliuTodoApi(): XinliuTodoApi | undefined {
  return window.xinliu?.todo;
}

function formatNotesSyncStatus(status: NotesSyncStatus): string {
  if (status === 'DIRTY') {
    return '本地已保存（待同步）';
  }
  if (status === 'SYNCING') {
    return '本地已保存（同步中）';
  }
  if (status === 'FAILED') {
    return '本地已保存（同步失败）';
  }
  if (status === 'SYNCED') {
    return '远端已同步（后台）';
  }
  if (status === 'LOCAL_ONLY') {
    return '仅本地（不参与同步）';
  }
  if (status === 'UNKNOWN' || status === null) {
    return '本地已保存（状态未知）';
  }
  return String(status);
}

function formatNotesUpdatedAt(updatedAtMs: number): string {
  try {
    return new Date(updatedAtMs).toLocaleString();
  } catch {
    return String(updatedAtMs);
  }
}

async function safePopupMiddleItemMenu(itemId: string) {
  const api = getXinliuContextMenuApi();
  const fn = api?.popupMiddleItem;
  if (typeof fn !== 'function') {
    console.warn('[contextMenu] window.xinliu.contextMenu.popupMiddleItem 不可用');
    return;
  }
  try {
    const res = await fn(itemId);
    if (!res.ok) {
      console.warn(`[contextMenu] popupMiddleItem 失败：${res.error.code}`);
    }
  } catch (e) {
    console.warn(`[contextMenu] popupMiddleItem 异常：${String(e)}`);
  }
}

async function safePopupFolderMenu(folderId: string) {
  const api = getXinliuContextMenuApi();
  const fn = api?.popupFolder;
  if (typeof fn !== 'function') {
    console.warn('[contextMenu] window.xinliu.contextMenu.popupFolder 不可用');
    return;
  }
  try {
    const res = await fn(folderId);
    if (!res.ok) {
      console.warn(`[contextMenu] popupFolder 失败：${res.error.code}`);
    }
  } catch (e) {
    console.warn(`[contextMenu] popupFolder 异常：${String(e)}`);
  }
}

async function safeOpenQuickCapture() {
  const fn = window.xinliu?.quickCapture?.open;
  if (typeof fn !== 'function') {
    console.warn('[quickCapture] window.xinliu.quickCapture.open 不可用');
    return;
  }
  try {
    const res = await fn();
    if (!res.ok) {
      console.warn(`[quickCapture] open 失败：${res.error.code}`);
    }
  } catch (e) {
    console.warn(`[quickCapture] open 异常：${String(e)}`);
  }
}

async function safeCallWindowAction(action: 'minimize' | 'toggleMaximize' | 'close') {
  const api = getXinliuWindowApi();
  const fn = api?.[action];

  if (typeof fn !== 'function') {
    console.warn(`[titlebar] window.xinliu.window.${action} 不可用`);
    return;
  }

  try {
    const res = await fn();
    if (!res.ok) {
      console.warn(`[titlebar] ${action} 失败：${res.error.code}`);
    }
  } catch (e) {
    console.warn(`[titlebar] ${action} 异常：${String(e)}`);
  }
}

async function safeCopyTextToClipboard(text: string): Promise<void> {
  const raw = text.trim();
  if (raw.length === 0) {
    return;
  }

  try {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(raw);
      return;
    }
  } catch {}

  try {
    const ta = document.createElement('textarea');
    ta.value = raw;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '0';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {}
}

function formatSyncAtMs(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '-';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function SyncSummaryPanel(props: {
  apiAvailable: boolean;
  status: SyncStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<{ flow: boolean; memos: boolean }>({
    flow: false,
    memos: false,
  });

  const toggleExpand = (lane: 'flow' | 'memos') => {
    setExpanded((prev) => ({ ...prev, [lane]: !prev[lane] }));
  };

  const containerClass = props.compact ? 'rightCard' : 'settingsSection';
  const headerClass = props.compact ? 'rightCardTitle' : 'settingsSectionTitle';

  return (
    <section
      className={containerClass}
      data-testid={props.compact ? 'left-sync-summary' : 'settings-sync-summary'}
    >
      <div className={props.compact ? 'rightCardBody' : undefined}>
        <div className={props.compact ? undefined : 'settingsSectionHeader'}>
          <div>
            <div className={headerClass}>同步状态摘要</div>
            {!props.compact ? (
              <div className="settingsSectionSub">Flow / Memos 独立统计（renderer 不直连 DB）</div>
            ) : (
              <div className="fine">Flow / Memos 独立统计</div>
            )}
          </div>
          {!props.compact ? (
            <button
              type="button"
              className="btn"
              onClick={() => props.onRefresh()}
              disabled={!props.apiAvailable || props.loading}
            >
              {props.loading ? '刷新中…' : '刷新状态'}
            </button>
          ) : null}
        </div>

        {props.compact ? (
          <div className="btnRow" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btnSmall"
              onClick={() => props.onRefresh()}
              disabled={!props.apiAvailable || props.loading}
            >
              {props.loading ? '刷新中…' : '刷新状态'}
            </button>
          </div>
        ) : null}

        <div className="contentGrid" style={{ marginTop: 10 }}>
          <div className="contentCard" data-testid="sync-flow">
            <div className="contentCardTitle">Flow</div>
            <div className="contentCardBody">
              <div className="kvRow">
                <div className="k">pull cursor</div>
                <div className="v">{props.status?.flow.summary.pullCursor ?? 0}</div>
              </div>
              <div className="kvRow">
                <div className="k">outbox pending</div>
                <div className="v">{props.status?.flow.summary.outboxPendingCount ?? 0}</div>
              </div>
              <div className="kvRow">
                <div className="k">rejected_conflict</div>
                <div className="v">
                  {props.status?.flow.summary.outboxRejectedConflictCount ?? 0}
                </div>
              </div>
              <div className="kvRow">
                <div className="k">request_id</div>
                <div className="v">
                  <code>{props.status?.flow.summary.lastRequestId ?? '-'}</code>
                  <button
                    type="button"
                    className="btn btnGhost"
                    style={{ marginLeft: 8 }}
                    disabled={!props.status?.flow.summary.lastRequestId}
                    onClick={() =>
                      void safeCopyTextToClipboard(props.status?.flow.summary.lastRequestId ?? '')
                    }
                  >
                    复制
                  </button>
                </div>
              </div>
              <div className="kvRow">
                <div className="k">最近运行</div>
                <div className="v">{formatSyncAtMs(props.status?.flow.lastRunAtMs ?? null)}</div>
              </div>
              <div className="btnRow" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btnSmall"
                  onClick={() => toggleExpand('flow')}
                  disabled={!props.status?.flow.lastErrorMessage}
                >
                  {expanded.flow ? '收起错误' : '展开错误'}
                </button>
              </div>
              {expanded.flow && props.status?.flow.lastErrorMessage ? (
                <pre className="codeLike" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                  {props.status.flow.lastErrorMessage}
                </pre>
              ) : null}
            </div>
          </div>

          <div className="contentCard" data-testid="sync-memos">
            <div className="contentCardTitle">Memos</div>
            <div className="contentCardBody">
              <div className="kvRow">
                <div className="k">DIRTY</div>
                <div className="v">{props.status?.memos.summary.dirtyCount ?? 0}</div>
              </div>
              <div className="kvRow">
                <div className="k">FAILED</div>
                <div className="v">{props.status?.memos.summary.failedCount ?? 0}</div>
              </div>
              <div className="kvRow">
                <div className="k">request_id</div>
                <div className="v">
                  <code>{props.status?.memos.summary.lastRequestId ?? '-'}</code>
                  <button
                    type="button"
                    className="btn btnGhost"
                    style={{ marginLeft: 8 }}
                    disabled={!props.status?.memos.summary.lastRequestId}
                    onClick={() =>
                      void safeCopyTextToClipboard(props.status?.memos.summary.lastRequestId ?? '')
                    }
                  >
                    复制
                  </button>
                </div>
              </div>
              <div className="kvRow">
                <div className="k">最近运行</div>
                <div className="v">{formatSyncAtMs(props.status?.memos.lastRunAtMs ?? null)}</div>
              </div>
              <div className="btnRow" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btnSmall"
                  onClick={() => toggleExpand('memos')}
                  disabled={!props.status?.memos.lastErrorMessage}
                >
                  {expanded.memos ? '收起错误' : '展开错误'}
                </button>
              </div>
              {expanded.memos && props.status?.memos.lastErrorMessage ? (
                <pre className="codeLike" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                  {props.status.memos.lastErrorMessage}
                </pre>
              ) : null}
            </div>
          </div>
        </div>

        {!props.apiAvailable ? (
          <div className="callout calloutWarn" style={{ marginTop: 8 }}>
            同步 API 不可用（preload 未注入）
          </div>
        ) : null}

        {props.error ? (
          <div className="callout calloutWarn" style={{ marginTop: 8 }}>
            {props.error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Icon({ name }: { name: 'min' | 'max' | 'close' }) {
  if (name === 'min') {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M2 6.5h8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (name === 'max') {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path
          d="M3 3h6v6H3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d="M3 3l6 6M9 3L3 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Titlebar({ title }: { title: string }) {
  const versions = window.xinliu?.versions;

  return (
    <header className="titlebar">
      <div className="titlebarLeft">
        <div className="titlebarBrand">心流</div>
        <div className="titlebarSubtitle">{title}</div>
      </div>

      <div className="titlebarCenter" aria-hidden="true">
        <div className="titlebarPills">
          <span className="pill">Electron {versions?.electron ?? '-'}</span>
          <span className="pill">Chrome {versions?.chrome ?? '-'}</span>
          <span className="pill">Node {versions?.node ?? '-'}</span>
        </div>
      </div>

      <div className="titlebarRight titlebarNoDrag">
        <button
          type="button"
          className="btn titlebarQuickCaptureBtn"
          data-testid="titlebar-quick-capture"
          onClick={() => void safeOpenQuickCapture()}
        >
          快捕
        </button>
        <button
          type="button"
          className="titlebarBtn"
          data-testid="titlebar-minimize"
          aria-label="最小化"
          onClick={() => void safeCallWindowAction('minimize')}
        >
          <Icon name="min" />
        </button>
        <button
          type="button"
          className="titlebarBtn"
          data-testid="titlebar-maximize"
          aria-label="最大化/还原"
          onClick={() => void safeCallWindowAction('toggleMaximize')}
        >
          <Icon name="max" />
        </button>
        <button
          type="button"
          className="titlebarBtn titlebarBtnClose"
          data-testid="titlebar-close"
          aria-label="关闭"
          onClick={() => void safeCallWindowAction('close')}
        >
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}

function NavItem({
  active,
  meta,
  testId,
  onClick,
}: {
  active: boolean;
  meta: RouteMeta;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`navItem ${active ? 'navItemActive' : ''}`}
      data-testid={testId}
      onClick={onClick}
    >
      <div className="navItemTitle">{meta.label}</div>
      <div className="navItemHint">{meta.hint}</div>
    </button>
  );
}

function ShortcutStatusBadge({ entry }: { entry: ShortcutStatusEntry }) {
  const text =
    entry.registrationState === 'registered'
      ? '已注册'
      : entry.registrationState === 'failed'
        ? '注册失败'
        : '未注册';
  const cls =
    entry.registrationState === 'registered'
      ? 'badge badgeOk'
      : entry.registrationState === 'failed'
        ? 'badge badgeBad'
        : 'badge';

  return (
    <span className={cls} data-testid={`settings-shortcut-${entry.id}-status`}>
      {text}
    </span>
  );
}

function SettingsShortcutsSection(props: {
  status: ShortcutsStatus | null;
  error: string | null;
  draft: Record<string, { accelerator: string; enabled: boolean }>;
  onUpdateDraft: (
    id: ShortcutId,
    patch: Partial<{ accelerator: string; enabled: boolean }>
  ) => void;
  onSaveOne: (id: ShortcutId) => void;
  onResetOne: (id: ShortcutId) => void;
  onResetAll: () => void;
}) {
  return (
    <section className="settingsSection" data-testid="settings-shortcuts">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">快捷键</div>
          <div className="settingsSectionSub">全局快捷键仅由 main 进程注册；此处用于配置与回退</div>
        </div>
        <button type="button" className="btn" onClick={() => props.onResetAll()}>
          恢复默认
        </button>
      </div>

      {props.error ? <div className="callout calloutWarn">{props.error}</div> : null}

      <div className="settingsList">
        {(props.status?.entries ?? []).map((entry) => {
          const current = props.draft[entry.id] ?? {
            accelerator: entry.accelerator,
            enabled: entry.enabled,
          };

          return (
            <div
              key={entry.id}
              className="settingsRow"
              data-testid={`settings-shortcut-${entry.id}`}
            >
              <div className="settingsRowMain">
                <div className="settingsRowTitle">
                  {entry.title} <ShortcutStatusBadge entry={entry} />
                </div>
                <div className="settingsRowSub">{entry.description}</div>

                {entry.registrationState === 'failed' ? (
                  <div
                    className="callout calloutBad"
                    data-testid={`settings-shortcut-${entry.id}-register-failed`}
                  >
                    {entry.registrationMessage ?? '注册失败'}
                  </div>
                ) : null}
              </div>

              <div className="settingsRowControls">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={current.enabled}
                    onChange={(e) => props.onUpdateDraft(entry.id, { enabled: e.target.checked })}
                  />
                  <span>启用</span>
                </label>

                <input
                  className="textInput"
                  value={current.accelerator}
                  placeholder={entry.accelerator}
                  onChange={(e) => props.onUpdateDraft(entry.id, { accelerator: e.target.value })}
                  aria-label={`${entry.title} 快捷键`}
                />

                <div className="btnRow">
                  <button type="button" className="btn" onClick={() => props.onSaveOne(entry.id)}>
                    保存
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost"
                    onClick={() => props.onResetOne(entry.id)}
                  >
                    默认
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SettingsContent(props: {
  shortcutsStatus: ShortcutsStatus | null;
  shortcutsError: string | null;
  shortcutsDraft: Record<string, { accelerator: string; enabled: boolean }>;
  storageRootStatus: StorageRootStatus | null;
  storageRootError: string | null;
  storageRootApiAvailable: boolean;
  closeBehaviorStatus: CloseBehaviorStatus | null;
  closeBehaviorError: string | null;
  closeBehaviorApiAvailable: boolean;
  diagnosticsStatus: DiagnosticsStatus | null;
  diagnosticsError: string | null;
  diagnosticsApiAvailable: boolean;
  updaterStatus: UpdaterStatus | null;
  updaterError: string | null;
  updaterApiAvailable: boolean;
  syncApiAvailable: boolean;
  syncStatus: SyncStatus | null;
  syncStatusLoading: boolean;
  syncStatusError: string | null;
  syncActionError: string | null;
  syncBusyLane: 'flow' | 'memos' | null;
  storageRootRestartRequired: boolean;
  storageRootLastMigration: (StorageRootChooseAndMigrateResult & { kind: 'migrated' }) | null;
  onUpdateDraft: (
    id: ShortcutId,
    patch: Partial<{ accelerator: string; enabled: boolean }>
  ) => void;
  onSaveOne: (id: ShortcutId) => void;
  onResetOne: (id: ShortcutId) => void;
  onResetAll: () => void;
  onChooseAndMigrateStorageRoot: () => void;
  onRestartNow: () => void;
  onSetCloseBehavior: (behavior: 'hide' | 'quit') => void;
  onResetCloseToTrayHint: () => void;
  onSaveFlowBaseUrl: (baseUrl: string) => Promise<void>;
  onSaveMemosBaseUrl: (baseUrl: string) => Promise<void>;
  onRefreshSyncStatus: () => void;
  onSyncNowFlow: () => void;
  onSyncNowMemos: () => void;
  onCheckUpdates: () => void;
  onInstallUpdateNow: () => void;
  onDeferInstall: () => void;
}) {
  return (
    <div className="contentPlaceholder">
      <div className="contentHero">
        <div className="contentHeroTitle">设置</div>
        <div className="contentHeroSub">账户、同步、外观与系统集成能力的配置入口</div>
      </div>

      <div className="settingsStack">
        <SettingsCloseBehaviorSection
          status={props.closeBehaviorStatus}
          error={props.closeBehaviorError}
          apiAvailable={props.closeBehaviorApiAvailable}
          onSetBehavior={props.onSetCloseBehavior}
          onResetHint={props.onResetCloseToTrayHint}
        />
        <SettingsStorageRootSection
          status={props.storageRootStatus}
          error={props.storageRootError}
          apiAvailable={props.storageRootApiAvailable}
          restartRequired={props.storageRootRestartRequired}
          lastMigration={props.storageRootLastMigration}
          onChooseAndMigrate={props.onChooseAndMigrateStorageRoot}
          onRestartNow={props.onRestartNow}
        />
        <SettingsUpdaterSection
          status={props.updaterStatus}
          error={props.updaterError}
          apiAvailable={props.updaterApiAvailable}
          onCheckUpdates={props.onCheckUpdates}
          onInstallUpdateNow={props.onInstallUpdateNow}
          onDeferInstall={props.onDeferInstall}
        />
        <SettingsSyncSection
          apiAvailable={props.syncApiAvailable}
          status={props.syncStatus}
          statusLoading={props.syncStatusLoading}
          statusError={props.syncStatusError}
          actionError={props.syncActionError}
          busyLane={props.syncBusyLane}
          onRefreshStatus={props.onRefreshSyncStatus}
          onSyncNowFlow={props.onSyncNowFlow}
          onSyncNowMemos={props.onSyncNowMemos}
        />
        <SettingsDiagnosticsSection
          status={props.diagnosticsStatus}
          error={props.diagnosticsError}
          apiAvailable={props.diagnosticsApiAvailable}
          onSaveFlowBaseUrl={props.onSaveFlowBaseUrl}
          onSaveMemosBaseUrl={props.onSaveMemosBaseUrl}
        />
        <SettingsShortcutsSection
          status={props.shortcutsStatus}
          error={props.shortcutsError}
          draft={props.shortcutsDraft}
          onUpdateDraft={props.onUpdateDraft}
          onSaveOne={props.onSaveOne}
          onResetOne={props.onResetOne}
          onResetAll={props.onResetAll}
        />
      </div>
    </div>
  );
}

function SettingsStorageRootSection(props: {
  status: StorageRootStatus | null;
  error: string | null;
  apiAvailable: boolean;
  restartRequired: boolean;
  lastMigration: (StorageRootChooseAndMigrateResult & { kind: 'migrated' }) | null;
  onChooseAndMigrate: () => void;
  onRestartNow: () => void;
}) {
  return (
    <section className="settingsSection" data-testid="settings-storage-root">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">数据存储目录</div>
          <div className="settingsSectionSub">用于存放数据库、附件缓存与日志等本地数据</div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => props.onChooseAndMigrate()}
          disabled={!props.apiAvailable}
        >
          更改目录
        </button>
      </div>

      <div className="rightCardBody">
        <div className="kvRow">
          <div className="k">当前目录</div>
          <div className="v">{props.status?.storageRootAbsPath ?? '-'}</div>
        </div>
        <div className="kvRow">
          <div className="k">是否默认</div>
          <div className="v">{props.status ? (props.status.isDefault ? '是' : '否') : '-'}</div>
        </div>
      </div>

      {props.error ? <div className="callout calloutWarn">{props.error}</div> : null}

      {props.restartRequired ? (
        <div className="callout calloutWarn" data-testid="settings-restart-required">
          <div>目录迁移已完成。为确保所有文件句柄正确释放，请重启应用后继续使用。</div>
          {props.lastMigration ? (
            <div className="fine">
              迁移：{props.lastMigration.oldStorageRootAbsPath} →{' '}
              {props.lastMigration.newStorageRootAbsPath}
            </div>
          ) : null}
          <div className="btnRow">
            <button type="button" className="btn" onClick={() => props.onRestartNow()}>
              立即重启
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsUpdaterSection(props: {
  status: UpdaterStatus | null;
  error: string | null;
  apiAvailable: boolean;
  onCheckUpdates: () => void;
  onInstallUpdateNow: () => void;
  onDeferInstall: () => void;
}) {
  const releasesUrl =
    props.status?.releasesUrl ?? 'https://github.com/pscly/xinliu_desktop/releases';
  const state = props.status?.state ?? 'idle';
  const currentVersion = props.status?.currentVersion ?? '-';
  const availableVersion = props.status?.availableVersion;
  const deferred = props.status?.deferred ?? false;

  const openReleases = () => {
    try {
      window.open?.(releasesUrl);
    } catch {}
  };

  const percentText = (() => {
    const p = props.status?.progress?.percent01;
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      return null;
    }
    const pct = Math.round(p * 100);
    return `${pct}%`;
  })();

  const statusText = (() => {
    if (state === 'disabled') {
      return '开发模式：自动更新已禁用（仅安装包可用）';
    }
    if (state === 'idle') {
      return '尚未检查';
    }
    if (state === 'checking') {
      return '正在检查更新…';
    }
    if (state === 'no_update') {
      return '已是最新版本';
    }
    if (state === 'update_available') {
      return availableVersion
        ? `发现新版本 ${availableVersion}，准备下载…`
        : '发现新版本，准备下载…';
    }
    if (state === 'downloading') {
      const base = availableVersion ? `正在后台下载 ${availableVersion}` : '正在后台下载更新';
      return percentText ? `${base}（${percentText}）` : base;
    }
    if (state === 'downloaded') {
      const base = availableVersion ? `新版本 ${availableVersion} 已下载` : '新版本已下载';
      return deferred ? `${base}（已延后安装）` : base;
    }
    if (state === 'error') {
      return '更新失败';
    }
    return String(state);
  })();

  const hintText = state === 'disabled' ? props.status?.errorMessage : null;
  const errorText = props.error ?? props.status?.errorMessage;

  const checkDisabled = state === 'checking' || state === 'downloading';

  return (
    <section className="settingsSection" data-testid="settings-updater">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">自动更新</div>
          <div className="settingsSectionSub">
            GitHub Releases（stable）；后台下载，用户触发安装
          </div>
        </div>

        <div className="btnRow">
          <button
            type="button"
            className="btn"
            onClick={() => props.onCheckUpdates()}
            disabled={checkDisabled}
            data-testid="check-updates"
          >
            检查更新
          </button>
          <button
            type="button"
            className="btn btnGhost"
            onClick={() => openReleases()}
            data-testid="update-open-releases"
          >
            打开 Releases
          </button>
        </div>
      </div>

      <div className="rightCardBody">
        <div className="kvRow">
          <div className="k">当前版本</div>
          <div className="v" data-testid="update-current-version">
            {currentVersion}
          </div>
        </div>
        <div className="kvRow">
          <div className="k">状态</div>
          <div className="v" data-testid="update-status">
            {statusText}
          </div>
        </div>
      </div>

      {!props.apiAvailable ? (
        <div className="callout calloutWarn">自动更新 API 不可用（preload 未注入）</div>
      ) : null}

      {hintText ? (
        <div className="callout calloutWarn" data-testid="update-disabled-hint">
          {hintText}
        </div>
      ) : null}

      {state === 'downloaded' ? (
        <div className="callout calloutWarn" data-testid="update-downloaded">
          <div>更新已下载完成。你可以选择现在安装并重启，或延后稍后再说。</div>
          <div className="btnRow">
            <button
              type="button"
              className="btn"
              onClick={() => props.onInstallUpdateNow()}
              data-testid="update-install-now"
            >
              安装并重启
            </button>
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => props.onDeferInstall()}
              data-testid="update-defer"
            >
              稍后再说
            </button>
          </div>
        </div>
      ) : null}

      {errorText ? (
        <div
          className={state === 'error' ? 'callout calloutBad' : 'callout calloutWarn'}
          data-testid="update-error"
        >
          <div>{errorText}</div>
          <div className="btnRow">
            <button type="button" className="btn" onClick={() => props.onCheckUpdates()}>
              重试
            </button>
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => openReleases()}
              data-testid="update-open-releases-error"
            >
              打开 Releases
            </button>
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => void safeCopyTextToClipboard(String(errorText))}
            >
              复制错误
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsSyncSection(props: {
  apiAvailable: boolean;
  status: SyncStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  actionError: string | null;
  busyLane: 'flow' | 'memos' | null;
  onRefreshStatus: () => void;
  onSyncNowFlow: () => void;
  onSyncNowMemos: () => void;
}) {
  return (
    <section className="settingsSection" data-testid="settings-sync-now">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">立即同步</div>
          <div className="settingsSectionSub">手动触发一次 Flow / Memos 同步调度</div>
        </div>
      </div>

      <div className="btnRow">
        <button
          type="button"
          className="btn"
          data-testid="sync-now-memos"
          disabled={!props.apiAvailable || props.busyLane !== null}
          onClick={() => props.onSyncNowMemos()}
        >
          {props.busyLane === 'memos' ? '同步中…' : '立即同步（Memos）'}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="sync-now-flow"
          disabled={!props.apiAvailable || props.busyLane !== null}
          onClick={() => props.onSyncNowFlow()}
        >
          {props.busyLane === 'flow' ? '同步中…' : '立即同步（Flow）'}
        </button>
      </div>

      <SyncSummaryPanel
        apiAvailable={props.apiAvailable}
        status={props.status}
        loading={props.statusLoading}
        error={props.statusError}
        onRefresh={props.onRefreshStatus}
      />

      {props.actionError ? <div className="callout calloutWarn">{props.actionError}</div> : null}
    </section>
  );
}

function SettingsCloseBehaviorSection(props: {
  status: CloseBehaviorStatus | null;
  error: string | null;
  apiAvailable: boolean;
  onSetBehavior: (behavior: 'hide' | 'quit') => void;
  onResetHint: () => void;
}) {
  const current = props.status?.behavior ?? 'hide';
  const hintShown = props.status?.closeToTrayHintShown ?? false;

  return (
    <section className="settingsSection" data-testid="settings-close-behavior">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">关闭行为</div>
          <div className="settingsSectionSub">点击窗口关闭按钮时的动作：隐藏到托盘，或真正退出</div>
        </div>
      </div>

      <div className="rightCardBody">
        <div className="kvRow">
          <div className="k">当前行为</div>
          <div className="v">{current === 'quit' ? '真正退出' : '关闭到托盘'}</div>
        </div>

        <div className="kvRow">
          <div className="k">选择</div>
          <div className="v">
            <label style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="closeBehavior"
                checked={current === 'hide'}
                onChange={() => props.onSetBehavior('hide')}
                disabled={!props.apiAvailable}
                data-testid="close-behavior-hide"
              />{' '}
              关闭到托盘
            </label>
            <label>
              <input
                type="radio"
                name="closeBehavior"
                checked={current === 'quit'}
                onChange={() => props.onSetBehavior('quit')}
                disabled={!props.apiAvailable}
                data-testid="close-behavior-quit"
              />{' '}
              真正退出
            </label>
          </div>
        </div>

        <div className="kvRow">
          <div className="k">首次关闭提示</div>
          <div className="v">
            {hintShown ? '已展示' : '未展示'}
            <button
              type="button"
              className="btn btnGhost"
              style={{ marginLeft: 8 }}
              onClick={() => props.onResetHint()}
              disabled={!props.apiAvailable}
              data-testid="close-to-tray-hint-reset"
            >
              重置
            </button>
          </div>
        </div>
      </div>

      {!props.apiAvailable ? (
        <div className="callout calloutWarn">关闭行为 API 不可用（preload 未注入）</div>
      ) : null}

      {props.error ? <div className="callout calloutWarn">{props.error}</div> : null}
    </section>
  );
}

function SettingsDiagnosticsSection(props: {
  status: DiagnosticsStatus | null;
  error: string | null;
  apiAvailable: boolean;
  onSaveFlowBaseUrl: (baseUrl: string) => Promise<void>;
  onSaveMemosBaseUrl: (baseUrl: string) => Promise<void>;
}) {
  const [flowBaseUrlDraft, setFlowBaseUrlDraft] = useState('');
  const [memosBaseUrlDraft, setMemosBaseUrlDraft] = useState('');
  const [savingFlowBaseUrl, setSavingFlowBaseUrl] = useState(false);
  const [savingMemosBaseUrl, setSavingMemosBaseUrl] = useState(false);

  useEffect(() => {
    setFlowBaseUrlDraft(props.status?.flowBaseUrl ?? '');
  }, [props.status?.flowBaseUrl]);

  useEffect(() => {
    setMemosBaseUrlDraft(props.status?.memosBaseUrl ?? '');
  }, [props.status?.memosBaseUrl]);

  const saveFlowBaseUrl = async () => {
    setSavingFlowBaseUrl(true);
    try {
      await props.onSaveFlowBaseUrl(flowBaseUrlDraft);
    } finally {
      setSavingFlowBaseUrl(false);
    }
  };

  const saveMemosBaseUrl = async () => {
    setSavingMemosBaseUrl(true);
    try {
      await props.onSaveMemosBaseUrl(memosBaseUrlDraft);
    } finally {
      setSavingMemosBaseUrl(false);
    }
  };

  const providerText =
    props.status?.notesProvider === 'memos' && props.status?.notesProviderKind === 'direct'
      ? 'Memos（直连）'
      : props.status?.notesProvider === 'flow_notes'
        ? 'Flow Notes（降级）'
        : props.status?.notesProvider
          ? String(props.status.notesProvider)
          : '-';

  const degradeReason =
    props.status?.notesProviderKind === 'fallback' ? (props.status.lastDegradeReason ?? '-') : '-';

  const memosRequestId = props.status?.lastRequestIds.memos_request_id ?? null;
  const flowRequestId = props.status?.lastRequestIds.flow_request_id ?? null;

  return (
    <section className="settingsSection" data-testid="settings-backend">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">后端与网络</div>
          <div className="settingsSectionSub">
            用于排障：不展示 token 明文；日志会强制脱敏（Authorization/Token/绝对路径）
          </div>
        </div>
      </div>

      <div className="rightCardBody">
        <div className="kvRow">
          <div className="k">Flow Base URL</div>
          <div className="v">
            <input
              className="textInput"
              data-testid="backend-flow-base-url-input"
              value={flowBaseUrlDraft}
              onChange={(e) => setFlowBaseUrlDraft(e.currentTarget.value)}
              placeholder="https://xl.pscly.cc"
              disabled={!props.apiAvailable || savingFlowBaseUrl}
              aria-label="Flow Base URL"
            />
            <button
              type="button"
              className="btn btnGhost"
              data-testid="backend-flow-base-url-save"
              disabled={!props.apiAvailable || savingFlowBaseUrl}
              onClick={() => void saveFlowBaseUrl()}
              style={{ marginLeft: 8 }}
            >
              {savingFlowBaseUrl ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
        <div className="kvRow">
          <div className="k">Memos Base URL</div>
          <div className="v">
            <input
              className="textInput"
              data-testid="backend-memos-base-url-input"
              value={memosBaseUrlDraft}
              onChange={(e) => setMemosBaseUrlDraft(e.currentTarget.value)}
              placeholder="留空则禁用直连 Memos"
              disabled={!props.apiAvailable || savingMemosBaseUrl}
              aria-label="Memos Base URL"
            />
            <button
              type="button"
              className="btn btnGhost"
              data-testid="backend-memos-base-url-save"
              disabled={!props.apiAvailable || savingMemosBaseUrl}
              onClick={() => void saveMemosBaseUrl()}
              style={{ marginLeft: 8 }}
            >
              {savingMemosBaseUrl ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
        <div className="kvRow">
          <div className="k">Notes Provider</div>
          <div className="v">{providerText}</div>
        </div>
        <div className="kvRow">
          <div className="k">最近一次降级原因</div>
          <div className="v">{degradeReason}</div>
        </div>

        <div className="kvRow">
          <div className="k">memos_request_id</div>
          <div className="v">
            <code data-testid="diagnostics-memos-request-id">{memosRequestId ?? '-'}</code>
            <button
              type="button"
              className="btn btnGhost"
              data-testid="diagnostics-copy-memos-request-id"
              disabled={!props.apiAvailable || !memosRequestId}
              onClick={() => void safeCopyTextToClipboard(memosRequestId ?? '')}
              style={{ marginLeft: 8 }}
            >
              复制
            </button>
          </div>
        </div>

        <div className="kvRow">
          <div className="k">flow_request_id</div>
          <div className="v">
            <code data-testid="diagnostics-flow-request-id">{flowRequestId ?? '-'}</code>
            <button
              type="button"
              className="btn btnGhost"
              data-testid="diagnostics-copy-flow-request-id"
              disabled={!props.apiAvailable || !flowRequestId}
              onClick={() => void safeCopyTextToClipboard(flowRequestId ?? '')}
              style={{ marginLeft: 8 }}
            >
              复制
            </button>
          </div>
        </div>
      </div>

      {!props.apiAvailable ? (
        <div className="callout calloutWarn">后端配置 API 不可用（preload 未注入，保存已禁用）</div>
      ) : null}

      {props.error ? <div className="callout calloutWarn">{props.error}</div> : null}
    </section>
  );
}

function DefaultRoutePlaceholder(props: {
  routeMeta: RouteMeta;
  middleItems: Array<{ id: string; title: string; sub: string }>;
  onPopupMiddleItemMenu: (itemId: string) => void;
}) {
  return (
    <div className="contentPlaceholder">
      <div className="contentHero">
        <div className="contentHeroTitle">{props.routeMeta.label} 入口占位</div>
        <div className="contentHeroSub">
          这里将承载核心页面内容：列表、编辑器、时间线、或设置表单。
        </div>
      </div>

      <div className="contentGrid">
        <div className="contentCard">
          <div className="contentCardTitle">状态</div>
          <div className="contentCardBody">UI 壳已就绪：标题栏 + 三栏布局 + 路由骨架</div>
        </div>
        <div className="contentCard">
          <div className="contentCardTitle">下一步</div>
          <div className="contentCardBody">
            按路由逐个落地 Notes/Collections/Todo/设置/冲突页面。
          </div>
        </div>
      </div>

      <div className="contentList" data-testid="middle-list">
        <div className="contentListTitle">条目（占位，可右键）</div>
        <div className="contentListBody">
          {props.middleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="listRow"
              onContextMenu={(e) => {
                e.preventDefault();
                props.onPopupMiddleItemMenu(item.id);
              }}
            >
              <div className="listRowTitle">{item.title}</div>
              <div className="listRowSub">{item.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const MIDDLE_LIST_ITEM_TEST_ID_PREFIX = 'middle-list-item-';
const FOLDER_TREE_NODE_TEST_ID_PREFIX = 'folder-tree-node-';
const DRAG_UNDO_DURATION_MS = 6000;
const MOUSE_DRAG_MIN_DISTANCE_PX = 8;

interface CollectionsMoveUndoNotice {
  itemId: string;
  itemName: string;
  fromParentId: string | null;
  toParentId: string | null;
}

interface CollectionsMouseDragCandidate {
  itemId: string;
  startX: number;
  startY: number;
}

function parseMiddleListItemIdFromDnd(id: UniqueIdentifier | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }
  const raw = String(id);
  if (!raw.startsWith(MIDDLE_LIST_ITEM_TEST_ID_PREFIX)) {
    return null;
  }
  const itemId = raw.slice(MIDDLE_LIST_ITEM_TEST_ID_PREFIX.length).trim();
  return itemId.length > 0 ? itemId : null;
}

function parseFolderNodeIdFromDnd(id: UniqueIdentifier | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }
  const raw = String(id);
  if (!raw.startsWith(FOLDER_TREE_NODE_TEST_ID_PREFIX)) {
    return null;
  }
  const folderId = raw.slice(FOLDER_TREE_NODE_TEST_ID_PREFIX.length).trim();
  return folderId.length > 0 ? folderId : null;
}

function readPointerClientY(
  event: Event,
  fallbackRect: { top: number; bottom: number } | null
): number | null {
  if (event instanceof MouseEvent) {
    return event.clientY;
  }
  if ('touches' in event) {
    const touches = (event as TouchEvent).touches;
    if (touches.length > 0) {
      return touches[0]?.clientY ?? null;
    }
  }
  if (fallbackRect) {
    return (fallbackRect.top + fallbackRect.bottom) / 2;
  }
  return null;
}

function CollectionsMiddleDraggableItem(props: {
  item: CollectionsTreeItem;
  onOpenFolder: (item: CollectionsTreeItem) => void;
  onPopupMiddleItemMenu: (itemId: string) => void;
  onMouseDragStart: (args: { itemId: string; clientX: number; clientY: number }) => void;
}) {
  const itemId = props.item.id;
  const onMouseDragStart = props.onMouseDragStart;
  const dragId = `${MIDDLE_LIST_ITEM_TEST_ID_PREFIX}${props.item.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
  });

  const style: CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

  const mergedOnMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.button === 0) {
        onMouseDragStart({
          itemId,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
      listeners?.onMouseDown?.(event);
    },
    [itemId, listeners, onMouseDragStart]
  );

  const mergedListeners = useMemo(() => {
    if (!listeners) {
      return undefined;
    }
    return {
      ...listeners,
      onMouseDown: mergedOnMouseDown,
    };
  }, [listeners, mergedOnMouseDown]);

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`listRow ${isDragging ? 'listRowDragging' : ''}`}
      data-testid={dragId}
      style={style}
      onClick={() => {
        if (props.item.itemType === 'folder') {
          props.onOpenFolder(props.item);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onPopupMiddleItemMenu(props.item.id);
      }}
      {...attributes}
      {...mergedListeners}
    >
      <div className="listRowTitle">
        [{props.item.itemType}] {props.item.name || '（未命名）'}
      </div>
      <div className="listRowSub">id: {props.item.id}</div>
    </button>
  );
}

function CollectionsTreeNodeButton(props: {
  item: CollectionsTreeItem;
  selected: boolean;
  expanded: boolean;
  childLoading: boolean;
  dropState: 'idle' | 'valid' | 'invalid';
  dropHint: string | null;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleFolder: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const isFolder = props.item.itemType === 'folder';
  const { setNodeRef } = useDroppable({
    id: `${FOLDER_TREE_NODE_TEST_ID_PREFIX}${props.item.id}`,
    disabled: !isFolder,
  });

  const dropClass =
    props.dropState === 'valid'
      ? 'treeRowDropValid'
      : props.dropState === 'invalid'
        ? 'treeRowDropInvalid'
        : '';

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`treeRow ${props.selected ? 'treeRowSelected' : ''} ${dropClass}`.trim()}
      data-testid={`${FOLDER_TREE_NODE_TEST_ID_PREFIX}${props.item.id}`}
      onClick={() => props.onClick()}
      onMouseEnter={() => props.onMouseEnter()}
      onMouseLeave={() => props.onMouseLeave()}
      onContextMenu={(event) => props.onContextMenu(event)}
    >
      <div className="treeRowLine">
        {isFolder ? (
          <button
            type="button"
            className="treeToggle"
            onClick={(event) => props.onToggleFolder(event)}
            aria-label={props.expanded ? '收起' : '展开'}
          >
            {props.expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="treeToggle treeTogglePlaceholder">•</span>
        )}

        <div className="treeRowTitle">
          [{props.item.itemType}] {props.item.name || '（未命名）'}
        </div>
      </div>
      <div className="treeRowSub">id: {props.item.id}</div>
      {props.childLoading ? <div className="treeRowSub">加载子项中…</div> : null}
      {props.dropHint ? <div className="treeRowSub treeRowDropHint">{props.dropHint}</div> : null}
    </button>
  );
}

function CollectionsMiddle(props: {
  selectedParentId: string | null;
  selectedParentName: string | null;
  items: CollectionsTreeItem[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  apiAvailable: boolean;
  onRefresh: () => void;
  onOpenFolder: (item: CollectionsTreeItem) => void;
  onPopupMiddleItemMenu: (itemId: string) => void;
  onMiddleItemMouseDragStart: (args: { itemId: string; clientX: number; clientY: number }) => void;
  undoNotice: CollectionsMoveUndoNotice | null;
  undoBusy: boolean;
  onUndoMove: () => void;
}) {
  return (
    <div className="contentPlaceholder" data-testid="collections-center">
      <div className="contentHero">
        <div className="contentHeroTitle">Collections</div>
        <div className="contentHeroSub">
          中栏展示当前 parentId 的直接子项（folder 与 note_ref 混排）。
        </div>
      </div>

      <div className="notesScopeRow" style={{ marginTop: 12 }}>
        <div className="fine" data-testid="collections-parent-meta">
          当前 parentId：{props.selectedParentId ?? 'ROOT'}
          {props.selectedParentName ? `（${props.selectedParentName}）` : ''}
        </div>
        <button
          type="button"
          className="btnSmall"
          onClick={() => props.onRefresh()}
          disabled={!props.apiAvailable || props.loading}
          style={{ marginLeft: 'auto' }}
        >
          {props.loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {props.error ? (
        <div className="callout calloutWarn" style={{ marginTop: 10 }}>
          {props.error}
        </div>
      ) : null}

      {props.undoNotice ? (
        <div className="callout" data-testid="collections-undo-callout" style={{ marginTop: 10 }}>
          已移动「{props.undoNotice.itemName || props.undoNotice.itemId}」，可在短时间内撤销。
          <div className="calloutActions">
            <button
              type="button"
              className="btnSmall"
              data-testid="collections-undo-btn"
              onClick={() => props.onUndoMove()}
              disabled={props.undoBusy}
            >
              {props.undoBusy ? '撤销中…' : '撤销'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="contentList" data-testid="middle-list">
        <div className="contentListTitle">子项列表</div>
        <div className="contentListBody">
          {props.items.map((item) => (
            <CollectionsMiddleDraggableItem
              key={item.id}
              item={item}
              onOpenFolder={props.onOpenFolder}
              onPopupMiddleItemMenu={props.onPopupMiddleItemMenu}
              onMouseDragStart={props.onMiddleItemMouseDragStart}
            />
          ))}

          {!props.loading && props.items.length === 0 ? (
            <div className="fine">当前 parentId 暂无子项。</div>
          ) : null}
        </div>

        {props.hasMore ? (
          <div className="fine">当前只展示第一页，请扩展分页参数查看后续。</div>
        ) : null}
      </div>
    </div>
  );
}

function GlobalSearchBox() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [lastResult, setLastResult] = useState<SearchQueryResult | null>(null);

  useEffect(() => {
    const api = getXinliuShortcutsApi();
    const off = api?.onFocusSearch?.(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      off?.();
    };
  }, []);

  const renderMarkedSnippet = (snippet: string) => {
    const s = String(snippet ?? '');
    if (!s.includes('<mark>')) {
      return s;
    }

    const parts: Array<{ text: string; marked: boolean; key: number }> = [];
    let cursor = 0;
    while (cursor < s.length) {
      const open = s.indexOf('<mark>', cursor);
      if (open < 0) {
        parts.push({ text: s.slice(cursor), marked: false, key: cursor });
        break;
      }
      if (open > cursor) {
        parts.push({ text: s.slice(cursor, open), marked: false, key: cursor });
      }
      const close = s.indexOf('</mark>', open + 6);
      if (close < 0) {
        parts.push({ text: s.slice(open), marked: false, key: open });
        break;
      }
      parts.push({ text: s.slice(open + 6, close), marked: true, key: open });
      cursor = close + 7;
    }

    return parts.map((p) =>
      p.marked ? <mark key={p.key}>{p.text}</mark> : <span key={p.key}>{p.text}</span>
    );
  };

  const runQuery = useCallback(
    async (options: { query: string; page: number; append: boolean }) => {
      const api = getXinliuSearchApi();
      const fn = api?.query;
      if (typeof fn !== 'function') {
        setError('搜索能力不可用（preload 未注入）');
        setItems([]);
        setLastResult(null);
        return;
      }

      const q = options.query.trim();
      if (q.length === 0) {
        setError(null);
        setItems([]);
        setLastResult(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fn({ query: q, page: options.page, pageSize: 20 });
        if (!res.ok) {
          setError(`搜索失败：${res.error.code}`);
          setItems([]);
          setLastResult(null);
          return;
        }
        setLastResult(res.value);
        setItems((prev) => (options.append ? [...prev, ...res.value.items] : res.value.items));
      } catch (e) {
        setError(`搜索异常：${String(e)}`);
        setItems([]);
        setLastResult(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runQuery({ query, page: 0, append: false });
    }, 180);
    return () => {
      window.clearTimeout(handle);
    };
  }, [query, runQuery]);

  const canLoadMore = Boolean(lastResult?.hasMore) && !loading;

  return (
    <div className="rightCard" data-testid="global-search">
      <div className="rightCardTitle">搜索</div>
      <div className="rightCardBody">
        <input
          ref={inputRef}
          className="textInput"
          data-testid="global-search-input"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="搜索 Notes / Todo / Collections"
        />

        {error ? <div className="calloutWarn">{error}</div> : null}

        {lastResult && !lastResult.ftsAvailable ? (
          <div className="calloutWarn">
            索引不可用：已降级为有限搜索（仅扫描最近部分数据）。
            <div className="calloutActions">
              <button
                type="button"
                className="btnSmall"
                onClick={async () => {
                  const api = getXinliuSearchApi();
                  const fn = api?.rebuildIndex;
                  if (typeof fn !== 'function') {
                    setError('重建索引不可用');
                    return;
                  }
                  setLoading(true);
                  setError(null);
                  try {
                    const res = await fn();
                    if (!res.ok) {
                      setError(`重建失败：${res.error.code}`);
                      return;
                    }
                    if (!res.value.rebuilt) {
                      setError(res.value.message);
                      return;
                    }
                    void runQuery({ query, page: 0, append: false });
                  } catch (e) {
                    setError(`重建异常：${String(e)}`);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                重建索引
              </button>
            </div>
          </div>
        ) : null}

        <div className="fine">
          {loading ? '搜索中…' : '提示：可通过全局快捷键打开主窗并聚焦此输入框。'}
        </div>

        {items.length > 0 ? (
          <ul className="searchResults">
            {items.map((item) => {
              const secondary = item.matchSnippet?.trim().length ? item.matchSnippet : item.preview;
              return (
                <li key={`${item.kind}:${item.id}`} className="searchResultRow">
                  <div className="searchResultTop">
                    <div className="searchResultTitle">{item.title}</div>
                    <div className="searchResultKind">{item.kind}</div>
                  </div>
                  {secondary.length > 0 ? (
                    <div className="searchResultSnippet">{renderMarkedSnippet(secondary)}</div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {canLoadMore ? (
          <button
            type="button"
            className="btnSmall"
            onClick={() =>
              void runQuery({ query, page: (lastResult?.page ?? 0) + 1, append: true })
            }
          >
            加载更多
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NotesEditorCard() {
  const [localUuid, setLocalUuid] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [syncStatus, setSyncStatus] = useState<NotesSyncStatus>(null);
  const [phase, setPhase] = useState<'idle' | 'dirty' | 'saving' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState('');

  const debounceMs = 800;
  const timerRef = useRef<number | null>(null);
  const contentRef = useRef<string>('');
  const localUuidRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const mountedRef = useRef(true);

  const safeSetPhase = useCallback((next: 'idle' | 'dirty' | 'saving' | 'failed') => {
    if (!mountedRef.current) {
      return;
    }
    setPhase(next);
  }, []);

  const safeSetError = useCallback((next: string | null) => {
    if (!mountedRef.current) {
      return;
    }
    setError(next);
  }, []);

  const safeSetSyncStatus = useCallback((next: NotesSyncStatus) => {
    if (!mountedRef.current) {
      return;
    }
    setSyncStatus(next);
  }, []);

  const safeSetLastSavedContent = useCallback((next: string) => {
    if (!mountedRef.current) {
      return;
    }
    setLastSavedContent(next);
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    localUuidRef.current = localUuid;
  }, [localUuid]);

  const refreshDraftMeta = useCallback(
    async (uuid: string) => {
      const api = getXinliuNotesApi();
      const fn = api?.getDraft;
      if (typeof fn !== 'function') {
        return;
      }

      try {
        const res = await fn({ localUuid: uuid });
        if (!res.ok) {
          return;
        }
        const draft = res.value.draft;
        if (!draft) {
          return;
        }
        safeSetSyncStatus(draft.syncStatus);
      } catch {}
    },
    [safeSetSyncStatus]
  );

  const saveNow = useCallback(
    async (reason: 'debounce' | 'flush') => {
      const api = getXinliuNotesApi();
      const upsert = api?.upsertDraft;
      const getDraft = api?.getDraft;

      if (typeof upsert !== 'function' || typeof getDraft !== 'function') {
        if (reason !== 'flush') {
          safeSetPhase('failed');
          safeSetError('Notes API 不可用（preload 未注入）');
        }
        return;
      }

      const uuid = localUuidRef.current;
      if (!uuid) {
        return;
      }

      const latest = contentRef.current;
      if (latest === lastSavedContentRef.current) {
        return;
      }

      safeSetPhase('saving');
      safeSetError(null);

      try {
        const res = await upsert({ localUuid: uuid, content: latest });
        if (!res.ok) {
          safeSetPhase('failed');
          safeSetError(`${res.error.message}（${res.error.code}）`);
          return;
        }

        lastSavedContentRef.current = latest;
        safeSetLastSavedContent(latest);

        const meta = await getDraft({ localUuid: uuid });
        if (meta.ok && meta.value.draft) {
          safeSetSyncStatus(meta.value.draft.syncStatus);
        } else {
          safeSetSyncStatus('DIRTY');
        }
        safeSetPhase('idle');
      } catch (e) {
        safeSetPhase('failed');
        safeSetError(`保存异常：${String(e)}`);
      }
    },
    [safeSetError, safeSetLastSavedContent, safeSetPhase, safeSetSyncStatus]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      void saveNow('flush');
    };
  }, [saveNow]);

  useEffect(() => {
    if (!localUuid) {
      return;
    }

    if (content === lastSavedContent) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveNow('debounce');
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, lastSavedContent, localUuid, saveNow]);

  const onNewDraft = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await saveNow('flush');

    const api = getXinliuNotesApi();
    const fn = api?.createDraft;
    if (typeof fn !== 'function') {
      safeSetPhase('failed');
      safeSetError('Notes API 不可用（preload 未注入）');
      return;
    }

    const initial = '# 新笔记\n';
    safeSetPhase('saving');
    safeSetError(null);
    try {
      const res = await fn({ content: initial });
      if (!res.ok) {
        safeSetPhase('failed');
        safeSetError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setLocalUuid(res.value.localUuid);
      setContent(initial);
      lastSavedContentRef.current = initial;
      safeSetLastSavedContent(initial);
      safeSetPhase('idle');
      void refreshDraftMeta(res.value.localUuid);
    } catch (e) {
      safeSetPhase('failed');
      safeSetError(`新建草稿异常：${String(e)}`);
    }
  };

  const apiAvailable = Boolean(getXinliuNotesApi());
  const isDirty = Boolean(localUuid) && content !== lastSavedContent;

  const statusText = (() => {
    if (!apiAvailable) {
      return 'Notes API 不可用（preload 未注入）';
    }
    if (!localUuid) {
      return '尚未创建草稿';
    }
    if (phase === 'saving') {
      return '正在保存到本地…';
    }
    if (isDirty) {
      return '本地修改待保存…';
    }
    if (phase === 'failed') {
      return error ? `本地保存失败：${error}` : '本地保存失败';
    }
    return formatNotesSyncStatus(syncStatus);
  })();

  return (
    <div className="rightCard" data-testid="notes-editor">
      <div className="rightCardTitle">编辑器</div>
      <div className="rightCardBody">
        <div className="btnRow" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btnSmall"
            data-testid="notes-new"
            onClick={() => void onNewDraft()}
            disabled={!apiAvailable || phase === 'saving'}
          >
            新建
          </button>
          <div className="fine" data-testid="notes-save-status" style={{ marginLeft: 'auto' }}>
            {statusText}
          </div>
        </div>

        <textarea
          className="textInput"
          data-testid="notes-editor-input"
          value={content}
          onChange={(e) => {
            safeSetError(null);
            setContent(e.currentTarget.value);
          }}
          placeholder={localUuid ? '在此输入 Markdown…' : '点击「新建」创建草稿后开始编辑'}
          disabled={!localUuid}
          style={{ minHeight: 260, resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

const NOTES_VIRTUAL_ROW_HEIGHT = 132;
const NOTES_VIRTUAL_VIEWPORT_HEIGHT = 560;
const NOTES_VIRTUAL_OVERSCAN = 4;
const NOTES_LIST_PAGE_SIZE = 200;

const COLLECTIONS_PAGE_SIZE = 200;
const COLLECTIONS_ROOT_KEY = '__root__';
const HOVER_EXPAND_DELAY_MS = 800;
const TREE_EDGE_SCROLL_THRESHOLD_PX = 56;
const TREE_EDGE_SCROLL_STEP_PX = 24;

function NotesListCenter(props: {
  apiAvailable: boolean;
  scope: NotesScope;
  items: NotesListItem[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  actionBusyKey: string | null;
  pendingHardDeleteKey: string | null;
  onChangeScope: (scope: NotesScope) => void;
  onRefresh: () => void;
  onDelete: (item: NotesListItem) => void;
  onRestore: (item: NotesListItem) => void;
  onPrepareHardDelete: (item: NotesListItem) => void;
  onCancelHardDelete: () => void;
  onConfirmHardDelete: (item: NotesListItem) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleCount =
    Math.ceil(NOTES_VIRTUAL_VIEWPORT_HEIGHT / NOTES_VIRTUAL_ROW_HEIGHT) +
    NOTES_VIRTUAL_OVERSCAN * 2;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / NOTES_VIRTUAL_ROW_HEIGHT) - NOTES_VIRTUAL_OVERSCAN
  );
  const endIndex = Math.min(props.items.length, startIndex + visibleCount);
  const renderedItems = props.items.slice(startIndex, endIndex);
  const totalHeight = props.items.length * NOTES_VIRTUAL_ROW_HEIGHT;
  const offsetY = startIndex * NOTES_VIRTUAL_ROW_HEIGHT;

  return (
    <div className="contentPlaceholder" data-testid="notes-list-center">
      <div className="contentHero">
        <div className="contentHeroTitle">Notes 列表</div>
        <div className="contentHeroSub">
          时间线 / 收件箱 / 回收站，统一由 Notes IPC 返回完整列表项
        </div>
      </div>

      <div className="notesScopeRow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`scopeBtn ${props.scope === 'timeline' ? 'scopeBtnActive' : ''}`}
          data-testid="notes-scope-timeline"
          onClick={() => props.onChangeScope('timeline')}
          disabled={props.loading}
        >
          时间线
        </button>
        <button
          type="button"
          className={`scopeBtn ${props.scope === 'inbox' ? 'scopeBtnActive' : ''}`}
          data-testid="notes-scope-inbox"
          onClick={() => props.onChangeScope('inbox')}
          disabled={props.loading}
        >
          收件箱
        </button>
        <button
          type="button"
          className={`scopeBtn ${props.scope === 'trash' ? 'scopeBtnActive' : ''}`}
          data-testid="notes-scope-trash"
          onClick={() => props.onChangeScope('trash')}
          disabled={props.loading}
        >
          回收站
        </button>
        <button
          type="button"
          className="btnSmall"
          data-testid="notes-refresh"
          onClick={() => props.onRefresh()}
          disabled={props.loading || !props.apiAvailable}
          style={{ marginLeft: 'auto' }}
        >
          {props.loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="fine" style={{ marginTop: 8 }} data-testid="notes-list-meta">
        当前范围：{props.scope} · 条目：{props.items.length}
        {props.hasMore ? ' · 仅显示当前分页' : ''}
      </div>

      {!props.apiAvailable ? (
        <div
          className="callout calloutWarn"
          data-testid="notes-list-error"
          style={{ marginTop: 10 }}
        >
          Notes API 不可用（preload 未注入）
        </div>
      ) : null}

      {props.error ? (
        <div
          className="callout calloutWarn"
          data-testid="notes-list-error"
          style={{ marginTop: 10 }}
        >
          {props.error}
        </div>
      ) : null}

      {props.actionError ? (
        <div
          className="callout calloutWarn"
          data-testid="notes-list-action-error"
          style={{ marginTop: 10 }}
        >
          {props.actionError}
        </div>
      ) : null}

      <div
        className="notesVirtualViewport"
        data-testid="notes-virtual-viewport"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="notesVirtualSpacer" style={{ height: `${Math.max(totalHeight, 1)}px` }}>
          <div className="notesVirtualInner" style={{ transform: `translateY(${offsetY}px)` }}>
            {renderedItems.map((item) => {
              const key = `${item.provider}-${item.id}`;
              const deleteBusyKey = `delete:${key}`;
              const restoreBusyKey = `restore:${key}`;
              const hardDeleteBusyKey = `hardDelete:${key}`;
              const hardDeleting = props.pendingHardDeleteKey === key;

              return (
                <div
                  key={key}
                  className="listRow notesListRow"
                  data-testid="notes-virtual-row"
                  style={{ minHeight: NOTES_VIRTUAL_ROW_HEIGHT - 12, cursor: 'default' }}
                >
                  <div className="listRowTitle" data-testid={`notes-item-${key}`}>
                    {item.title}
                  </div>
                  <div className="listRowSub">{item.preview || '（无预览）'}</div>
                  <div className="notesItemMeta">
                    <span data-testid={`notes-item-provider-${key}`}>
                      provider：{item.provider}
                    </span>
                    <span data-testid={`notes-item-sync-status-${key}`}>
                      syncStatus：{formatNotesSyncStatus(item.syncStatus)}
                    </span>
                    <span>更新时间：{formatNotesUpdatedAt(item.updatedAtMs)}</span>
                  </div>

                  {props.scope === 'trash' ? (
                    <div className="btnRow" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`notes-item-restore-${key}`}
                        onClick={() => props.onRestore(item)}
                        disabled={
                          !props.apiAvailable ||
                          props.loading ||
                          props.actionBusyKey === restoreBusyKey ||
                          props.actionBusyKey === hardDeleteBusyKey
                        }
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`notes-item-hard-delete-${key}`}
                        onClick={() => props.onPrepareHardDelete(item)}
                        disabled={
                          !props.apiAvailable ||
                          props.loading ||
                          props.actionBusyKey === restoreBusyKey ||
                          props.actionBusyKey === hardDeleteBusyKey
                        }
                      >
                        彻底删除
                      </button>
                    </div>
                  ) : (
                    <div className="btnRow" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`notes-item-delete-${key}`}
                        onClick={() => props.onDelete(item)}
                        disabled={
                          !props.apiAvailable ||
                          props.loading ||
                          props.actionBusyKey === deleteBusyKey
                        }
                      >
                        删除
                      </button>
                    </div>
                  )}

                  {hardDeleting ? (
                    <div
                      className="callout calloutWarn"
                      data-testid={`notes-item-hard-delete-panel-${key}`}
                      style={{ marginTop: 8 }}
                    >
                      <div>确认彻底删除？该操作不可恢复。</div>
                      <div className="btnRow" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btnSmall"
                          data-testid={`notes-item-hard-delete-confirm-${key}`}
                          onClick={() => props.onConfirmHardDelete(item)}
                          disabled={
                            !props.apiAvailable || props.actionBusyKey === hardDeleteBusyKey
                          }
                        >
                          确认彻底删除
                        </button>
                        <button
                          type="button"
                          className="btnSmall"
                          data-testid={`notes-item-hard-delete-cancel-${key}`}
                          onClick={() => props.onCancelHardDelete()}
                          disabled={props.actionBusyKey === hardDeleteBusyKey}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!props.loading && props.items.length === 0 ? (
        <div className="fine" data-testid="notes-list-empty" style={{ marginTop: 10 }}>
          当前范围暂无条目。
        </div>
      ) : null}
    </div>
  );
}

const TODO_LIST_PAGE_SIZE = 200;

function TodoCenter() {
  const api = getXinliuTodoApi();
  const apiAvailable = Boolean(api);

  const [scope, setScope] = useState<TodoScope>('active');
  const [items, setItems] = useState<TodoListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [pendingHardDeleteId, setPendingHardDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const selectedIds = useMemo(() => Array.from(selected.values()), [selected]);
  const bulkVisible = selectedIds.length > 0 && scope !== 'trash';

  const refresh = useCallback(async () => {
    if (!api || typeof api.listItems !== 'function') {
      setError('Todo API 不可用（preload 未注入）');
      setItems([]);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.listItems({ scope, limit: TODO_LIST_PAGE_SIZE, offset: 0 });
      if (!res.ok) {
        setError(`${res.error.message}（${res.error.code}）`);
        setItems([]);
        setHasMore(false);
        return;
      }
      setItems(res.value.items);
      setHasMore(res.value.hasMore);
    } catch (e) {
      setError(`Todo 加载异常：${String(e)}`);
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [api, scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (key: string, run: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
      setActionBusyKey(key);
      setActionError(null);
      try {
        const result = await run();
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        setActionError(null);
        await refresh();
      } finally {
        setActionBusyKey(null);
      }
    },
    [refresh]
  );

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  return (
    <div className="contentPlaceholder" data-testid="todo-center">
      <div className="contentHero">
        <div className="contentHeroTitle">Todo</div>
        <div className="contentHeroSub">
          任务列表 / 已完成 / 回收站；所有读写仅通过 Todo IPC（renderer 不直连 DB）
        </div>
      </div>

      <div className="notesScopeRow" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`scopeBtn ${scope === 'active' ? 'scopeBtnActive' : ''}`}
          data-testid="todo-scope-active"
          onClick={() => {
            setScope('active');
            setPendingHardDeleteId(null);
            setActionError(null);
            setSelected(new Set());
          }}
          disabled={loading}
        >
          未完成
        </button>
        <button
          type="button"
          className={`scopeBtn ${scope === 'completed' ? 'scopeBtnActive' : ''}`}
          data-testid="todo-scope-completed"
          onClick={() => {
            setScope('completed');
            setPendingHardDeleteId(null);
            setActionError(null);
            setSelected(new Set());
          }}
          disabled={loading}
        >
          已完成
        </button>
        <button
          type="button"
          className={`scopeBtn ${scope === 'trash' ? 'scopeBtnActive' : ''}`}
          data-testid="todo-scope-trash"
          onClick={() => {
            setScope('trash');
            setPendingHardDeleteId(null);
            setActionError(null);
            setSelected(new Set());
          }}
          disabled={loading}
        >
          回收站
        </button>

        <button
          type="button"
          className="btnSmall"
          onClick={() => void refresh()}
          disabled={loading || !apiAvailable}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="fine" style={{ marginTop: 8 }}>
        当前范围：{scope} · 条目：{items.length}
        {hasMore ? ' · 仅显示当前分页' : ''}
      </div>

      {!apiAvailable ? (
        <div className="callout calloutWarn" style={{ marginTop: 10 }}>
          Todo API 不可用（preload 未注入）
        </div>
      ) : null}

      {error ? (
        <div className="callout calloutWarn" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}

      {actionError ? (
        <div className="callout calloutWarn" style={{ marginTop: 10 }}>
          {actionError}
        </div>
      ) : null}

      {bulkVisible ? (
        <div className="callout" data-testid="todo-bulk-bar" style={{ marginTop: 10 }}>
          已选择 {selectedIds.length} 项。
          <div className="calloutActions">
            <button
              type="button"
              className="btnSmall"
              data-testid="todo-bulk-complete"
              disabled={!apiAvailable || loading || actionBusyKey !== null}
              onClick={() => {
                const fn = api?.bulkComplete;
                if (typeof fn !== 'function') {
                  setActionError('Todo API 不可用（preload 未注入）');
                  return;
                }
                void runAction('bulkComplete', async () => {
                  try {
                    const res = await fn({ ids: selectedIds });
                    if (!res.ok) {
                      return {
                        ok: false as const,
                        message: `${res.error.message}（${res.error.code}）`,
                      };
                    }
                    setSelected(new Set());
                    return { ok: true as const };
                  } catch (e) {
                    return { ok: false as const, message: `批量完成异常：${String(e)}` };
                  }
                });
              }}
            >
              批量完成
            </button>
            <button
              type="button"
              className="btnSmall"
              data-testid="todo-bulk-delete"
              disabled={!apiAvailable || loading || actionBusyKey !== null}
              onClick={() => {
                const fn = api?.bulkDelete;
                if (typeof fn !== 'function') {
                  setActionError('Todo API 不可用（preload 未注入）');
                  return;
                }
                void runAction('bulkDelete', async () => {
                  try {
                    const res = await fn({ ids: selectedIds });
                    if (!res.ok) {
                      return {
                        ok: false as const,
                        message: `${res.error.message}（${res.error.code}）`,
                      };
                    }
                    setSelected(new Set());
                    return { ok: true as const };
                  } catch (e) {
                    return { ok: false as const, message: `批量删除异常：${String(e)}` };
                  }
                });
              }}
            >
              批量删除
            </button>
          </div>
        </div>
      ) : null}

      <div className="contentList" style={{ marginTop: 12 }}>
        <div className="contentListTitle">任务列表</div>
        <div className="contentListBody">
          {items.map((item) => {
            const toggling = actionBusyKey === `toggle:${item.id}`;
            const deleting = actionBusyKey === `delete:${item.id}`;
            const restoring = actionBusyKey === `restore:${item.id}`;
            const hardDeleting = actionBusyKey === `hardDelete:${item.id}`;
            const confirmVisible = pendingHardDeleteId === item.id;

            return (
              <div key={item.id} className="listRow" data-testid={`todo-item-${item.id}`}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    data-testid={`todo-select-${item.id}`}
                    checked={selected.has(item.id)}
                    disabled={
                      !apiAvailable || scope === 'trash' || loading || actionBusyKey !== null
                    }
                    onChange={(e) => toggleSelected(item.id, e.currentTarget.checked)}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="listRowTitle">{item.title || '（未命名）'}</div>
                    <div className="listRowSub">
                      {item.note?.trim().length ? item.note : '（无备注）'}
                    </div>
                    <div className="fine" style={{ marginTop: 6 }}>
                      {item.completed ? '已完成' : '未完成'} · updatedAt: {item.updatedAt}
                      {item.deletedAt ? ` · deletedAt: ${item.deletedAt}` : ''}
                    </div>
                  </div>
                </div>

                {scope !== 'trash' ? (
                  <div className="btnRow" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btnSmall"
                      data-testid={`todo-item-toggle-${item.id}`}
                      disabled={!apiAvailable || loading || toggling || deleting}
                      onClick={() => {
                        const fn = api?.toggleComplete;
                        if (typeof fn !== 'function') {
                          setActionError('Todo API 不可用（preload 未注入）');
                          return;
                        }
                        void runAction(`toggle:${item.id}`, async () => {
                          try {
                            const res = await fn({ id: item.id });
                            if (!res.ok) {
                              return {
                                ok: false as const,
                                message: `${res.error.message}（${res.error.code}）`,
                              };
                            }
                            return { ok: true as const };
                          } catch (e) {
                            return { ok: false as const, message: `切换完成异常：${String(e)}` };
                          }
                        });
                      }}
                    >
                      {item.completed ? '取消完成' : '完成'}
                    </button>
                    <button
                      type="button"
                      className="btnSmall"
                      data-testid={`todo-item-delete-${item.id}`}
                      disabled={!apiAvailable || loading || deleting || toggling}
                      onClick={() => {
                        const fn = api?.softDelete;
                        if (typeof fn !== 'function') {
                          setActionError('Todo API 不可用（preload 未注入）');
                          return;
                        }
                        void runAction(`delete:${item.id}`, async () => {
                          try {
                            const res = await fn({ id: item.id });
                            if (!res.ok) {
                              return {
                                ok: false as const,
                                message: `${res.error.message}（${res.error.code}）`,
                              };
                            }
                            setSelected((prev) => {
                              const next = new Set(prev);
                              next.delete(item.id);
                              return next;
                            });
                            return { ok: true as const };
                          } catch (e) {
                            return { ok: false as const, message: `删除异常：${String(e)}` };
                          }
                        });
                      }}
                    >
                      删除
                    </button>
                  </div>
                ) : (
                  <div className="btnRow" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btnSmall"
                      data-testid={`todo-item-restore-${item.id}`}
                      disabled={!apiAvailable || loading || restoring || hardDeleting}
                      onClick={() => {
                        const fn = api?.restore;
                        if (typeof fn !== 'function') {
                          setActionError('Todo API 不可用（preload 未注入）');
                          return;
                        }
                        void runAction(`restore:${item.id}`, async () => {
                          try {
                            const res = await fn({ id: item.id });
                            if (!res.ok) {
                              return {
                                ok: false as const,
                                message: `${res.error.message}（${res.error.code}）`,
                              };
                            }
                            return { ok: true as const };
                          } catch (e) {
                            return { ok: false as const, message: `恢复异常：${String(e)}` };
                          }
                        });
                      }}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="btnSmall"
                      data-testid={`todo-item-hard-delete-${item.id}`}
                      disabled={!apiAvailable || loading || restoring || hardDeleting}
                      onClick={() => setPendingHardDeleteId(item.id)}
                    >
                      彻底删除
                    </button>
                  </div>
                )}

                {scope === 'trash' && confirmVisible ? (
                  <div
                    className="callout calloutWarn"
                    data-testid={`todo-item-hard-delete-panel-${item.id}`}
                    style={{ marginTop: 10 }}
                  >
                    <div>确认彻底删除？该操作不可恢复。</div>
                    <div className="btnRow" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`todo-item-hard-delete-confirm-${item.id}`}
                        disabled={!apiAvailable || loading || hardDeleting}
                        onClick={() => {
                          const fn = api?.hardDelete;
                          if (typeof fn !== 'function') {
                            setActionError('Todo API 不可用（preload 未注入）');
                            return;
                          }
                          void runAction(`hardDelete:${item.id}`, async () => {
                            try {
                              const res = await fn({ id: item.id });
                              if (!res.ok) {
                                return {
                                  ok: false as const,
                                  message: `${res.error.message}（${res.error.code}）`,
                                };
                              }
                              setPendingHardDeleteId(null);
                              return { ok: true as const };
                            } catch (e) {
                              return { ok: false as const, message: `彻底删除异常：${String(e)}` };
                            }
                          });
                        }}
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`todo-item-hard-delete-cancel-${item.id}`}
                        disabled={hardDeleting}
                        onClick={() => setPendingHardDeleteId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {!loading && items.length === 0 ? <div className="fine">当前范围暂无条目。</div> : null}
        </div>
      </div>
    </div>
  );
}

function ConflictsCenter(props: {
  apiAvailable: boolean;
  loading: boolean;
  flowItems: FlowConflictItem[];
  notesItems: NotesConflictItem[];
  error: string | null;
  actionError: string | null;
  actionBusyKey: string | null;
  pendingForceOutboxId: string | null;
  notesCompareLocalUuid: string | null;
  onRefresh: () => void;
  onApplyServer: (outboxId: string) => void;
  onKeepLocalCopy: (outboxId: string) => void;
  onPrepareForceOverwrite: (outboxId: string) => void;
  onCancelForceOverwrite: () => void;
  onConfirmForceOverwrite: (outboxId: string) => void;
  onToggleNotesCompare: (localUuid: string) => void;
  onCopyNotes: (content: string) => void;
}) {
  const formatMs = (ms: number) => {
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return String(ms);
    }
  };
  const firstNotesConflictLocalUuid = props.notesItems[0]?.localUuid ?? null;

  return (
    <div className="contentPlaceholder" data-testid="conflicts-center">
      <div className="contentHero">
        <div className="contentHeroTitle">冲突中心</div>
        <div className="contentHeroSub">聚合 Flow rejected/server snapshot 与 Notes 冲突副本</div>
      </div>

      <div className="btnRow" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn"
          data-testid="conflicts-refresh"
          onClick={() => props.onRefresh()}
          disabled={props.loading || !props.apiAvailable}
        >
          {props.loading ? '刷新中…' : '刷新冲突'}
        </button>
        <div className="fine">
          Flow：{props.flowItems.length} 条 · Notes：{props.notesItems.length} 条
        </div>
      </div>

      {!props.apiAvailable ? (
        <div className="callout calloutWarn">冲突中心 API 不可用（preload 未注入）</div>
      ) : null}

      {props.error ? (
        <div className="callout calloutWarn" data-testid="conflicts-error">
          {props.error}
        </div>
      ) : null}

      {props.actionError ? (
        <div className="callout calloutWarn" data-testid="conflicts-action-error">
          {props.actionError}
        </div>
      ) : null}

      <div className="contentGrid">
        <div className="contentCard" data-testid="conflicts-flow-list">
          <div className="contentCardTitle">Flow 冲突（REJECTED_CONFLICT）</div>
          <div className="contentCardBody">
            {props.flowItems.length === 0 ? (
              <div className="fine">暂无 Flow 冲突。</div>
            ) : (
              props.flowItems.map((item) => {
                const applyKey = `apply_server:${item.outboxId}`;
                const keepKey = `keep_local_copy:${item.outboxId}`;
                const forceKey = `force_overwrite:${item.outboxId}`;
                return (
                  <div
                    key={item.outboxId}
                    className="listRow"
                    data-testid={`conflicts-flow-item-${item.outboxId}`}
                    style={{ cursor: 'default' }}
                  >
                    <div className="listRowTitle">
                      {item.resource} · {item.op} · {item.entityId}
                    </div>
                    <div className="listRowSub">outboxId: {item.outboxId}</div>
                    <div className="listRowSub">updatedAt: {formatMs(item.updatedAtMs)}</div>
                    <div className="listRowSub">requestId: {item.requestId ?? '-'}</div>
                    <div className="fine" style={{ marginTop: 6 }}>
                      server snapshot：
                      {item.serverSnapshot ? JSON.stringify(item.serverSnapshot) : '无'}
                    </div>

                    <div className="btnRow" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`conflicts-flow-apply-server-${item.outboxId}`}
                        onClick={() => props.onApplyServer(item.outboxId)}
                        disabled={
                          !props.apiAvailable || props.loading || props.actionBusyKey === applyKey
                        }
                      >
                        应用服务端版本
                      </button>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`conflicts-flow-keep-local-${item.outboxId}`}
                        onClick={() => props.onKeepLocalCopy(item.outboxId)}
                        disabled={
                          !props.apiAvailable || props.loading || props.actionBusyKey === keepKey
                        }
                      >
                        保留本地副本
                      </button>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`conflicts-flow-force-overwrite-${item.outboxId}`}
                        onClick={() => props.onPrepareForceOverwrite(item.outboxId)}
                        disabled={
                          !props.apiAvailable || props.loading || props.actionBusyKey === forceKey
                        }
                      >
                        强制覆盖
                      </button>
                    </div>

                    {props.pendingForceOutboxId === item.outboxId ? (
                      <div
                        className="callout calloutWarn"
                        data-testid={`conflicts-flow-force-confirm-panel-${item.outboxId}`}
                        style={{ marginTop: 8 }}
                      >
                        <div>确认强制覆盖？这会基于本地版本强制推进 client_updated_at_ms。</div>
                        <div className="btnRow" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btnSmall"
                            data-testid={`conflicts-flow-force-confirm-${item.outboxId}`}
                            onClick={() => props.onConfirmForceOverwrite(item.outboxId)}
                            disabled={
                              !props.apiAvailable ||
                              props.loading ||
                              props.actionBusyKey === forceKey
                            }
                          >
                            确认强制覆盖
                          </button>
                          <button
                            type="button"
                            className="btnSmall"
                            data-testid={`conflicts-flow-force-cancel-${item.outboxId}`}
                            onClick={() => props.onCancelForceOverwrite()}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="contentCard" data-testid="conflicts-notes-list">
          <div
            className="contentCardTitle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>Notes 冲突副本（copy vs original）</span>
            <button
              type="button"
              className="btnSmall"
              data-testid="conflict-compare"
              disabled={!firstNotesConflictLocalUuid}
              onClick={() => {
                if (!firstNotesConflictLocalUuid) {
                  return;
                }
                props.onToggleNotesCompare(firstNotesConflictLocalUuid);
              }}
            >
              对比首条
            </button>
          </div>
          <div className="contentCardBody">
            {props.notesItems.length === 0 ? (
              <div className="fine">暂无 Notes 冲突副本。</div>
            ) : (
              props.notesItems.map((item) => {
                const expanded = props.notesCompareLocalUuid === item.localUuid;
                return (
                  <div
                    key={item.localUuid}
                    className="listRow"
                    data-testid={`conflicts-notes-item-${item.localUuid}`}
                    style={{ cursor: 'default' }}
                  >
                    <div className="listRowTitle">copy: {item.localUuid}</div>
                    <div className="listRowSub">original: {item.originalLocalUuid}</div>
                    <div className="listRowSub">updatedAt: {formatMs(item.updatedAtMs)}</div>
                    <div className="listRowSub">requestId: {item.conflictRequestId ?? '-'}</div>

                    <div className="btnRow" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`conflicts-notes-compare-${item.localUuid}`}
                        onClick={() => props.onToggleNotesCompare(item.localUuid)}
                      >
                        {expanded ? '收起对比' : '对比'}
                      </button>
                      <button
                        type="button"
                        className="btnSmall"
                        data-testid={`conflicts-notes-copy-${item.localUuid}`}
                        onClick={() => props.onCopyNotes(item.copyContent)}
                      >
                        复制副本
                      </button>
                    </div>

                    {expanded ? (
                      <div
                        className="callout"
                        data-testid={`conflicts-notes-compare-panel-${item.localUuid}`}
                        style={{ marginTop: 8 }}
                      >
                        <div className="fine">原文</div>
                        <pre className="codeLike" style={{ whiteSpace: 'pre-wrap' }}>
                          {item.originalContent ?? '（原文不存在或已删除）'}
                        </pre>
                        <div className="fine" style={{ marginTop: 6 }}>
                          副本
                        </div>
                        <pre className="codeLike" style={{ whiteSpace: 'pre-wrap' }}>
                          {item.copyContent}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MainWindowApp() {
  const [route, setRoute] = useState<RouteKey>('notes');
  const routeMeta = useMemo(() => ROUTES.find((r) => r.key === route)!, [route]);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportLastFormat, setExportLastFormat] = useState<'text' | 'markdown'>('text');

  const [lastContextMenuSelection, setLastContextMenuSelection] =
    useState<ContextMenuDidSelectPayload | null>(null);

  const [shortcutsStatus, setShortcutsStatus] = useState<ShortcutsStatus | null>(null);
  const [shortcutsError, setShortcutsError] = useState<string | null>(null);
  const [shortcutsDraft, setShortcutsDraft] = useState<
    Record<string, { accelerator: string; enabled: boolean }>
  >({});

  const [storageRootStatus, setStorageRootStatus] = useState<StorageRootStatus | null>(null);
  const [storageRootError, setStorageRootError] = useState<string | null>(null);
  const [storageRootRestartRequired, setStorageRootRestartRequired] = useState(false);
  const [storageRootLastMigration, setStorageRootLastMigration] = useState<
    (StorageRootChooseAndMigrateResult & { kind: 'migrated' }) | null
  >(null);

  const [closeBehaviorStatus, setCloseBehaviorStatus] = useState<CloseBehaviorStatus | null>(null);
  const [closeBehaviorError, setCloseBehaviorError] = useState<string | null>(null);

  const [diagnosticsStatus, setDiagnosticsStatus] = useState<DiagnosticsStatus | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const [updaterError, setUpdaterError] = useState<string | null>(null);
  const [syncStatusSnapshot, setSyncStatusSnapshot] = useState<SyncStatus | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(false);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);
  const [syncActionError, setSyncActionError] = useState<string | null>(null);
  const [syncBusyLane, setSyncBusyLane] = useState<'flow' | 'memos' | null>(null);

  const [notesScope, setNotesScope] = useState<NotesScope>('timeline');
  const [notesItems, setNotesItems] = useState<NotesListItem[]>([]);
  const [notesHasMore, setNotesHasMore] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesActionError, setNotesActionError] = useState<string | null>(null);
  const [notesActionBusyKey, setNotesActionBusyKey] = useState<string | null>(null);
  const [notesPendingHardDeleteKey, setNotesPendingHardDeleteKey] = useState<string | null>(null);

  const [flowConflicts, setFlowConflicts] = useState<FlowConflictItem[]>([]);
  const [notesConflicts, setNotesConflicts] = useState<NotesConflictItem[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [conflictsActionError, setConflictsActionError] = useState<string | null>(null);
  const [conflictsActionBusyKey, setConflictsActionBusyKey] = useState<string | null>(null);
  const [conflictsPendingForceOutboxId, setConflictsPendingForceOutboxId] = useState<string | null>(
    null
  );
  const [notesCompareLocalUuid, setNotesCompareLocalUuid] = useState<string | null>(null);

  const [collectionsItemsById, setCollectionsItemsById] = useState<
    Record<string, CollectionsTreeItem>
  >({});
  const [collectionsChildIdsByParent, setCollectionsChildIdsByParent] = useState<
    Record<string, string[]>
  >({ [COLLECTIONS_ROOT_KEY]: [] });
  const [collectionsLoadedParent, setCollectionsLoadedParent] = useState<Record<string, boolean>>(
    {}
  );
  const [collectionsLoadingParent, setCollectionsLoadingParent] = useState<Record<string, boolean>>(
    {}
  );
  const [collectionsTreeError, setCollectionsTreeError] = useState<string | null>(null);
  const [collectionsExpanded, setCollectionsExpanded] = useState<Record<string, boolean>>({});
  const [collectionsSelectedNodeId, setCollectionsSelectedNodeId] = useState<string | null>(null);

  const [collectionsMiddleParentId, setCollectionsMiddleParentId] = useState<string | null>(null);
  const [collectionsMiddleItems, setCollectionsMiddleItems] = useState<CollectionsTreeItem[]>([]);
  const [collectionsMiddleHasMore, setCollectionsMiddleHasMore] = useState(false);
  const [collectionsMiddleLoading, setCollectionsMiddleLoading] = useState(false);
  const [collectionsMiddleError, setCollectionsMiddleError] = useState<string | null>(null);
  const [collectionsDraggingItemId, setCollectionsDraggingItemId] = useState<string | null>(null);
  const [collectionsDragOverFolderId, setCollectionsDragOverFolderId] = useState<string | null>(
    null
  );
  const [collectionsMouseDragCandidate, setCollectionsMouseDragCandidate] =
    useState<CollectionsMouseDragCandidate | null>(null);
  const [collectionsUndoNotice, setCollectionsUndoNotice] =
    useState<CollectionsMoveUndoNotice | null>(null);
  const [collectionsUndoBusy, setCollectionsUndoBusy] = useState(false);

  const folderTreeViewportRef = useRef<HTMLDivElement | null>(null);
  const hoverExpandTimerRef = useRef<number | null>(null);
  const collectionsUndoTimerRef = useRef<number | null>(null);
  const collectionsRootInitRef = useRef(false);

  useEffect(() => {
    const api = getXinliuContextMenuApi();
    const off = api?.onCommand?.((payload) => {
      setLastContextMenuSelection(payload);
    });
    return () => {
      off?.();
    };
  }, []);

  useEffect(() => {
    const api = getXinliuUpdaterApi();
    const off = api?.onStatusChanged?.((status) => {
      setUpdaterStatus(status);
      setUpdaterError(null);
    });
    return () => {
      off?.();
    };
  }, []);

  const queryCollectionsPage = useCallback(async (parentId: string | null) => {
    const api = getXinliuCollectionsApi();
    if (!api) {
      return {
        ok: false as const,
        error: 'Collections API 不可用（preload 未注入）',
      };
    }

    const pagePayload = { limit: COLLECTIONS_PAGE_SIZE, offset: 0 };
    try {
      const res =
        parentId === null
          ? await api.listRoots(pagePayload)
          : await api.listChildren({ parentId, ...pagePayload });
      if (!res.ok) {
        return {
          ok: false as const,
          error: `${res.error.message}（${res.error.code}）`,
        };
      }
      return { ok: true as const, value: res.value };
    } catch (error) {
      return {
        ok: false as const,
        error: `Collections 加载异常：${String(error)}`,
      };
    }
  }, []);

  const mergeCollectionsItems = useCallback((items: CollectionsTreeItem[]) => {
    setCollectionsItemsById((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[item.id] = item;
      }
      return next;
    });
  }, []);

  const loadCollectionsTreeBranch = useCallback(
    async (parentId: string | null, options?: { force?: boolean }) => {
      const parentKey = parentId ?? COLLECTIONS_ROOT_KEY;
      if (!options?.force && collectionsLoadedParent[parentKey]) {
        return;
      }

      setCollectionsLoadingParent((prev) => ({ ...prev, [parentKey]: true }));
      const result = await queryCollectionsPage(parentId);
      setCollectionsLoadingParent((prev) => ({ ...prev, [parentKey]: false }));

      if (!result.ok) {
        setCollectionsTreeError(result.error);
        return;
      }

      setCollectionsTreeError(null);
      mergeCollectionsItems(result.value.items);
      setCollectionsChildIdsByParent((prev) => ({
        ...prev,
        [parentKey]: result.value.items.map((item) => item.id),
      }));
      setCollectionsLoadedParent((prev) => ({ ...prev, [parentKey]: true }));
    },
    [collectionsLoadedParent, mergeCollectionsItems, queryCollectionsPage]
  );

  const loadCollectionsMiddle = useCallback(
    async (parentId: string | null) => {
      setCollectionsMiddleLoading(true);
      const result = await queryCollectionsPage(parentId);
      setCollectionsMiddleLoading(false);

      if (!result.ok) {
        setCollectionsMiddleItems([]);
        setCollectionsMiddleHasMore(false);
        setCollectionsMiddleError(result.error);
        return;
      }

      const parentKey = parentId ?? COLLECTIONS_ROOT_KEY;
      setCollectionsMiddleError(null);
      setCollectionsMiddleItems(result.value.items);
      setCollectionsMiddleHasMore(result.value.hasMore);

      mergeCollectionsItems(result.value.items);
      setCollectionsChildIdsByParent((prev) => ({
        ...prev,
        [parentKey]: result.value.items.map((item) => item.id),
      }));
      setCollectionsLoadedParent((prev) => ({ ...prev, [parentKey]: true }));
    },
    [mergeCollectionsItems, queryCollectionsPage]
  );

  const clearHoverExpandTimer = useCallback(() => {
    if (hoverExpandTimerRef.current !== null) {
      window.clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
  }, []);

  const expandFolderNode = useCallback(
    async (folderId: string) => {
      const node = collectionsItemsById[folderId];
      if (!node || node.itemType !== 'folder') {
        return;
      }
      await loadCollectionsTreeBranch(folderId);
      setCollectionsExpanded((prev) => ({ ...prev, [folderId]: true }));
    },
    [collectionsItemsById, loadCollectionsTreeBranch]
  );

  const toggleFolderNode = useCallback(
    async (folderId: string) => {
      const expanded = Boolean(collectionsExpanded[folderId]);
      if (expanded) {
        setCollectionsExpanded((prev) => ({ ...prev, [folderId]: false }));
        return;
      }
      await expandFolderNode(folderId);
    },
    [collectionsExpanded, expandFolderNode]
  );

  const scheduleHoverExpand = useCallback(
    (item: CollectionsTreeItem) => {
      if (item.itemType !== 'folder') {
        return;
      }
      if (collectionsExpanded[item.id]) {
        return;
      }
      clearHoverExpandTimer();
      hoverExpandTimerRef.current = window.setTimeout(() => {
        hoverExpandTimerRef.current = null;
        void expandFolderNode(item.id);
      }, HOVER_EXPAND_DELAY_MS);
    },
    [clearHoverExpandTimer, collectionsExpanded, expandFolderNode]
  );

  const selectCollectionsRoot = useCallback(() => {
    setCollectionsSelectedNodeId(null);
    setCollectionsMiddleParentId(null);
    setRoute('collections');
  }, []);

  const onCollectionNodeClick = useCallback(
    (item: CollectionsTreeItem) => {
      setCollectionsSelectedNodeId(item.id);
      setCollectionsMiddleParentId(item.id);
      setRoute('collections');
      if (item.itemType === 'folder') {
        void expandFolderNode(item.id);
      }
    },
    [expandFolderNode]
  );

  const clearCollectionsUndoTimer = useCallback(() => {
    if (collectionsUndoTimerRef.current !== null) {
      window.clearTimeout(collectionsUndoTimerRef.current);
      collectionsUndoTimerRef.current = null;
    }
  }, []);

  const pushCollectionsUndoNotice = useCallback(
    (notice: CollectionsMoveUndoNotice) => {
      clearCollectionsUndoTimer();
      setCollectionsUndoNotice(notice);
      setCollectionsUndoBusy(false);
      collectionsUndoTimerRef.current = window.setTimeout(() => {
        collectionsUndoTimerRef.current = null;
        setCollectionsUndoNotice(null);
      }, DRAG_UNDO_DURATION_MS);
    },
    [clearCollectionsUndoTimer]
  );

  const isCollectionsDescendant = useCallback(
    (ancestorId: string, nodeId: string) => {
      let cursor: string | null = nodeId;
      const visited = new Set<string>();
      while (cursor) {
        if (cursor === ancestorId) {
          return true;
        }
        if (visited.has(cursor)) {
          break;
        }
        visited.add(cursor);
        cursor = collectionsItemsById[cursor]?.parentId ?? null;
      }
      return false;
    },
    [collectionsItemsById]
  );

  const getCollectionsMoveBlockedReason = useCallback(
    (itemId: string, newParentId: string | null): string | null => {
      const item = collectionsItemsById[itemId];
      if (!item) {
        return '被拖拽条目不存在';
      }
      if (newParentId !== null) {
        const parent = collectionsItemsById[newParentId];
        if (!parent || parent.itemType !== 'folder') {
          return '仅支持拖入 folder 节点';
        }
      }
      if (item.id === newParentId) {
        return '不能拖入自身';
      }
      if (
        item.itemType === 'folder' &&
        newParentId &&
        isCollectionsDescendant(item.id, newParentId)
      ) {
        return '不能拖入自己的子孙节点';
      }
      return null;
    },
    [collectionsItemsById, isCollectionsDescendant]
  );

  const applyCollectionsMoveLocally = useCallback(
    (itemId: string, newParentId: string | null) => {
      const existing = collectionsItemsById[itemId];
      if (!existing) {
        return null;
      }
      const previousParentId = existing.parentId;
      if (previousParentId === newParentId) {
        return {
          changed: false,
          previousParentId,
          previousItem: existing,
        };
      }

      const nextItem: CollectionsTreeItem = {
        ...existing,
        parentId: newParentId,
      };

      setCollectionsItemsById((prev) => ({
        ...prev,
        [itemId]: nextItem,
      }));

      setCollectionsChildIdsByParent((prev) => {
        const previousParentKey = previousParentId ?? COLLECTIONS_ROOT_KEY;
        const nextParentKey = newParentId ?? COLLECTIONS_ROOT_KEY;
        const next = { ...prev };
        if (next[previousParentKey]) {
          next[previousParentKey] = next[previousParentKey].filter((id) => id !== itemId);
        }
        if (next[nextParentKey]) {
          const without = next[nextParentKey].filter((id) => id !== itemId);
          next[nextParentKey] = [...without, itemId];
        }
        return next;
      });

      setCollectionsMiddleItems((prev) => {
        const without = prev.filter((item) => item.id !== itemId);
        if (collectionsMiddleParentId === newParentId) {
          return [...without, nextItem].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
          );
        }
        return without;
      });

      return {
        changed: true,
        previousParentId,
        previousItem: existing,
      };
    },
    [collectionsItemsById, collectionsMiddleParentId]
  );

  const runCollectionsMove = useCallback(
    async (args: { itemId: string; newParentId: string | null; allowUndo: boolean }) => {
      const blockedReason = getCollectionsMoveBlockedReason(args.itemId, args.newParentId);
      if (blockedReason) {
        setCollectionsMiddleError(`移动失败：${blockedReason}`);
        return false;
      }

      const optimistic = applyCollectionsMoveLocally(args.itemId, args.newParentId);
      if (!optimistic) {
        setCollectionsMiddleError('移动失败：找不到该条目');
        return false;
      }

      if (!optimistic.changed) {
        return true;
      }

      const api = getXinliuCollectionsApi();
      const move = api?.move;
      if (typeof move !== 'function') {
        applyCollectionsMoveLocally(args.itemId, optimistic.previousParentId);
        setCollectionsMiddleError('移动失败：Collections move API 不可用（preload 未注入）');
        return false;
      }

      try {
        const result = await move({ itemId: args.itemId, newParentId: args.newParentId });
        if (!result.ok) {
          applyCollectionsMoveLocally(args.itemId, optimistic.previousParentId);
          setCollectionsMiddleError(`${result.error.message}（${result.error.code}）`);
          return false;
        }

        setCollectionsMiddleError(null);
        if (args.allowUndo) {
          pushCollectionsUndoNotice({
            itemId: args.itemId,
            itemName: optimistic.previousItem.name || '（未命名）',
            fromParentId: optimistic.previousParentId,
            toParentId: args.newParentId,
          });
        }
        return true;
      } catch (error) {
        applyCollectionsMoveLocally(args.itemId, optimistic.previousParentId);
        setCollectionsMiddleError(`移动异常：${String(error)}`);
        return false;
      }
    },
    [applyCollectionsMoveLocally, getCollectionsMoveBlockedReason, pushCollectionsUndoNotice]
  );

  const undoCollectionsMove = useCallback(async () => {
    if (!collectionsUndoNotice) {
      return;
    }
    setCollectionsUndoBusy(true);
    const ok = await runCollectionsMove({
      itemId: collectionsUndoNotice.itemId,
      newParentId: collectionsUndoNotice.fromParentId,
      allowUndo: false,
    });
    setCollectionsUndoBusy(false);
    if (ok) {
      clearCollectionsUndoTimer();
      setCollectionsUndoNotice(null);
    }
  }, [clearCollectionsUndoTimer, collectionsUndoNotice, runCollectionsMove]);

  const onCollectionsMiddleItemMouseDragStart = useCallback(
    (args: { itemId: string; clientX: number; clientY: number }) => {
      setCollectionsMouseDragCandidate({
        itemId: args.itemId,
        startX: args.clientX,
        startY: args.clientY,
      });
    },
    []
  );

  const handleFolderTreeEdgeScrollByClientY = useCallback((clientY: number | null) => {
    const container = folderTreeViewportRef.current;
    if (!container || clientY === null) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top;
    if (y < TREE_EDGE_SCROLL_THRESHOLD_PX) {
      container.scrollTop -= TREE_EDGE_SCROLL_STEP_PX;
      return;
    }
    if (y > rect.height - TREE_EDGE_SCROLL_THRESHOLD_PX) {
      container.scrollTop += TREE_EDGE_SCROLL_STEP_PX;
    }
  }, []);

  const dndSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const handleCollectionsDragStart = useCallback((event: DragStartEvent) => {
    setCollectionsMouseDragCandidate(null);
    setCollectionsDraggingItemId(parseMiddleListItemIdFromDnd(event.active.id));
    setCollectionsDragOverFolderId(null);
  }, []);

  const handleCollectionsDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!collectionsDraggingItemId) {
        return;
      }
      const translated = event.active.rect.current.translated;
      const clientY = readPointerClientY(
        event.activatorEvent,
        translated
          ? {
              top: translated.top,
              bottom: translated.bottom,
            }
          : null
      );
      handleFolderTreeEdgeScrollByClientY(clientY);
    },
    [collectionsDraggingItemId, handleFolderTreeEdgeScrollByClientY]
  );

  const handleCollectionsDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!collectionsDraggingItemId) {
        return;
      }
      const folderId = parseFolderNodeIdFromDnd(event.over?.id);
      setCollectionsDragOverFolderId(folderId);
      if (!folderId) {
        clearHoverExpandTimer();
        return;
      }
      const folderItem = collectionsItemsById[folderId];
      if (folderItem?.itemType === 'folder') {
        scheduleHoverExpand(folderItem);
      }
    },
    [clearHoverExpandTimer, collectionsDraggingItemId, collectionsItemsById, scheduleHoverExpand]
  );

  const resetCollectionsDragState = useCallback(() => {
    setCollectionsDraggingItemId(null);
    setCollectionsDragOverFolderId(null);
    setCollectionsMouseDragCandidate(null);
    clearHoverExpandTimer();
  }, [clearHoverExpandTimer]);

  const handleCollectionsDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      resetCollectionsDragState();
    },
    [resetCollectionsDragState]
  );

  const handleCollectionsDragEnd = useCallback(
    (event: DragEndEvent) => {
      const draggedItemId = parseMiddleListItemIdFromDnd(event.active.id);
      const overFolderId = parseFolderNodeIdFromDnd(event.over?.id);
      resetCollectionsDragState();

      if (!draggedItemId || !overFolderId) {
        return;
      }

      void runCollectionsMove({
        itemId: draggedItemId,
        newParentId: overFolderId,
        allowUndo: true,
      });
    },
    [resetCollectionsDragState, runCollectionsMove]
  );

  useEffect(() => {
    if (collectionsRootInitRef.current) {
      return;
    }
    collectionsRootInitRef.current = true;
    void loadCollectionsTreeBranch(null);
  }, [loadCollectionsTreeBranch]);

  useEffect(() => {
    if (route !== 'collections') {
      return;
    }
    void loadCollectionsMiddle(collectionsMiddleParentId);
  }, [collectionsMiddleParentId, loadCollectionsMiddle, route]);

  useEffect(() => {
    return () => {
      clearHoverExpandTimer();
      clearCollectionsUndoTimer();
    };
  }, [clearCollectionsUndoTimer, clearHoverExpandTimer]);

  useEffect(() => {
    const handleWindowMouseUp = (event: MouseEvent) => {
      const candidate = collectionsMouseDragCandidate;
      if (!candidate) {
        return;
      }
      setCollectionsMouseDragCandidate(null);

      const distance = Math.hypot(
        event.clientX - candidate.startX,
        event.clientY - candidate.startY
      );
      if (distance < MOUSE_DRAG_MIN_DISTANCE_PX) {
        return;
      }

      const eventTargetElement = event.target instanceof Element ? event.target : null;
      const hitElement =
        eventTargetElement ?? document.elementFromPoint(event.clientX, event.clientY) ?? null;
      const folderNodeElement = hitElement?.closest<HTMLElement>(
        '[data-testid^="folder-tree-node-"]'
      );
      const folderNodeTestId =
        folderNodeElement?.dataset.testid ?? folderNodeElement?.getAttribute('data-testid');
      const folderId = parseFolderNodeIdFromDnd(folderNodeTestId ?? null);
      if (!folderId) {
        return;
      }

      void runCollectionsMove({
        itemId: candidate.itemId,
        newParentId: folderId,
        allowUndo: true,
      });
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [collectionsMouseDragCandidate, runCollectionsMove]);

  const renderCollectionTreeNodes = (parentId: string | null, depth: number): JSX.Element[] => {
    const parentKey = parentId ?? COLLECTIONS_ROOT_KEY;
    const childIds = collectionsChildIdsByParent[parentKey] ?? [];
    const nodes: JSX.Element[] = [];

    for (const childId of childIds) {
      const item = collectionsItemsById[childId];
      if (!item) {
        continue;
      }

      const isFolder = item.itemType === 'folder';
      const expanded = Boolean(collectionsExpanded[item.id]);
      const childLoading = Boolean(collectionsLoadingParent[item.id]);
      const selected = collectionsSelectedNodeId === item.id;
      const isActiveDropTarget =
        collectionsDraggingItemId !== null && collectionsDragOverFolderId === item.id;
      const blockedReason =
        isActiveDropTarget && collectionsDraggingItemId
          ? getCollectionsMoveBlockedReason(collectionsDraggingItemId, item.id)
          : null;
      const dropState: 'idle' | 'valid' | 'invalid' = isActiveDropTarget
        ? blockedReason
          ? 'invalid'
          : 'valid'
        : 'idle';
      const dropHint = isActiveDropTarget ? (blockedReason ?? '释放后移动到该 folder') : null;

      nodes.push(
        <div key={item.id} className="treeNodeWrap" style={{ marginLeft: depth * 14 }}>
          <CollectionsTreeNodeButton
            item={item}
            selected={selected}
            expanded={expanded}
            childLoading={childLoading}
            dropState={dropState}
            dropHint={dropHint}
            onClick={() => onCollectionNodeClick(item)}
            onMouseEnter={() => scheduleHoverExpand(item)}
            onMouseLeave={() => clearHoverExpandTimer()}
            onToggleFolder={(event) => {
              event.stopPropagation();
              void toggleFolderNode(item.id);
            }}
            onContextMenu={(event) => {
              if (!isFolder) {
                return;
              }
              event.preventDefault();
              void safePopupFolderMenu(item.id);
            }}
          />

          {isFolder && expanded ? renderCollectionTreeNodes(item.id, depth + 1) : null}
        </div>
      );
    }

    return nodes;
  };

  const placeholderMiddleItems = useMemo(() => {
    if (route === 'notes') {
      return [
        { id: 'note_1', title: '示例笔记：今日复盘', sub: '右键：打开 / 移动到 / 删除 / 导出' },
        { id: 'note_2', title: '示例笔记：灵感碎片', sub: '（占位数据，后续接入本地库）' },
      ];
    }
    if (route === 'todo') {
      return [
        { id: 'todo_1', title: '示例任务：实现右键菜单', sub: '右键：打开 / 移动到 / 删除 / 导出' },
      ];
    }
    return [];
  }, [route]);

  const exportItems = useMemo(() => {
    if (route === 'collections') {
      return collectionsMiddleItems.map((item) => ({
        id: item.id,
        title: `[${item.itemType}] ${item.name || '（未命名）'}`,
      }));
    }
    return placeholderMiddleItems.map((item) => ({ id: item.id, title: item.title }));
  }, [collectionsMiddleItems, placeholderMiddleItems, route]);

  const exportPlainText = useMemo(() => {
    const lines: string[] = [];
    lines.push('心流 · 导出（纯文本，占位）');
    lines.push(`路由：${routeMeta.label}（${routeMeta.key}）`);
    lines.push('');
    lines.push('条目（占位）：');
    for (const item of exportItems) {
      lines.push(`- ${item.title}`);
    }
    return `${lines.join('\n')}\n`;
  }, [exportItems, routeMeta.key, routeMeta.label]);

  const exportMarkdown = useMemo(() => {
    const lines: string[] = [];
    lines.push('# 心流导出');
    lines.push('');
    lines.push(`- 路由：${routeMeta.label}（${routeMeta.key}）`);
    lines.push('');
    lines.push('## 条目（占位）');
    for (const item of exportItems) {
      lines.push(`- ${item.title}`);
    }
    return `${lines.join('\n')}\n`;
  }, [exportItems, routeMeta.key, routeMeta.label]);

  const exportContentForCopy = exportLastFormat === 'markdown' ? exportMarkdown : exportPlainText;

  const runExport = useCallback(
    async (format: 'text' | 'markdown') => {
      setExportLastFormat(format);

      const api = getXinliuFileAccessApi();
      const showSaveDialog = api?.showSaveDialog;
      const writeTextFile = api?.writeTextFile;

      if (typeof showSaveDialog !== 'function' || typeof writeTextFile !== 'function') {
        setExportError('导出能力不可用（preload 未注入）');
        return;
      }

      const content = format === 'markdown' ? exportMarkdown : exportPlainText;
      const defaultPath = format === 'markdown' ? 'xinliu-export.md' : 'xinliu-export.txt';
      const filters =
        format === 'markdown'
          ? [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
          : [{ name: 'Text', extensions: ['txt'] }];

      setExportBusy(true);
      setExportError(null);
      try {
        const picked = await showSaveDialog({
          title: format === 'markdown' ? '导出 Markdown' : '导出纯文本',
          defaultPath,
          filters,
        });
        if (!picked.ok) {
          setExportError(`${picked.error.message}（${picked.error.code}）`);
          return;
        }
        if (picked.value.kind === 'cancelled') {
          return;
        }

        const writeRes = await writeTextFile({
          grantId: picked.value.grantId,
          filePath: picked.value.filePath,
          content,
        });
        if (!writeRes.ok) {
          setExportError(`${writeRes.error.message}（${writeRes.error.code}）`);
          return;
        }
      } catch (e) {
        setExportError(`导出异常：${String(e)}`);
      } finally {
        setExportBusy(false);
      }
    },
    [exportMarkdown, exportPlainText]
  );

  const refreshShortcuts = async () => {
    const api = getXinliuShortcutsApi();
    if (!api) {
      setShortcutsStatus(null);
      setShortcutsError('快捷键 API 不可用（preload 未注入）');
      return;
    }

    const res = await api.getStatus();
    if (!res.ok) {
      setShortcutsStatus(null);
      setShortcutsError(`${res.error.message}（${res.error.code}）`);
      return;
    }

    setShortcutsError(null);
    setShortcutsStatus(res.value);

    const next: Record<string, { accelerator: string; enabled: boolean }> = {};
    for (const entry of res.value.entries) {
      next[entry.id] = { accelerator: entry.accelerator, enabled: entry.enabled };
    }
    setShortcutsDraft(next);
  };

  const refreshStorageRoot = async () => {
    const api = getXinliuStorageRootApi();
    if (!api) {
      setStorageRootStatus(null);
      setStorageRootError('数据存储目录 API 不可用（preload 未注入）');
      return;
    }

    const res = await api.getStatus();
    if (!res.ok) {
      setStorageRootStatus(null);
      setStorageRootError(`${res.error.message}（${res.error.code}）`);
      return;
    }

    setStorageRootError(null);
    setStorageRootStatus(res.value);
  };

  const refreshDiagnostics = async () => {
    const api = getXinliuDiagnosticsApi();
    if (!api) {
      setDiagnosticsStatus(null);
      setDiagnosticsError('后端配置 API 不可用（preload 未注入）');
      return;
    }

    const res = await api.getStatus();
    if (!res.ok) {
      setDiagnosticsStatus(null);
      setDiagnosticsError(`${res.error.message}（${res.error.code}）`);
      return;
    }

    setDiagnosticsError(null);
    setDiagnosticsStatus(res.value);
  };

  const saveFlowBaseUrl = async (baseUrl: string) => {
    const api = getXinliuDiagnosticsApi();
    const fn = api?.setFlowBaseUrl;
    if (typeof fn !== 'function') {
      setDiagnosticsError('后端配置 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn({ baseUrl });
      if (!res.ok) {
        setDiagnosticsError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setDiagnosticsError(null);
      await refreshDiagnostics();
    } catch (e) {
      setDiagnosticsError(`保存 Flow Base URL 异常：${String(e)}`);
    }
  };

  const saveMemosBaseUrl = async (baseUrl: string) => {
    const api = getXinliuDiagnosticsApi();
    const fn = api?.setMemosBaseUrl;
    if (typeof fn !== 'function') {
      setDiagnosticsError('后端配置 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn({ baseUrl });
      if (!res.ok) {
        setDiagnosticsError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setDiagnosticsError(null);
      await refreshDiagnostics();
    } catch (e) {
      setDiagnosticsError(`保存 Memos Base URL 异常：${String(e)}`);
    }
  };

  const refreshCloseBehavior = async () => {
    const api = getXinliuCloseBehaviorApi();
    if (!api) {
      setCloseBehaviorStatus(null);
      setCloseBehaviorError('关闭行为 API 不可用（preload 未注入）');
      return;
    }

    const res = await api.getStatus();
    if (!res.ok) {
      setCloseBehaviorStatus(null);
      setCloseBehaviorError(`${res.error.message}（${res.error.code}）`);
      return;
    }

    setCloseBehaviorError(null);
    setCloseBehaviorStatus(res.value);
  };

  const refreshUpdater = async () => {
    const api = getXinliuUpdaterApi();
    if (!api) {
      setUpdaterStatus(null);
      setUpdaterError('自动更新 API 不可用（preload 未注入）');
      return;
    }

    const res = await api.getStatus();
    if (!res.ok) {
      setUpdaterStatus(null);
      setUpdaterError(`${res.error.message}（${res.error.code}）`);
      return;
    }

    setUpdaterError(null);
    setUpdaterStatus(res.value);
  };

  const refreshSyncStatus = useCallback(async () => {
    const api = getXinliuSyncApi();
    const fn = api?.getStatus;
    if (typeof fn !== 'function') {
      setSyncStatusSnapshot(null);
      setSyncStatusError('同步 API 不可用（preload 未注入）');
      return;
    }

    setSyncStatusLoading(true);
    try {
      const res = await fn();
      if (!res.ok) {
        setSyncStatusSnapshot(null);
        setSyncStatusError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setSyncStatusSnapshot(res.value);
      setSyncStatusError(null);
    } catch (error) {
      setSyncStatusSnapshot(null);
      setSyncStatusError(`读取同步状态异常：${String(error)}`);
    } finally {
      setSyncStatusLoading(false);
    }
  }, []);

  const refreshNotesList = useCallback(async () => {
    const api = getXinliuNotesApi();
    if (!api) {
      setNotesItems([]);
      setNotesHasMore(false);
      setNotesError('Notes API 不可用（preload 未注入）');
      return;
    }

    setNotesLoading(true);
    setNotesError(null);
    try {
      const res = await api.listItems({
        scope: notesScope,
        page: 0,
        pageSize: NOTES_LIST_PAGE_SIZE,
      });
      if (!res.ok) {
        setNotesItems([]);
        setNotesHasMore(false);
        setNotesError(`${res.error.message}（${res.error.code}）`);
        return;
      }

      setNotesItems(res.value.items);
      setNotesHasMore(res.value.hasMore);
    } catch (e) {
      setNotesItems([]);
      setNotesHasMore(false);
      setNotesError(`Notes 列表加载异常：${String(e)}`);
    } finally {
      setNotesLoading(false);
    }
  }, [notesScope]);

  const runNotesAction = useCallback(
    async (item: NotesListItem, action: 'delete' | 'restore' | 'hardDelete') => {
      const api = getXinliuNotesApi();
      if (!api) {
        setNotesActionError('Notes API 不可用（preload 未注入）');
        return;
      }

      const itemKey = `${item.provider}-${item.id}`;
      const actionKey = `${action}:${itemKey}`;
      setNotesActionError(null);
      setNotesActionBusyKey(actionKey);

      try {
        const res =
          action === 'delete'
            ? await api.delete({ id: item.id, provider: item.provider })
            : action === 'restore'
              ? await api.restore({ id: item.id, provider: item.provider })
              : await api.hardDelete({ id: item.id, provider: item.provider });

        if (!res.ok) {
          setNotesActionError(`${res.error.message}（${res.error.code}）`);
          return;
        }

        if (action === 'hardDelete') {
          setNotesPendingHardDeleteKey(null);
        }
        await refreshNotesList();
      } catch (e) {
        setNotesActionError(`Notes 操作异常：${String(e)}`);
      } finally {
        setNotesActionBusyKey(null);
      }
    },
    [refreshNotesList]
  );

  const refreshConflicts = useCallback(async () => {
    const api = getXinliuConflictsApi();
    if (!api) {
      setFlowConflicts([]);
      setNotesConflicts([]);
      setConflictsError('冲突中心 API 不可用（preload 未注入）');
      return;
    }

    setConflictsLoading(true);
    setConflictsError(null);
    try {
      const [flowRes, notesRes] = await Promise.all([api.listFlow(), api.listNotes()]);

      const errors: string[] = [];
      if (flowRes.ok) {
        setFlowConflicts(flowRes.value.items);
      } else {
        setFlowConflicts([]);
        errors.push(`Flow 冲突加载失败：${flowRes.error.message}（${flowRes.error.code}）`);
      }

      if (notesRes.ok) {
        setNotesConflicts(notesRes.value.items);
      } else {
        setNotesConflicts([]);
        errors.push(`Notes 冲突加载失败：${notesRes.error.message}（${notesRes.error.code}）`);
      }

      setConflictsError(errors.length > 0 ? errors.join('；') : null);
    } catch (e) {
      setFlowConflicts([]);
      setNotesConflicts([]);
      setConflictsError(`冲突中心加载异常：${String(e)}`);
    } finally {
      setConflictsLoading(false);
    }
  }, []);

  const runResolveFlowConflict = useCallback(
    async (outboxId: string, strategy: 'apply_server' | 'keep_local_copy' | 'force_overwrite') => {
      const api = getXinliuConflictsApi();
      if (!api) {
        setConflictsActionError('冲突中心 API 不可用（preload 未注入）');
        return;
      }

      setConflictsActionError(null);
      const actionKey = `${strategy}:${outboxId}`;
      setConflictsActionBusyKey(actionKey);
      try {
        const res =
          strategy === 'apply_server'
            ? await api.resolveFlowApplyServer({ outboxId })
            : strategy === 'keep_local_copy'
              ? await api.resolveFlowKeepLocalCopy({ outboxId })
              : await api.resolveFlowForceOverwrite({ outboxId });

        if (!res.ok) {
          setConflictsActionError(`裁决失败：${res.error.message}（${res.error.code}）`);
          return;
        }

        setConflictsPendingForceOutboxId(null);
        await refreshConflicts();
      } catch (e) {
        setConflictsActionError(`裁决异常：${String(e)}`);
      } finally {
        setConflictsActionBusyKey(null);
      }
    },
    [refreshConflicts]
  );

  const updateDraft = (
    id: ShortcutId,
    patch: Partial<{ accelerator: string; enabled: boolean }>
  ) => {
    setShortcutsDraft((prev) => {
      const current = prev[id] ?? { accelerator: '', enabled: true };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  };

  const saveOne = async (id: ShortcutId) => {
    const api = getXinliuShortcutsApi();
    if (!api) {
      return;
    }
    const current = shortcutsDraft[id];
    if (!current) {
      return;
    }

    const res = await api.setConfig({
      id,
      accelerator: current.accelerator,
      enabled: current.enabled,
    });
    if (!res.ok) {
      setShortcutsError(`${res.error.message}（${res.error.code}）`);
      return;
    }
    void refreshShortcuts();
  };

  const resetOne = async (id: ShortcutId) => {
    const api = getXinliuShortcutsApi();
    if (!api) {
      return;
    }
    const res = await api.resetOne(id);
    if (!res.ok) {
      setShortcutsError(`${res.error.message}（${res.error.code}）`);
      return;
    }
    void refreshShortcuts();
  };

  const resetAll = async () => {
    const api = getXinliuShortcutsApi();
    if (!api) {
      return;
    }
    const res = await api.resetAll();
    if (!res.ok) {
      setShortcutsError(`${res.error.message}（${res.error.code}）`);
      return;
    }
    void refreshShortcuts();
  };

  const triggerSyncNow = async (lane: 'flow' | 'memos') => {
    const api = getXinliuSyncApi();
    if (!api) {
      setSyncActionError('同步 API 不可用（preload 未注入）');
      return;
    }

    const fn = lane === 'flow' ? api.syncNowFlow : api.syncNowMemos;
    if (typeof fn !== 'function') {
      setSyncActionError('同步 API 不可用（preload 未注入）');
      return;
    }

    setSyncBusyLane(lane);
    setSyncActionError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setSyncActionError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      if (!res.value.runOk) {
        setSyncActionError(res.value.message ?? '同步未执行');
        return;
      }
      setSyncActionError(null);
    } catch (error) {
      setSyncActionError(`手动同步异常：${String(error)}`);
    } finally {
      void refreshSyncStatus();
      setSyncBusyLane(null);
    }
  };

  const openSettingsRoute = () => {
    setRoute('settings');
    void Promise.all([
      refreshShortcuts(),
      refreshStorageRoot(),
      refreshDiagnostics(),
      refreshCloseBehavior(),
      refreshUpdater(),
      refreshSyncStatus(),
    ]);
  };

  useEffect(() => {
    void refreshSyncStatus();
  }, [refreshSyncStatus]);

  useEffect(() => {
    if (route === 'notes') {
      void refreshNotesList();
      return;
    }
    setNotesPendingHardDeleteKey(null);
    setNotesActionError(null);
    setNotesActionBusyKey(null);
  }, [refreshNotesList, route]);

  useEffect(() => {
    if (route === 'conflicts') {
      void refreshConflicts();
      return;
    }
    setConflictsPendingForceOutboxId(null);
    setNotesCompareLocalUuid(null);
    setConflictsActionError(null);
  }, [refreshConflicts, route]);

  const checkUpdates = async () => {
    const api = getXinliuUpdaterApi();
    const fn = api?.checkForUpdates;
    if (typeof fn !== 'function') {
      setUpdaterError('自动更新 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn();
      if (!res.ok) {
        setUpdaterError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setUpdaterError(null);
      void refreshUpdater();
    } catch (e) {
      setUpdaterError(`检查更新异常：${String(e)}`);
    }
  };

  const installUpdateNow = async () => {
    const api = getXinliuUpdaterApi();
    const fn = api?.installNow;
    if (typeof fn !== 'function') {
      setUpdaterError('自动更新 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn();
      if (!res.ok) {
        setUpdaterError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setUpdaterError(null);
    } catch (e) {
      setUpdaterError(`触发安装异常：${String(e)}`);
    }
  };

  const deferInstall = async () => {
    const api = getXinliuUpdaterApi();
    const fn = api?.deferInstall;
    if (typeof fn !== 'function') {
      setUpdaterError('自动更新 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn();
      if (!res.ok) {
        setUpdaterError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setUpdaterError(null);
      void refreshUpdater();
    } catch (e) {
      setUpdaterError(`延后安装异常：${String(e)}`);
    }
  };

  const setCloseBehavior = async (behavior: 'hide' | 'quit') => {
    const api = getXinliuCloseBehaviorApi();
    const fn = api?.setBehavior;
    if (typeof fn !== 'function') {
      setCloseBehaviorError('关闭行为 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn({ behavior });
      if (!res.ok) {
        setCloseBehaviorError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setCloseBehaviorError(null);
      void refreshCloseBehavior();
    } catch (e) {
      setCloseBehaviorError(`设置关闭行为异常：${String(e)}`);
    }
  };

  const resetCloseToTrayHint = async () => {
    const api = getXinliuCloseBehaviorApi();
    const fn = api?.resetCloseToTrayHint;
    if (typeof fn !== 'function') {
      setCloseBehaviorError('关闭行为 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn();
      if (!res.ok) {
        setCloseBehaviorError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setCloseBehaviorError(null);
      void refreshCloseBehavior();
    } catch (e) {
      setCloseBehaviorError(`重置提示异常：${String(e)}`);
    }
  };

  const chooseAndMigrateStorageRoot = async () => {
    const api = getXinliuStorageRootApi();
    const fn = api?.chooseAndMigrate;
    if (typeof fn !== 'function') {
      setStorageRootError('数据存储目录 API 不可用（preload 未注入）');
      return;
    }

    try {
      const res = await fn();
      if (!res.ok) {
        setStorageRootError(`${res.error.message}（${res.error.code}）`);
        return;
      }
      setStorageRootError(null);
      if (res.value.kind === 'migrated') {
        setStorageRootLastMigration(res.value);
        setStorageRootRestartRequired(true);
        setStorageRootStatus({
          storageRootAbsPath: res.value.newStorageRootAbsPath,
          isDefault: false,
        });
      }
    } catch (e) {
      setStorageRootError(`更改目录异常：${String(e)}`);
    }
  };

  const restartNow = async () => {
    const api = getXinliuStorageRootApi();
    const fn = api?.restartNow;
    if (typeof fn !== 'function') {
      setStorageRootError('重启 API 不可用（preload 未注入）');
      return;
    }
    try {
      const res = await fn();
      if (!res.ok) {
        setStorageRootError(`${res.error.message}（${res.error.code}）`);
      }
    } catch (e) {
      setStorageRootError(`重启异常：${String(e)}`);
    }
  };

  return (
    <div className="app">
      <Titlebar title={routeMeta.label} />

      <DndContext
        sensors={dndSensors}
        onDragStart={handleCollectionsDragStart}
        onDragMove={handleCollectionsDragMove}
        onDragOver={handleCollectionsDragOver}
        onDragEnd={handleCollectionsDragEnd}
        onDragCancel={handleCollectionsDragCancel}
      >
        <main className="triptych">
          <aside className="pane paneLeft" data-testid="triptych-left" aria-label="左栏">
            <div className="paneHeader">
              <div className="paneTitle">导航</div>
              <div className="paneSub">Triptych · 三栏骨架</div>
            </div>

            <nav className="nav" aria-label="主导航">
              <NavItem
                active={route === 'notes'}
                meta={ROUTES[0]}
                testId="nav-notes"
                onClick={() => setRoute('notes')}
              />
              <NavItem
                active={route === 'collections'}
                meta={ROUTES[1]}
                testId="nav-collections"
                onClick={() => setRoute('collections')}
              />
              <NavItem
                active={route === 'todo'}
                meta={ROUTES[2]}
                testId="nav-todo"
                onClick={() => setRoute('todo')}
              />
              <div className="navDivider" />
              <NavItem
                active={route === 'settings'}
                meta={ROUTES[3]}
                testId="nav-settings"
                onClick={() => openSettingsRoute()}
              />
              <NavItem
                active={route === 'conflicts'}
                meta={ROUTES[4]}
                testId="nav-conflicts"
                onClick={() => setRoute('conflicts')}
              />

              <div className="navDivider" />
              <div className="tree" data-testid="folder-tree">
                <div className="treeTitle">Collections / Folder 树</div>
                <div className="treeBody folderTreeBody">
                  <button
                    type="button"
                    className={`treeRow ${collectionsSelectedNodeId === null ? 'treeRowSelected' : ''}`}
                    data-testid="folder-tree-root"
                    onClick={() => selectCollectionsRoot()}
                  >
                    <div className="treeRowTitle">[root] 根节点</div>
                    <div className="treeRowSub">单击查看 root 的直接子项</div>
                  </button>

                  <div
                    ref={folderTreeViewportRef}
                    className="folderTreeViewport"
                    role="tree"
                    aria-label="Collections Tree"
                    tabIndex={0}
                    onKeyDown={() => {}}
                  >
                    {collectionsLoadingParent[COLLECTIONS_ROOT_KEY] ? (
                      <div className="fine">加载根节点中…</div>
                    ) : null}
                    {renderCollectionTreeNodes(null, 0)}
                  </div>

                  {collectionsTreeError ? (
                    <div className="callout calloutWarn">{collectionsTreeError}</div>
                  ) : null}
                </div>
              </div>
            </nav>

            <SyncSummaryPanel
              apiAvailable={Boolean(getXinliuSyncApi())}
              status={syncStatusSnapshot}
              loading={syncStatusLoading}
              error={syncStatusError}
              onRefresh={() => void refreshSyncStatus()}
              compact
            />

            <div className="paneFooter">
              <div className="fine">提示：左栏负责定位，中栏负责内容，右栏负责上下文。</div>
            </div>
          </aside>

          <section className="pane paneMiddle" data-testid="triptych-middle" aria-label="中栏">
            <div className="paneHeader">
              <div className="paneTitle">{routeMeta.label}</div>
              <div className="paneSub">{routeMeta.hint}</div>
            </div>

            {route === 'settings' ? (
              <SettingsContent
                shortcutsStatus={shortcutsStatus}
                shortcutsError={shortcutsError}
                shortcutsDraft={shortcutsDraft}
                storageRootStatus={storageRootStatus}
                storageRootError={storageRootError}
                storageRootApiAvailable={Boolean(getXinliuStorageRootApi())}
                closeBehaviorStatus={closeBehaviorStatus}
                closeBehaviorError={closeBehaviorError}
                closeBehaviorApiAvailable={Boolean(getXinliuCloseBehaviorApi())}
                diagnosticsStatus={diagnosticsStatus}
                diagnosticsError={diagnosticsError}
                diagnosticsApiAvailable={Boolean(getXinliuDiagnosticsApi())}
                updaterStatus={updaterStatus}
                updaterError={updaterError}
                updaterApiAvailable={Boolean(getXinliuUpdaterApi())}
                syncApiAvailable={Boolean(getXinliuSyncApi())}
                syncStatus={syncStatusSnapshot}
                syncStatusLoading={syncStatusLoading}
                syncStatusError={syncStatusError}
                syncActionError={syncActionError}
                syncBusyLane={syncBusyLane}
                storageRootRestartRequired={storageRootRestartRequired}
                storageRootLastMigration={storageRootLastMigration}
                onUpdateDraft={updateDraft}
                onSaveOne={(id) => void saveOne(id)}
                onResetOne={(id) => void resetOne(id)}
                onResetAll={() => void resetAll()}
                onChooseAndMigrateStorageRoot={() => void chooseAndMigrateStorageRoot()}
                onRestartNow={() => void restartNow()}
                onSetCloseBehavior={(behavior) => void setCloseBehavior(behavior)}
                onResetCloseToTrayHint={() => void resetCloseToTrayHint()}
                onSaveFlowBaseUrl={saveFlowBaseUrl}
                onSaveMemosBaseUrl={saveMemosBaseUrl}
                onRefreshSyncStatus={() => void refreshSyncStatus()}
                onSyncNowFlow={() => void triggerSyncNow('flow')}
                onSyncNowMemos={() => void triggerSyncNow('memos')}
                onCheckUpdates={() => void checkUpdates()}
                onInstallUpdateNow={() => void installUpdateNow()}
                onDeferInstall={() => void deferInstall()}
              />
            ) : route === 'notes' ? (
              <NotesListCenter
                apiAvailable={Boolean(getXinliuNotesApi())}
                scope={notesScope}
                items={notesItems}
                hasMore={notesHasMore}
                loading={notesLoading}
                error={notesError}
                actionError={notesActionError}
                actionBusyKey={notesActionBusyKey}
                pendingHardDeleteKey={notesPendingHardDeleteKey}
                onChangeScope={(scope) => {
                  setNotesScope(scope);
                  setNotesPendingHardDeleteKey(null);
                  setNotesActionError(null);
                }}
                onRefresh={() => void refreshNotesList()}
                onDelete={(item) => void runNotesAction(item, 'delete')}
                onRestore={(item) => void runNotesAction(item, 'restore')}
                onPrepareHardDelete={(item) =>
                  setNotesPendingHardDeleteKey(`${item.provider}-${item.id}`)
                }
                onCancelHardDelete={() => setNotesPendingHardDeleteKey(null)}
                onConfirmHardDelete={(item) => void runNotesAction(item, 'hardDelete')}
              />
            ) : route === 'todo' ? (
              <TodoCenter />
            ) : route === 'conflicts' ? (
              <ConflictsCenter
                apiAvailable={Boolean(getXinliuConflictsApi())}
                loading={conflictsLoading}
                flowItems={flowConflicts}
                notesItems={notesConflicts}
                error={conflictsError}
                actionError={conflictsActionError}
                actionBusyKey={conflictsActionBusyKey}
                pendingForceOutboxId={conflictsPendingForceOutboxId}
                notesCompareLocalUuid={notesCompareLocalUuid}
                onRefresh={() => void refreshConflicts()}
                onApplyServer={(outboxId) => void runResolveFlowConflict(outboxId, 'apply_server')}
                onKeepLocalCopy={(outboxId) =>
                  void runResolveFlowConflict(outboxId, 'keep_local_copy')
                }
                onPrepareForceOverwrite={(outboxId) => setConflictsPendingForceOutboxId(outboxId)}
                onCancelForceOverwrite={() => setConflictsPendingForceOutboxId(null)}
                onConfirmForceOverwrite={(outboxId) =>
                  void runResolveFlowConflict(outboxId, 'force_overwrite')
                }
                onToggleNotesCompare={(localUuid) =>
                  setNotesCompareLocalUuid((current) => (current === localUuid ? null : localUuid))
                }
                onCopyNotes={(content) => void safeCopyTextToClipboard(content)}
              />
            ) : route === 'collections' ? (
              <CollectionsMiddle
                selectedParentId={collectionsMiddleParentId}
                selectedParentName={
                  collectionsMiddleParentId
                    ? (collectionsItemsById[collectionsMiddleParentId]?.name ?? null)
                    : null
                }
                items={collectionsMiddleItems}
                hasMore={collectionsMiddleHasMore}
                loading={collectionsMiddleLoading}
                error={collectionsMiddleError}
                apiAvailable={Boolean(getXinliuCollectionsApi())}
                onRefresh={() => void loadCollectionsMiddle(collectionsMiddleParentId)}
                onOpenFolder={(item) => onCollectionNodeClick(item)}
                onPopupMiddleItemMenu={(itemId) => void safePopupMiddleItemMenu(itemId)}
                onMiddleItemMouseDragStart={onCollectionsMiddleItemMouseDragStart}
                undoNotice={collectionsUndoNotice}
                undoBusy={collectionsUndoBusy}
                onUndoMove={() => void undoCollectionsMove()}
              />
            ) : (
              <>
                <DefaultRoutePlaceholder
                  routeMeta={routeMeta}
                  middleItems={placeholderMiddleItems}
                  onPopupMiddleItemMenu={(itemId) => void safePopupMiddleItemMenu(itemId)}
                />
              </>
            )}
          </section>

          <aside className="pane paneRight" data-testid="triptych-right" aria-label="右栏">
            <div className="paneHeader">
              <div className="paneTitle">上下文</div>
              <div className="paneSub">为当前页面提供补充信息与快捷操作</div>
            </div>

            <div className="rightStack">
              <GlobalSearchBox />

              {route === 'notes' ? <NotesEditorCard /> : null}

              <div className="rightCard" data-testid="share-export">
                <div className="rightCardTitle">分享 / 导出</div>
                <div className="rightCardBody">
                  <div className="fine">
                    导出当前页面的可读文本（当前为占位内容；后续接入编辑器/选中条目）。
                  </div>

                  <div className="btnRow" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btnSmall"
                      onClick={() => void runExport('text')}
                      disabled={exportBusy}
                    >
                      {exportBusy ? '导出中…' : '导出纯文本'}
                    </button>
                    <button
                      type="button"
                      className="btnSmall"
                      onClick={() => void runExport('markdown')}
                      disabled={exportBusy}
                    >
                      {exportBusy ? '导出中…' : '导出 Markdown'}
                    </button>
                    <button
                      type="button"
                      className="btnSmall"
                      data-testid="export-copy"
                      onClick={() => void safeCopyTextToClipboard(exportContentForCopy)}
                    >
                      复制文本
                    </button>
                  </div>

                  {exportError ? <div className="callout calloutWarn">{exportError}</div> : null}
                </div>
              </div>

              <div className="rightCard">
                <div className="rightCardTitle">调试信息</div>
                <div className="rightCardBody">
                  <div className="kvRow">
                    <div className="k">当前路由</div>
                    <div className="v">{routeMeta.key}</div>
                  </div>
                  <div className="kvRow">
                    <div className="k">说明</div>
                    <div className="v">{routeMeta.hint}</div>
                  </div>
                  <div className="kvRow">
                    <div className="k">最近右键命令</div>
                    <div className="v">
                      {lastContextMenuSelection
                        ? `${lastContextMenuSelection.command} @ ${lastContextMenuSelection.target.kind}`
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </DndContext>
    </div>
  );
}

export function App() {
  if (window.location.hash === '#quick-capture') {
    return <QuickCaptureWindow />;
  }
  return <MainWindowApp />;
}
