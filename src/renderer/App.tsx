import { useMemo, useState } from 'react';

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

function getXinliuWindowApi(): XinliuWindowApi | undefined {
  return window.xinliu?.window;
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

export function App() {
  const [route, setRoute] = useState<RouteKey>('notes');
  const routeMeta = useMemo(() => ROUTES.find((r) => r.key === route)!, [route]);

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
              onClick={() => setRoute('settings')}
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
        </section>

        <aside className="pane paneRight" data-testid="triptych-right" aria-label="右栏">
          <div className="paneHeader">
            <div className="paneTitle">上下文</div>
            <div className="paneSub">为当前页面提供补充信息与快捷操作</div>
          </div>

          <div className="rightStack">
            <div className="rightCard">
              <div className="rightCardTitle">快速入口</div>
              <div className="rightCardBody">
                <div className="chipRow">
                  <span className="chip">搜索</span>
                  <span className="chip">过滤</span>
                  <span className="chip">同步</span>
                </div>
                <div className="fine">占位：后续会接入真实命令与状态。</div>
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
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
