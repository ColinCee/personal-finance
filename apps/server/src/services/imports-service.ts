import { createHash } from "node:crypto";

import { parseFixtureTransactionsCsv } from "@personal-finance/core";

import type {
  FixtureImportResult,
  ImportsRepository,
} from "../repositories/imports-repository";

export type ImportsService = {
  importFixtureCsv: (input: {
    csv: string;
    originalFileName: string;
  }) => FixtureImportResult;
};

export function createImportsService(
  importsRepository: ImportsRepository,
): ImportsService {
  return {
    importFixtureCsv: (input) => {
      const fileSha256 = sha256(input.csv);
      const importId = `import_${fileSha256.slice(0, 16)}`;

      return importsRepository.importFixtureTransactions({
        importId,
        fileSha256,
        originalFileName: input.originalFileName,
        transactions: parseFixtureTransactionsCsv(input.csv),
      });
    },
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
