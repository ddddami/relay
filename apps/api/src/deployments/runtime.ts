import { spawn } from "node:child_process";

import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { deployments } from "../db/schema";

type CommandResult = {
  stdout: string;
  stderr: string;
};

async function runCommandCapture(command: string, args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const child = spawn(command, args, {
    env: process.env,
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

export async function getContainerStatus(containerId: string) {
  try {
    const result = await runCommandCapture("docker", [
      "inspect",
      "-f",
      "{{.State.Status}}",
      containerId,
    ]);

    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function markDeploymentUnavailable(fastify: FastifyInstance, deploymentId: string) {
  await fastify.db
    .update(deployments)
    .set({
      status: "failed",
      containerId: null,
      detectedPort: null,
      url: null,
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, deploymentId));
}

export async function reconcileDeploymentRuntime(
  fastify: FastifyInstance,
  deployment: { id: string; containerId: string | null },
) {
  if (!deployment.containerId) {
    await markDeploymentUnavailable(fastify, deployment.id);
    return false;
  }

  const containerStatus = await getContainerStatus(deployment.containerId);
  if (containerStatus === "running") {
    return true;
  }

  await markDeploymentUnavailable(fastify, deployment.id);
  return false;
}

export async function reconcileRunningDeployments(fastify: FastifyInstance) {
  const runningDeployments = await fastify.db
    .select({
      id: deployments.id,
      containerId: deployments.containerId,
    })
    .from(deployments)
    .where(eq(deployments.status, "running"));

  for (const deployment of runningDeployments) {
    await reconcileDeploymentRuntime(fastify, deployment);
  }
}
