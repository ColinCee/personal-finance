import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "./App";

const fakeTransactions = [
  {
    id: "txn_fake_1",
    postedOn: "2026-05-02",
    description: "Amex payment",
    amountMinorUnits: -250000,
    currency: "GBP",
    kind: "credit_card_payment",
    source: "fake-amex",
    reviewItemId: "review_fake_1",
    reviewStatus: "needs_review",
    reviewReason: "credit_card_payment",
    affectsPersonalSpend: false,
  },
  {
    id: "txn_fake_2",
    postedOn: "2026-05-03",
    description: "Dinner",
    amountMinorUnits: -8000,
    currency: "GBP",
    kind: "spend",
    source: "fake-amex",
    reviewItemId: "review_fake_2",
    reviewStatus: "needs_review",
    reviewReason: "ordinary_spend",
    affectsPersonalSpend: true,
  },
  {
    id: "txn_fake_3",
    postedOn: "2026-05-04",
    description: "Coffee",
    amountMinorUnits: -350,
    currency: "GBP",
    kind: "spend",
    source: "fake-monzo",
    reviewItemId: null,
    reviewStatus: "confirmed",
    reviewReason: null,
    affectsPersonalSpend: true,
  },
  {
    id: "txn_fake_4",
    postedOn: "2026-05-05",
    description: "Shared subscription payment",
    amountMinorUnits: 2199,
    currency: "GBP",
    kind: "income",
    source: "fake-monzo",
    reviewItemId: "review_fake_4",
    reviewStatus: "needs_review",
    reviewReason: "positive_amount_uncertain",
    affectsPersonalSpend: false,
  },
  {
    id: "txn_fake_5",
    postedOn: "2026-05-06",
    description: "Household subscription repayment",
    amountMinorUnits: 2199,
    currency: "GBP",
    kind: "reimbursement",
    source: "fake-monzo",
    reviewItemId: "review_fake_5",
    reviewStatus: "confirmed",
    reviewReason: "private_rule:household-repayments",
    affectsPersonalSpend: false,
  },
  {
    id: "txn_fake_6",
    postedOn: "2026-05-07",
    description: "Instant Access Pot",
    amountMinorUnits: 5000,
    currency: "GBP",
    kind: "income",
    source: "fake-monzo",
    reviewItemId: "review_fake_6",
    reviewStatus: "needs_review",
    reviewReason: "positive_amount_uncertain",
    affectsPersonalSpend: false,
  },
];

const fakeMonthlyReports = [
  {
    month: "2026-05",
    cashflowNetMinorUnits: -14000,
    moneyInMinorUnits: 4000,
    moneyOutMinorUnits: 18000,
    actualPersonalSpendMinorUnits: 14000,
    personalSpendMinorUnits: 14000,
    businessOrReimbursableMinorUnits: 30000,
    sharedSpendMinorUnits: 4000,
    sharedAwaitingRepaymentMinorUnits: 4000,
    movedOrSavedMinorUnits: 25000,
    incomeNewMoneyMinorUnits: 300000,
    notPersonalBudgetMinorUnits: 30000,
    creditCardPaymentMinorUnits: 250000,
    refundOrRepaymentMinorUnits: 4000,
    unresolvedImpactMinorUnits: 8000,
    economicEffectTotals: {
      personal_spend: 14000,
      shared_spend: 4000,
      receivable_created: 34000,
      receivable_settled: 4000,
      refund: 0,
      transfer: 25000,
      saving: 0,
      investment: 0,
      credit_card_payment: 250000,
      income: 300000,
      not_personal_budget: 30000,
      uncertain: 8000,
    },
    allocationByPurpose: {
      personal: 14000,
      partner: 0,
      joint: 0,
      friend: 4000,
      business: 30000,
      reimbursable: 0,
      excluded: 0,
    },
    monthEndOutstandingByPurpose: {
      personal: 0,
      partner: 0,
      joint: 0,
      friend: 0,
      business: 30000,
      reimbursable: 0,
      excluded: 0,
    },
    monthEndCreditCardLiabilityMinorUnits: 0,
    transactionCount: 5,
    reviewItemCount: 2,
    openReviewItemCount: 1,
  },
];

