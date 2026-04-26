import { join } from "node:path";

import fp from "fastify-plugin";
import { migrate } from "drizzle-orm/libsql/migrator";

import { db } from "../db/client";

export default fp(async (fastify) => {
  await migrate(db, {
    migrationsFolder: join(process.cwd(), "drizzle"),
  });

  fastify.decorate("db", db);
});

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}
