import type {
  AllocationPurpose,
  EconomicAllocation,
  SettlementLink,
} from "../allocations/economic-allocation";
import { allocationPurposes } from "../allocations/economic-allocation";
import {
  calculateEconomicEffectTotals,
  deriveEconomicEffects,
  type EconomicEffectTotals,
} from "../effects/economic-effect";
import type { MinorUnitAmount } from "../money/amount";
import type { LedgerEntry } from "../transactions/ledger-entry";
import type { ReviewStatus } from "../transactions/review";

export type MonthlyReportReviewItem = {
  ledgerEntryId: string;
  status: ReviewStatus;
};

export type MonthlyReport = {
  month: string;
  cashflowNetMinorUnits: MinorUnitAmount;
  moneyInMinorUnits: MinorUnitAmount;
  moneyOutMinorUnits: MinorUnitAmount;
  actualPersonalSpendMinorUnits: MinorUnitAmount;
  soloPersonalSpendMinorUnits: MinorUnitAmount;
  sharedSpendTotalMinorUnits: MinorUnitAmount;
  sharedSpendMyShareMinorUnits: MinorUnitAmount;
  sharedSpendOtherShareMinorUnits: MinorUnitAmount;
  partnerSpendMinorUnits: MinorUnitAmount;
  personalSpendMinorUnits: MinorUnitAmount;
  businessOrReimbursableMinorUnits: MinorUnitAmount;
  sharedSpendMinorUnits: MinorUnitAmount;
  sharedAwaitingRepaymentMinorUnits: MinorUnitAmount;
  movedOrSavedMinorUnits: MinorUnitAmount;
  incomeNewMoneyMinorUnits: MinorUnitAmount;
  notPersonalBudgetMinorUnits: MinorUnitAmount;
  creditCardPaymentMinorUnits: MinorUnitAmount;
  refundOrRepaymentMinorUnits: MinorUnitAmount;
  unresolvedImpactMinorUnits: MinorUnitAmount;
  economicEffectTotals: EconomicEffectTotals;
  allocationByPurpose: Record<AllocationPurpose, MinorUnitAmount>;
  monthEndOutstandingByPurpose: Record<AllocationPurpose, MinorUnitAmount>;
  monthEndCreditCardLiabilityMinorUnits: MinorUnitAmount;
  transactionCount: number;
  reviewItemCount: number;
  openReviewItemCount: number;
};

const receivablePurposes = new Set<AllocationPurpose>([
  "partner",
  "joint",
  "friend",
  "business",
  "reimbursable",
]);

const sharedPurposes = new Set<AllocationPurpose>([
  "partner",
  "joint",
  "friend",
]);

