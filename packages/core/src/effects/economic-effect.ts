import type {
  AllocationPurpose,
  EconomicAllocation,
  SettlementLink,
} from "../allocations/economic-allocation";
import type { MinorUnitAmount } from "../money/amount";
import type { LedgerEntry } from "../transactions/ledger-entry";
import type { ReviewStatus } from "../transactions/review";

export const economicEffectTypes = [
  "personal_spend",
  "shared_spend",
  "receivable_created",
  "receivable_settled",
  "refund",
  "transfer",
  "saving",
  "investment",
  "credit_card_payment",
  "income",
  "not_personal_budget",
  "uncertain",
] as const;

export type EconomicEffectType = (typeof economicEffectTypes)[number];

export type EconomicEffect = {
  id: string;
  ledgerEntryId: string;
  type: EconomicEffectType;
  amountMinorUnits: MinorUnitAmount;
  counterparty: string | null;
  sourceId: string | null;
};

export type EconomicEffectReviewItem = {
  ledgerEntryId: string;
  status: ReviewStatus;
};

export type EconomicEffectTotals = Record<EconomicEffectType, MinorUnitAmount>;

const sharedPurposes = new Set<AllocationPurpose>([
  "partner",
  "joint",
  "friend",
]);

const receivablePurposes = new Set<AllocationPurpose>([
  "partner",
  "joint",
  "friend",
  "business",
  "reimbursable",
]);

const notPersonalBudgetPurposes = new Set<AllocationPurpose>([
  "business",
  "reimbursable",
  "excluded",
]);

export function deriveEconomicEffects(input: {
  entries: readonly LedgerEntry[];
  allocations: readonly EconomicAllocation[];
  settlements: readonly SettlementLink[];
  reviewItems: readonly EconomicEffectReviewItem[];
}): EconomicEffect[] {
  const entriesById = new Map(input.entries.map((entry) => [entry.id, entry]));
  const allocationsById = new Map(
    input.allocations.map((allocation) => [allocation.id, allocation]),
  );
  const openReviewEntryIds = new Set(
    input.reviewItems
      .filter((item) => item.status === "needs_review")
      .map((item) => item.ledgerEntryId),
  );
  const settlementEntryIds = new Set(
    input.settlements.map((settlement) => settlement.settlementLedgerEntryId),
  );
  const effects: EconomicEffect[] = [];

  for (const allocation of input.allocations) {
    effects.push(...effectsForAllocation(allocation));
  }

  for (const settlement of input.settlements) {
    effects.push(...effectsForSettlement(settlement, allocationsById));
  }

  for (const entry of input.entries) {
    if (!openReviewEntryIds.has(entry.id)) {
      effects.push(
        ...effectsForUnallocatedEntry(entry, settlementEntryIds.has(entry.id)),
      );
    }

    if (openReviewEntryIds.has(entry.id)) {
      effects.push({
        id: `effect_${entry.id}_uncertain`,
        ledgerEntryId: entry.id,
        type: "uncertain",
        amountMinorUnits: Math.abs(entry.amountMinorUnits),
        counterparty: null,
        sourceId: null,
      });
    }
  }

  return effects.filter((effect) => entriesById.has(effect.ledgerEntryId));
}

export function calculateEconomicEffectTotals(
  effects: readonly EconomicEffect[],
): EconomicEffectTotals {
  const totals = Object.fromEntries(
    economicEffectTypes.map((type) => [type, 0]),
  ) as EconomicEffectTotals;

  for (const effect of effects) {
    totals[effect.type] += effect.amountMinorUnits;
  }

  return totals;
}

function effectsForAllocation(
  allocation: EconomicAllocation,
): EconomicEffect[] {
  const effects: EconomicEffect[] = [];

  if (allocation.purpose === "personal") {
    effects.push(effectFromAllocation(allocation, "personal_spend"));
  }

  if (sharedPurposes.has(allocation.purpose)) {
    effects.push(effectFromAllocation(allocation, "shared_spend"));
  }

  if (receivablePurposes.has(allocation.purpose)) {
    effects.push(effectFromAllocation(allocation, "receivable_created"));
  }

  if (notPersonalBudgetPurposes.has(allocation.purpose)) {
    effects.push(effectFromAllocation(allocation, "not_personal_budget"));
  }

  return effects;
}

function effectsForSettlement(
  settlement: SettlementLink,
  allocationsById: ReadonlyMap<string, EconomicAllocation>,
): EconomicEffect[] {
  if (settlement.type === "card_payment") {
    return [
      {
        id: `effect_${settlement.id}_credit_card_payment`,
        ledgerEntryId: settlement.settlementLedgerEntryId,
        type: "credit_card_payment",
        amountMinorUnits: settlement.amountMinorUnits,
        counterparty: null,
        sourceId: settlement.id,
      },
    ];
  }

  const allocation = settlement.allocationId
    ? allocationsById.get(settlement.allocationId)
    : undefined;

  return [
    {
      id: `effect_${settlement.id}_receivable_settled`,
      ledgerEntryId: settlement.settlementLedgerEntryId,
      type: "receivable_settled",
      amountMinorUnits: settlement.amountMinorUnits,
      counterparty: allocation?.counterparty ?? null,
      sourceId: settlement.id,
    },
  ];
}

function effectsForUnallocatedEntry(
  entry: LedgerEntry,
  hasSettlementLink: boolean,
): EconomicEffect[] {
  if (entry.kind === "income") {
    return [
      {
        id: `effect_${entry.id}_income`,
        ledgerEntryId: entry.id,
        type: "income",
        amountMinorUnits: Math.abs(entry.amountMinorUnits),
        counterparty: null,
        sourceId: null,
      },
    ];
  }

  if (entry.kind === "transfer") {
    return [
      {
        id: `effect_${entry.id}_transfer`,
        ledgerEntryId: entry.id,
        type: "transfer",
        amountMinorUnits: Math.abs(entry.amountMinorUnits),
        counterparty: null,
        sourceId: null,
      },
    ];
  }

  if (entry.kind === "reimbursement" && !hasSettlementLink) {
    return [
      {
        id: `effect_${entry.id}_refund`,
        ledgerEntryId: entry.id,
        type: "refund",
        amountMinorUnits: Math.abs(entry.amountMinorUnits),
        counterparty: null,
        sourceId: null,
      },
    ];
  }

  if (entry.kind === "credit_card_payment" && !hasSettlementLink) {
    return [
      {
        id: `effect_${entry.id}_credit_card_payment`,
        ledgerEntryId: entry.id,
        type: "credit_card_payment",
        amountMinorUnits: Math.abs(entry.amountMinorUnits),
        counterparty: null,
        sourceId: null,
      },
    ];
  }

  return [];
}

function effectFromAllocation(
  allocation: EconomicAllocation,
  type: EconomicEffectType,
): EconomicEffect {
  return {
    id: `effect_${allocation.id}_${type}`,
    ledgerEntryId: allocation.ledgerEntryId,
    type,
    amountMinorUnits: allocation.amountMinorUnits,
    counterparty: allocation.counterparty,
    sourceId: allocation.id,
  };
}
