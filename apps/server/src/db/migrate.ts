import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppDatabase } from "./client";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export const migrationsFolder = resolve(currentDirectory, "../../drizzle");

export function runMigrations(db: AppDatabase): void {
  migrate(db, { migrationsFolder });
}
