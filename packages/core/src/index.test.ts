import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  affectsPersonalSpend,
  calculateAllocationSummary,
  calculateEconomicEffectTotals,
  calculateMonthlyReports,
  calculateNetPersonalSpendMinorUnits,
  classifyTransaction,
  classifyTransactionWithLocalRules,
  deriveEconomicEffects,
  detectFileImportSource,
  type EntryKind,
  type EconomicAllocation,
  exampleTransactions,
  majorUnitsToMinorUnits,
  parseAmexTransactionsCsv,
  parseFixtureTransactionsCsv,
  parseMonzoTransactionsCsv,
  reviewDecisionActionForKind,
  type SettlementLink,
  toReviewTransaction,
  validateSpendAllocations,
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

function ledgerEntry(
  id: string,
  amountMinorUnits: number,
  kind: EntryKind,
  source: string,
  postedOn = "2026-05-02",
) {
  return {
    id,
    postedOn,
    description: id,
    amountMinorUnits,
    currency: "GBP" as const,
    kind,
    source,
  };
}

function allocation(
  id: string,
  ledgerEntryId: string,
  purpose: EconomicAllocation["purpose"],
  amountMinorUnits: number,
  counterparty: string | null = null,
): EconomicAllocation {
  return {
    id,
    ledgerEntryId,
    purpose,
    amountMinorUnits,
    counterparty,
  };
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

  test("keeps savings and investment movement in review", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -50000,
        description: "Transfer to savings",
        kind: "spend",
        source: "monzo",
      }),
    ).toMatchObject({
      kind: "transfer",
      confidence: "medium",
      reason: "saving_or_investment_movement",
      reviewRequired: true,
    });
  });

  test("automates Monzo instant access pot money-in as a transfer", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: 5000,
        description: "Instant Access Pot",
        kind: "income",
        source: "monzo",
      }),
    ).toMatchObject({
      kind: "transfer",
      confidence: "high",
      reason: "pot_transfer",
      reviewRequired: false,
    });
  });

  test("automates Monzo Flex movements as transfers", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: 40574,
        description: "Flex payment for travel booking",
        kind: "income",
        source: "monzo",
        raw: {
          Type: "Flex",
          Description: "Flex payment for travel booking",
        },
      }),
    ).toMatchObject({
      kind: "transfer",
      confidence: "high",
      reason: "monzo_flex",
      reviewRequired: false,
    });
  });

  test("classifies explicit own-account transfers without review", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -50000,
        description: "Internal transfer between accounts",
        kind: "spend",
        source: "monzo",
      }),
    ).toMatchObject({
      kind: "transfer",
      confidence: "high",
      reason: "internal_transfer",
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

  test("treats shared subscription repayments as repayment-like, not income", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: 2199,
        description: "Shared subscription repayment",
        kind: "income",
        source: "monzo",
      }),
    ).toEqual({
      kind: "reimbursement",
      confidence: "medium",
      reason: "shared_repayment",
      reviewRequired: true,
    });
  });

  test("does not classify Amex charges as card payments", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -12500,
        description: "American Express travel charge",
        kind: "spend",
        source: "amex",
      }),
    ).toEqual({
      kind: "spend",
      confidence: "high",
      reason: "ordinary_spend",
      reviewRequired: false,
    });
  });

  test("keeps source-supplied non-default kinds in review", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: -2500,
        description: "Manual reimbursement adjustment",
        kind: "reimbursement",
        source: "monzo",
      }),
    ).toEqual({
      kind: "reimbursement",
      confidence: "medium",
      reason: "source_supplied_kind",
      reviewRequired: true,
    });
  });

  test("classifies zero-value entries as no-op transfers", () => {
    expect(
      classifyTransaction({
        amountMinorUnits: 0,
        description: "Zero balance correction",
        kind: "income",
        source: "monzo",
      }),
    ).toEqual({
      kind: "transfer",
      confidence: "high",
      reason: "zero_amount",
      reviewRequired: false,
    });
  });

  test("applies local private classification rules before public defaults", () => {
    expect(
      classifyTransactionWithLocalRules(
        {
          amountMinorUnits: 2199,
          description: "Household subscription repayment",
          kind: "income",
          source: "monzo",
        },
        [
          {
            id: "household-repayments",
            label: "Household repayments",
            match: {
              amountDirection: "money_in",
              descriptionContains: ["household subscription"],
            },
            classifyAs: "reimbursement",
          },
        ],
      ),
    ).toEqual({
      kind: "reimbursement",
      confidence: "high",
      reason: "private_rule",
      reviewRequired: false,
      matchedRule: {
        id: "household-repayments",
        label: "Household repayments",
      },
    });
  });
});

