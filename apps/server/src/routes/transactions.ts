import { Hono } from "hono";

import type { TransactionsService } from "../services/transactions-service";

export function createTransactionsRoutes(
  transactionsService: TransactionsService,
) {
  const routes = new Hono();

  routes.get("/transactions", (context) =>
    context.json(transactionsService.listReviewTransactions()),
  );

  return routes;
}
