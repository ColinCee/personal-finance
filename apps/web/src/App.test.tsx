import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "txn_fake_1",
          postedOn: "2026-05-02",
          description: "Groceries",
          amountMinorUnits: -8240,
          currency: "GBP",
          kind: "spend",
          source: "fake-amex",
          reviewStatus: "needs_review",
          affectsPersonalSpend: true,
        },
      ],
    })),
  );
});

test("renders the dashboard", async () => {
  render(<App />);

  expect(
    await screen.findByRole("heading", { name: "Personal Finance" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("1 items")).toBeInTheDocument();
});
