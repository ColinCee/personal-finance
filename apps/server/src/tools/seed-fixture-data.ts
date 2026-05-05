import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadServerConfig } from "../config/env";
import { createDatabaseConnection } from "../db/client";
import { runMigrations } from "../db/migrate";
import { createImportsRepository } from "../repositories/imports-repository";
import { createImportsService } from "../services/imports-service";

const repositoryRoot = resolve(import.meta.dirname, "../../../..");
const fixturePath = resolve(repositoryRoot, "fixtures/transactions.csv");
const config = loadServerConfig();
const connection = createDatabaseConnection(config.databasePath);

try {
  runMigrations(connection.db);

  const importsService = createImportsService(
    createImportsRepository(connection.db),
  );
  const result = importsService.importFixtureCsv({
    csv: readFileSync(fixturePath, "utf8"),
    originalFileName: "fixtures/transactions.csv",
  });

  console.log(
    JSON.stringify(
      {
        databasePath: config.databasePath,
        fixturePath,
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  connection.close();
}
