import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

type MockEventSourceInstance = {
  url: string;
  addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
  emit: (type: string, data: string) => void;
  close: () => void;
};

const mockEventSourceInstances: MockEventSourceInstance[] = [];

function createMockEventSource(url: string): MockEventSourceInstance {
  const listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  return {
    url,
    addEventListener(type, listener) {
      const listenersForType =
        listeners.get(type) ?? new Set<(event: MessageEvent<string>) => void>();
      listenersForType.add(listener);
      listeners.set(type, listenersForType);
    },
    emit(type, data) {
      const listenersForType = listeners.get(type);
      if (!listenersForType) {
        return;
      }

      const event = { data } as MessageEvent<string>;
      for (const listener of listenersForType) {
        listener(event);
      }
    },
    close() {},
  };
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
    const mockEventSource = vi.fn(function MockEventSource(url: string) {
      const instance = createMockEventSource(url);
      mockEventSourceInstances.push(instance);
      return instance;
    });

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
              {
                id: "dep_2",
                name: "bright-orbit-456",
                repoUrl: "https://github.com/acme/worker-app",
                status: "failed",
                imageTag: "relay/worker-app:sha-123",
                containerId: null,
                detectedPort: null,
                url: null,
                createdAt: "2026-04-25T19:00:00.000Z",
                updatedAt: "2026-04-25T19:00:00.000Z",
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

        if (url.endsWith("/deployments/dep_2/logs")) {
          return {
            ok: true,
            json: async () => [
              {
                id: "log_2",
                deploymentId: "dep_2",
                timestamp: "2026-04-25T19:00:01.000Z",
                stream: "stderr",
                message: "build failed",
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

    vi.stubGlobal("EventSource", mockEventSource as unknown as typeof EventSource);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });
  });

  afterEach(() => {
    mockEventSourceInstances.length = 0;
    vi.unstubAllGlobals();
  });

  it("renders the deploy form and deployment history on one page", async () => {
    renderApp();

    expect(
      screen.getByRole("heading", { name: "Your deployment pipeline in one page" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repository URL")).toBeInTheDocument();
    expect(await screen.findByText("acme/example-app")).toBeInTheDocument();
    expect(await screen.findByText(/cloning repo/)).toBeInTheDocument();
  });

  it("filters deployments and switches the selected logs panel", async () => {
    renderApp();

    expect(await screen.findByText("acme/example-app")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });

    expect((await screen.findAllByText("bright-orbit-456")).length).toBeGreaterThan(0);
    expect(screen.queryByText("acme/example-app")).not.toBeInTheDocument();
    expect(await screen.findByText(/build failed/)).toBeInTheDocument();
  });

  it("appends streamed logs for the selected deployment", async () => {
    renderApp();

    expect(await screen.findByText(/cloning repo/)).toBeInTheDocument();

    mockEventSourceInstances[0].emit(
      "log",
      JSON.stringify({
        id: "log_3",
        deploymentId: "dep_1",
        timestamp: "2026-04-26T19:00:02.000Z",
        stream: "stdout",
        message: "building image",
      }),
    );

    expect(await screen.findByText(/building image/)).toBeInTheDocument();
  });
});
