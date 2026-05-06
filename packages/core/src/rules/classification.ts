import type { NormalizedTransactionInput } from "../imports/normalize";
import type { ImportSource } from "../imports/source";
import type { EntryKind } from "../transactions/kinds";

export const classificationConfidences = ["high", "medium", "low"] as const;

export type ClassificationConfidence =
  (typeof classificationConfidences)[number];

export type ClassificationReason =
  | "ordinary_spend"
  | "zero_amount"
  | "salary_income"
  | "credit_card_payment"
  | "internal_transfer"
  | "pot_transfer"
  | "monzo_flex"
  | "saving_or_investment_movement"
  | "shared_repayment"
  | "reimbursement"
  | "split_settlement"
  | "source_supplied_kind"
  | "positive_amount_uncertain"
  | "private_rule";

export type TransactionClassification = {
  kind: EntryKind;
  confidence: ClassificationConfidence;
  reason: ClassificationReason;
  reviewRequired: boolean;
  matchedRule?: MatchedClassificationRule;
};

type ClassifiableTransaction = Pick<
  NormalizedTransactionInput,
  "amountMinorUnits" | "description" | "kind" | "source"
> &
  Partial<Pick<NormalizedTransactionInput, "raw">>;

export type LocalClassificationRule = {
  id: string;
  label: string;
  enabled?: boolean;
  match: {
    descriptionContains: readonly string[];
    amountDirection?: "any" | "money_in" | "money_out";
    sources?: readonly ImportSource[];
  };
  classifyAs: EntryKind;
  confidence?: ClassificationConfidence;
  reviewRequired?: boolean;
};

export type MatchedClassificationRule = {
  id: string;
  label: string;
};

const monzoSources = new Set(["fake-monzo", "monzo"]);

export function classifyTransaction(
  transaction: ClassifiableTransaction,
): TransactionClassification {
  const description = normalizeDescription(transaction.description);

  if (transaction.amountMinorUnits === 0) {
    return highConfidence("transfer", "zero_amount");
  }

  if (isSalary(description) && transaction.amountMinorUnits > 0) {
    return highConfidence("income", "salary_income");
  }

  if (isCreditCardPayment(description, transaction)) {
    return highConfidence("credit_card_payment", "credit_card_payment");
  }

  if (isInstantAccessPotTransfer(description, transaction)) {
    return highConfidence("transfer", "pot_transfer");
  }

  if (isMonzoFlexMovement(description, transaction)) {
    return highConfidence("transfer", "monzo_flex");
  }

  if (isSavingOrInvestmentMovementDescription(description)) {
    return mediumConfidence("transfer", "saving_or_investment_movement");
  }

  if (isInternalTransfer(description)) {
    return highConfidence("transfer", "internal_transfer");
  }

  if (transaction.amountMinorUnits > 0 && isSharedRepayment(description)) {
    return mediumConfidence("reimbursement", "shared_repayment");
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

  if (defaultKind === "transfer") {
    return highConfidence("transfer", "internal_transfer");
  }

  return highConfidence("spend", "ordinary_spend");
}

export function classifyTransactionWithLocalRules(
  transaction: ClassifiableTransaction,
  rules: readonly LocalClassificationRule[],
): TransactionClassification {
  const matchedRule = rules.find((rule) =>
    localRuleMatchesTransaction(rule, transaction),
  );

  if (!matchedRule) {
    return classifyTransaction(transaction);
  }

  return {
    kind: matchedRule.classifyAs,
    confidence: matchedRule.confidence ?? "high",
    reason: "private_rule",
    reviewRequired: matchedRule.reviewRequired ?? false,
    matchedRule: {
      id: matchedRule.id,
      label: matchedRule.label,
    },
  };
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

function localRuleMatchesTransaction(
  rule: LocalClassificationRule,
  transaction: ClassifiableTransaction,
): boolean {
  if (rule.enabled === false) {
    return false;
  }

  if (!amountDirectionMatches(rule.match.amountDirection, transaction)) {
    return false;
  }

  if (rule.match.sources && !rule.match.sources.includes(transaction.source)) {
    return false;
  }

  const description = normalizeDescription(transaction.description);

  return rule.match.descriptionContains.some((term) =>
    description.includes(normalizeDescription(term)),
  );
}

function amountDirectionMatches(
  direction: LocalClassificationRule["match"]["amountDirection"],
  transaction: ClassifiableTransaction,
): boolean {
  switch (direction ?? "any") {
    case "any":
      return true;
    case "money_in":
      return transaction.amountMinorUnits > 0;
    case "money_out":
      return transaction.amountMinorUnits < 0;
  }
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
  return /\b(internal transfer|own account|between accounts)\b/.test(
    description,
  );
}

function isInstantAccessPotTransfer(
  description: string,
  transaction: ClassifiableTransaction,
): boolean {
  return (
    monzoSources.has(transaction.source) &&
    /\binstant access pot\b/.test(description)
  );
}

function isMonzoFlexMovement(
  description: string,
  transaction: ClassifiableTransaction,
): boolean {
  return (
    monzoSources.has(transaction.source) &&
    (normalizeDescription(transaction.raw?.Type ?? "") === "flex" ||
      normalizeDescription(transaction.raw?.Description ?? "").includes(
        "flex",
      ) ||
      /\bflex\b/.test(description))
  );
}

export function isSavingOrInvestmentMovementDescription(
  description: string,
): boolean {
  return /\b(pot|savings?|isa|investment|invest|vanguard|trading 212|pension)\b/.test(
    normalizeDescription(description),
  );
}

function isReimbursement(description: string): boolean {
  return /\b(refund|reimbursement|repayment|paid me back|settled up)\b/.test(
    description,
  );
}

function isSharedRepayment(description: string): boolean {
  return /\b(shared subscription|family subscription|splitwise|bill split|shared|joint|household|housemate|flatmate|utilities?|council tax|rent)\b/.test(
    description,
  );
}

function isSplitSettlement(description: string): boolean {
  return /\b(joint|split|shared|settlement)\b/.test(description);
}
