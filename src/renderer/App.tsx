import { useEffect, useMemo, useRef, useState } from 'react';

import type { ShortcutId, ShortcutStatusEntry, ShortcutsStatus } from '../shared/ipc';

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

function getXinliuWindowApi(): XinliuWindowApi | undefined {
  return window.xinliu?.window;
}

function getXinliuShortcutsApi(): XinliuShortcutsApi | undefined {
  return window.xinliu?.shortcuts;
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
    <span
      className={cls}
      data-testid={`settings-shortcut-${entry.id}-status`}
    >
      {text}
    </span>
  );
}

function SettingsShortcutsSection(props: {
  status: ShortcutsStatus | null;
  error: string | null;
  draft: Record<string, { accelerator: string; enabled: boolean }>;
  onUpdateDraft: (id: ShortcutId, patch: Partial<{ accelerator: string; enabled: boolean }>) => void;
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
          const current = props.draft[entry.id] ?? { accelerator: entry.accelerator, enabled: entry.enabled };

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
                  <button type="button" className="btn btnGhost" onClick={() => props.onResetOne(entry.id)}>
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
  onUpdateDraft: (id: ShortcutId, patch: Partial<{ accelerator: string; enabled: boolean }>) => void;
  onSaveOne: (id: ShortcutId) => void;
  onResetOne: (id: ShortcutId) => void;
  onResetAll: () => void;
}) {
  return (
    <div className="contentPlaceholder">
      <div className="contentHero">
        <div className="contentHeroTitle">设置</div>
        <div className="contentHeroSub">账户、同步、外观与系统集成能力的配置入口</div>
      </div>

      <div className="settingsStack">
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

function DefaultRoutePlaceholder({ routeMeta }: { routeMeta: RouteMeta }) {
  return (
    <div className="contentPlaceholder">
      <div className="contentHero">
        <div className="contentHeroTitle">{routeMeta.label} 入口占位</div>
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
          <div className="contentCardBody">按路由逐个落地 Notes/Collections/Todo/设置/冲突页面。</div>
        </div>
      </div>
    </div>
  );
}

function GlobalSearchBox() {
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <div className="rightCard" data-testid="global-search">
      <div className="rightCardTitle">搜索</div>
      <div className="rightCardBody">
        <input
          ref={inputRef}
          className="textInput"
          data-testid="global-search-input"
          placeholder="搜索（占位，后续接入 FTS5）"
        />
        <div className="fine">提示：可通过全局快捷键打开主窗并聚焦此输入框。</div>
      </div>
    </div>
  );
}

function MainWindowApp() {
  const [route, setRoute] = useState<RouteKey>('notes');
  const routeMeta = useMemo(() => ROUTES.find((r) => r.key === route)!, [route]);

  const [shortcutsStatus, setShortcutsStatus] = useState<ShortcutsStatus | null>(null);
  const [shortcutsError, setShortcutsError] = useState<string | null>(null);
  const [shortcutsDraft, setShortcutsDraft] = useState<
    Record<string, { accelerator: string; enabled: boolean }>
  >({});

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

  const updateDraft = (id: ShortcutId, patch: Partial<{ accelerator: string; enabled: boolean }>) => {
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
    void refreshShortcuts();
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
          </nav>

          <div className="paneFooter">
            <div className="fine">提示：左栏负责定位，中栏负责内容，右栏负责上下文。</div>
          </div>
        </aside>

        <section
          className="pane paneMiddle"
          data-testid="triptych-middle"
          aria-label="中栏"
        >
          <div className="paneHeader">
            <div className="paneTitle">{routeMeta.label}</div>
            <div className="paneSub">{routeMeta.hint}</div>
          </div>

          {route === 'settings' ? (
            <SettingsContent
              shortcutsStatus={shortcutsStatus}
              shortcutsError={shortcutsError}
              shortcutsDraft={shortcutsDraft}
              onUpdateDraft={updateDraft}
              onSaveOne={(id) => void saveOne(id)}
              onResetOne={(id) => void resetOne(id)}
              onResetAll={() => void resetAll()}
            />
          ) : (
            <DefaultRoutePlaceholder routeMeta={routeMeta} />
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
