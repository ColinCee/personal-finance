import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export type DatabaseConnection = {
  db: AppDatabase;
  sqlite: Database.Database;
  close: () => void;
};

export function createDatabaseConnection(
  databasePath: string,
): DatabaseConnection {
  const sqlite = new Database(databasePath);

  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
