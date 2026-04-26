import "./App.css";

function App() {
  return (
    <main className="app-shell">
      <header className="hero-block">
        <div>
          <p className="eyebrow">Relay</p>
          <h1>Internal deployment control plane</h1>
          <p className="hero-copy">
            Deploy containerized applications, inspect state transitions, and follow live logs from
            a single surface.
          </p>
        </div>
      </header>

      <section className="panel deploy-panel" aria-labelledby="deploy-heading">
        <div className="panel-header">
          <div>
            <h2 id="deploy-heading">New deployment</h2>
            <p>Start with a public GitHub repository URL.</p>
          </div>
        </div>

        <form className="deploy-form">
          <label className="field-label" htmlFor="repo-url">
            Repository URL
          </label>
          <div className="deploy-form-row">
            <input
              id="repo-url"
              name="repoUrl"
              type="url"
              placeholder="https://github.com/acme/example-app"
            />
            <button type="submit">Deploy</button>
          </div>
        </form>
      </section>

      <section className="workspace-grid">
        <section className="panel" aria-labelledby="deployments-heading">
          <div className="panel-header">
            <div>
              <h2 id="deployments-heading">Deployments</h2>
              <p>Current runtime history will appear here.</p>
            </div>
          </div>

          <div className="table-shell" role="table" aria-label="Deployments">
            <div className="table-row table-row-head" role="row">
              <span>Name</span>
              <span>Status</span>
              <span>URL</span>
              <span>Created</span>
            </div>
            <div className="table-row" role="row">
              <span className="mono">No deployments yet</span>
              <span className="status-chip status-chip-idle">Idle</span>
              <span className="muted">-</span>
              <span className="muted">-</span>
            </div>
          </div>
        </section>

        <section className="panel logs-panel" aria-labelledby="logs-heading">
          <div className="panel-header">
            <div>
              <h2 id="logs-heading">Logs</h2>
              <p>Select a deployment to inspect build and runtime output.</p>
            </div>
          </div>

          <pre className="log-surface">Waiting for deployment logs.</pre>
        </section>
      </section>
    </main>
  );
}

export default App;
