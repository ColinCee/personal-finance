import { Hono } from "hono";

import type { ReportsService } from "../services/reports-service";

export function createReportsRoutes(reportsService: ReportsService) {
  const routes = new Hono();

  routes.get("/reports/monthly", (context) =>
    context.json(reportsService.listMonthlyReports()),
  );

  return routes;
}
