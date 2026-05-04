import { addMinorUnitAmounts } from "../money/amount";
import { affectsPersonalSpend } from "../rules/spending";
import type { LedgerEntry } from "../transactions/ledger-entry";

export function calculateNetPersonalSpendMinorUnits(
  entries: readonly LedgerEntry[],
): number {
  return addMinorUnitAmounts(
    entries
      .filter((entry) => affectsPersonalSpend(entry))
      .map((entry) => entry.amountMinorUnits),
  );
}
