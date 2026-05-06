import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { loadLocalClassificationRules } from "./local-classification-rules";

describe("local classification rules", () => {
  test("returns no rules when the private rules file is missing", () => {
    expect(
      loadLocalClassificationRules("/missing/classification-rules.json"),
    ).toEqual([]);
  });

  test("loads private local rules from an ignored JSON file", () => {
    const directory = mkdtempSync(join(tmpdir(), "personal-finance-rules-"));
    const rulesPath = join(directory, "classification-rules.json");

    try {
      writeFileSync(
        rulesPath,
        JSON.stringify({
          version: 1,
          rules: [
            {
              id: "household-repayments",
              label: "Household repayments",
              match: {
                descriptionContains: ["household subscription"],
                amountDirection: "money_in",
              },
              classifyAs: "reimbursement",
            },
          ],
        }),
      );

      expect(loadLocalClassificationRules(rulesPath)).toEqual([
        {
          id: "household-repayments",
          label: "Household repayments",
          match: {
            descriptionContains: ["household subscription"],
            amountDirection: "money_in",
          },
          classifyAs: "reimbursement",
        },
      ]);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
