import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CloseBehaviorStatus,
  ContextMenuDidSelectPayload,
  DiagnosticsStatus,
  SearchQueryResult,
  SearchResultItem,
  ShortcutId,
  ShortcutStatusEntry,
  ShortcutsStatus,
  StorageRootChooseAndMigrateResult,
  StorageRootStatus,
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
type XinliuSearchApi = NonNullable<Window['xinliu']>['search'];

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

function getXinliuSearchApi(): XinliuSearchApi | undefined {
  return window.xinliu?.search;
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
        <SettingsDiagnosticsSection
          status={props.diagnosticsStatus}
          error={props.diagnosticsError}
          apiAvailable={props.diagnosticsApiAvailable}
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
}) {
  const flowBaseUrl = props.status?.flowBaseUrl ?? '-';
  const memosBaseUrl = props.status?.memosBaseUrl ?? '-';

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
    <section className="settingsSection" data-testid="diagnostics-panel">
      <div className="settingsSectionHeader">
        <div>
          <div className="settingsSectionTitle">诊断</div>
          <div className="settingsSectionSub">
            用于排障：不展示 token；日志会强制脱敏（Authorization/Token/绝对路径）
          </div>
        </div>
      </div>

      <div className="rightCardBody">
        <div className="kvRow">
          <div className="k">Flow Base URL</div>
          <div className="v">{flowBaseUrl}</div>
        </div>
        <div className="kvRow">
          <div className="k">Memos Base URL</div>
          <div className="v">{memosBaseUrl}</div>
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
        <div className="callout calloutWarn">诊断 API 不可用（preload 未注入）</div>
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

function MainWindowApp() {
  const [route, setRoute] = useState<RouteKey>('notes');
  const routeMeta = useMemo(() => ROUTES.find((r) => r.key === route)!, [route]);

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

  useEffect(() => {
    const api = getXinliuContextMenuApi();
    const off = api?.onCommand?.((payload) => {
      setLastContextMenuSelection(payload);
    });
    return () => {
      off?.();
    };
  }, []);

  const demoFolders = useMemo(
    () => [
      { id: 'folder_inbox', title: '收件箱' },
      { id: 'folder_projects', title: '项目' },
      { id: 'folder_archive', title: '归档' },
    ],
    []
  );

  const demoMiddleItems = useMemo(() => {
    if (route === 'notes') {
      return [
        { id: 'note_1', title: '示例笔记：今日复盘', sub: '右键：打开 / 移动到 / 删除 / 导出' },
        { id: 'note_2', title: '示例笔记：灵感碎片', sub: '（占位数据，后续接入本地库）' },
      ];
    }
    if (route === 'collections') {
      return [{ id: 'col_1', title: '示例条目：收藏夹', sub: '右键：打开 / 移动到 / 删除 / 导出' }];
    }
    if (route === 'todo') {
      return [
        { id: 'todo_1', title: '示例任务：实现右键菜单', sub: '右键：打开 / 移动到 / 删除 / 导出' },
      ];
    }
    if (route === 'conflicts') {
      return [
        {
          id: 'conflict_1',
          title: '示例冲突：标题不一致',
          sub: '右键：打开 / 移动到 / 删除 / 导出',
        },
      ];
    }
    return [];
  }, [route]);

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
      setDiagnosticsError('诊断 API 不可用（preload 未注入）');
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

  const openSettingsRoute = () => {
    setRoute('settings');
    void Promise.all([
      refreshShortcuts(),
      refreshStorageRoot(),
      refreshDiagnostics(),
      refreshCloseBehavior(),
    ]);
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
              <div className="treeTitle">Folders（占位，可右键）</div>
              <div className="treeBody">
                {demoFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="treeRow"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void safePopupFolderMenu(f.id);
                    }}
                  >
                    <div className="treeRowTitle">{f.title}</div>
                    <div className="treeRowSub">右键：新建子项 / 重命名 / 移动 / 删除</div>
                  </button>
                ))}
              </div>
            </div>
          </nav>

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
            />
          ) : (
            <DefaultRoutePlaceholder
              routeMeta={routeMeta}
              middleItems={demoMiddleItems}
              onPopupMiddleItemMenu={(itemId) => void safePopupMiddleItemMenu(itemId)}
            />
          )}
        </section>

        <aside className="pane paneRight" data-testid="triptych-right" aria-label="右栏">
          <div className="paneHeader">
            <div className="paneTitle">上下文</div>
            <div className="paneSub">为当前页面提供补充信息与快捷操作</div>
          </div>

          <div className="rightStack">
            <GlobalSearchBox />

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
    </div>
  );
}

export function App() {
  if (window.location.hash === '#quick-capture') {
    return <QuickCaptureWindow />;
  }
  return <MainWindowApp />;
}
