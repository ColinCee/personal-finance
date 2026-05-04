export const entryKinds = [
  "income",
  "spend",
  "transfer",
  "credit_card_payment",
  "reimbursement",
  "split_settlement",
] as const;

export type EntryKind = (typeof entryKinds)[number];

export type LedgerEntry = {
  id: string;
  postedOn: string;
  description: string;
  amount: number;
  currency: "GBP";
  kind: EntryKind;
  source: string;
};

export type ReviewTransaction = LedgerEntry & {
  reviewStatus: "needs_review" | "confirmed";
  affectsPersonalSpend: boolean;
};

export const exampleTransactions = [
  {
    id: "txn_salary",
    postedOn: "2026-05-01",
    description: "Salary",
    amount: 3000,
    currency: "GBP",
    kind: "income",
    source: "fake-monzo",
  },
  {
    id: "txn_groceries",
    postedOn: "2026-05-02",
    description: "Groceries",
    amount: -82.4,
    currency: "GBP",
    kind: "spend",
    source: "fake-amex",
  },
  {
    id: "txn_amex_payment",
    postedOn: "2026-05-03",
    description: "Amex payment",
    amount: -82.4,
    currency: "GBP",
    kind: "credit_card_payment",
    source: "fake-monzo",
  },
  {
    id: "txn_repayment",
    postedOn: "2026-05-04",
    description: "Dinner repayment",
    amount: 25,
    currency: "GBP",
    kind: "reimbursement",
    source: "fake-monzo",
  },
] satisfies LedgerEntry[];

export function affectsPersonalSpend(entry: LedgerEntry): boolean {
  return ["spend", "reimbursement", "split_settlement"].includes(entry.kind);
}

export function toReviewTransaction(entry: LedgerEntry): ReviewTransaction {
  return {
    ...entry,
    affectsPersonalSpend: affectsPersonalSpend(entry),
    reviewStatus: entry.kind === "spend" ? "confirmed" : "needs_review",
  };
}
