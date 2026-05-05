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
import type { ReactNode } from "react";
import { useState } from "react";

import { fileImportSources } from "@personal-finance/core";
import type {
  AllocationPurpose,
  EntryKind,
  FileImportSource,
} from "@personal-finance/core";
import { Button } from "@/components/ui/button";
import {
  commitCsvImport,
  fetchMonthlyReports,
  fetchImportHistory,
  fetchTransactions,
  previewCsvImport,
  submitAllocationDecision,
  submitReviewDecision,
  type CsvImportRequest,
  type ImportPreview,
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

const importsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/imports",
  component: ImportWorkspace,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, importsRoute, reviewRoute]),
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
      <header className="app-chrome">
        <Link
          aria-label="Personal Finance dashboard"
          className="brand-lockup"
          to="/"
        >
          <span aria-hidden="true" className="brand-mark">
            PF
          </span>
          <span className="brand-copy">
            <strong>Personal Finance</strong>
            <span>Local ledger</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="app-nav">
          <Link
            activeOptions={{ exact: true }}
            activeProps={{ className: "app-nav-link active" }}
            inactiveProps={{ className: "app-nav-link" }}
            to="/"
          >
            Dashboard
          </Link>
          <Link
            activeProps={{ className: "app-nav-link active" }}
            inactiveProps={{ className: "app-nav-link" }}
            to="/imports"
          >
            Imports
          </Link>
          <Link
            activeProps={{ className: "app-nav-link active" }}
            inactiveProps={{ className: "app-nav-link" }}
            to="/review"
          >
            Review
          </Link>
        </nav>

        <div className="chrome-status">
          <span className="status-pill">Fake data</span>
          <span className="status-pill muted">Local SQLite</span>
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
      <PageHeader
        aside={
          <div className="page-actions">
            <span className="status-pill">{reviewItemCount} open reviews</span>
            <span className="status-pill muted">
              {latestReport ? formatMonth(latestReport.month) : "No report yet"}
            </span>
          </div>
        }
        description="A reviewed ledger view that separates real spending from transfers, Amex payments, reimbursements, and joint-account settlements."
        eyebrow="Dashboard"
        title="Economic overview"
      />

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

