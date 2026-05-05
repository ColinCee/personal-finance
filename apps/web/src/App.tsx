import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useState } from "react";

import type { AllocationPurpose, EntryKind } from "@personal-finance/core";
import { Button } from "@/components/ui/button";
import {
  fetchMonthlyReports,
  fetchTransactions,
  submitAllocationDecision,
  submitReviewDecision,
  type MonthlyReport,
  type Transaction,
} from "./api";
import "./styles.css";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review",
  component: ReviewInbox,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, reviewRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function RootLayout() {
  return (
    <main className="shell">
      <header className="hero">
        <div className="hero-title-block">
          <p className="eyebrow">Local-first finance workspace</p>
          <h1>Personal Finance</h1>
          <p className="hero-summary">
            Import bank exports, review uncertain transactions, and separate
            real spending from transfers, Amex payments, reimbursements, and
            joint-account settlements.
          </p>
        </div>
        <div className="hero-copy">
          <span className="data-badge">Fake data only</span>
          <nav aria-label="Primary" className="hero-nav">
            <Button asChild className="nav-pill" size="lg" variant="outline">
              <Link to="/">Dashboard</Link>
            </Button>
            <Button asChild className="nav-pill" size="lg" variant="outline">
              <Link to="/review">Review inbox</Link>
            </Button>
          </nav>
        </div>
      </header>
      <Outlet />
    </main>
  );
}

function Dashboard() {
  const transactions = useTransactions();
  const monthlyReports = useMonthlyReports();
  const reviewItemCount =
    transactions.data?.filter(
      (transaction) => transaction.reviewStatus === "needs_review",
    ).length ?? 0;
  const reports = monthlyReports.data ?? [];
  const latestReport = reports.at(-1);

  return (
    <div className="dashboard-stack">
      <section className="grid">
        <SummaryCard
          label="Review inbox"
          value={`${reviewItemCount} open`}
          hint="Only uncertain rows need action"
        />
        <SummaryCard
          label="Latest personal spend"
          value={formatCurrencyFromMinorUnits(
            latestReport?.personalSpendMinorUnits ?? 0,
          )}
          hint={
            latestReport ? formatMonth(latestReport.month) : "No reports yet"
          }
        />
        <SummaryCard
          label="Card liability"
          value={formatCurrencyFromMinorUnits(
            latestReport?.monthEndCreditCardLiabilityMinorUnits ?? 0,
          )}
          hint="Month-end Amex balance model"
        />
      </section>

      <MonthlyReportsPanel
        isError={monthlyReports.isError}
        isLoading={monthlyReports.isLoading}
        reports={reports}
      />
    </div>
  );
}

