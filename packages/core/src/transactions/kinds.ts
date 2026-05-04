export const entryKinds = [
  "income",
  "spend",
  "transfer",
  "credit_card_payment",
  "reimbursement",
  "split_settlement",
] as const;

export type EntryKind = (typeof entryKinds)[number];
