import { join } from "node:path";

import { migrate } from "drizzle-orm/libsql/migrator";

import { db, sqlite } from "./client";

async function main() {
  try {
    await migrate(db, {
      migrationsFolder: join(process.cwd(), "drizzle"),
    });
  } finally {
    sqlite.close();
  }
}

void main();
