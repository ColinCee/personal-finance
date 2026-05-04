import type { NormalizedTransactionInput } from "../imports/normalize";
import type { EntryKind } from "../transactions/kinds";

export const classificationConfidences = ["high", "medium", "low"] as const;

export type ClassificationConfidence =
  (typeof classificationConfidences)[number];

export type ClassificationReason =
  | "ordinary_spend"
  | "salary_income"
  | "credit_card_payment"
  | "internal_transfer"
  | "reimbursement"
  | "split_settlement"
  | "source_supplied_kind"
  | "positive_amount_uncertain";

export type TransactionClassification = {
  kind: EntryKind;
  confidence: ClassificationConfidence;
  reason: ClassificationReason;
  reviewRequired: boolean;
};

type ClassifiableTransaction = Pick<
  NormalizedTransactionInput,
  "amountMinorUnits" | "description" | "kind" | "source"
>;

const monzoSources = new Set(["fake-monzo", "monzo"]);

export function classifyTransaction(
  transaction: ClassifiableTransaction,
): TransactionClassification {
  const description = normalizeDescription(transaction.description);

  if (isSalary(description) && transaction.amountMinorUnits > 0) {
    return highConfidence("income", "salary_income");
  }

  if (isCreditCardPayment(description, transaction)) {
    return highConfidence("credit_card_payment", "credit_card_payment");
  }

  if (isInternalTransfer(description)) {
    return highConfidence("transfer", "internal_transfer");
  }

  if (isSplitSettlement(description)) {
    return mediumConfidence("split_settlement", "split_settlement");
  }

  if (isReimbursement(description) && transaction.amountMinorUnits > 0) {
    return highConfidence("reimbursement", "reimbursement");
  }

  const defaultKind = defaultKindForAmount(transaction.amountMinorUnits);

  if (transaction.kind !== defaultKind) {
    return mediumConfidence(transaction.kind, "source_supplied_kind");
  }

  if (defaultKind === "income") {
    return lowConfidence("income", "positive_amount_uncertain");
  }

  return highConfidence("spend", "ordinary_spend");
}

function defaultKindForAmount(amountMinorUnits: number): EntryKind {
  if (amountMinorUnits < 0) {
    return "spend";
  }

  if (amountMinorUnits > 0) {
    return "income";
  }

  return "transfer";
}

function highConfidence(
  kind: EntryKind,
  reason: ClassificationReason,
): TransactionClassification {
  return {
    kind,
    confidence: "high",
    reason,
    reviewRequired: false,
  };
}

function mediumConfidence(
  kind: EntryKind,
  reason: ClassificationReason,
): TransactionClassification {
  return {
    kind,
    confidence: "medium",
    reason,
    reviewRequired: true,
  };
}

function lowConfidence(
  kind: EntryKind,
  reason: ClassificationReason,
): TransactionClassification {
  return {
    kind,
    confidence: "low",
    reason,
    reviewRequired: true,
  };
}

function normalizeDescription(description: string): string {
  return description.toLowerCase().replace(/\s+/g, " ").trim();
}

function isSalary(description: string): boolean {
  return /\b(salary|payroll|wages|pay)\b/.test(description);
}

function isCreditCardPayment(
  description: string,
  transaction: ClassifiableTransaction,
): boolean {
  return (
    monzoSources.has(transaction.source) &&
    transaction.amountMinorUnits < 0 &&
    /\b(amex|american express|credit card|card payment)\b/.test(description)
  );
}

function isInternalTransfer(description: string): boolean {
  return /\b(internal transfer|transfer to savings|transfer from savings|pot transfer)\b/.test(
    description,
  );
}

function isReimbursement(description: string): boolean {
  return /\b(refund|reimbursement|repayment|paid me back|settled up)\b/.test(
    description,
  );
}

function isSplitSettlement(description: string): boolean {
  return /\b(joint|split|shared|settlement)\b/.test(description);
}