export function calculateMonthlyReports(input: {
  entries: readonly LedgerEntry[];
  allocations: readonly EconomicAllocation[];
  settlements: readonly SettlementLink[];
  reviewItems: readonly MonthlyReportReviewItem[];
}): MonthlyReport[] {
  const entriesById = new Map(input.entries.map((entry) => [entry.id, entry]));
  const months = uniqueSortedMonths(input.entries);

  return months.map((month) => {
    const monthlyEntries = input.entries.filter(
      (entry) => monthFromDate(entry.postedOn) === month,
    );
    const monthlyEntryIds = new Set(monthlyEntries.map((entry) => entry.id));
    const monthlyAllocations = input.allocations.filter((allocation) =>
      monthlyEntryIds.has(allocation.ledgerEntryId),
    );
    const monthlySettlements = input.settlements.filter((settlement) =>
      monthlyEntryIds.has(settlement.settlementLedgerEntryId),
    );
    const monthlyReviewItems = input.reviewItems.filter((item) =>
      monthlyEntryIds.has(item.ledgerEntryId),
    );
    const monthlyEffectTotals = calculateEconomicEffectTotals(
      deriveEconomicEffects({
        entries: monthlyEntries,
        allocations: monthlyAllocations,
        settlements: monthlySettlements,
        reviewItems: monthlyReviewItems,
      }),
    );
    const sharedSpendBreakdown =
      calculateSharedSpendBreakdown(monthlyAllocations);
    const monthEndEntryIds = new Set(
      input.entries
        .filter((entry) => monthFromDate(entry.postedOn) <= month)
        .map((entry) => entry.id),
    );
    const monthEndOutstandingByPurpose = calculateMonthEndOutstandingByPurpose(
      input.allocations,
      input.settlements,
      monthEndEntryIds,
    );

    return {
      month,
      cashflowNetMinorUnits: sum(
        monthlyEntries.map((entry) => entry.amountMinorUnits),
      ),
      moneyInMinorUnits: sum(
        monthlyEntries
          .filter((entry) => entry.amountMinorUnits > 0)
          .map((entry) => entry.amountMinorUnits),
      ),
      moneyOutMinorUnits: sum(
        monthlyEntries
          .filter((entry) => entry.amountMinorUnits < 0)
          .map((entry) => Math.abs(entry.amountMinorUnits)),
      ),
      personalSpendMinorUnits: sumAllocationsByPurpose(
        monthlyAllocations,
        "personal",
      ),
      actualPersonalSpendMinorUnits: monthlyEffectTotals.personal_spend,
      soloPersonalSpendMinorUnits: Math.max(
        0,
        monthlyEffectTotals.personal_spend -
          sharedSpendBreakdown.myShareMinorUnits,
      ),
      sharedSpendTotalMinorUnits: sharedSpendBreakdown.totalMinorUnits,
      sharedSpendMyShareMinorUnits: sharedSpendBreakdown.myShareMinorUnits,
      sharedSpendOtherShareMinorUnits:
        sharedSpendBreakdown.otherShareMinorUnits,
      partnerSpendMinorUnits: sumAllocationsByPurpose(
        monthlyAllocations,
        "partner",
      ),
      businessOrReimbursableMinorUnits:
        sumAllocationsByPurpose(monthlyAllocations, "business") +
        sumAllocationsByPurpose(monthlyAllocations, "reimbursable"),
      sharedSpendMinorUnits: sum(
        monthlyAllocations
          .filter((allocation) => sharedPurposes.has(allocation.purpose))
          .map((allocation) => allocation.amountMinorUnits),
      ),
      sharedAwaitingRepaymentMinorUnits: sum(
        ["partner", "joint", "friend"].map(
          (purpose) =>
            monthEndOutstandingByPurpose[purpose as AllocationPurpose],
        ),
      ),
      movedOrSavedMinorUnits:
        monthlyEffectTotals.transfer +
        monthlyEffectTotals.saving +
        monthlyEffectTotals.investment,
      incomeNewMoneyMinorUnits: monthlyEffectTotals.income,
      notPersonalBudgetMinorUnits: monthlyEffectTotals.not_personal_budget,
      creditCardPaymentMinorUnits: monthlyEffectTotals.credit_card_payment,
      refundOrRepaymentMinorUnits:
        monthlyEffectTotals.refund + monthlyEffectTotals.receivable_settled,
      unresolvedImpactMinorUnits: monthlyEffectTotals.uncertain,
      economicEffectTotals: monthlyEffectTotals,
      allocationByPurpose: allocationTotalsByPurpose(monthlyAllocations),
      monthEndOutstandingByPurpose,
      monthEndCreditCardLiabilityMinorUnits:
        calculateMonthEndCreditCardLiability(
          input.entries,
          input.settlements,
          entriesById,
          month,
        ),
      transactionCount: monthlyEntries.length,
      reviewItemCount: monthlyReviewItems.length,
      openReviewItemCount: monthlyReviewItems.filter(
        (item) => item.status === "needs_review",
      ).length,
    };
  });
}

function uniqueSortedMonths(entries: readonly LedgerEntry[]): string[] {
  return Array.from(
    new Set(entries.map((entry) => monthFromDate(entry.postedOn))),
  ).sort();
}

function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

function allocationTotalsByPurpose(
  allocations: readonly EconomicAllocation[],
): Record<AllocationPurpose, MinorUnitAmount> {
  return Object.fromEntries(
    allocationPurposes.map((purpose) => [
      purpose,
      sumAllocationsByPurpose(allocations, purpose),
    ]),
  ) as Record<AllocationPurpose, MinorUnitAmount>;
}

