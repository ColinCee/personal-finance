import {
  calculateAllocationSummary,
  type AllocationSummary,
} from "@personal-finance/core";
import type {
  EconomicAllocation,
  LedgerEntry,
  SettlementLink,
} from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import {
  economicAllocations,
  ledgerEntries,
  settlementLinks,
} from "../db/schema";

export type AllocationsRepository = {
  calculateSummary: () => AllocationSummary;
};

export function createAllocationsRepository(
  db: AppDatabase,
): AllocationsRepository {
  return {
    calculateSummary: () =>
      calculateAllocationSummary(
        db.select().from(ledgerEntries).all().map(toLedgerEntry),
        db.select().from(economicAllocations).all().map(toEconomicAllocation),
        db.select().from(settlementLinks).all().map(toSettlementLink),
      ),
  };
}

function toLedgerEntry(entry: typeof ledgerEntries.$inferSelect): LedgerEntry {
  return {
    id: entry.id,
    postedOn: entry.postedOn,
    description: entry.description,
    amountMinorUnits: entry.amountMinorUnits,
    currency: entry.currency,
    kind: entry.kind,
    source: entry.source,
  };
}

function toEconomicAllocation(
  allocation: typeof economicAllocations.$inferSelect,
): EconomicAllocation {
  return {
    id: allocation.id,
    ledgerEntryId: allocation.ledgerEntryId,
    purpose: allocation.purpose,
    amountMinorUnits: allocation.amountMinorUnits,
    counterparty: allocation.counterparty,
  };
}

function toSettlementLink(
  settlement: typeof settlementLinks.$inferSelect,
): SettlementLink {
  return {
    id: settlement.id,
    settlementLedgerEntryId: settlement.settlementLedgerEntryId,
    allocationId: settlement.allocationId,
    type: settlement.type,
    amountMinorUnits: settlement.amountMinorUnits,
  };
}
