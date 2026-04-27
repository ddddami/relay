import http from "node:http";

import { eq } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { deployments } from "../db/schema";
import { reconcileDeploymentRuntime } from "./runtime";

export async function getRunningDeployment(fastify: FastifyInstance, deploymentId: string) {
  const result = await fastify.db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  const deployment = result[0];
  if (!deployment) {
    return null;
  }

  if (deployment.status !== "running" || !deployment.containerId) {
    return false;
  }

  const isRuntimeAvailable = await reconcileDeploymentRuntime(fastify, deployment);
  if (!isRuntimeAvailable) {
    return false;
  }

  return deployment;
}

export async function proxyDeploymentRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  containerId: string,
  port: number,
  upstreamPath: string,
) {
  const requestUrl = new URL(request.raw.url ?? upstreamPath, "http://relay.local");
  const upstreamUrl = new URL(`http://${containerId}:${port}${upstreamPath}${requestUrl.search}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || key === "host" || key === "content-length") {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
      continue;
    }

    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  headers.set("host", `localhost:${port}`);

  const response = await new Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const upstreamRequest = http.request(
      upstreamUrl,
      {
        method: request.method,
        headers: Object.fromEntries(headers.entries()),
      },
      (upstreamResponse) => {
        const chunks: Buffer[] = [];

        upstreamResponse.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        upstreamResponse.on("end", () => {
          resolve({
            statusCode: upstreamResponse.statusCode ?? 502,
            headers: upstreamResponse.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    upstreamRequest.on("error", reject);

    if (request.method === "GET" || request.method === "HEAD") {
      upstreamRequest.end();
      return;
    }

    request.raw.pipe(upstreamRequest);
  });

  reply.code(response.statusCode);

  for (const [key, value] of Object.entries(response.headers)) {
    if (!value || key === "content-length" || key === "transfer-encoding") {
      continue;
    }

    if (Array.isArray(value)) {
      reply.header(key, value.join(", "));
      continue;
    }

    reply.header(key, value);
  }

  reply.send(response.body);
}
