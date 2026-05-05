import { Hono } from "hono";

import type { AppDatabase } from "./db/client";
import { createImportsRepository } from "./repositories/imports-repository";
import { createReportsRepository } from "./repositories/reports-repository";
import { createTransactionsRepository } from "./repositories/transactions-repository";
import { createHealthRoutes } from "./routes/health";
import { createImportsRoutes } from "./routes/imports";
import { createReportsRoutes } from "./routes/reports";
import { createTransactionsRoutes } from "./routes/transactions";
import { createImportsService } from "./services/imports-service";
import { createReportsService } from "./services/reports-service";
import { createTransactionsService } from "./services/transactions-service";

export function createApp(db: AppDatabase) {
  const app = new Hono();
  const reportsRepository = createReportsRepository(db);
  const reportsService = createReportsService(reportsRepository);
  const transactionsRepository = createTransactionsRepository(db);
  const transactionsService = createTransactionsService(transactionsRepository);
  const importsRepository = createImportsRepository(db);
  const importsService = createImportsService(importsRepository);

  app.route("/api", createHealthRoutes());
  app.route("/api", createImportsRoutes(importsService));
  app.route("/api", createReportsRoutes(reportsService));
  app.route("/api", createTransactionsRoutes(transactionsService));

  return app;
}
