import { createHash } from "node:crypto";

import {
  classifyTransaction,
  detectFileImportSource,
  type FileImportSource,
  type NormalizedTransactionInput,
  parseAmexTransactionsCsv,
  parseFixtureTransactionsCsv,
  parseMonzoTransactionsCsv,
} from "@personal-finance/core";

import type {
  ImportHistoryItem,
  ImportResult,
  ImportsRepository,
} from "../repositories/imports-repository";

export type ImportPreview = {
  source: FileImportSource;
  originalFileName: string;
  fileSha256: string;
  rowCount: number;
  duplicateRowCount: number;
  alreadyImported: boolean;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  reviewItemCount: number;
  moneyInMinorUnits: number;
  moneyOutMinorUnits: number;
  netAmountMinorUnits: number;
};

export type ImportCommitResult = ImportPreview &
  ImportResult & {
    importedAt: string;
  };

export type ImportsService = {
  previewCsvImport: (input: CsvImportInput) => ImportPreview;
  importCsv: (input: CsvImportInput) => ImportCommitResult;
  importFixtureCsv: (input: {
    csv: string;
    originalFileName: string;
  }) => ImportResult;
  listImportedFiles: () => ImportHistoryItem[];
};

export type CsvImportInput = {
  csv: string;
  originalFileName: string;
  source?: FileImportSource;
};

export function createImportsService(
  importsRepository: ImportsRepository,
): ImportsService {
  return {
    previewCsvImport: (input) => previewCsvImport(input, importsRepository),

    importCsv: (input) => {
      const parsedImport = parseCsvImport(input);
      const preview = summarizeImport(parsedImport, importsRepository);
      const result = importsRepository.importTransactions({
        importId: parsedImport.importId,
        fileSha256: parsedImport.fileSha256,
        originalFileName: input.originalFileName,
        source: parsedImport.source,
        transactions: parsedImport.transactions,
      });

      return {
        ...preview,
        ...result,
        importedAt: new Date().toISOString(),
      };
    },

    importFixtureCsv: (input) =>
      importsRepository.importTransactions({
        ...parseCsvImport({
          csv: input.csv,
          originalFileName: input.originalFileName,
          source: "fixture_csv",
        }),
        originalFileName: input.originalFileName,
        source: "fixture_csv",
      }),

    listImportedFiles: () => importsRepository.listImportedFiles(),
  };
}

function previewCsvImport(
  input: CsvImportInput,
  importsRepository: ImportsRepository,
) {
  return summarizeImport(parseCsvImport(input), importsRepository);
}

type ParsedCsvImport = {
  importId: string;
  fileSha256: string;
  originalFileName: string;
  source: FileImportSource;
  transactions: NormalizedTransactionInput[];
};

function parseCsvImport(input: CsvImportInput): ParsedCsvImport {
  const source = input.source ?? detectFileImportSource(input.csv);
  const fileSha256 = sha256(input.csv);
  const importId = `import_${source}_${fileSha256.slice(0, 16)}`;

  return {
    importId,
    fileSha256,
    originalFileName: input.originalFileName,
    source,
    transactions: parseTransactions(source, input.csv),
  };
}

function parseTransactions(source: FileImportSource, csv: string) {
  switch (source) {
    case "amex_csv":
      return parseAmexTransactionsCsv(csv);
    case "fixture_csv":
      return parseFixtureTransactionsCsv(csv);
    case "monzo_csv":
      return parseMonzoTransactionsCsv(csv);
  }
}

function summarizeImport(
  parsedImport: ParsedCsvImport,
  importsRepository: ImportsRepository,
): ImportPreview {
  const existingImport = importsRepository.findImportBySourceAndHash(
    parsedImport.source,
    parsedImport.fileSha256,
  );
  const amounts = parsedImport.transactions.reduce(
    (summary, transaction) => {
      if (transaction.amountMinorUnits > 0) {
        summary.moneyInMinorUnits += transaction.amountMinorUnits;
      } else {
        summary.moneyOutMinorUnits += Math.abs(transaction.amountMinorUnits);
      }

      summary.netAmountMinorUnits += transaction.amountMinorUnits;

      return summary;
    },
    {
      moneyInMinorUnits: 0,
      moneyOutMinorUnits: 0,
      netAmountMinorUnits: 0,
    },
  );
  const dates = parsedImport.transactions
    .map((transaction) => transaction.postedOn)
    .sort();
  const reviewItemCount = parsedImport.transactions.filter(
    (transaction) => classifyTransaction(transaction).reviewRequired,
  ).length;

  return {
    source: parsedImport.source,
    originalFileName: parsedImport.originalFileName,
    fileSha256: parsedImport.fileSha256,
    rowCount: parsedImport.transactions.length,
    duplicateRowCount: existingImport ? parsedImport.transactions.length : 0,
    alreadyImported: Boolean(existingImport),
    dateRange: {
      from: dates.at(0) ?? null,
      to: dates.at(-1) ?? null,
    },
    reviewItemCount,
    ...amounts,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
