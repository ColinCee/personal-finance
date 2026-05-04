import { z } from "zod";

import { entryKinds } from "@personal-finance/core";
import type { EntryKind } from "@personal-finance/core";

const entryKindSchema = z.enum(entryKinds);

const transactionSchema = z.object({
  id: z.string(),
  postedOn: z.string(),
  description: z.string(),
  amountMinorUnits: z.number().int(),
  currency: z.string(),
  kind: entryKindSchema,
  source: z.string(),
  reviewItemId: z.string().nullable(),
  reviewStatus: z.enum(["needs_review", "confirmed"]),
  affectsPersonalSpend: z.boolean(),
});

export type Transaction = z.infer<typeof transactionSchema>;

const reviewDecisionSchema = z.object({
  id: z.string(),
  reviewItemId: z.string(),
  action: z.enum(["confirm_kind", "change_kind"]),
  decidedKind: entryKindSchema,
  note: z.string().nullable(),
});

export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export type ReviewDecisionInput = {
  reviewItemId: string;
  decidedKind: EntryKind;
  note?: string;
};

export async function fetchTransactions(): Promise<Transaction[]> {
  const response = await fetch("/api/transactions");

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }

  return z.array(transactionSchema).parse(await response.json());
}

export async function submitReviewDecision(
  decision: ReviewDecisionInput,
): Promise<ReviewDecision> {
  const response = await fetch(
    `/api/review-items/${decision.reviewItemId}/decisions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decidedKind: decision.decidedKind,
        note: decision.note,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to submit review decision: ${response.status}`);
  }

  return reviewDecisionSchema.parse(await response.json());
}
