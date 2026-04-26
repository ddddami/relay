import { desc } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";

import { deployments } from "../../db/schema";

const deploymentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async function () {
    return fastify.db.select().from(deployments).orderBy(desc(deployments.createdAt));
  });
};

export default deploymentRoutes;
