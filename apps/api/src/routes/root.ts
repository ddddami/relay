import { FastifyPluginAsync } from "fastify";

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
  const payload = { ok: true, service: "relay-api" };

  fastify.get("/", async function () {
    return payload;
  });

  fastify.get("/health", async function () {
    return payload;
  });
};

export default root;
