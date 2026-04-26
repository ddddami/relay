import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const defaultDatabaseFilePath = join(process.cwd(), ".data", "relay.db");

export const databaseUrl = process.env.DATABASE_URL ?? `file:${defaultDatabaseFilePath}`;
export const databaseFilePath = databaseUrl.startsWith("file:")
  ? databaseUrl.slice("file:".length)
  : defaultDatabaseFilePath;

mkdirSync(dirname(databaseFilePath), { recursive: true });

export const sqlite = createClient({ url: databaseUrl });
export const db = drizzle({ client: sqlite, schema });
