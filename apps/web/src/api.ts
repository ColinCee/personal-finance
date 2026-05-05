import { z } from "zod";

import {
  allocationPurposes,
  entryKinds,
  settlementTypes,
} from "@personal-finance/core";
import type {
  AllocationPurpose,
  EntryKind,
  SettlementType,
} from "@personal-finance/core";

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

const allocationPurposeTotalsSchema = z.object({
  personal: z.number().int(),
  partner: z.number().int(),
  joint: z.number().int(),
  friend: z.number().int(),
  business: z.number().int(),
  reimbursable: z.number().int(),
  excluded: z.number().int(),
});

const monthlyReportSchema = z.object({
  month: z.string(),
  cashflowNetMinorUnits: z.number().int(),
  moneyInMinorUnits: z.number().int(),
  moneyOutMinorUnits: z.number().int(),
  personalSpendMinorUnits: z.number().int(),
  businessOrReimbursableMinorUnits: z.number().int(),
  sharedSpendMinorUnits: z.number().int(),
  allocationByPurpose: allocationPurposeTotalsSchema,
  monthEndOutstandingByPurpose: allocationPurposeTotalsSchema,
  monthEndCreditCardLiabilityMinorUnits: z.number().int(),
  transactionCount: z.number().int(),
  reviewItemCount: z.number().int(),
  openReviewItemCount: z.number().int(),
});

export type MonthlyReport = z.infer<typeof monthlyReportSchema>;

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

const allocationDecisionSchema = z.object({
  reviewItemId: z.string(),
  allocationCount: z.number().int(),
  settlementCount: z.number().int(),
});

export type AllocationDecision = z.infer<typeof allocationDecisionSchema>;

export type AllocationDecisionInput = {
  reviewItemId: string;
  note?: string;
  allocations?: readonly AllocationDecisionAllocationInput[];
  settlements?: readonly AllocationDecisionSettlementInput[];
};

export type AllocationDecisionAllocationInput = {
  purpose: AllocationPurpose;
  amountMinorUnits: number;
  counterparty?: string;
};

export type AllocationDecisionSettlementInput = {
  allocationId?: string | null;
  type: SettlementType;
  amountMinorUnits: number;
};

const allocationDecisionPayloadSchema = z.object({
  note: z.string().optional(),
  allocations: z
    .array(
      z.object({
        purpose: z.enum(allocationPurposes),
        amountMinorUnits: z.number().int().positive(),
        counterparty: z.string().optional(),
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

export async function fetchTransactions(): Promise<Transaction[]> {
  const response = await fetch("/api/transactions");

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }

  return z.array(transactionSchema).parse(await response.json());
}

export async function fetchMonthlyReports(): Promise<MonthlyReport[]> {
  const response = await fetch("/api/reports/monthly");

  if (!response.ok) {
    throw new Error(`Failed to fetch monthly reports: ${response.status}`);
  }

  return z.array(monthlyReportSchema).parse(await response.json());
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

export async function submitAllocationDecision(
  decision: AllocationDecisionInput,
): Promise<AllocationDecision> {
  const payload = allocationDecisionPayloadSchema.parse({
    note: decision.note,
    allocations: decision.allocations,
    settlements: decision.settlements,
  });
  const response = await fetch(
    `/api/review-items/${decision.reviewItemId}/allocation-decisions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to submit allocation decision: ${response.status}`);
  }

  return allocationDecisionSchema.parse(await response.json());
}
