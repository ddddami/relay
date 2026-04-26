import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { getRunningDeployment, proxyDeploymentRequest } from "../../deployments/proxy";

const appProxyRoutes: FastifyPluginAsync = async (fastify) => {
  async function handleProxy(request: FastifyRequest, reply: FastifyReply) {
    const id = (request.params as { id: string }).id;
    const record = await getRunningDeployment(fastify, id);
    if (record === null) {
      reply.code(404);
      return { message: "Deployment not found." };
    }

    if (record === false) {
      reply.code(409);
      return { message: "Deployment is not running." };
    }

    const { containerId } = record;
    const { detectedPort } = record;
    if (!containerId || !detectedPort) {
      reply.code(409);
      return { message: "Deployment is not running." };
    }

    const requestUrl = new URL(request.raw.url ?? `/apps/${id}`, "http://relay.local");
    const pathPrefix = `/apps/${id}`;
    const pathSuffix = requestUrl.pathname.slice(pathPrefix.length) || "/";

    await proxyDeploymentRequest(request, reply, containerId, detectedPort, pathSuffix);
  }

  fastify.all("/:id", handleProxy);
  fastify.all("/:id/*", handleProxy);
};

export default appProxyRoutes;
