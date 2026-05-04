import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyTransaction,
  minorUnitsToMajorUnits,
  parseAmexTransactionsCsv,
  parseMonzoTransactionsCsv,
} from "@personal-finance/core";
import type {
  ClassificationConfidence,
  ClassificationReason,
  EntryKind,
  NormalizedTransactionInput,
  TransactionClassification,
} from "@personal-finance/core";

type ImportSourceKind = "amex" | "monzo";

type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

type MoneySummary = {
  minorUnits: number;
  formatted: string;
};

type ClassifiedTransaction = NormalizedTransactionInput & {
  classification: TransactionClassification;
};

export type PrivateImportValidationSummary = {
  storagePath: string;
  csvFileCount: number;
  totals: {
    rowCount: number;
    reviewRequiredCount: number;
    reviewSkippedCount: number;
    netAmount: MoneySummary;
    moneyIn: MoneySummary;
    moneyOut: MoneySummary;
  };
  files: PrivateImportFileSummary[];
  crossChecks: {
    amexSpendOut: MoneySummary;
    monzoCreditCardPaymentOut: MoneySummary;
    monzoAmexPaymentCoverage: MoneySummary;
    note: string;
  };
  issues: ValidationIssue[];
};

export type PrivateImportFileSummary = {
  file: string;
  source: ImportSourceKind;
  rowCount: number;
  reviewRequiredCount: number;
  reviewSkippedCount: number;
  netAmount: MoneySummary;
  moneyIn: MoneySummary;
  moneyOut: MoneySummary;
  byKind: Record<EntryKind, number>;
  byReason: Record<ClassificationReason, number>;
  byConfidence: Record<ClassificationConfidence, number>;
  monthly: Record<
    string,
    {
      rowCount: number;
      netAmount: MoneySummary;
      moneyIn: MoneySummary;
      moneyOut: MoneySummary;
      reviewRequiredCount: number;
    }
  >;
};

const entryKinds: readonly EntryKind[] = [
  "income",
  "spend",
  "transfer",
  "credit_card_payment",
  "reimbursement",
  "split_settlement",
];

const classificationReasons: readonly ClassificationReason[] = [
  "ordinary_spend",
  "salary_income",
  "credit_card_payment",
  "internal_transfer",
  "reimbursement",
  "split_settlement",
  "source_supplied_kind",
  "positive_amount_uncertain",
];

const classificationConfidences: readonly ClassificationConfidence[] = [
  "high",
  "medium",
  "low",
];

const serverRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(serverRoot, "../..");

export function validatePrivateImports(
  storagePath = resolve(repositoryRoot, "storage"),
): PrivateImportValidationSummary {
  const csvFiles = findCsvFiles(storagePath);
  const issues: ValidationIssue[] = [];

  if (csvFiles.length === 0) {
    issues.push({
      severity: "error",
      message: "No CSV files found in private storage.",
    });
  }

  const files = csvFiles.map((filePath, index) =>
    summarizeFile(filePath, index, issues),
  );
  const allTransactions = files.flatMap((file) => file.transactions);
  const amexSpendOut = sumMoney(
    allTransactions.filter(
      (transaction) =>
        transaction.source === "amex" &&
        transaction.classification.kind === "spend" &&
        transaction.amountMinorUnits < 0,
    ),
  ).moneyOut;
  const monzoCreditCardPaymentOut = sumMoney(
    allTransactions.filter(
      (transaction) =>
        transaction.source === "monzo" &&
        transaction.classification.kind === "credit_card_payment" &&
        transaction.amountMinorUnits < 0,
    ),
  ).moneyOut;

  return {
    storagePath,
    csvFileCount: csvFiles.length,
    totals: summarizeTransactions(allTransactions),
    files: files.map(({ transactions: _transactions, ...summary }) => summary),
    crossChecks: {
      amexSpendOut,
      monzoCreditCardPaymentOut,
      monzoAmexPaymentCoverage: moneySummary(
        monzoCreditCardPaymentOut.minorUnits - amexSpendOut.minorUnits,
      ),
      note: "Coverage compares Monzo credit-card-payment outflow against Amex spend outflow. It is only expected to be near zero when export periods align.",
    },
    issues,
  };
}

