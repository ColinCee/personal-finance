import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  affectsPersonalSpend,
  calculateNetPersonalSpendMinorUnits,
  type EntryKind,
  exampleTransactions,
  majorUnitsToMinorUnits,
  parseFixtureTransactionsCsv,
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

describe("fixture imports", () => {
  test("parses the committed fixture CSV", () => {
    const csv = readFileSync(
      resolve(import.meta.dirname, "../../../fixtures/transactions.csv"),
      "utf8",
    );

    expect(parseFixtureTransactionsCsv(csv)).toHaveLength(4);
  });

  test("parses fixture CSV rows into normalized transaction inputs", () => {
    const transactions = parseFixtureTransactionsCsv(
      [
        "posted_on,description,amount,currency,kind,source",
        "2026-05-02,Groceries,-82.40,GBP,spend,fake-amex",
      ].join("\n"),
    );

    expect(transactions).toEqual([
      {
        id: "fixture:0:2026-05-02:fake-amex",
        postedOn: "2026-05-02",
        description: "Groceries",
        amountMinorUnits: -8240,
        currency: "GBP",
        kind: "spend",
        source: "fake-amex",
      },
    ]);
  });

  test("rejects malformed fixture CSV rows", () => {
    expect(() =>
      parseFixtureTransactionsCsv(
        [
          "posted_on,description,amount,currency,kind,source",
          "not-a-date,Groceries,-82.4,GBP,spend,fake-amex",
        ].join("\n"),
      ),
    ).toThrow();
  });

  test("parses quoted fixture CSV values", () => {
    const transactions = parseFixtureTransactionsCsv(
      [
        "posted_on,description,amount,currency,kind,source",
        '2026-05-02,"Groceries, household",-82.40,GBP,spend,fake-amex',
      ].join("\n"),
    );

    expect(transactions[0]?.description).toBe("Groceries, household");
  });
});
