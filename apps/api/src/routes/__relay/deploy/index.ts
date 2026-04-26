import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { getRunningDeployment, proxyDeploymentRequest } from "../../../deployments/proxy";

function getDeploymentIdFromHost(value: string | undefined) {
  if (!value) {
    return null;
  }

  const host = value.split(":")[0]?.trim();
  if (!host) {
    return null;
  }

  const match = host.match(/^([0-9a-f-]{36})\.localhost$/i);
  return match?.[1] ?? null;
}

const deploymentHostRoutes: FastifyPluginAsync = async (fastify) => {
  async function handleProxy(request: FastifyRequest, reply: FastifyReply) {
    const deploymentId = getDeploymentIdFromHost(request.headers.host);
    if (!deploymentId) {
      reply.code(404);
      return { message: "Deployment not found." };
    }

    const deployment = await getRunningDeployment(fastify, deploymentId);
    if (deployment === null) {
      reply.code(404);
      return { message: "Deployment not found." };
    }

    if (deployment === false) {
      reply.code(409);
      return { message: "Deployment is not running." };
    }

    const { containerId, detectedPort } = deployment;
    if (!containerId || !detectedPort) {
      reply.code(409);
      return { message: "Deployment is not running." };
    }

    const requestUrl = new URL(request.raw.url ?? "/__relay/deploy", "http://relay.local");
    const pathPrefix = "/__relay/deploy";
    const pathSuffix = requestUrl.pathname.slice(pathPrefix.length) || "/";

    await proxyDeploymentRequest(request, reply, containerId, detectedPort, pathSuffix);
  }

  fastify.all("/", handleProxy);
  fastify.all("/*", handleProxy);
};

export default deploymentHostRoutes;