const fakeImportHistory = [
  {
    id: "import_fixture_1",
    source: "fixture_csv",
    originalFileName: "transactions.csv",
    importedAt: "2026-05-05T12:00:00.000Z",
    rowCount: 4,
    status: "imported",
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.history.pushState({}, "", "/");
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (
      method === "POST" &&
      url === "/api/review-items/review_fake_1/decisions"
    ) {
      return {
        ok: true,
        json: async () => ({
          id: "review_decision_1",
          reviewItemId: "review_fake_1",
          action: "confirm_kind",
          decidedKind: "credit_card_payment",
          note: null,
        }),
      };
    }

    if (
      method === "POST" &&
      url === "/api/review-items/review_fake_1/allocation-decisions"
    ) {
      return {
        ok: true,
        json: async () => ({
          reviewItemId: "review_fake_1",
          allocationCount: 0,
          settlementCount: 1,
        }),
      };
    }

    if (
      method === "POST" &&
      url === "/api/review-items/review_fake_2/allocation-decisions"
    ) {
      return {
        ok: true,
        json: async () => ({
          reviewItemId: "review_fake_2",
          allocationCount: 2,
          settlementCount: 0,
        }),
      };
    }

    if (method === "GET" && url === "/api/reports/monthly") {
      return {
        ok: true,
        json: async () => fakeMonthlyReports,
      };
    }

    if (method === "GET" && url === "/api/imports") {
      return {
        ok: true,
        json: async () => fakeImportHistory,
      };
    }

    if (method === "POST" && url === "/api/imports/preview") {
      return {
        ok: true,
        json: async () => ({
          source: "monzo_csv",
          originalFileName: "monzo.csv",
          fileSha256: "hash",
          rowCount: 10,
          duplicateRowCount: 0,
          alreadyImported: false,
          dateRange: {
            from: "2026-05-01",
            to: "2026-05-04",
          },
          reviewItemCount: 3,
          moneyInMinorUnits: 302500,
          moneyOutMinorUnits: 16480,
          netAmountMinorUnits: 286020,
        }),
      };
    }

    if (method === "POST" && url === "/api/imports") {
      return {
        ok: true,
        json: async () => ({
          source: "monzo_csv",
          originalFileName: "monzo.csv",
          fileSha256: "hash",
          rowCount: 10,
          duplicateRowCount: 0,
          alreadyImported: false,
          dateRange: {
            from: "2026-05-01",
            to: "2026-05-04",
          },
          reviewItemCount: 3,
          moneyInMinorUnits: 302500,
          moneyOutMinorUnits: 16480,
          netAmountMinorUnits: 286020,
          imported: true,
          importedFileId: "import_fixture_1",
          rawTransactionCount: 4,
          ledgerEntryCount: 4,
          importedAt: "2026-05-05T12:00:00.000Z",
        }),
      };
    }

    if (method === "POST" && url === "/api/local-classification-rules/apply") {
      return {
        ok: true,
        json: async () => ({
          ruleCount: 2,
          automatedMatchedTransactionCount: 1,
          privateMatchedTransactionCount: 2,
          matchedTransactionCount: 3,
          createdReviewItemCount: 1,
          resolvedReviewItemCount: 2,
          updatedLedgerEntryCount: 3,
        }),
      };
    }

    if (method === "GET" && url === "/api/transactions") {
      return {
        ok: true,
        json: async () => fakeTransactions,
      };
    }

    return {
      ok: true,
      json: async () => {
        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

test("renders the dashboard", async () => {
  render(<App />);

  expect(
    await screen.findByRole("heading", { name: "Economic overview" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("4 open")).toBeInTheDocument();
  expect(await screen.findByText("Economic view")).toBeInTheDocument();
  expect(await screen.findByText("1 open / 2 flagged")).toBeInTheDocument();
});

test("renders the primary navigation", async () => {
  render(<App />);

  const navigation = await screen.findByRole("navigation", {
    name: "Primary",
  });

  expect(
    within(navigation).getByRole("link", { name: "Dashboard" }),
  ).toHaveAttribute("href", "/");
  expect(
    within(navigation).getByRole("link", { name: "Imports" }),
  ).toHaveAttribute("href", "/imports");
  expect(
    within(navigation).getByRole("link", { name: "Review" }),
  ).toHaveAttribute("href", "/review");
});

test("submits a review decision from the inbox", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  expect(await screen.findByText("Amex payment")).toBeInTheDocument();
  expect(screen.queryByText("Coffee")).not.toBeInTheDocument();

  fireEvent.pointerDown(
    screen.getAllByRole("button", { name: "Other choices" })[0],
  );
  fireEvent.click(await screen.findByText("Use card payment"));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/review-items/review_fake_1/decisions",
      expect.objectContaining({
        method: "POST",
      }),
    ),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/review-items/review_fake_1/decisions",
    expect.objectContaining({
      body: JSON.stringify({
        decidedKind: "credit_card_payment",
      }),
    }),
  );
});

test("previews and commits a CSV import", async () => {
  window.history.pushState({}, "", "/imports");
  render(<App />);

  expect(
    await screen.findByRole("heading", { name: "Import workspace" }),
  ).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/Choose a CSV file/), {
    target: {
      files: [
        new File(
          [
            "Transaction ID,Date,Time,Type,Name,Amount,Currency,Local currency,Money Out,Money In",
          ],
          "monzo.csv",
          {
            type: "text/csv",
          },
        ),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analyze CSV" }));

  expect(await screen.findByText("Detected Monzo CSV")).toBeInTheDocument();
  expect(
    await screen.findByText("3 rows will need review"),
  ).toBeInTheDocument();
  await waitFor(() => {
    const previewCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/imports/preview" && init?.method === "POST",
    );

    expect((previewCall?.[1]?.body as FormData).get("source")).toBeNull();
  });

  fireEvent.click(screen.getByRole("button", { name: "Import to ledger" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    ),
  );
});

test("submits a card-payment settlement from the inbox", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  fireEvent.click(
    await screen.findByRole("button", {
      name: "Settle card payment",
    }),
  );

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/review-items/review_fake_1/allocation-decisions",
      expect.objectContaining({
        method: "POST",
      }),
    ),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/review-items/review_fake_1/allocation-decisions",
    expect.objectContaining({
      body: JSON.stringify({
        note: "Recorded from the review inbox as a payment settling the credit-card liability.",
        settlements: [
          {
            type: "card_payment",
            amountMinorUnits: 250000,
          },
        ],
      }),
    }),
  );
});

test("submits a split allocation from the inbox", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  fireEvent.pointerDown(
    (await screen.findAllByRole("button", { name: "Other choices" }))[1],
  );
  fireEvent.click(await screen.findByText("Shared 50/50 - friend owes me"));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/review-items/review_fake_2/allocation-decisions",
      expect.objectContaining({
        method: "POST",
      }),
    ),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/review-items/review_fake_2/allocation-decisions",
    expect.objectContaining({
      body: JSON.stringify({
        note: "Recorded from the review inbox as a shared expense with a friend.",
        allocations: [
          {
            purpose: "personal",
            amountMinorUnits: 4000,
          },
          {
            purpose: "friend",
            amountMinorUnits: 4000,
            counterparty: "friend",
          },
        ],
      }),
    }),
  );
});

