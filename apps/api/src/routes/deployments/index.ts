import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";

import { deployments } from "../../db/schema";

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
    repoName: repo.toLowerCase(),
  };
}

function buildDeploymentName(repoName: string) {
  const suffix = Math.floor(Math.random() * 900) + 100;

  return `${repoName}-${suffix}`;
}

const deploymentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async function () {
    return fastify.db.select().from(deployments).orderBy(desc(deployments.createdAt));
  });

  fastify.get("/:id", async function (request, reply) {
    const id = (request.params as { id: string }).id;
    const result = await fastify.db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
      .limit(1);

    if (!result.length) {
      reply.code(404);

      return {
        message: "Deployment not found.",
      };
    }

    return result[0];
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
      name: buildDeploymentName(parsed.repoName),
      repoUrl: parsed.repoUrl,
      status: "pending" as const,
      imageTag: null,
      containerId: null,
      url: null,
      createdAt: now,
      updatedAt: now,
    };

    await fastify.db.insert(deployments).values(deployment);

    reply.code(201);

    return deployment;
  });
};

export default deploymentRoutes;
