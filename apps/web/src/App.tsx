import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  deploymentStatuses,
  type CreateDeploymentInput,
  type Deployment,
  type DeploymentLog,
  type DeploymentStatus,
} from "@relay/shared";

import "./App.css";

async function fetchDeployments(): Promise<Deployment[]> {
  const response = await fetch("/api/deployments");

  if (!response.ok) {
    throw new Error("Failed to load deployments.");
  }

  return response.json();
}

async function fetchDeploymentLogs(deploymentId: string): Promise<DeploymentLog[]> {
  const response = await fetch(`/api/deployments/${deploymentId}/logs`);

  if (!response.ok) {
    throw new Error("Failed to load deployment logs.");
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

async function redeployDeployment(deploymentId: string): Promise<Deployment> {
  const response = await fetch(`/api/deployments/${deploymentId}/redeploy`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };
    throw new Error(error.message ?? "Failed to redeploy deployment.");
  }

  return response.json();
}

async function deleteDeployment(deploymentId: string): Promise<void> {
  const response = await fetch(`/api/deployments/${deploymentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };
    throw new Error(error.message ?? "Failed to delete deployment.");
  }
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString();
}

function formatCreatedAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatLogLine(log: DeploymentLog) {
  const timestamp = new Date(log.timestamp).toLocaleTimeString();

  return `[${timestamp}] ${log.stream}: ${log.message}`;
}

function getStatusChipClass(status: DeploymentStatus | "idle") {
  switch (status) {
    case "running":
      return "status-chip status-chip-running";
    case "failed":
      return "status-chip status-chip-failed";
    case "building":
    case "deploying":
    case "cloning":
      return "status-chip status-chip-active";
    default:
      return "status-chip status-chip-idle";
  }
}

function getRepoLabel(repoUrl: string) {
  try {
    const url = new URL(repoUrl);
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } catch {
    return repoUrl;
  }
}

function getShortId(value: string) {
  return value.slice(0, 8);
}

function getFilterLabel(status: DeploymentStatus | "all") {
  return status === "all" ? "all" : status;
}

function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const logSurfaceRef = useRef<HTMLPreElement | null>(null);
  const queryClient = useQueryClient();

  const deploymentsQuery = useQuery({
    queryKey: ["deployments"],
    queryFn: fetchDeployments,
  });

  const filteredDeployments = useMemo(() => {
    const searchValue = searchQuery.trim().toLowerCase();

    return (deploymentsQuery.data ?? []).filter((deployment) => {
      const matchesStatus = statusFilter === "all" || deployment.status === statusFilter;
      const matchesSearch =
        !searchValue ||
        deployment.name.toLowerCase().includes(searchValue) ||
        deployment.repoUrl.toLowerCase().includes(searchValue) ||
        getRepoLabel(deployment.repoUrl).toLowerCase().includes(searchValue);

      return matchesStatus && matchesSearch;
    });
  }, [deploymentsQuery.data, searchQuery, statusFilter]);

  const deploymentLogsQuery = useQuery({
    queryKey: ["deployment-logs", selectedDeploymentId],
    queryFn: () => fetchDeploymentLogs(selectedDeploymentId!),
    enabled: Boolean(selectedDeploymentId),
  });

  const selectedDeployment =
    deploymentsQuery.data?.find((deployment) => deployment.id === selectedDeploymentId) ?? null;

  const selectedDeploymentLogText = deploymentLogsQuery.data?.length
    ? deploymentLogsQuery.data.map(formatLogLine).join("\n")
    : null;

  useEffect(() => {
    if (!selectedDeploymentId) {
      return;
    }

    const eventSource = new EventSource(`/api/deployments/${selectedDeploymentId}/logs/stream`);

    eventSource.addEventListener("log", (event) => {
      const log = JSON.parse((event as MessageEvent<string>).data) as DeploymentLog;

      queryClient.setQueryData<DeploymentLog[]>(
        ["deployment-logs", selectedDeploymentId],
        (logs) => {
          if (logs?.some((entry) => entry.id === log.id)) {
            return logs;
          }

          return [...(logs ?? []), log];
        },
      );

      void queryClient.invalidateQueries({ queryKey: ["deployments"] });
    });

    return () => {
      eventSource.close();
    };
  }, [queryClient, selectedDeploymentId]);

  useEffect(() => {
    if (!filteredDeployments.length) {
      setSelectedDeploymentId(null);
      return;
    }

    if (
      selectedDeploymentId &&
      filteredDeployments.some((deployment) => deployment.id === selectedDeploymentId)
    ) {
      return;
    }

    setSelectedDeploymentId(filteredDeployments[0].id);
  }, [filteredDeployments, selectedDeploymentId]);

  useEffect(() => {
    if (!copiedField) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopiedField(null);
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copiedField]);

  useEffect(() => {
    if (!logSurfaceRef.current) {
      return;
    }

    logSurfaceRef.current.scrollTop = logSurfaceRef.current.scrollHeight;
  }, [selectedDeploymentId, selectedDeploymentLogText]);

  const createDeploymentMutation = useMutation({
    mutationFn: createDeployment,
    onSuccess: async (deployment) => {
      setRepoUrl("");
      setStatusFilter("all");
      setSearchQuery("");
      setSelectedDeploymentId(deployment.id);
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
  });

  const redeployDeploymentMutation = useMutation({
    mutationFn: redeployDeployment,
    onSuccess: async (deployment) => {
      setSelectedDeploymentId(deployment.id);
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
      await queryClient.invalidateQueries({ queryKey: ["deployment-logs", deployment.id] });
    },
  });

  const deleteDeploymentMutation = useMutation({
    mutationFn: deleteDeployment,
    onSuccess: async (_, deletedDeploymentId) => {
      if (selectedDeploymentId === deletedDeploymentId) {
        setSelectedDeploymentId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
    },
  });

  async function copyValue(key: string, value: string) {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedField(key);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createDeploymentMutation.mutate({ repoUrl });
  }

  function handleSelectDeployment(deploymentId: string) {
    setSelectedDeploymentId(deploymentId);
  }

  function handleRedeploy(deploymentId: string) {
    redeployDeploymentMutation.mutate(deploymentId);
  }

  function handleDelete(deploymentId: string) {
    deleteDeploymentMutation.mutate(deploymentId);
  }

  return (
    <main className="app-shell">
      <section className="topbar panel" aria-labelledby="deploy-heading">
        <div className="brand-block">
          <p className="eyebrow">Relay</p>
          <h1 id="deploy-heading">Your deployment pipeline in one page</h1>
        </div>

        <form className="deploy-form deploy-form-inline" onSubmit={handleSubmit}>
          <div className="deploy-form-row">
            <input
              aria-label="GitHub repository URL"
              id="repo-url"
              name="repoUrl"
              type="url"
              placeholder="https://github.com/acme/example-app"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              disabled={createDeploymentMutation.isPending}
            />
            <button type="submit" disabled={createDeploymentMutation.isPending || !repoUrl.trim()}>
              {createDeploymentMutation.isPending ? "Deploying" : "Deploy"}
            </button>
          </div>

          {createDeploymentMutation.error ? (
            <p className="feedback feedback-error">{createDeploymentMutation.error.message}</p>
          ) : null}
        </form>
      </section>

      <section className="workspace-stack">
        <section className="panel" aria-labelledby="deployments-heading">
          <div className="section-heading history-heading">
            <div>
              <h2 id="deployments-heading">Runtime history</h2>
            </div>
            <div className="history-summary">
              <span>{filteredDeployments.length} visible</span>
              <span>{deploymentsQuery.data?.length ?? 0} total</span>
            </div>
          </div>

          <div className="filter-row" aria-label="Deployment filters">
            <label className="filter-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as DeploymentStatus | "all")
                }
              >
                <option value="all">All states</option>
                {deploymentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {getFilterLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field filter-field-search">
              <span>Search</span>
              <input
                type="search"
                placeholder="Search repo or deployment"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <button
              className="secondary-button"
              type="button"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["deployments"] })}
            >
              Refresh
            </button>
          </div>

          <div className="table-shell" role="table" aria-label="Deployments">
            <div className="table-row table-row-head" role="row">
              <span>Repo</span>
              <span>Status</span>
              <span>Image</span>
              <span>Created</span>
              <span>Actions</span>
            </div>

            {deploymentsQuery.isLoading ? (
              <div className="table-row table-row-empty" role="row">
                <span className="mono">Loading deployments...</span>
              </div>
            ) : null}

            {deploymentsQuery.isError ? (
              <div className="table-row table-row-empty" role="row">
                <span className="mono">Failed to load deployments.</span>
              </div>
            ) : null}

            {filteredDeployments.map((deployment) => (
              <div
                className={`table-row table-row-button${selectedDeploymentId === deployment.id ? " table-row-selected" : ""}`}
                role="row"
                key={deployment.id}
              >
                <span className="deployment-cell">
                  <button
                    className="table-row-trigger"
                    type="button"
                    onClick={() => handleSelectDeployment(deployment.id)}
                  >
                    <span className="deployment-primary mono">
                      {getRepoLabel(deployment.repoUrl)}
                    </span>
                    <span className="deployment-secondary">{deployment.name}</span>
                  </button>
                </span>
                <span className={getStatusChipClass(deployment.status)}>{deployment.status}</span>
                <span className="table-truncate mono">{deployment.imageTag ?? "pending"}</span>
                <span className="deployment-cell deployment-cell-time">
                  <span className="deployment-primary">
                    {formatCreatedAgo(deployment.createdAt)}
                  </span>
                  <span className="deployment-secondary">
                    {formatCreatedAt(deployment.createdAt)}
                  </span>
                </span>
                <span className="row-actions">
                  {deployment.url ? (
                    <a
                      className="row-action-button"
                      href={deployment.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${deployment.name}`}
                    >
                      <ExternalLink size={14} strokeWidth={1.75} />
                    </a>
                  ) : (
                    <span
                      className="row-action-button row-action-button-placeholder"
                      aria-hidden="true"
                    >
                      <ExternalLink size={14} strokeWidth={1.75} />
                    </span>
                  )}
                  <button
                    className="row-action-button"
                    type="button"
                    aria-label={`Redeploy ${deployment.name}`}
                    onClick={() => handleRedeploy(deployment.id)}
                    disabled={redeployDeploymentMutation.isPending}
                  >
                    <RefreshCcw size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    className="row-action-button row-action-button-danger"
                    type="button"
                    aria-label={`Delete ${deployment.name}`}
                    onClick={() => handleDelete(deployment.id)}
                    disabled={deleteDeploymentMutation.isPending}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
            ))}

            {!deploymentsQuery.isLoading &&
            !deploymentsQuery.isError &&
            !filteredDeployments.length ? (
              <div className="table-row table-row-empty" role="row">
                <span className="mono">No deployments match the current filters.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel logs-panel" aria-labelledby="logs-heading">
          <div className="section-heading logs-heading">
            <div>
              <h2 id="logs-heading">Run output</h2>
              <p className="logs-subtitle">
                {selectedDeployment ? selectedDeployment.name : "Select a deployment"}
              </p>
            </div>
            {selectedDeployment ? (
              <div className="logs-actions">
                {selectedDeployment.url ? (
                  <a
                    className="secondary-button"
                    href={selectedDeployment.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open URL
                  </a>
                ) : null}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    void queryClient.invalidateQueries({
                      queryKey: ["deployment-logs", selectedDeployment.id],
                    })
                  }
                >
                  Refresh logs
                </button>
                {selectedDeployment.status === "failed" ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => handleRedeploy(selectedDeployment.id)}
                    disabled={redeployDeploymentMutation.isPending}
                  >
                    Retry deploy
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {selectedDeployment ? (
            <div className="deployment-detail-grid">
              <div className="detail-card">
                <span className="meta-label">Status</span>
                <span className={getStatusChipClass(selectedDeployment.status)}>
                  {selectedDeployment.status}
                </span>
              </div>

              <div className="detail-card">
                <span className="meta-label">Deployment ID</span>
                <div className="detail-inline">
                  <code>{getShortId(selectedDeployment.id)}</code>
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() => void copyValue("deployment-id", selectedDeployment.id)}
                  >
                    {copiedField === "deployment-id" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="detail-card">
                <span className="meta-label">Image tag</span>
                <div className="detail-inline">
                  <code>{selectedDeployment.imageTag ?? "pending"}</code>
                  {selectedDeployment.imageTag ? (
                    <button
                      className="copy-button"
                      type="button"
                      onClick={() => void copyValue("image-tag", selectedDeployment.imageTag!)}
                    >
                      {copiedField === "image-tag" ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="detail-card">
                <span className="meta-label">Repository</span>
                <code>{getRepoLabel(selectedDeployment.repoUrl)}</code>
              </div>
            </div>
          ) : null}

          <pre className="log-surface" ref={logSurfaceRef}>
            {!selectedDeploymentId
              ? "Select a deployment to inspect build and runtime output."
              : null}
            {selectedDeploymentId && deploymentLogsQuery.isLoading
              ? "Loading deployment logs..."
              : null}
            {selectedDeploymentId && deploymentLogsQuery.isError
              ? "Failed to load deployment logs."
              : null}
            {selectedDeploymentId &&
            !deploymentLogsQuery.isLoading &&
            !deploymentLogsQuery.isError &&
            !deploymentLogsQuery.data?.length
              ? "No logs available yet."
              : null}
            {selectedDeploymentLogText}
          </pre>
        </section>
      </section>
    </main>
  );
}

export default App;
