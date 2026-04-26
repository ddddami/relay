import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export const databaseFilePath = join(process.cwd(), ".data", "relay.db");

mkdirSync(dirname(databaseFilePath), { recursive: true });

export const sqlite = new Database(databaseFilePath);
export const db = drizzle(sqlite);
