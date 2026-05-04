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

    return {
      ok: true,
      json: async () => fakeTransactions,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
});

test("renders the dashboard", async () => {
  render(<App />);

  expect(
    await screen.findByRole("heading", { name: "Personal Finance" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("1 open")).toBeInTheDocument();
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
