import { describe, expect, test } from "vitest";

import {
  affectsPersonalSpend,
  calculateNetPersonalSpendMinorUnits,
  type EntryKind,
  exampleTransactions,
  majorUnitsToMinorUnits,
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
  test("stores money as integer minor units", () => {
    const groceries = findExampleTransaction("spend");

    expect(groceries.amountMinorUnits).toBe(-8240);
    expect(Number.isInteger(groceries.amountMinorUnits)).toBe(true);
  });

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

  test("calculates net personal spend from spend-like entries only", () => {
    expect(calculateNetPersonalSpendMinorUnits(exampleTransactions)).toBe(
      majorUnitsToMinorUnits(-57.4),
    );
  });
});
