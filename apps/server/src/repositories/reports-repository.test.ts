import { describe, expect, test } from "vitest";

import {
  accounts,
  economicAllocations,
  ledgerEntries,
  reviewItems,
  settlementLinks,
} from "../db/schema";
import { createTestDatabase } from "../test/database";
import { createReportsRepository } from "./reports-repository";

describe("reports repository", () => {
  test("calculates monthly reports from persisted allocations and settlements", () => {
    const testDatabase = createTestDatabase();

    try {
      seedMonthlyReportScenario(testDatabase.db);

      expect(
        createReportsRepository(testDatabase.db).listMonthlyReports(),
      ).toMatchObject([
        {
          month: "2026-04",
          cashflowNetMinorUnits: 282000,
          personalSpendMinorUnits: 14000,
          sharedSpendMinorUnits: 4000,
          monthEndCreditCardLiabilityMinorUnits: 18000,
          reviewItemCount: 1,
          openReviewItemCount: 1,
        },
        {
          month: "2026-05",
          cashflowNetMinorUnits: -14000,
          personalSpendMinorUnits: 0,
          sharedSpendMinorUnits: 0,
          monthEndCreditCardLiabilityMinorUnits: 0,
          reviewItemCount: 1,
          openReviewItemCount: 0,
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });
});

function seedMonthlyReportScenario(
  db: ReturnType<typeof createTestDatabase>["db"],
) {
  db.insert(accounts)
    .values([
      {
        id: "account_monzo",
        name: "Monzo",
        institution: "Monzo",
        type: "current",
      },
      {
        id: "account_amex",
        name: "Amex",
        institution: "American Express",
        type: "credit_card",
      },
    ])
    .run();

  db.insert(ledgerEntries)
    .values([
      ledger("salary_april", "account_monzo", "2026-04-30", 300000, "income"),
      ledger(
        "amex_groceries_april",
        "account_amex",
        "2026-04-12",
        -10000,
        "spend",
        "amex",
      ),
      ledger(
        "amex_friend_dinner_april",
        "account_amex",
        "2026-04-18",
        -8000,
        "spend",
        "amex",
      ),
      ledger(
        "friend_repayment_may",
        "account_monzo",
        "2026-05-03",
        4000,
        "reimbursement",
      ),
      ledger(
        "monzo_amex_payment_may",
        "account_monzo",
        "2026-05-04",
        -18000,
        "credit_card_payment",
      ),
    ])
    .run();

  db.insert(economicAllocations)
    .values([
      allocation(
        "groceries_personal",
        "amex_groceries_april",
        "personal",
        10000,
      ),
      allocation(
        "dinner_personal",
        "amex_friend_dinner_april",
        "personal",
        4000,
      ),
      {
        ...allocation(
          "dinner_friend",
          "amex_friend_dinner_april",
          "friend",
          4000,
        ),
        counterparty: "friend",
      },
    ])
    .run();

  db.insert(settlementLinks)
    .values([
      {
        id: "friend_repayment_settlement",
        settlementLedgerEntryId: "friend_repayment_may",
        allocationId: "dinner_friend",
        type: "reimbursement",
        amountMinorUnits: 4000,
      },
      {
        id: "amex_payment_settlement",
        settlementLedgerEntryId: "monzo_amex_payment_may",
        allocationId: null,
        type: "card_payment",
        amountMinorUnits: 18000,
      },
    ])
    .run();

  db.insert(reviewItems)
    .values([
      {
        id: "review_dinner",
        ledgerEntryId: "amex_friend_dinner_april",
        status: "needs_review",
        reason: "split_settlement",
      },
      {
        id: "review_card_payment",
        ledgerEntryId: "monzo_amex_payment_may",
        status: "confirmed",
        reason: "credit_card_payment",
      },
    ])
    .run();
}

function ledger(
  id: string,
  accountId: string,
  postedOn: string,
  amountMinorUnits: number,
  kind: typeof ledgerEntries.$inferInsert.kind,
  source: typeof ledgerEntries.$inferInsert.source = "monzo",
): typeof ledgerEntries.$inferInsert {
  return {
    id,
    accountId,
    postedOn,
    description: id,
    amountMinorUnits,
    kind,
    source,
  };
}

function allocation(
  id: string,
  ledgerEntryId: string,
  purpose: typeof economicAllocations.$inferInsert.purpose,
  amountMinorUnits: number,
): typeof economicAllocations.$inferInsert {
  return {
    id,
    ledgerEntryId,
    purpose,
    amountMinorUnits,
  };
}
