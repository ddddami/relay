import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";

import type { CreateDeploymentInput, Deployment } from "@relay/shared";

import "./App.css";

async function fetchDeployments(): Promise<Deployment[]> {
  const response = await fetch("/api/deployments");

  if (!response.ok) {
    throw new Error("Failed to load deployments.");
  }

  return response.json();
}

async function createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
  const response = await fetch("/api/deployments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };

    throw new Error(error.message ?? "Failed to create deployment.");
  }

  return response.json();
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString();
}

function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const queryClient = useQueryClient();

  const deploymentsQuery = useQuery({
    queryKey: ["deployments"],
    queryFn: fetchDeployments,
  });

  const createDeploymentMutation = useMutation({
    mutationFn: createDeployment,
    onSuccess: async () => {
      setRepoUrl("");
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createDeploymentMutation.mutate({ repoUrl });
  }

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

        <form className="deploy-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="repo-url">
            Repository URL
          </label>
          <div className="deploy-form-row">
            <input
              id="repo-url"
              name="repoUrl"
              type="url"
              placeholder="https://github.com/acme/example-app"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              disabled={createDeploymentMutation.isPending}
            />
            <button type="submit" disabled={createDeploymentMutation.isPending || !repoUrl.trim()}>
              {createDeploymentMutation.isPending ? "Deploying..." : "Deploy"}
            </button>
          </div>

          {createDeploymentMutation.error ? (
            <p className="feedback feedback-error">{createDeploymentMutation.error.message}</p>
          ) : null}
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

            {deploymentsQuery.isLoading ? (
              <div className="table-row" role="row">
                <span className="mono">Loading deployments...</span>
                <span className="status-chip status-chip-idle">Loading</span>
                <span className="muted">-</span>
                <span className="muted">-</span>
              </div>
            ) : null}

            {deploymentsQuery.isError ? (
              <div className="table-row" role="row">
                <span className="mono">Failed to load deployments</span>
                <span className="status-chip status-chip-idle">Error</span>
                <span className="muted">-</span>
                <span className="muted">-</span>
              </div>
            ) : null}

            {deploymentsQuery.data?.length
              ? deploymentsQuery.data.map((deployment) => (
                  <div className="table-row" role="row" key={deployment.id}>
                    <span className="mono">{deployment.name}</span>
                    <span className="status-chip status-chip-idle">{deployment.status}</span>
                    <span className="muted">{deployment.url ?? "-"}</span>
                    <span className="muted">{formatCreatedAt(deployment.createdAt)}</span>
                  </div>
                ))
              : null}

            {!deploymentsQuery.isLoading &&
            !deploymentsQuery.isError &&
            !deploymentsQuery.data?.length ? (
              <div className="table-row" role="row">
                <span className="mono">No deployments yet</span>
                <span className="status-chip status-chip-idle">Idle</span>
                <span className="muted">-</span>
                <span className="muted">-</span>
              </div>
            ) : null}
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
