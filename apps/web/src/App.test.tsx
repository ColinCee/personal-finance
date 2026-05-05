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