function summarizeFile(
  filePath: string,
  index: number,
  issues: ValidationIssue[],
): PrivateImportFileSummary & { transactions: ClassifiedTransaction[] } {
  const csv = readFileSync(filePath, "utf8");
  const source = detectSource(csv);
  const parsedTransactions =
    source === "amex"
      ? parseAmexTransactionsCsv(csv)
      : parseMonzoTransactionsCsv(csv);
  const transactions = parsedTransactions.map((transaction) => ({
    ...transaction,
    classification: classifyTransaction(transaction),
  }));
  const expectedRowCount = csv.split(/\r?\n/).filter(Boolean).length - 1;
  const duplicateIds = duplicatedValues(
    transactions.map((transaction) => transaction.id),
  );

  if (expectedRowCount !== transactions.length) {
    issues.push({
      severity: "error",
      message: `storage_csv_${index + 1} parsed ${transactions.length} rows from ${expectedRowCount} non-empty CSV data rows.`,
    });
  }

  if (duplicateIds.length > 0) {
    issues.push({
      severity: "warning",
      message: `storage_csv_${index + 1} has ${duplicateIds.length} duplicate normalized transaction IDs.`,
    });
  }

  for (const transaction of transactions) {
    if (!Number.isInteger(transaction.amountMinorUnits)) {
      issues.push({
        severity: "error",
        message: `storage_csv_${index + 1} produced a non-integer minor-unit amount.`,
      });
      break;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.postedOn)) {
      issues.push({
        severity: "error",
        message: `storage_csv_${index + 1} produced a non-ISO posting date.`,
      });
      break;
    }
  }

  return {
    file: `storage_csv_${index + 1}`,
    source,
    ...summarizeTransactions(transactions),
    byKind: countBy(
      entryKinds,
      transactions,
      (transaction) => transaction.classification.kind,
    ),
    byReason: countBy(
      classificationReasons,
      transactions,
      (transaction) => transaction.classification.reason,
    ),
    byConfidence: countBy(
      classificationConfidences,
      transactions,
      (transaction) => transaction.classification.confidence,
    ),
    monthly: summarizeMonthly(transactions),
    transactions,
  };
}

function summarizeTransactions(transactions: readonly ClassifiedTransaction[]) {
  const money = sumMoney(transactions);
  const reviewRequiredCount = transactions.filter(
    (transaction) => transaction.classification.reviewRequired,
  ).length;

  return {
    rowCount: transactions.length,
    reviewRequiredCount,
    reviewSkippedCount: transactions.length - reviewRequiredCount,
    netAmount: money.netAmount,
    moneyIn: money.moneyIn,
    moneyOut: money.moneyOut,
  };
}

function summarizeMonthly(transactions: readonly ClassifiedTransaction[]) {
  const months = [
    ...new Set(
      transactions.map((transaction) => monthOf(transaction.postedOn)),
    ),
  ].sort();

  return Object.fromEntries(
    months.map((month) => {
      const monthlyTransactions = transactions.filter(
        (transaction) => monthOf(transaction.postedOn) === month,
      );
      const summary = summarizeTransactions(monthlyTransactions);

      return [
        month,
        {
          rowCount: summary.rowCount,
          netAmount: summary.netAmount,
          moneyIn: summary.moneyIn,
          moneyOut: summary.moneyOut,
          reviewRequiredCount: summary.reviewRequiredCount,
        },
      ];
    }),
  );
}

function sumMoney(transactions: readonly ClassifiedTransaction[]) {
  const netMinorUnits = transactions.reduce(
    (total, transaction) => total + transaction.amountMinorUnits,
    0,
  );
  const moneyInMinorUnits = transactions
    .filter((transaction) => transaction.amountMinorUnits > 0)
    .reduce((total, transaction) => total + transaction.amountMinorUnits, 0);
  const moneyOutMinorUnits = Math.abs(
    transactions
      .filter((transaction) => transaction.amountMinorUnits < 0)
      .reduce((total, transaction) => total + transaction.amountMinorUnits, 0),
  );

  return {
    netAmount: moneySummary(netMinorUnits),
    moneyIn: moneySummary(moneyInMinorUnits),
    moneyOut: moneySummary(moneyOutMinorUnits),
  };
}

function moneySummary(minorUnits: number): MoneySummary {
  return {
    minorUnits,
    formatted: formatMoney(minorUnits),
  };
}

function formatMoney(minorUnits: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(minorUnitsToMajorUnits(minorUnits));
}

function countBy<T extends string>(
  keys: readonly T[],
  transactions: readonly ClassifiedTransaction[],
  getKey: (transaction: ClassifiedTransaction) => T,
): Record<T, number> {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      transactions.filter((transaction) => getKey(transaction) === key).length,
    ]),
  ) as Record<T, number>;
}

function detectSource(csv: string): ImportSourceKind {
  const header = csv.split(/\r?\n/, 1)[0] ?? "";

  if (header.includes("Card Member") && header.includes("Account #")) {
    return "amex";
  }

  if (header.includes("Transaction ID") && header.includes("Local currency")) {
    return "monzo";
  }

  throw new Error("Unable to detect CSV source from private import headers.");
}

function findCsvFiles(storagePath: string): string[] {
  const files: string[] = [];

  function walk(directory: string) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = statSync(path);

      if (stat.isDirectory()) {
        walk(path);
        continue;
      }

      if (extname(name).toLowerCase() === ".csv") {
        files.push(path);
      }
    }
  }

  walk(storagePath);

  return files.sort();
}

function duplicatedValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicated.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicated].sort();
}

function monthOf(postedOn: string): string {
  return postedOn.slice(0, 7);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const storagePath = process.env.PERSONAL_FINANCE_STORAGE_PATH
    ? resolve(process.env.PERSONAL_FINANCE_STORAGE_PATH)
    : undefined;
  const summary = validatePrivateImports(storagePath);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.issues.some((issue) => issue.severity === "error")) {
    process.exitCode = 1;
  }
}