function calculateSharedSpendBreakdown(
  allocations: readonly EconomicAllocation[],
): {
  totalMinorUnits: MinorUnitAmount;
  myShareMinorUnits: MinorUnitAmount;
  otherShareMinorUnits: MinorUnitAmount;
} {
  const sharedEntryIds = new Set(
    allocations
      .filter((allocation) => sharedPurposes.has(allocation.purpose))
      .map((allocation) => allocation.ledgerEntryId),
  );
  let totalMinorUnits = 0;
  let myShareMinorUnits = 0;
  let otherShareMinorUnits = 0;

  for (const allocation of allocations) {
    if (!sharedEntryIds.has(allocation.ledgerEntryId)) {
      continue;
    }

    if (allocation.purpose === "personal") {
      totalMinorUnits += allocation.amountMinorUnits;
      myShareMinorUnits += allocation.amountMinorUnits;
    }

    if (sharedPurposes.has(allocation.purpose)) {
      totalMinorUnits += allocation.amountMinorUnits;
      otherShareMinorUnits += allocation.amountMinorUnits;
    }
  }

  return {
    totalMinorUnits,
    myShareMinorUnits,
    otherShareMinorUnits,
  };
}

function calculateMonthEndOutstandingByPurpose(
  allocations: readonly EconomicAllocation[],
  settlements: readonly SettlementLink[],
  monthEndEntryIds: ReadonlySet<string>,
): Record<AllocationPurpose, MinorUnitAmount> {
  const outstandingByPurpose = Object.fromEntries(
    allocationPurposes.map((purpose) => [purpose, 0]),
  ) as Record<AllocationPurpose, MinorUnitAmount>;
  const includedAllocations = allocations.filter((allocation) =>
    monthEndEntryIds.has(allocation.ledgerEntryId),
  );
  const allocationsById = new Map(
    includedAllocations.map((allocation) => [allocation.id, allocation]),
  );

  for (const allocation of includedAllocations) {
    if (receivablePurposes.has(allocation.purpose)) {
      outstandingByPurpose[allocation.purpose] += allocation.amountMinorUnits;
    }
  }

  for (const settlement of settlements) {
    if (
      !monthEndEntryIds.has(settlement.settlementLedgerEntryId) ||
      !settlement.allocationId
    ) {
      continue;
    }

    const allocation = allocationsById.get(settlement.allocationId);
    if (allocation && receivablePurposes.has(allocation.purpose)) {
      outstandingByPurpose[allocation.purpose] -= settlement.amountMinorUnits;
    }
  }

  return outstandingByPurpose;
}

function calculateMonthEndCreditCardLiability(
  entries: readonly LedgerEntry[],
  settlements: readonly SettlementLink[],
  entriesById: ReadonlyMap<string, LedgerEntry>,
  month: string,
): MinorUnitAmount {
  const cardChargesMinorUnits = entries
    .filter(
      (entry) =>
        monthFromDate(entry.postedOn) <= month &&
        entry.source.includes("amex") &&
        entry.kind === "spend" &&
        entry.amountMinorUnits < 0,
    )
    .reduce((total, entry) => total + Math.abs(entry.amountMinorUnits), 0);
  const cardPaymentsMinorUnits = settlements
    .filter((settlement) => {
      const settlementEntry = entriesById.get(
        settlement.settlementLedgerEntryId,
      );

      return (
        settlementEntry &&
        monthFromDate(settlementEntry.postedOn) <= month &&
        settlement.type === "card_payment"
      );
    })
    .reduce((total, settlement) => total + settlement.amountMinorUnits, 0);

  return cardChargesMinorUnits - cardPaymentsMinorUnits;
}

function sumAllocationsByPurpose(
  allocations: readonly EconomicAllocation[],
  purpose: AllocationPurpose,
): MinorUnitAmount {
  return sum(
    allocations
      .filter((allocation) => allocation.purpose === purpose)
      .map((allocation) => allocation.amountMinorUnits),
  );
}

function sum(amounts: readonly MinorUnitAmount[]): MinorUnitAmount {
  return amounts.reduce((total, amount) => total + amount, 0);
}
