import { Hono } from "hono";
import { z } from "zod";

import {
  allocationPurposes,
  entryKinds,
  settlementTypes,
} from "@personal-finance/core";
import {
  AllocationDecisionInvalidError,
  ReviewItemNotFoundError,
} from "../errors";
import type { TransactionsService } from "../services/transactions-service";

const reviewDecisionPayloadSchema = z.object({
  decidedKind: z.enum(entryKinds),
  note: z.string().trim().min(1).max(1000).optional(),
});

const allocationDecisionPayloadSchema = z.object({
  note: z.string().trim().min(1).max(1000).optional(),
  allocations: z
    .array(
      z.object({
        purpose: z.enum(allocationPurposes),
        amountMinorUnits: z.number().int().positive(),
        counterparty: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .optional(),
  settlements: z
    .array(
      z.object({
        allocationId: z.string().nullable().optional(),
        type: z.enum(settlementTypes),
        amountMinorUnits: z.number().int().positive(),
      }),
    )
    .optional(),
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

  routes.post(
    "/review-items/:reviewItemId/allocation-decisions",
    async (context) => {
      const payload = allocationDecisionPayloadSchema.safeParse(
        await context.req.json(),
      );

      if (!payload.success) {
        return context.json(
          {
            error: "Invalid allocation decision payload",
            issues: payload.error.issues,
          },
          400,
        );
      }

      try {
        const decision = transactionsService.recordAllocationDecision({
          reviewItemId: context.req.param("reviewItemId"),
          ...payload.data,
        });

        return context.json(decision, 201);
      } catch (error) {
        if (error instanceof ReviewItemNotFoundError) {
          return context.json({ error: error.message }, 404);
        }

        if (error instanceof AllocationDecisionInvalidError) {
          return context.json({ error: error.message }, 400);
        }

        throw error;
      }
    },
  );

  return routes;
}
