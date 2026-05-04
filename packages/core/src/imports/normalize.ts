import type { Currency, MinorUnitAmount } from "../money/amount";
import type { EntryKind } from "../transactions/kinds";
import type { ImportSource } from "./source";

export type NormalizedTransactionInput = {
  id: string;
  postedOn: string;
  description: string;
  amountMinorUnits: MinorUnitAmount;
  currency: Currency;
  kind: EntryKind;
  source: ImportSource;
};
