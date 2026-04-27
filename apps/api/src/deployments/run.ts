import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { deployments } from "../db/schema";
import { appendDeploymentLog } from "./logs";
import { findReachableContainerPort } from "./network";

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onLine?: (stream: "stdout" | "stderr", line: string) => Promise<void>;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

async function appendLog(deploymentId: string, stream: string, message: string) {
  await appendDeploymentLog(deploymentId, stream, message);
}

async function updateDeployment(
  deploymentId: string,
  values: Partial<{
    status: "pending" | "cloning" | "building" | "deploying" | "running" | "failed";
    imageTag: string | null;
    containerId: string | null;
    detectedPort: number | null;
    url: string | null;
  }>,
) {
  await db
    .update(deployments)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, deploymentId));
}

async function getDeployment(deploymentId: string) {
  const result = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  return result[0] ?? null;
}

async function runCommand(command: string, args: string[], options: CommandOptions = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  const handleStream = (stream: "stdout" | "stderr", source: NodeJS.ReadableStream) => {
    let buffer = "";

    source.on("data", (chunk) => {
      buffer += chunk.toString();

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !options.onLine) {
          continue;
        }

        void options.onLine(stream, trimmed);
      }
    });

    source.on("end", () => {
      const trimmed = buffer.trim();
      if (trimmed && options.onLine) {
        void options.onLine(stream, trimmed);
      }
    });
  };

  handleStream("stdout", child.stdout);
  handleStream("stderr", child.stderr);

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function runCommandCapture(command: string, args: string[], options: CommandOptions = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  child.stdout.on("data", (chunk) => {
    stdout.push(chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    stderr.push(chunk.toString());
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });

  return {
    stdout: stdout.join(""),
    stderr: stderr.join(""),
  } satisfies CommandResult;
}

export function startDeploymentRun(deploymentId: string) {
  void runDeployment(deploymentId);
}

async function ensureBuildkit() {
  async function createBuildkit() {
    await runCommand("docker", ["rm", "-f", "relay-buildkit"]);
    await runCommand("docker", [
      "run",
      "--privileged",
      "-d",
      "--name",
      "relay-buildkit",
      "moby/buildkit",
    ]);
  }

  try {
    const result = await runCommandCapture("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      "relay-buildkit",
    ]);

    if (result.stdout.trim() === "true") {
      return;
    }

    await runCommand("docker", ["start", "relay-buildkit"]);

    const restarted = await runCommandCapture("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      "relay-buildkit",
    ]);
    if (restarted.stdout.trim() === "true") {
      return;
    }

    await createBuildkit();
    return;
  } catch {
    await createBuildkit();
  }
}

function getContainerName(deploymentId: string) {
  return `relay-deployment-${deploymentId}`;
}

async function removeContainerIfExists(containerName: string) {
  try {
    await runCommand("docker", ["rm", "-f", containerName]);
  } catch {
    return;
  }
}

async function getRuntimeCommand(sourceDir: string) {
  try {
    const packageJson = JSON.parse(await readFile(join(sourceDir, "package.json"), "utf8")) as {
      scripts?: { start?: string };
    };

    const startScript = packageJson.scripts?.start?.trim();
    if (!startScript?.includes("astro dev")) {
      return null;
    }

    return "astro preview --host 0.0.0.0 --port 3000";
  } catch {
    return null;
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getContainerStatus(containerName: string) {
  const result = await runCommandCapture("docker", [
    "inspect",
    "-f",
    "{{.State.Status}}",
    containerName,
  ]);

  return result.stdout.trim();
}

async function appendContainerLogs(deploymentId: string, containerName: string) {
  try {
    const result = await runCommandCapture("docker", ["logs", "--tail", "50", containerName]);
    const output = `${result.stdout}${result.stderr}`.trim();
    if (!output) {
      return;
    }

    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      await appendLog(deploymentId, "stderr", trimmed);
    }
  } catch {
    return;
  }
}

async function verifyContainerRuntime(deploymentId: string, containerName: string) {
  await appendLog(deploymentId, "system", "Verifying runtime container");
  await sleep(2000);

  const status = await getContainerStatus(containerName);
  if (status !== "running") {
    await appendContainerLogs(deploymentId, containerName);
    throw new Error(`Runtime container failed to stabilize (status: ${status}).`);
  }

  const port = await findReachableContainerPort(containerName);
  if (port) {
    await appendLog(deploymentId, "system", `Runtime reachable on port ${port}`);
    return port;
  }

  await appendContainerLogs(deploymentId, containerName);
  throw new Error("Runtime container is running but no reachable port was found.");
}

async function runDeployment(deploymentId: string) {
  const deployment = await getDeployment(deploymentId);
  if (!deployment) {
    return;
  }

  const workspaceDir = join(process.cwd(), ".data", "deployments", deploymentId);
  const sourceDir = join(workspaceDir, deployment.name);

  try {
    await updateDeployment(deploymentId, { status: "cloning" });
    await appendLog(deploymentId, "system", `Cloning ${deployment.repoUrl}`);

    await rm(workspaceDir, { force: true, recursive: true });
    await mkdir(workspaceDir, { recursive: true });

    await runCommand("git", ["clone", "--depth", "1", deployment.repoUrl, sourceDir], {
      onLine: async (stream, line) => {
        await appendLog(deploymentId, stream, line);
      },
    });

    await updateDeployment(deploymentId, { status: "building" });
    await appendLog(deploymentId, "system", "Starting Railpack build");

    await ensureBuildkit();

    await runCommand("railpack", ["build", "."], {
      cwd: sourceDir,
      env: {
        BUILDKIT_HOST: "docker-container://relay-buildkit",
      },
      onLine: async (stream, line) => {
        await appendLog(deploymentId, stream, line);
      },
    });

    await updateDeployment(deploymentId, {
      status: "deploying",
      imageTag: deployment.name,
      detectedPort: null,
    });

    await appendLog(deploymentId, "system", "Starting runtime container");

    const containerName = getContainerName(deploymentId);
    await removeContainerIfExists(containerName);
    const runtimeCommand = await getRuntimeCommand(sourceDir);

    if (runtimeCommand) {
      await appendLog(deploymentId, "system", "Using Astro runtime command override");
    }

    await runCommand(
      "docker",
      [
        "run",
        "-d",
        "--name",
        containerName,
        "--network",
        "relay_default",
        "-e",
        "PORT=3000",
        "-e",
        "HOST=0.0.0.0",
        "-e",
        "HOSTNAME=0.0.0.0",
        "-e",
        "NODE_ENV=production",
        deployment.name,
        ...(runtimeCommand ? [runtimeCommand] : []),
      ],
      {
        onLine: async (stream, line) => {
          await appendLog(deploymentId, stream, line);
        },
      },
    );

    const detectedPort = await verifyContainerRuntime(deploymentId, containerName);

    await updateDeployment(deploymentId, {
      status: "running",
      containerId: containerName,
      detectedPort,
      imageTag: deployment.name,
      url: `http://${deploymentId}.localhost`,
    });

    await appendLog(deploymentId, "system", "Container started");
  } catch (error) {
    await updateDeployment(deploymentId, { status: "failed" });
    await appendLog(
      deploymentId,
      "stderr",
      error instanceof Error ? error.message : "Deployment runner failed.",
    );
  }
}
