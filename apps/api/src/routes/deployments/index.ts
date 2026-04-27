import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";

import { appendDeploymentLog, subscribeToDeploymentLogs } from "../../deployments/logs";
import { removeContainerIfExists, startDeploymentRun } from "../../deployments/run";
import { deploymentLogs, deployments } from "../../db/schema";

type CreateDeploymentBody = {
  repoUrl?: unknown;
};

function parseGitHubRepoUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const repoUrl = value.trim();
  if (!repoUrl) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(repoUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  if (!owner || !repo) {
    return null;
  }

  return {
    repoUrl,
  };
}

const deploymentNameAdjectives = ["storm", "blue", "ember", "silent", "rapid", "bright"];
const deploymentNameNouns = ["fox", "wave", "forge", "field", "stack", "orbit"];

function buildDeploymentName() {
  const adjective =
    deploymentNameAdjectives[Math.floor(Math.random() * deploymentNameAdjectives.length)];
  const noun = deploymentNameNouns[Math.floor(Math.random() * deploymentNameNouns.length)];
  const suffix = Math.floor(Math.random() * 900) + 100;

  return `${adjective}-${noun}-${suffix}`;
}

function shouldStartDeploymentRun() {
  return process.env.DISABLE_DEPLOYMENT_RUNNER !== "1";
}

const deploymentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async function () {
    return fastify.db.select().from(deployments).orderBy(desc(deployments.createdAt));
  });

  async function findDeployment(id: string) {
    const result = await fastify.db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  fastify.get("/:id", async function (request, reply) {
    const id = (request.params as { id: string }).id;
    const result = await findDeployment(id);

    if (!result) {
      reply.code(404);

      return {
        message: "Deployment not found.",
      };
    }

    return result;
  });

  fastify.get("/:id/logs", async function (request, reply) {
    const id = (request.params as { id: string }).id;
    const deployment = await findDeployment(id);

    if (!deployment) {
      reply.code(404);

      return {
        message: "Deployment not found.",
      };
    }

    return fastify.db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, id))
      .orderBy(deploymentLogs.timestamp);
  });

  fastify.get("/:id/logs/stream", async function (request, reply) {
    const id = (request.params as { id: string }).id;
    const deployment = await findDeployment(id);

    if (!deployment) {
      reply.code(404);

      return {
        message: "Deployment not found.",
      };
    }

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    reply.raw.write(": connected\n\n");

    const persistedLogs = await fastify.db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, id))
      .orderBy(deploymentLogs.timestamp);

    for (const log of persistedLogs) {
      reply.raw.write(
        `event: log\ndata: ${JSON.stringify({
          ...log,
          timestamp: log.timestamp.toISOString(),
        })}\n\n`,
      );
    }

    const unsubscribe = subscribeToDeploymentLogs(id, (log) => {
      reply.raw.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(": keepalive\n\n");
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    return reply.hijack();
  });

  fastify.delete("/:id", async function (request, reply) {
    const id = (request.params as { id: string }).id;
    const deployment = await findDeployment(id);

    if (!deployment) {
      reply.code(404);

      return {
        message: "Deployment not found.",
      };
    }

    if (deployment.containerId) {
      await appendDeploymentLog(id, "system", "Stopping runtime container");
      await removeContainerIfExists(deployment.containerId);
    }

    await fastify.db.delete(deploymentLogs).where(eq(deploymentLogs.deploymentId, id));
    await fastify.db.delete(deployments).where(eq(deployments.id, id));

    reply.code(204);
  });

  fastify.post("/:id/redeploy", async function (request, reply) {
    const id = (request.params as { id: string }).id;
    const deployment = await findDeployment(id);

    if (!deployment) {
      reply.code(404);

      return {
        message: "Deployment not found.",
      };
    }

    const now = new Date();

    if (deployment.containerId) {
      await appendDeploymentLog(id, "system", "Stopping runtime container for redeploy");
      await removeContainerIfExists(deployment.containerId);
    }

    await fastify.db
      .update(deployments)
      .set({
        status: "pending",
        imageTag: null,
        containerId: null,
        detectedPort: null,
        url: null,
        updatedAt: now,
      })
      .where(eq(deployments.id, id));

    await appendDeploymentLog(id, "system", "Redeploy requested");

    const updatedDeployment = (await findDeployment(id))!;

    reply.code(202);
    if (shouldStartDeploymentRun()) {
      startDeploymentRun(id);
    }

    return updatedDeployment;
  });

  fastify.post("/", async function (request, reply) {
    const parsed = parseGitHubRepoUrl((request.body as CreateDeploymentBody | undefined)?.repoUrl);

    if (!parsed) {
      reply.code(400);

      return {
        message: "A valid public GitHub repository URL is required.",
      };
    }

    const now = new Date();
    const deployment = {
      id: randomUUID(),
      name: buildDeploymentName(),
      repoUrl: parsed.repoUrl,
      status: "pending" as const,
      imageTag: null,
      containerId: null,
      detectedPort: null,
      url: null,
      createdAt: now,
      updatedAt: now,
    };

    await fastify.db.insert(deployments).values(deployment);

    reply.code(201);

    if (shouldStartDeploymentRun()) {
      startDeploymentRun(deployment.id);
    }

    return deployment;
  });
};

export default deploymentRoutes;
