import "./App.css";

export default function App() {
  return (
    <div className="appShell">
      <header className="appHeader">
        <h1 className="appTitle">Second Pass Reader</h1>
        <p className="appSubtitle">Standalone browser reader client</p>
      </header>

      <main className="appMain">
        <section className="panel">
          <h2 className="panelTitle">Status</h2>
          <dl className="statusList">
            <div className="statusRow">
              <dt>Client app</dt>
              <dd>
                <span className="pill pillOk">running</span>
              </dd>
            </div>
            <div className="statusRow">
              <dt>Server connection</dt>
              <dd>
                <span className="pill pillWarn">not configured</span>
              </dd>
            </div>
            <div className="statusRow">
              <dt>Renderer</dt>
              <dd>
                <span className="pill pillIdle">not initialized</span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2 className="panelTitle">Next build targets</h2>
          <ul className="targetsList">
            <li>Connection setup</li>
            <li>Client API linking flow</li>
            <li>Library landing page</li>
            <li>EPUB renderer bridge</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

