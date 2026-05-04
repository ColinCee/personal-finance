import { majorUnitsToMinorUnits } from "../money/amount";
import type { LedgerEntry } from "../transactions/ledger-entry";

export const exampleTransactions = [
  {
    id: "txn_salary",
    postedOn: "2026-05-01",
    description: "Salary",
    amountMinorUnits: majorUnitsToMinorUnits(3000),
    currency: "GBP",
    kind: "income",
    source: "fake-monzo",
  },
  {
    id: "txn_groceries",
    postedOn: "2026-05-02",
    description: "Groceries",
    amountMinorUnits: majorUnitsToMinorUnits(-82.4),
    currency: "GBP",
    kind: "spend",
    source: "fake-amex",
  },
  {
    id: "txn_amex_payment",
    postedOn: "2026-05-03",
    description: "Amex payment",
    amountMinorUnits: majorUnitsToMinorUnits(-82.4),
    currency: "GBP",
    kind: "credit_card_payment",
    source: "fake-monzo",
  },
  {
    id: "txn_repayment",
    postedOn: "2026-05-04",
    description: "Dinner repayment",
    amountMinorUnits: majorUnitsToMinorUnits(25),
    currency: "GBP",
    kind: "reimbursement",
    source: "fake-monzo",
  },
] satisfies LedgerEntry[];
