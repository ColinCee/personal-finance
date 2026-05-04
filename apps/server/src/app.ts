import { Hono } from "hono";

import type { AppDatabase } from "./db/client";
import { createTransactionsRepository } from "./repositories/transactions-repository";
import { createHealthRoutes } from "./routes/health";
import { createTransactionsRoutes } from "./routes/transactions";
import { createTransactionsService } from "./services/transactions-service";

export function createApp(db: AppDatabase) {
  const app = new Hono();
  const transactionsRepository = createTransactionsRepository(db);
  const transactionsService = createTransactionsService(transactionsRepository);

  app.route("/api", createHealthRoutes());
  app.route("/api", createTransactionsRoutes(transactionsService));

  return app;
}
