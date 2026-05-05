import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { validatePrivateImports } from "./private-import-validation";

describe("private import validation", () => {
  test("summarizes private CSV exports without exposing row contents", () => {
    const storagePath = mkdtempSync(
      join(tmpdir(), "personal-finance-imports-"),
    );

    try {
      writeFileSync(
        join(storagePath, "amex.csv"),
        [
          "Date,Description,Card Member,Account #,Amount",
          "02/05/2026,Groceries,Example Person,00000,82.40",
          "03/05/2026,Bank credit,Example Person,00000,-25.00",
        ].join("\n"),
      );
      writeFileSync(
        join(storagePath, "monzo.csv"),
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
            "American Express card payment",
            "",
            "General",
            "-82.40",
            "GBP",
            "-82.40",
            "GBP",
            "",
            "",
            "",
            "American Express card payment",
            "",
            "82.40",
            "",
          ].join(","),
          [
            "tx_2",
            "31/05/2026",
            "09:00:00",
            "Credit",
            "Monthly salary",
            "",
            "Income",
            "3000.00",
            "GBP",
            "3000.00",
            "GBP",
            "",
            "",
            "",
            "Monthly salary",
            "",
            "",
            "3000.00",
          ].join(","),
        ].join("\n"),
      );

      const summary = validatePrivateImports(storagePath);

      expect(summary.csvFileCount).toBe(2);
      expect(summary.totals.rowCount).toBe(4);
      expect(summary.totals.reviewRequiredCount).toBe(1);
      expect(summary.files).toEqual([
        expect.objectContaining({
          file: "storage_csv_1",
          source: "amex",
          rowCount: 2,
          importPreview: expect.objectContaining({
            duplicateRowCount: 0,
            reviewItemCount: 1,
            rowCount: 2,
          }),
          byKind: expect.objectContaining({
            spend: 1,
            reimbursement: 1,
          }),
        }),
        expect.objectContaining({
          file: "storage_csv_2",
          source: "monzo",
          rowCount: 2,
          importPreview: expect.objectContaining({
            duplicateRowCount: 0,
            reviewItemCount: 0,
            rowCount: 2,
          }),
          byKind: expect.objectContaining({
            income: 1,
            credit_card_payment: 1,
          }),
        }),
      ]);
      expect(summary.crossChecks.amexSpendOut.minorUnits).toBe(8240);
      expect(summary.crossChecks.monzoCreditCardPaymentOut.minorUnits).toBe(
        8240,
      );
      expect(summary.issues).toEqual([]);
      expect(JSON.stringify(summary)).not.toContain("Groceries");
      expect(JSON.stringify(summary)).not.toContain("Monthly salary");
      expect(JSON.stringify(summary)).not.toContain("Bank credit");
      expect(JSON.stringify(summary)).not.toContain("Example Person");
    } finally {
      rmSync(storagePath, { recursive: true, force: true });
    }
  });
});
