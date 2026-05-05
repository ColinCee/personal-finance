import {
  calculateMonthlyReports,
  type EconomicAllocation,
  type LedgerEntry,
  type MonthlyReport,
  type MonthlyReportReviewItem,
  type SettlementLink,
} from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import {
  economicAllocations,
  ledgerEntries,
  reviewItems,
  settlementLinks,
} from "../db/schema";

export type ReportsRepository = {
  listMonthlyReports: () => MonthlyReport[];
};

export function createReportsRepository(db: AppDatabase): ReportsRepository {
  return {
    listMonthlyReports: () =>
      calculateMonthlyReports({
        entries: db.select().from(ledgerEntries).all().map(toLedgerEntry),
        allocations: db
          .select()
          .from(economicAllocations)
          .all()
          .map(toEconomicAllocation),
        settlements: db
          .select()
          .from(settlementLinks)
          .all()
          .map(toSettlementLink),
        reviewItems: db
          .select()
          .from(reviewItems)
          .all()
          .map(toReportReviewItem),
      }),
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

function toReportReviewItem(
  reviewItem: typeof reviewItems.$inferSelect,
): MonthlyReportReviewItem {
  return {
    ledgerEntryId: reviewItem.ledgerEntryId,
    status: reviewItem.status,
  };
}
