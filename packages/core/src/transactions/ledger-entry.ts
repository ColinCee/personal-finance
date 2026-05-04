import type { Currency, MinorUnitAmount } from "../money/amount";
import type { EntryKind } from "./kinds";

export type LedgerEntry = {
  id: string;
  postedOn: string;
  description: string;
  amountMinorUnits: MinorUnitAmount;
  currency: Currency;
  kind: EntryKind;
  source: string;
};