function ReviewInbox() {
  const transactions = useTransactions();
  const queryClient = useQueryClient();
  const reviewDecision = useMutation({
    mutationFn: submitReviewDecision,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });
  const allocationDecision = useMutation({
    mutationFn: submitAllocationDecision,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });
  const rows = transactions.data ?? [];
  const pendingReviewItemId =
    reviewDecision.isPending || allocationDecision.isPending
      ? (reviewDecision.variables?.reviewItemId ??
        allocationDecision.variables?.reviewItemId)
      : null;

  if (transactions.isLoading) {
    return <p className="panel">Loading transactions...</p>;
  }

  if (transactions.isError) {
    return <p className="panel error">{transactions.error.message}</p>;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>Review inbox</h2>
          <p>
            The app flags repayments, transfers, reimbursements, and shared
            settlements before they flow into reports.
          </p>
        </div>
        <div className="queue-meter">
          <strong>{rows.length}</strong>
          <span>rows</span>
        </div>
      </div>

      {reviewDecision.isError || allocationDecision.isError ? (
        <p className="decision-error" role="alert">
          {reviewDecision.error?.message ?? allocationDecision.error?.message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-state">
          <strong>Nothing needs review.</strong>
          <span>Import fake fixture data to populate this queue.</span>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Detected kind</th>
              <th>Amount</th>
              <th>Impact</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((transaction) => (
              <tr key={transaction.id}>
                <td>
                  <time dateTime={transaction.postedOn}>
                    {transaction.postedOn}
                  </time>
                </td>
                <td>
                  <div className="transaction-copy">
                    <strong>{transaction.description}</strong>
                    <span>{transaction.source}</span>
                  </div>
                </td>
                <td>
                  <span className="kind-pill">
                    {formatEntryKind(transaction.kind)}
                  </span>
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(transaction.amountMinorUnits)}
                </td>
                <td>{impactLabel(transaction)}</td>
                <td>
                  <ReviewActions
                    pending={pendingReviewItemId === transaction.reviewItemId}
                    transaction={transaction}
                    onDecision={(decidedKind) => {
                      if (!transaction.reviewItemId) {
                        throw new Error(
                          `Transaction has no review item: ${transaction.id}`,
                        );
                      }

                      reviewDecision.mutate({
                        reviewItemId: transaction.reviewItemId,
                        decidedKind,
                        note:
                          decidedKind === transaction.kind
                            ? undefined
                            : `Changed from ${formatEntryKind(transaction.kind)} in the review inbox.`,
                      });
                    }}
                    onAllocationDecision={(allocationChoice) => {
                      if (!transaction.reviewItemId) {
                        throw new Error(
                          `Transaction has no review item: ${transaction.id}`,
                        );
                      }

                      allocationDecision.mutate({
                        reviewItemId: transaction.reviewItemId,
                        note: allocationChoice.note,
                        allocations: allocationChoice.allocations,
                        settlements: allocationChoice.settlements,
                      });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ReviewActions(props: {
  pending: boolean;
  transaction: Transaction;
  onDecision: (decidedKind: EntryKind) => void;
  onAllocationDecision: (choice: AllocationChoice) => void;
}) {
  if (
    props.transaction.reviewStatus === "confirmed" ||
    !props.transaction.reviewItemId
  ) {
    return <span className="resolved-label">Resolved</span>;
  }

  return (
    <div className="decision-actions">
      <Button
        disabled={props.pending}
        onClick={() => props.onDecision(props.transaction.kind)}
        size="sm"
      >
        {props.pending
          ? "Saving..."
          : `Confirm ${formatEntryKind(props.transaction.kind)}`}
      </Button>
      {kindCorrectionOptionsForTransaction(props.transaction).map((option) => (
        <Button
          disabled={props.pending}
          key={option.kind}
          onClick={() => props.onDecision(option.kind)}
          size="sm"
          variant="outline"
        >
          {option.label}
        </Button>
      ))}
      {allocationChoicesForTransaction(props.transaction).map((choice) => (
        <Button
          disabled={props.pending}
          key={choice.label}
          onClick={() => props.onAllocationDecision(choice)}
          size="sm"
          variant="secondary"
        >
          {choice.label}
        </Button>
      ))}
    </div>
  );
}

type AllocationChoice = {
  label: string;
  note: string;
  allocations?: readonly {
    purpose: AllocationPurpose;
    amountMinorUnits: number;
    counterparty?: string;
  }[];
  settlements?: readonly {
    type: "card_payment";
    amountMinorUnits: number;
  }[];
};

function SummaryCard(props: { label: string; value: string; hint?: string }) {
  return (
    <article className="card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.hint ? <small>{props.hint}</small> : null}
    </article>
  );
}

function useTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: fetchTransactions,
  });
}

function useMonthlyReports() {
  return useQuery({
    queryKey: ["monthly-reports"],
    queryFn: fetchMonthlyReports,
  });
}

function MonthlyReportsPanel(props: {
  reports: MonthlyReport[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (props.isLoading) {
    return <p className="panel">Loading monthly reports...</p>;
  }

  if (props.isError) {
    return <p className="panel error">Unable to load monthly reports.</p>;
  }

  return (
    <section className="panel report-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Monthly reporting</p>
          <h2>Economic view</h2>
          <p>
            Month-end balances come from reviewed allocations and settlements,
            so Amex payments, friend splits, and business spend are not confused
            with personal spending.
          </p>
        </div>
      </div>

      {props.reports.length === 0 ? (
        <div className="empty-state">
          <strong>No reports yet.</strong>
          <span>
            Import and review transactions to populate monthly reports.
          </span>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Personal</th>
              <th>Shared</th>
              <th>Business</th>
              <th>Card liability</th>
              <th>Review health</th>
            </tr>
          </thead>
          <tbody>
            {props.reports.map((report) => (
              <tr key={report.month}>
                <td>{formatMonth(report.month)}</td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(report.personalSpendMinorUnits)}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(report.sharedSpendMinorUnits)}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(
                    report.businessOrReimbursableMinorUnits,
                  )}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(
                    report.monthEndCreditCardLiabilityMinorUnits,
                  )}
                </td>
                <td>
                  {report.openReviewItemCount} open / {report.reviewItemCount}{" "}
                  flagged
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatCurrencyFromMinorUnits(amountMinorUnits: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountMinorUnits / 100);
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

const decisionKindOptions: { kind: EntryKind; label: string }[] = [
  { kind: "spend", label: "spend" },
  { kind: "transfer", label: "transfer" },
  { kind: "credit_card_payment", label: "card payment" },
  { kind: "reimbursement", label: "reimbursement" },
  { kind: "split_settlement", label: "split" },
];

const spendCorrectionKinds = new Set<EntryKind>([
  "transfer",
  "credit_card_payment",
  "reimbursement",
]);

function kindCorrectionOptionsForTransaction(
  transaction: Transaction,
): { kind: EntryKind; label: string }[] {
  return decisionKindOptions
    .filter((option) => option.kind !== transaction.kind)
    .filter((option) =>
      transaction.kind === "spend"
        ? spendCorrectionKinds.has(option.kind)
        : option.kind === "spend",
    )
    .map((option) => ({
      kind: option.kind,
      label:
        transaction.kind === "spend"
          ? `Actually ${option.label}`
          : `Mark as ${option.label}`,
    }));
}

const entryKindLabels: Record<EntryKind, string> = {
  income: "income",
  spend: "spend",
  transfer: "transfer",
  credit_card_payment: "credit-card payment",
  reimbursement: "reimbursement",
  split_settlement: "split settlement",
};

function formatEntryKind(kind: EntryKind): string {
  return entryKindLabels[kind];
}

function impactLabel(transaction: Transaction): string {
  return transaction.affectsPersonalSpend
    ? "Counts as spend"
    : "Excluded from spend";
}

function allocationChoicesForTransaction(
  transaction: Transaction,
): AllocationChoice[] {
  if (transaction.amountMinorUnits >= 0) {
    return [];
  }

  const amountMinorUnits = Math.abs(transaction.amountMinorUnits);

  if (transaction.kind === "credit_card_payment") {
    return [
      {
        label: "Settle card payment",
        note: "Recorded from the review inbox as a payment settling the credit-card liability.",
        settlements: [
          {
            type: "card_payment",
            amountMinorUnits,
          },
        ],
      },
    ];
  }

  const halfMinorUnits = Math.floor(amountMinorUnits / 2);
  const personalShareMinorUnits = amountMinorUnits - halfMinorUnits;

  return [
    fullAllocationChoice("Personal spend", "personal", amountMinorUnits),
    fullAllocationChoice("Business", "business", amountMinorUnits, "business"),
    fullAllocationChoice(
      "Reimbursable",
      "reimbursable",
      amountMinorUnits,
      "to be reimbursed",
    ),
    {
      label: "Friend 50/50",
      note: "Recorded from the review inbox as a shared expense with a friend.",
      allocations: [
        {
          purpose: "personal",
          amountMinorUnits: personalShareMinorUnits,
        },
        {
          purpose: "friend",
          amountMinorUnits: halfMinorUnits,
          counterparty: "friend",
        },
      ],
    },
    {
      label: "Partner 50/50",
      note: "Recorded from the review inbox as a shared expense with a partner.",
      allocations: [
        {
          purpose: "personal",
          amountMinorUnits: personalShareMinorUnits,
        },
        {
          purpose: "partner",
          amountMinorUnits: halfMinorUnits,
          counterparty: "partner",
        },
      ],
    },
  ];
}

function fullAllocationChoice(
  label: string,
  purpose: AllocationPurpose,
  amountMinorUnits: number,
  counterparty?: string,
): AllocationChoice {
  return {
    label,
    note: `Recorded from the review inbox as ${label.toLowerCase()}.`,
    allocations: [
      {
        purpose,
        amountMinorUnits,
        counterparty,
      },
    ],
  };
}