describe("allocation and settlement accounting", () => {
  test("counts only personal allocations as personal spend and settlements clear balances", () => {
    const entries = [
      ledgerEntry("salary", 300000, "income", "monzo"),
      ledgerEntry("amex_groceries", -10000, "spend", "amex"),
      ledgerEntry("amex_business_hotel", -30000, "spend", "amex"),
      ledgerEntry("amex_friend_dinner", -8000, "spend", "amex"),
      ledgerEntry("friend_repayment", 4000, "reimbursement", "monzo"),
      ledgerEntry("monzo_amex_payment", -48000, "credit_card_payment", "monzo"),
    ] as const;
    const allocations: EconomicAllocation[] = [
      allocation("groceries_personal", "amex_groceries", "personal", 10000),
      allocation(
        "hotel_business",
        "amex_business_hotel",
        "business",
        30000,
        "business",
      ),
      allocation("dinner_personal", "amex_friend_dinner", "personal", 4000),
      allocation(
        "dinner_friend",
        "amex_friend_dinner",
        "friend",
        4000,
        "friend",
      ),
    ];
    const settlements: SettlementLink[] = [
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
    ];

    expect(validateSpendAllocations(entries, allocations)).toEqual([]);
    expect(
      calculateAllocationSummary(entries, allocations, settlements),
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
  });

  test("flags underallocated and overallocated spend entries", () => {
    const entries = [ledgerEntry("dinner", -8000, "spend", "amex")] as const;

    expect(
      validateSpendAllocations(entries, [
        allocation("personal_share", "dinner", "personal", 3000),
      ]),
    ).toEqual([
      {
        ledgerEntryId: "dinner",
        expectedMinorUnits: 8000,
        allocatedMinorUnits: 3000,
      },
    ]);

    expect(
      validateSpendAllocations(entries, [
        allocation("personal_share", "dinner", "personal", 5000),
        allocation("friend_share", "dinner", "friend", 5000),
      ]),
    ).toEqual([
      {
        ledgerEntryId: "dinner",
        expectedMinorUnits: 8000,
        allocatedMinorUnits: 10000,
      },
    ]);
  });
});

describe("economic effects", () => {
  test("derives budget effects from allocations, settlements, income, transfers, and unresolved rows", () => {
    const entries = [
      ledgerEntry("salary", 300000, "income", "monzo"),
      ledgerEntry("pot_transfer", -50000, "transfer", "monzo"),
      ledgerEntry("amex_friend_dinner", -10000, "spend", "amex"),
      ledgerEntry("friend_repayment", 6000, "reimbursement", "monzo"),
      ledgerEntry("amex_payment", -10000, "credit_card_payment", "monzo"),
      ledgerEntry("ambiguous_credit", 2500, "income", "monzo"),
    ] as const;
    const allocations: EconomicAllocation[] = [
      allocation("dinner_personal", "amex_friend_dinner", "personal", 4000),
      allocation(
        "dinner_friend",
        "amex_friend_dinner",
        "friend",
        6000,
        "friend",
      ),
    ];
    const settlements: SettlementLink[] = [
      {
        id: "friend_repayment_settlement",
        settlementLedgerEntryId: "friend_repayment",
        allocationId: "dinner_friend",
        type: "reimbursement",
        amountMinorUnits: 6000,
      },
      {
        id: "amex_payment_settlement",
        settlementLedgerEntryId: "amex_payment",
        allocationId: null,
        type: "card_payment",
        amountMinorUnits: 10000,
      },
    ];

    const totals = calculateEconomicEffectTotals(
      deriveEconomicEffects({
        entries,
        allocations,
        settlements,
        reviewItems: [
          {
            ledgerEntryId: "ambiguous_credit",
            status: "needs_review",
          },
        ],
      }),
    );

    expect(totals.personal_spend).toBe(4000);
    expect(totals.shared_spend).toBe(6000);
    expect(totals.receivable_created).toBe(6000);
    expect(totals.receivable_settled).toBe(6000);
    expect(totals.credit_card_payment).toBe(10000);
    expect(totals.income).toBe(300000);
    expect(totals.transfer).toBe(50000);
    expect(totals.uncertain).toBe(2500);
  });
});

describe("monthly reports", () => {
  test("calculates monthly activity and month-end balances", () => {
    const entries = [
      ledgerEntry("salary_april", 300000, "income", "monzo", "2026-04-30"),
      ledgerEntry(
        "amex_groceries_april",
        -10000,
        "spend",
        "amex",
        "2026-04-12",
      ),
      ledgerEntry(
        "amex_friend_dinner_april",
        -8000,
        "spend",
        "amex",
        "2026-04-18",
      ),
      ledgerEntry(
        "friend_repayment_may",
        4000,
        "reimbursement",
        "monzo",
        "2026-05-03",
      ),
      ledgerEntry(
        "monzo_amex_payment_may",
        -18000,
        "credit_card_payment",
        "monzo",
        "2026-05-04",
      ),
    ] as const;
    const allocations: EconomicAllocation[] = [
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
      allocation(
        "dinner_friend",
        "amex_friend_dinner_april",
        "friend",
        4000,
        "friend",
      ),
    ];
    const settlements: SettlementLink[] = [
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
    ];

    const reports = calculateMonthlyReports({
      entries,
      allocations,
      settlements,
      reviewItems: [
        {
          ledgerEntryId: "amex_friend_dinner_april",
          status: "needs_review",
        },
        {
          ledgerEntryId: "monzo_amex_payment_may",
          status: "confirmed",
        },
      ],
    });

    expect(reports).toMatchObject([
      {
        month: "2026-04",
        cashflowNetMinorUnits: 282000,
        moneyInMinorUnits: 300000,
        moneyOutMinorUnits: 18000,
        actualPersonalSpendMinorUnits: 14000,
        soloPersonalSpendMinorUnits: 10000,
        sharedSpendTotalMinorUnits: 8000,
        sharedSpendMyShareMinorUnits: 4000,
        sharedSpendOtherShareMinorUnits: 4000,
        partnerSpendMinorUnits: 0,
        personalSpendMinorUnits: 14000,
        businessOrReimbursableMinorUnits: 0,
        sharedSpendMinorUnits: 4000,
        sharedAwaitingRepaymentMinorUnits: 4000,
        incomeNewMoneyMinorUnits: 300000,
        refundOrRepaymentMinorUnits: 0,
        unresolvedImpactMinorUnits: 8000,
        monthEndCreditCardLiabilityMinorUnits: 18000,
        transactionCount: 3,
        reviewItemCount: 1,
        openReviewItemCount: 1,
      },
      {
        month: "2026-05",
        cashflowNetMinorUnits: -14000,
        moneyInMinorUnits: 4000,
        moneyOutMinorUnits: 18000,
        actualPersonalSpendMinorUnits: 0,
        soloPersonalSpendMinorUnits: 0,
        sharedSpendTotalMinorUnits: 0,
        sharedSpendMyShareMinorUnits: 0,
        sharedSpendOtherShareMinorUnits: 0,
        partnerSpendMinorUnits: 0,
        personalSpendMinorUnits: 0,
        businessOrReimbursableMinorUnits: 0,
        sharedSpendMinorUnits: 0,
        sharedAwaitingRepaymentMinorUnits: 0,
        incomeNewMoneyMinorUnits: 0,
        refundOrRepaymentMinorUnits: 4000,
        creditCardPaymentMinorUnits: 18000,
        unresolvedImpactMinorUnits: 0,
        monthEndCreditCardLiabilityMinorUnits: 0,
        transactionCount: 2,
        reviewItemCount: 1,
        openReviewItemCount: 0,
      },
    ]);
    expect(reports[0]?.monthEndOutstandingByPurpose.friend).toBe(4000);
    expect(reports[1]?.monthEndOutstandingByPurpose.friend).toBe(0);
    expect(reports[0]?.allocationByPurpose.personal).toBe(14000);
    expect(reports[0]?.allocationByPurpose.friend).toBe(4000);
    expect(reports[0]?.economicEffectTotals.personal_spend).toBe(14000);
    expect(reports[1]?.economicEffectTotals.receivable_settled).toBe(4000);
  });

  test("counts confirmed spend without allocations as personal spend", () => {
    const reports = calculateMonthlyReports({
      entries: [
        ledgerEntry(
          "ordinary_groceries",
          -4200,
          "spend",
          "monzo",
          "2026-05-12",
        ),
      ],
      allocations: [],
      settlements: [],
      reviewItems: [],
    });

    expect(reports).toMatchObject([
      {
        month: "2026-05",
        actualPersonalSpendMinorUnits: 4200,
        soloPersonalSpendMinorUnits: 4200,
        sharedSpendTotalMinorUnits: 0,
        sharedSpendMyShareMinorUnits: 0,
        sharedSpendOtherShareMinorUnits: 0,
        partnerSpendMinorUnits: 0,
        personalSpendMinorUnits: 0,
        unresolvedImpactMinorUnits: 0,
        reviewItemCount: 0,
        openReviewItemCount: 0,
      },
    ]);
    expect(reports[0]?.economicEffectTotals.personal_spend).toBe(4200);
  });

  test("breaks shared partner spend into my share and partner share", () => {
    const reports = calculateMonthlyReports({
      entries: [
        ledgerEntry("partner_dinner", -12000, "spend", "monzo", "2026-05-12"),
      ],
      allocations: [
        allocation("partner_dinner_me", "partner_dinner", "personal", 6000),
        allocation(
          "partner_dinner_partner",
          "partner_dinner",
          "partner",
          6000,
          "partner",
        ),
      ],
      settlements: [],
      reviewItems: [],
    });

    expect(reports).toMatchObject([
      {
        month: "2026-05",
        actualPersonalSpendMinorUnits: 6000,
        soloPersonalSpendMinorUnits: 0,
        sharedSpendTotalMinorUnits: 12000,
        sharedSpendMyShareMinorUnits: 6000,
        sharedSpendOtherShareMinorUnits: 6000,
        partnerSpendMinorUnits: 6000,
      },
    ]);
  });

  test("separates business and excluded allocations from personal spend", () => {
    const entries = [
      ledgerEntry("amex_personal_april", -10000, "spend", "amex", "2026-04-10"),
      ledgerEntry("amex_business_april", -30000, "spend", "amex", "2026-04-12"),
      ledgerEntry("amex_excluded_april", -5000, "spend", "amex", "2026-04-14"),
      ledgerEntry(
        "business_reimbursement_may",
        30000,
        "reimbursement",
        "monzo",
        "2026-05-03",
      ),
    ] as const;
    const allocations: EconomicAllocation[] = [
      allocation("personal", "amex_personal_april", "personal", 10000),
      allocation(
        "business",
        "amex_business_april",
        "business",
        30000,
        "business",
      ),
      allocation("excluded", "amex_excluded_april", "excluded", 5000),
    ];
    const settlements: SettlementLink[] = [
      {
        id: "business_reimbursement",
        settlementLedgerEntryId: "business_reimbursement_may",
        allocationId: "business",
        type: "business_reimbursement",
        amountMinorUnits: 30000,
      },
    ];

    const reports = calculateMonthlyReports({
      entries,
      allocations,
      settlements,
      reviewItems: [],
    });

    expect(reports).toMatchObject([
      {
        month: "2026-04",
        actualPersonalSpendMinorUnits: 10000,
        personalSpendMinorUnits: 10000,
        businessOrReimbursableMinorUnits: 30000,
        notPersonalBudgetMinorUnits: 35000,
        sharedSpendMinorUnits: 0,
        monthEndCreditCardLiabilityMinorUnits: 45000,
      },
      {
        month: "2026-05",
        actualPersonalSpendMinorUnits: 0,
        personalSpendMinorUnits: 0,
        businessOrReimbursableMinorUnits: 0,
        refundOrRepaymentMinorUnits: 30000,
        sharedSpendMinorUnits: 0,
        monthEndCreditCardLiabilityMinorUnits: 45000,
      },
    ]);
    expect(reports[0]?.allocationByPurpose.excluded).toBe(5000);
    expect(reports[0]?.monthEndOutstandingByPurpose.business).toBe(30000);
    expect(reports[1]?.monthEndOutstandingByPurpose.business).toBe(0);
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

    expect(transactions).toMatchObject([
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
    expect(transactions[0]?.raw).toEqual({
      amount: "-82.40",
      currency: "GBP",
      description: "Groceries",
      kind: "spend",
      posted_on: "2026-05-02",
      source: "fake-amex",
    });
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
  test("detects supported CSV import sources from headers", () => {
    expect(
      detectFileImportSource(
        [
          "posted_on,description,amount,currency,kind,source",
          "2026-05-02,Groceries,-82.40,GBP,spend,fake-amex",
        ].join("\n"),
      ),
    ).toBe("fixture_csv");
    expect(
      detectFileImportSource(
        [
          "\uFEFFTransaction ID,Date,Time,Type,Name,Amount,Currency,Local currency,Money Out,Money In",
          "tx_1,02/05/2026,12:34:56,Card payment,Groceries,-82.40,GBP,GBP,82.40,",
        ].join("\n"),
      ),
    ).toBe("monzo_csv");
    expect(
      detectFileImportSource(
        [
          "Date,Description,Card Member,Account #,Amount",
          "02/05/2026,Groceries,Example Person,00000,82.40",
        ].join("\n"),
      ),
    ).toBe("amex_csv");
  });

  test("parses Monzo CSV rows with pence amounts", () => {
    const transactions = parseMonzoTransactionsCsv(
      [
        "ID,Date,Amount,Name,Type,Category,Local Currency",
        "tx_1,2026-05-02T14:35:01Z,-8240,Groceries,debit,shopping,GBP",
        "tx_2,2026-05-31T09:00:00Z,300000,Salary,credit,income,GBP",
      ].join("\n"),
    );

    expect(transactions).toMatchObject([
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
    expect(transactions[0]?.raw).toMatchObject({
      ID: "tx_1",
      Name: "Groceries",
    });
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

    expect(transactions).toMatchObject([
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
    expect(transactions[0]?.raw).toMatchObject({
      "Transaction ID": "tx_1",
      Amount: "-82.40",
      "Money Out": "82.40",
    });
  });

  test("parses current Amex export headers with charge-positive amounts", () => {
    const transactions = parseAmexTransactionsCsv(
      [
        "Date,Description,Card Member,Account #,Amount",
        "02/05/2026,Groceries,Example Person,00000,82.40",
        "03/05/2026,Refund,Example Person,00000,-25.00",
      ].join("\n"),
    );

    expect(transactions).toMatchObject([
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
    expect(transactions[0]?.raw).toMatchObject({
      "Account #": "00000",
      Amount: "82.40",
      "Card Member": "Example Person",
    });
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
