import { eq } from "drizzle-orm";
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { deployments } from "../../db/schema";

const appProxyRoutes: FastifyPluginAsync = async (fastify) => {
  async function handleProxy(request: FastifyRequest, reply: FastifyReply) {
    const id = (request.params as { id: string }).id;
    const deployment = await fastify.db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
      .limit(1);

    const record = deployment[0];
    if (!record) {
      reply.code(404);
      return { message: "Deployment not found." };
    }

    if (record.status !== "running" || !record.containerId) {
      reply.code(409);
      return { message: "Deployment is not running." };
    }

    const requestUrl = new URL(request.raw.url ?? `/apps/${id}`, "http://relay.local");
    const pathPrefix = `/apps/${id}`;
    const pathSuffix = requestUrl.pathname.slice(pathPrefix.length) || "/";
    const upstreamUrl = new URL(
      `http://${record.containerId}:3000${pathSuffix}${requestUrl.search}`,
    );

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

    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.raw,
      duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
      redirect: "manual",
    });

    reply.code(response.status);

    response.headers.forEach((value, key) => {
      if (key === "content-length" || key === "transfer-encoding") {
        return;
      }

      reply.header(key, value);
    });

    reply.send(Buffer.from(await response.arrayBuffer()));
  }

  fastify.all("/:id", handleProxy);
  fastify.all("/:id/*", handleProxy);
};

export default appProxyRoutes;