function ImportWorkspace() {
  const queryClient = useQueryClient();
  const importHistory = useQuery({
    queryKey: ["import-history"],
    queryFn: fetchImportHistory,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [source, setSource] = useState<FileImportSource>("fixture_csv");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const previewMutation = useMutation({
    mutationFn: previewCsvImport,
    onSuccess: (nextPreview) => setPreview(nextPreview),
  });
  const commitMutation = useMutation({
    mutationFn: commitCsvImport,
    onSuccess: (result) => {
      setPreview(result);
      void queryClient.invalidateQueries({ queryKey: ["import-history"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["monthly-reports"] });
    },
  });

  function currentRequest(): CsvImportRequest | null {
    return selectedFile ? { file: selectedFile, source } : null;
  }

  function previewCurrentImport() {
    const request = currentRequest();

    if (request) {
      previewMutation.mutate(request);
    }
  }

  return (
    <div className="import-stack">
      <PageHeader
        aside={
          <div className="page-actions">
            <span className="status-pill">CSV upload</span>
            <span className="status-pill muted">Preview first</span>
          </div>
        }
        description="Upload a bank export, inspect aggregate-only metadata, then commit it into the auditable local ledger."
        eyebrow="Imports"
        title="Import workspace"
      />

      <section className="import-layout">
        <form
          className="panel import-panel"
          onSubmit={(event) => {
            event.preventDefault();
            previewCurrentImport();
          }}
        >
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Upload</p>
              <h2>Preview a CSV</h2>
              <p>
                Preview returns counts, date range, duplicate status, and money
                totals before anything is persisted.
              </p>
            </div>
          </div>

          <label className="field">
            <span>Source</span>
            <select
              onChange={(event) => {
                setSource(event.target.value as FileImportSource);
                setPreview(null);
              }}
              value={source}
            >
              {fileImportSources.map((importSource) => (
                <option key={importSource} value={importSource}>
                  {formatFileImportSource(importSource)}
                </option>
              ))}
            </select>
          </label>

          <label className="file-drop">
            <span>
              {selectedFile ? selectedFile.name : "Choose a CSV file"}
            </span>
            <small>
              The browser sends the file to the local API; SQLite stays server
              owned.
            </small>
            <input
              accept=".csv,text/csv"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
              type="file"
            />
          </label>

          <div className="import-actions">
            <Button
              disabled={!selectedFile || previewMutation.isPending}
              onClick={previewCurrentImport}
              type="button"
            >
              {previewMutation.isPending ? "Previewing..." : "Preview import"}
            </Button>
            <Button
              disabled={
                !selectedFile ||
                !preview ||
                commitMutation.isPending ||
                preview.alreadyImported
              }
              onClick={() => {
                const request = currentRequest();

                if (request) {
                  commitMutation.mutate(request);
                }
              }}
              type="button"
              variant="secondary"
            >
              {commitMutation.isPending ? "Importing..." : "Commit import"}
            </Button>
          </div>

          {previewMutation.isError || commitMutation.isError ? (
            <p className="decision-error" role="alert">
              {previewMutation.error?.message ?? commitMutation.error?.message}
            </p>
          ) : null}
        </form>

        <ImportPreviewPanel preview={preview} />
      </section>

      <ImportHistoryPanel
        history={importHistory.data ?? []}
        isError={importHistory.isError}
        isLoading={importHistory.isLoading}
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
    <div className="review-stack">
      <PageHeader
        aside={
          <div className="page-actions">
            <span className="status-pill">{rows.length} rows</span>
            <span className="status-pill muted">Needs review</span>
          </div>
        }
        description="Confirm uncertain imports before they affect your economic reports."
        eyebrow="Review"
        title="Review inbox"
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Decision queue</p>
            <h2>Flagged transactions</h2>
            <p>
              The app flags repayments, transfers, reimbursements, and shared
              settlements before they flow into reports.
            </p>
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
    </div>
  );
}

function PageHeader(props: {
  aside?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="page-header">
      <div className="page-header-copy">
        <p className="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.aside ? (
        <div className="page-header-aside">{props.aside}</div>
      ) : null}
    </section>
  );
}

function ImportPreviewPanel(props: { preview: ImportPreview | null }) {
  if (!props.preview) {
    return (
      <section className="panel import-preview-panel">
        <div className="empty-state">
          <strong>No preview yet.</strong>
          <span>Select a source and CSV to inspect safe import metadata.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel import-preview-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>
            {props.preview.alreadyImported ? "Already imported" : "Ready"}
          </h2>
          <p>
            {props.preview.originalFileName} ·{" "}
            {formatFileImportSource(props.preview.source)}
          </p>
        </div>
      </div>

      <div className="preview-grid">
        <SummaryCard label="Rows" value={props.preview.rowCount.toString()} />
        <SummaryCard
          label="Duplicates"
          value={props.preview.duplicateRowCount.toString()}
          hint={
            props.preview.alreadyImported ? "Same file hash exists" : "None"
          }
        />
        <SummaryCard
          label="Review"
          value={`${props.preview.reviewItemCount} items`}
          hint="Will need confirmation"
        />
        <SummaryCard
          label="Net"
          value={formatCurrencyFromMinorUnits(
            props.preview.netAmountMinorUnits,
          )}
          hint={`${formatDateRange(props.preview.dateRange)} period`}
        />
      </div>
    </section>
  );
}

function ImportHistoryPanel(props: {
  history: readonly {
    id: string;
    source: FileImportSource;
    originalFileName: string;
    importedAt: string;
    rowCount: number;
    status: "imported";
  }[];
  isError: boolean;
  isLoading: boolean;
}) {
  if (props.isLoading) {
    return <p className="panel">Loading import history...</p>;
  }

  if (props.isError) {
    return <p className="panel error">Unable to load import history.</p>;
  }

  return (
    <section className="panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">History</p>
          <h2>Imported files</h2>
          <p>Committed files are tracked by source and file hash.</p>
        </div>
      </div>

      {props.history.length === 0 ? (
        <div className="empty-state">
          <strong>No imports yet.</strong>
          <span>Preview and commit a CSV to start the ledger.</span>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Source</th>
              <th>Rows</th>
              <th>Imported</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.history.map((item) => (
              <tr key={item.id}>
                <td>{item.originalFileName}</td>
                <td>{formatFileImportSource(item.source)}</td>
                <td>{item.rowCount}</td>
                <td>{formatTimestamp(item.importedAt)}</td>
                <td>
                  <span className="kind-pill">{item.status}</span>
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

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatDateRange(range: { from: string | null; to: string | null }) {
  if (!range.from || !range.to) {
    return "No dates";
  }

  if (range.from === range.to) {
    return range.from;
  }

  return `${range.from} to ${range.to}`;
}

function formatFileImportSource(source: FileImportSource) {
  switch (source) {
    case "amex_csv":
      return "Amex CSV";
    case "fixture_csv":
      return "Fixture CSV";
    case "monzo_csv":
      return "Monzo CSV";
  }
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
