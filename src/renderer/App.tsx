export function App() {
  const versions = window.xinliu?.versions;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">心流</div>
        <div className="sub">Electron + Vite + React + TypeScript</div>
      </header>

      <main className="main">
        <section className="card">
          <div className="cardTitle">运行环境</div>
          <div className="kv">
            <div className="k">Electron</div>
            <div className="v">{versions?.electron ?? '-'}</div>
          </div>
          <div className="kv">
            <div className="k">Chrome</div>
            <div className="v">{versions?.chrome ?? '-'}</div>
          </div>
          <div className="kv">
            <div className="k">Node</div>
            <div className="v">{versions?.node ?? '-'}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