test("shows mark as spend on money-out rows", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  const dinnerTransaction = await screen.findByText("Dinner");
  const dinnerCard = dinnerTransaction.closest("tr");

  if (!dinnerCard) {
    throw new Error("Dinner transaction card was not rendered.");
  }

  expect(
    within(dinnerCard).getByRole("button", {
      name: "Mark as spend",
    }),
  ).toBeInTheDocument();
});

test("recommends repayment before income for positive credits", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  const subscriptionTransaction = await screen.findByText(
    "Shared subscription payment",
  );
  const subscriptionCard = subscriptionTransaction.closest("tr");

  if (!subscriptionCard) {
    throw new Error("Shared subscription transaction card was not rendered.");
  }

  expect(
    within(subscriptionCard).getByRole("button", {
      name: "Mark as refund / payout",
    }),
  ).toBeInTheDocument();
});

test("recommends transfer for pot movements even when detected as income", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  const potTransaction = await screen.findByText("Instant Access Pot");
  const potCard = potTransaction.closest("tr");

  if (!potCard) {
    throw new Error("Instant Access Pot transaction card was not rendered.");
  }

  expect(
    within(potCard).getByRole("button", {
      name: "Mark as transfer",
    }),
  ).toBeInTheDocument();
  expect(within(potCard).getByText("Monzo")).toBeInTheDocument();
  expect(
    within(potCard).queryByText("Looks like transfer"),
  ).not.toBeInTheDocument();
  expect(
    within(potCard).queryByText("Detected income"),
  ).not.toBeInTheDocument();
});

test("shows private-rule matches in the auto-identified tab", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  fireEvent.click(await screen.findByRole("tab", { name: /Auto-identified/ }));

  expect(
    await screen.findByText("Household subscription repayment"),
  ).toBeInTheDocument();
  expect(await screen.findByText("Auto-filed")).toBeInTheDocument();
  expect(await screen.findByText("refund / payout")).toBeInTheDocument();
});

test("reloads private rules from the review page", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Refresh rules" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/local-classification-rules/apply",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  expect(await screen.findByText(/Refreshed classifiers/)).toBeInTheDocument();
});

test("shows a compact guide for choosing review categories", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  fireEvent.click(
    await screen.findByRole("button", { name: "How should I choose?" }),
  );

  expect(await screen.findByText("Refund / payout")).toBeInTheDocument();
  expect(
    await screen.findByText(/Positive money is not a purchase/),
  ).toBeInTheDocument();
});
