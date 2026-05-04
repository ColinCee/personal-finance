import type { MinorUnitAmount } from "../money/amount";
import type { LedgerEntry } from "../transactions/ledger-entry";

export const allocationPurposes = [
  "personal",
  "partner",
  "joint",
  "friend",
  "business",
  "reimbursable",
  "excluded",
] as const;

export type AllocationPurpose = (typeof allocationPurposes)[number];

export const settlementTypes = [
  "card_payment",
  "reimbursement",
  "split_settlement",
  "business_reimbursement",
] as const;

export type SettlementType = (typeof settlementTypes)[number];

export type EconomicAllocation = {
  id: string;
  ledgerEntryId: string;
  purpose: AllocationPurpose;
  amountMinorUnits: MinorUnitAmount;
  counterparty: string | null;
};

export type SettlementLink = {
  id: string;
  settlementLedgerEntryId: string;
  allocationId: string | null;
  type: SettlementType;
  amountMinorUnits: MinorUnitAmount;
};

export type AllocationValidationIssue = {
  ledgerEntryId: string;
  expectedMinorUnits: MinorUnitAmount;
  allocatedMinorUnits: MinorUnitAmount;
};

export type AllocationSummary = {
  cashflowNetMinorUnits: MinorUnitAmount;
  personalSpendMinorUnits: MinorUnitAmount;
  businessOrReimbursableMinorUnits: MinorUnitAmount;
  creditCardLiabilityMinorUnits: MinorUnitAmount;
  outstandingByPurpose: Record<AllocationPurpose, MinorUnitAmount>;
};

const receivablePurposes = new Set<AllocationPurpose>([
  "partner",
  "joint",
  "friend",
  "business",
  "reimbursable",
]);

export function validateSpendAllocations(
  entries: readonly LedgerEntry[],
  allocations: readonly EconomicAllocation[],
): AllocationValidationIssue[] {
  return entries
    .filter((entry) => entry.kind === "spend" && entry.amountMinorUnits < 0)
    .flatMap((entry) => {
      const expectedMinorUnits = Math.abs(entry.amountMinorUnits);
      const allocatedMinorUnits = allocations
        .filter((allocation) => allocation.ledgerEntryId === entry.id)
        .reduce((total, allocation) => total + allocation.amountMinorUnits, 0);

      if (allocatedMinorUnits === expectedMinorUnits) {
        return [];
      }

      return [
        {
          ledgerEntryId: entry.id,
          expectedMinorUnits,
          allocatedMinorUnits,
        },
      ];
    });
}

export function calculateAllocationSummary(
  entries: readonly LedgerEntry[],
  allocations: readonly EconomicAllocation[],
  settlements: readonly SettlementLink[],
): AllocationSummary {
  const outstandingByPurpose = Object.fromEntries(
    allocationPurposes.map((purpose) => [purpose, 0]),
  ) as Record<AllocationPurpose, MinorUnitAmount>;

  for (const allocation of allocations) {
    if (receivablePurposes.has(allocation.purpose)) {
      outstandingByPurpose[allocation.purpose] += allocation.amountMinorUnits;
    }
  }

  for (const settlement of settlements) {
    if (!settlement.allocationId) {
      continue;
    }

    const allocation = allocations.find(
      (candidate) => candidate.id === settlement.allocationId,
    );

    if (allocation && receivablePurposes.has(allocation.purpose)) {
      outstandingByPurpose[allocation.purpose] -= settlement.amountMinorUnits;
    }
  }

  return {
    cashflowNetMinorUnits: entries.reduce(
      (total, entry) => total + entry.amountMinorUnits,
      0,
    ),
    personalSpendMinorUnits: sumAllocationsByPurpose(allocations, "personal"),
    businessOrReimbursableMinorUnits:
      sumAllocationsByPurpose(allocations, "business") +
      sumAllocationsByPurpose(allocations, "reimbursable"),
    creditCardLiabilityMinorUnits: calculateCreditCardLiability(
      entries,
      settlements,
    ),
    outstandingByPurpose,
  };
}

function calculateCreditCardLiability(
  entries: readonly LedgerEntry[],
  settlements: readonly SettlementLink[],
): MinorUnitAmount {
  const cardChargesMinorUnits = entries
    .filter(
      (entry) =>
        entry.source.includes("amex") &&
        entry.kind === "spend" &&
        entry.amountMinorUnits < 0,
    )
    .reduce((total, entry) => total + Math.abs(entry.amountMinorUnits), 0);
  const cardPaymentsMinorUnits = settlements
    .filter((settlement) => settlement.type === "card_payment")
    .reduce((total, settlement) => total + settlement.amountMinorUnits, 0);

  return cardChargesMinorUnits - cardPaymentsMinorUnits;
}

function sumAllocationsByPurpose(
  allocations: readonly EconomicAllocation[],
  purpose: AllocationPurpose,
): MinorUnitAmount {
  return allocations
    .filter((allocation) => allocation.purpose === purpose)
    .reduce((total, allocation) => total + allocation.amountMinorUnits, 0);
}
