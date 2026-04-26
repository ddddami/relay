import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

export const databaseFilePath = join(process.cwd(), ".data", "relay.db");
export const databaseUrl = `file:${databaseFilePath}`;

mkdirSync(dirname(databaseFilePath), { recursive: true });

export const sqlite = createClient({ url: databaseUrl });
export const db = drizzle({ client: sqlite, schema });
