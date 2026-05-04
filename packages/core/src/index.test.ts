import { describe, expect, test } from "vitest";

import {
  affectsPersonalSpend,
  type EntryKind,
  exampleTransactions,
  toReviewTransaction,
} from ".";

function findExampleTransaction(kind: EntryKind) {
  const transaction = exampleTransactions.find(
    (exampleTransaction) => exampleTransaction.kind === kind,
  );

  if (!transaction) {
    throw new Error(`Missing example transaction with kind: ${kind}`);
  }

  return transaction;
}

describe("ledger rules", () => {
  test("does not count credit-card payments as personal spend", () => {
    const payment = findExampleTransaction("credit_card_payment");

    expect(affectsPersonalSpend(payment)).toBe(false);
  });

  test("puts non-spend entries into the review workflow", () => {
    const reimbursement = findExampleTransaction("reimbursement");

    expect(toReviewTransaction(reimbursement).reviewStatus).toBe(
      "needs_review",
    );
  });
});
