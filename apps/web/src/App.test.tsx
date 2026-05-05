import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    affectsPersonalSpend: true,
  },
];

const fakeMonthlyReports = [
  {
    month: "2026-05",
    cashflowNetMinorUnits: -14000,
    moneyInMinorUnits: 4000,
    moneyOutMinorUnits: 18000,
    personalSpendMinorUnits: 14000,
    businessOrReimbursableMinorUnits: 30000,
    sharedSpendMinorUnits: 4000,
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
          source: "fixture_csv",
          originalFileName: "transactions.csv",
          fileSha256: "hash",
          rowCount: 4,
          duplicateRowCount: 0,
          alreadyImported: false,
          dateRange: {
            from: "2026-05-01",
            to: "2026-05-04",
          },
          reviewItemCount: 0,
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
          source: "fixture_csv",
          originalFileName: "transactions.csv",
          fileSha256: "hash",
          rowCount: 4,
          duplicateRowCount: 0,
          alreadyImported: false,
          dateRange: {
            from: "2026-05-01",
            to: "2026-05-04",
          },
          reviewItemCount: 0,
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
  expect(await screen.findByText("2 open")).toBeInTheDocument();
  expect(await screen.findByText("Economic view")).toBeInTheDocument();
  expect(await screen.findByText("1 open / 2 flagged")).toBeInTheDocument();
});

test("submits a review decision from the inbox", async () => {
  window.history.pushState({}, "", "/review");
  render(<App />);

  fireEvent.click(
    await screen.findByRole("button", {
      name: "Confirm credit-card payment",
    }),
  );

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

  fireEvent.change(await screen.findByLabelText("Source"), {
    target: { value: "fixture_csv" },
  });
  fireEvent.change(screen.getByLabelText(/Choose a CSV file/), {
    target: {
      files: [
        new File(
          ["posted_on,description,amount,currency,kind,source"],
          "transactions.csv",
          {
            type: "text/csv",
          },
        ),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

  expect(await screen.findByText("Ready")).toBeInTheDocument();
  expect(await screen.findAllByText("4")).not.toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Commit import" }));

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

  fireEvent.click(
    await screen.findByRole("button", {
      name: "Friend 50/50",
    }),
  );

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
