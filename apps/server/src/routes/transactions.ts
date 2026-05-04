import { Hono } from "hono";
import { z } from "zod";

import { entryKinds } from "@personal-finance/core";
import { ReviewItemNotFoundError } from "../errors";
import type { TransactionsService } from "../services/transactions-service";

const reviewDecisionPayloadSchema = z.object({
  decidedKind: z.enum(entryKinds),
  note: z.string().trim().min(1).max(1000).optional(),
});

export function createTransactionsRoutes(
  transactionsService: TransactionsService,
) {
  const routes = new Hono();

  routes.get("/transactions", (context) =>
    context.json(transactionsService.listReviewTransactions()),
  );

  routes.post("/review-items/:reviewItemId/decisions", async (context) => {
    const payload = reviewDecisionPayloadSchema.safeParse(
      await context.req.json(),
    );

    if (!payload.success) {
      return context.json(
        {
          error: "Invalid review decision payload",
          issues: payload.error.issues,
        },
        400,
      );
    }

    try {
      const decision = transactionsService.recordReviewDecision({
        reviewItemId: context.req.param("reviewItemId"),
        ...payload.data,
      });

      return context.json(decision, 201);
    } catch (error) {
      if (error instanceof ReviewItemNotFoundError) {
        return context.json({ error: error.message }, 404);
      }

      throw error;
    }
  });

  return routes;
}
