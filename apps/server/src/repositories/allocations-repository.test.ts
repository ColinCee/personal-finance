import { describe, expect, test } from "vitest";

import {
  accounts,
  economicAllocations,
  ledgerEntries,
  settlementLinks,
} from "../db/schema";
import { createTestDatabase } from "../test/database";
import { createAllocationsRepository } from "./allocations-repository";

describe("allocations repository", () => {
  test("calculates allocation and settlement summary from persisted rows", () => {
    const testDatabase = createTestDatabase();

    try {
      seedAllocationScenario(testDatabase.db);

      expect(
        createAllocationsRepository(testDatabase.db).calculateSummary(),
      ).toEqual({
        cashflowNetMinorUnits: 208000,
        personalSpendMinorUnits: 14000,
        businessOrReimbursableMinorUnits: 30000,
        creditCardLiabilityMinorUnits: 0,
        outstandingByPurpose: {
          personal: 0,
          partner: 0,
          joint: 0,
          friend: 0,
          business: 30000,
          reimbursable: 0,
          excluded: 0,
        },
      });
    } finally {
      testDatabase.cleanup();
    }
  });
});

function seedAllocationScenario(
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
      ledger("salary", "account_monzo", 300000, "income", "monzo"),
      ledger("amex_groceries", "account_amex", -10000, "spend", "amex"),
      ledger("amex_business_hotel", "account_amex", -30000, "spend", "amex"),
      ledger("amex_friend_dinner", "account_amex", -8000, "spend", "amex"),
      ledger(
        "friend_repayment",
        "account_monzo",
        4000,
        "reimbursement",
        "monzo",
      ),
      ledger(
        "monzo_amex_payment",
        "account_monzo",
        -48000,
        "credit_card_payment",
        "monzo",
      ),
    ])
    .run();

  db.insert(economicAllocations)
    .values([
      allocation("groceries_personal", "amex_groceries", "personal", 10000),
      allocation("hotel_business", "amex_business_hotel", "business", 30000),
      allocation("dinner_personal", "amex_friend_dinner", "personal", 4000),
      {
        ...allocation("dinner_friend", "amex_friend_dinner", "friend", 4000),
        counterparty: "friend",
      },
    ])
    .run();

  db.insert(settlementLinks)
    .values([
      {
        id: "friend_repayment_settlement",
        settlementLedgerEntryId: "friend_repayment",
        allocationId: "dinner_friend",
        type: "reimbursement",
        amountMinorUnits: 4000,
      },
      {
        id: "amex_payment_settlement",
        settlementLedgerEntryId: "monzo_amex_payment",
        allocationId: null,
        type: "card_payment",
        amountMinorUnits: 48000,
      },
    ])
    .run();
}

function ledger(
  id: string,
  accountId: string,
  amountMinorUnits: number,
  kind: typeof ledgerEntries.$inferInsert.kind,
  source: typeof ledgerEntries.$inferInsert.source,
): typeof ledgerEntries.$inferInsert {
  return {
    id,
    accountId,
    postedOn: "2026-05-02",
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
