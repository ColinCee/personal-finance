import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "../db/client";
import { runMigrations } from "../db/migrate";

export type TestDatabase = DatabaseConnection & {
  path: string;
  cleanup: () => void;
};

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), "personal-finance-db-"));
  const path = join(directory, "test.sqlite");
  const connection = createDatabaseConnection(path);

  runMigrations(connection.db);

  return {
    ...connection,
    path,
    cleanup: () => {
      connection.close();
      rmSync(directory, { force: true, recursive: true });
    },
  };
}
