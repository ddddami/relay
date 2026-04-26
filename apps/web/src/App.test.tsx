import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

class MockEventSource {
  static instances: MockEventSource[] = [];

  listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    const listeners = this.listeners.get(type) ?? new Set<(event: MessageEvent<string>) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: string) {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    const event = { data } as MessageEvent<string>;
    for (const listener of listeners) {
      listener(event);
    }
  }

  close() {}
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.endsWith("/deployments")) {
          return {
            ok: true,
            json: async () => [
              {
                id: "dep_1",
                name: "storm-fox-123",
                repoUrl: "https://github.com/acme/example-app",
                status: "building",
                imageTag: null,
                containerId: null,
                detectedPort: null,
                url: null,
                createdAt: "2026-04-26T19:00:00.000Z",
                updatedAt: "2026-04-26T19:00:00.000Z",
              },
            ],
          };
        }

        if (url.endsWith("/deployments/dep_1/logs")) {
          return {
            ok: true,
            json: async () => [
              {
                id: "log_1",
                deploymentId: "dep_1",
                timestamp: "2026-04-26T19:00:01.000Z",
                stream: "stdout",
                message: "cloning repo",
              },
            ],
          };
        }

        return {
          ok: true,
          json: async () => [],
        };
      }),
    );

    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  it("renders the Relay heading and deployment history", async () => {
    renderApp();

    expect(
      screen.getByRole("heading", { name: "Internal deployment control plane" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("storm-fox-123")).toBeInTheDocument();
    expect(await screen.findByText(/cloning repo/)).toBeInTheDocument();
  });

  it("appends streamed logs for the selected deployment", async () => {
    renderApp();

    expect(await screen.findByText(/cloning repo/)).toBeInTheDocument();

    MockEventSource.instances[0].emit(
      "log",
      JSON.stringify({
        id: "log_2",
        deploymentId: "dep_1",
        timestamp: "2026-04-26T19:00:02.000Z",
        stream: "stdout",
        message: "building image",
      }),
    );

    expect(await screen.findByText(/building image/)).toBeInTheDocument();
  });
});
