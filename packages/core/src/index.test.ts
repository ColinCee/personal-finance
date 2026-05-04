import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  affectsPersonalSpend,
  calculateNetPersonalSpendMinorUnits,
  classifyTransaction,
  type EntryKind,
  exampleTransactions,
  majorUnitsToMinorUnits,
  parseAmexTransactionsCsv,
  parseFixtureTransactionsCsv,
  parseMonzoTransactionsCsv,
  reviewDecisionActionForKind,
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

  test("models review decisions as confirmations or kind changes", () => {
    expect(reviewDecisionActionForKind("credit_card_payment", "spend")).toBe(
      "change_kind",
    );
    expect(
      reviewDecisionActionForKind("credit_card_payment", "credit_card_payment"),
    ).toBe("confirm_kind");
  });

  test("calculates net personal spend from spend-like entries only", () => {
    expect(calculateNetPersonalSpendMinorUnits(exampleTransactions)).toBe(
      majorUnitsToMinorUnits(-57.4),
    );
  });
});

describe("classification rules", () => {
  test("classifies salary income as high confidence without review", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: 300000,
        description: "Monthly salary",
        kind: "income",
        source: "monzo",
      }),
    ).toEqual({
      kind: "income",
      confidence: "high",
      reason: "salary_income",
      reviewRequired: false,
    });
  });

  test("classifies Monzo Amex payments as credit-card payments", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -250000,
        description: "American Express card payment",
        kind: "spend",
        source: "monzo",
      }),
    ).toEqual({
      kind: "credit_card_payment",
      confidence: "high",
      reason: "credit_card_payment",
      reviewRequired: false,
    });
  });

  test("classifies internal savings transfers without counting them as spend", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -50000,
        description: "Transfer to savings",
        kind: "spend",
        source: "monzo",
      }),
    ).toMatchObject({
      kind: "transfer",
      confidence: "high",
      reviewRequired: false,
    });
  });

  test("keeps joint split settlements in review", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -4200,
        description: "Joint dinner split",
        kind: "spend",
        source: "monzo",
      }),
    ).toEqual({
      kind: "split_settlement",
      confidence: "medium",
      reason: "split_settlement",
      reviewRequired: true,
    });
  });

  test("keeps ambiguous positive credits in review", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: 2500,
        description: "Bank credit",
        kind: "income",
        source: "monzo",
      }),
    ).toEqual({
      kind: "income",
      confidence: "low",
      reason: "positive_amount_uncertain",
      reviewRequired: true,
    });
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

describe("bank imports", () => {
  test("parses Monzo CSV rows with pence amounts", () => {
    const transactions = parseMonzoTransactionsCsv(
      [
        "ID,Date,Amount,Name,Type,Category,Local Currency",
        "tx_1,2026-05-02T14:35:01Z,-8240,Groceries,debit,shopping,GBP",
        "tx_2,2026-05-31T09:00:00Z,300000,Salary,credit,income,GBP",
      ].join("\n"),
    );

    expect(transactions).toEqual([
      {
        id: "tx_1",
        postedOn: "2026-05-02",
        description: "Groceries",
        amountMinorUnits: -8240,
        currency: "GBP",
        kind: "spend",
        source: "monzo",
      },
      {
        id: "tx_2",
        postedOn: "2026-05-31",
        description: "Salary",
        amountMinorUnits: 300000,
        currency: "GBP",
        kind: "income",
        source: "monzo",
      },
    ]);
  });

  test("parses current Monzo export headers with decimal major-unit amounts", () => {
    const transactions = parseMonzoTransactionsCsv(
      [
        [
          "Transaction ID",
          "Date",
          "Time",
          "Type",
          "Name",
          "Emoji",
          "Category",
          "Amount",
          "Currency",
          "Local amount",
          "Local currency",
          "Notes and #tags",
          "Address",
          "Receipt",
          "Description",
          "Category split",
          "Money Out",
          "Money In",
        ].join(","),
        [
          "tx_1",
          "02/05/2026",
          "12:34:56",
          "Card payment",
          "Groceries",
          "",
          "Shopping",
          "-82.40",
          "GBP",
          "-82.40",
          "GBP",
          "",
          "",
          "",
          "Groceries",
          "",
          "82.40",
          "",
        ].join(","),
      ].join("\n"),
    );

    expect(transactions).toEqual([
      {
        id: "tx_1",
        postedOn: "2026-05-02",
        description: "Groceries",
        amountMinorUnits: -8240,
        currency: "GBP",
        kind: "spend",
        source: "monzo",
      },
    ]);
  });

  test("parses current Amex export headers with charge-positive amounts", () => {
    const transactions = parseAmexTransactionsCsv(
      [
        "Date,Description,Card Member,Account #,Amount",
        "02/05/2026,Groceries,Example Person,00000,82.40",
        "03/05/2026,Refund,Example Person,00000,-25.00",
      ].join("\n"),
    );

    expect(transactions).toEqual([
      {
        id: "amex:0:2026-05-02",
        postedOn: "2026-05-02",
        description: "Groceries",
        amountMinorUnits: -8240,
        currency: "GBP",
        kind: "spend",
        source: "amex",
      },
      {
        id: "amex:1:2026-05-03",
        postedOn: "2026-05-03",
        description: "Refund",
        amountMinorUnits: 2500,
        currency: "GBP",
        kind: "reimbursement",
        source: "amex",
      },
    ]);
  });

  test("rejects unsupported bank CSV currencies", () => {
    expect(() =>
      parseAmexTransactionsCsv(
        [
          "Date,Description,Amount,Currency,Reference",
          "2026-05-02,Groceries,-82.40,USD,amex_1",
        ].join("\n"),
      ),
    ).toThrow("Unsupported Amex currency");
  });

  test("rejects bank CSV rows with missing required headers", () => {
    expect(() =>
      parseMonzoTransactionsCsv(
        [
          "ID,Date,Amount,Type,Category,Local Currency",
          "tx_1,2026-05-02T14:35:01Z,-8240,debit,shopping,GBP",
        ].join("\n"),
      ),
    ).toThrow("Missing required CSV header: Name or Description");
  });
});
