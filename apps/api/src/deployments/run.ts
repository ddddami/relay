import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { deploymentLogs, deployments } from "../db/schema";

type CommandOptions = {
  cwd?: string;
  onLine?: (stream: "stdout" | "stderr", line: string) => Promise<void>;
};

async function appendLog(deploymentId: string, stream: string, message: string) {
  await db.insert(deploymentLogs).values({
    id: randomUUID(),
    deploymentId,
    timestamp: new Date(),
    stream,
    message,
  });
}

async function updateDeployment(
  deploymentId: string,
  values: Partial<{
    status: "pending" | "cloning" | "building" | "deploying" | "running" | "failed";
    imageTag: string | null;
    containerId: string | null;
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
    env: process.env,
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

export function startDeploymentRun(deploymentId: string) {
  void runDeployment(deploymentId);
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

    await runCommand("railpack", ["build", "."], {
      cwd: sourceDir,
      onLine: async (stream, line) => {
        await appendLog(deploymentId, stream, line);
      },
    });

    await updateDeployment(deploymentId, {
      status: "deploying",
      imageTag: deployment.name,
    });

    await appendLog(deploymentId, "system", "Build finished, runtime deployment step is next");
  } catch (error) {
    await updateDeployment(deploymentId, { status: "failed" });
    await appendLog(
      deploymentId,
      "stderr",
      error instanceof Error ? error.message : "Deployment runner failed.",
    );
  }
}
