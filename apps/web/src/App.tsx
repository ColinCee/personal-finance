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

import type {
  AllocationPurpose,
  EntryKind,
  FileImportSource,
} from "@personal-finance/core";
import { Button } from "@/components/ui/button";
import {
  applyLocalClassificationRules,
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
          label="Actual personal spend"
          value={formatCurrencyFromMinorUnits(
            latestReport?.actualPersonalSpendMinorUnits ?? 0,
          )}
          hint={
            latestReport ? formatMonth(latestReport.month) : "No reports yet"
          }
        />
        <SummaryCard
          label="Unresolved impact"
          value={formatCurrencyFromMinorUnits(
            latestReport?.unresolvedImpactMinorUnits ?? 0,
          )}
          hint="Excluded from confidence until reviewed"
        />
        <SummaryCard
          label="Shared awaiting repayment"
          value={formatCurrencyFromMinorUnits(
            latestReport?.sharedAwaitingRepaymentMinorUnits ?? 0,
          )}
          hint="Friend, partner, and joint balances"
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
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importCommitted, setImportCommitted] = useState(false);
  const previewMutation = useMutation({
    mutationFn: previewCsvImport,
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setImportCommitted(false);
    },
  });
  const commitMutation = useMutation({
    mutationFn: commitCsvImport,
    onSuccess: (result) => {
      setPreview(result);
      setImportCommitted(result.imported);
      void queryClient.invalidateQueries({ queryKey: ["import-history"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["monthly-reports"] });
    },
  });

  function currentRequest(): CsvImportRequest | null {
    return selectedFile ? { file: selectedFile } : null;
  }

  function previewCurrentImport() {
    const request = currentRequest();

    if (request) {
      previewMutation.mutate(request);
    }
  }

  function commitCurrentImport() {
    const request = currentRequest();

    if (request) {
      commitMutation.mutate(request);
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
        description="Drop in a bank export, let the app detect the format, then import only after seeing what will need review."
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
              <h2>Analyze a CSV</h2>
              <p>
                Monzo, Amex, and fixture exports are detected from the file
                headers. Nothing is written until you import.
              </p>
            </div>
          </div>

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
                setImportCommitted(false);
                previewMutation.reset();
                commitMutation.reset();
              }}
              type="file"
            />
          </label>

          <div className="import-actions">
            <Button
              disabled={!selectedFile || previewMutation.isPending}
              type="submit"
              variant={preview ? "secondary" : "default"}
            >
              {previewMutation.isPending
                ? "Analyzing..."
                : preview
                  ? "Analyze again"
                  : "Analyze CSV"}
            </Button>
          </div>

          {previewMutation.isError || commitMutation.isError ? (
            <p className="decision-error" role="alert">
              {previewMutation.error?.message ?? commitMutation.error?.message}
            </p>
          ) : null}
        </form>

        <ImportPreviewPanel
          importCommitted={importCommitted}
          isImporting={commitMutation.isPending}
          onCommit={commitCurrentImport}
          preview={preview}
        />
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
  const [activeReviewTab, setActiveReviewTab] =
    useState<ReviewInboxTab>("needs_action");
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
  const localRulesApply = useMutation({
    mutationFn: applyLocalClassificationRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-reports"] });
      setActiveReviewTab("auto_identified");
    },
  });
  const allRows = transactions.data ?? [];
  const rows = allRows.filter(
    (transaction) =>
      transaction.reviewStatus === "needs_review" && transaction.reviewItemId,
  );
  const autoIdentifiedRows = allRows.filter(isPrivateRuleTransaction);
  const displayedRows =
    activeReviewTab === "needs_action" ? rows : autoIdentifiedRows;
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

  function decideKind(transaction: Transaction, decidedKind: EntryKind) {
    if (!transaction.reviewItemId) {
      throw new Error(`Transaction has no review item: ${transaction.id}`);
    }

    reviewDecision.mutate({
      reviewItemId: transaction.reviewItemId,
      decidedKind,
      note:
        decidedKind === transaction.kind
          ? undefined
          : `Changed from ${formatEntryKind(transaction.kind)} in the review inbox.`,
    });
  }

  function decideAllocation(
    transaction: Transaction,
    allocationChoice: AllocationChoice,
  ) {
    if (!transaction.reviewItemId) {
      throw new Error(`Transaction has no review item: ${transaction.id}`);
    }

    allocationDecision.mutate({
      reviewItemId: transaction.reviewItemId,
      note: allocationChoice.note,
      allocations: allocationChoice.allocations,
      settlements: allocationChoice.settlements,
    });
  }

  return (
    <div className="review-stack">
      <PageHeader
        aside={
          <div className="page-actions">
            <span className="status-pill">{rows.length} need action</span>
            <span className="status-pill muted">
              {autoIdentifiedRows.length} auto-identified
            </span>
            <span className="status-pill muted">
              {allRows.length} ledger rows
            </span>
          </div>
        }
        description="Confirm uncertain imports before they affect your economic reports."
        eyebrow="Review"
        title="Review inbox"
      />

      <section className="panel review-panel">
        <div className="panel-header review-panel-header">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>
              {activeReviewTab === "needs_action"
                ? "Flagged transactions"
                : "Auto-identified transactions"}
            </h2>
            <p>
              {activeReviewTab === "needs_action"
                ? "Review only the rows that can change your real monthly spend. Choose the budget effect, not a bookkeeping category."
                : "Private local rules can auto-file rows for you, but they stay visible here so the behaviour is inspectable."}
            </p>
          </div>
          <div className="review-queue-summary">
            <strong>{displayedRows.length}</strong>
            <span>{activeReviewTab === "needs_action" ? "open" : "auto"}</span>
          </div>
        </div>

        <div className="review-tabs" role="tablist" aria-label="Review inbox">
          <button
            aria-selected={activeReviewTab === "needs_action"}
            className="review-tab"
            onClick={() => setActiveReviewTab("needs_action")}
            role="tab"
            type="button"
          >
            Needs action
            <span>{rows.length}</span>
          </button>
          <button
            aria-selected={activeReviewTab === "auto_identified"}
            className="review-tab"
            onClick={() => setActiveReviewTab("auto_identified")}
            role="tab"
            type="button"
          >
            Auto-identified
            <span>{autoIdentifiedRows.length}</span>
          </button>
        </div>

        {reviewDecision.isError || allocationDecision.isError ? (
          <p className="decision-error" role="alert">
            {reviewDecision.error?.message ?? allocationDecision.error?.message}
          </p>
        ) : null}

        {localRulesApply.isError ? (
          <p className="decision-error" role="alert">
            {localRulesApply.error.message}
          </p>
        ) : null}

        <div className="local-rules-bar">
          <div>
            <strong>Edited private rules?</strong>
            <span>
              Reload the ignored JSON file and apply matching rules to existing
              unresolved rows.
            </span>
          </div>
          <Button
            disabled={localRulesApply.isPending}
            onClick={() => localRulesApply.mutate()}
            type="button"
            variant="secondary"
          >
            {localRulesApply.isPending ? "Reloading..." : "Reload rules"}
          </Button>
        </div>

        {localRulesApply.isSuccess ? (
          <p className="rules-apply-summary" role="status">
            Applied {localRulesApply.data.ruleCount} private rules.{" "}
            {localRulesApply.data.matchedTransactionCount} rows matched;{" "}
            {localRulesApply.data.resolvedReviewItemCount} moved from Needs
            action and {localRulesApply.data.createdReviewItemCount} marked as
            auto-identified.
          </p>
        ) : null}

        {displayedRows.length === 0 ? (
          <div className="empty-state">
            <strong>
              {activeReviewTab === "needs_action"
                ? "Nothing needs review."
                : "No private rules have auto-identified rows yet."}
            </strong>
            <span>
              {activeReviewTab === "needs_action"
                ? "Confirmed and auto-filed rows stay out of this queue."
                : "Add local rules under storage to auto-file private payees without committing them."}
            </span>
          </div>
        ) : activeReviewTab === "needs_action" ? (
          <div className="review-card-list">
            {displayedRows.map((transaction) => (
              <ReviewDecisionCard
                key={transaction.id}
                pending={pendingReviewItemId === transaction.reviewItemId}
                transaction={transaction}
                onAllocationDecision={(allocationChoice) =>
                  decideAllocation(transaction, allocationChoice)
                }
                onDecision={(decidedKind) =>
                  decideKind(transaction, decidedKind)
                }
              />
            ))}
          </div>
        ) : (
          <div className="review-card-list">
            {displayedRows.map((transaction) => (
              <AutoIdentifiedCard
                key={transaction.id}
                transaction={transaction}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type ReviewInboxTab = "needs_action" | "auto_identified";

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

function ImportPreviewPanel(props: {
  importCommitted: boolean;
  isImporting: boolean;
  onCommit: () => void;
  preview: ImportPreview | null;
}) {
  if (!props.preview) {
    return (
      <section className="panel import-preview-panel">
        <div className="empty-state">
          <strong>Waiting for a file.</strong>
          <span>
            Choose a CSV and the app will detect the bank before showing the
            import decision.
          </span>
        </div>
      </section>
    );
  }

  const autoFiledCount = props.preview.rowCount - props.preview.reviewItemCount;

  return (
    <section className="panel import-preview-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">
            Detected {formatFileImportSource(props.preview.source)}
          </p>
          <h2>{importPreviewTitle(props.preview, props.importCommitted)}</h2>
          <p>
            {props.preview.originalFileName} ·{" "}
            {formatDateRange(props.preview.dateRange)}
          </p>
        </div>
      </div>

      <div className="import-decision-card">
        <span className="decision-count">
          {props.preview.alreadyImported
            ? props.preview.duplicateRowCount
            : props.preview.reviewItemCount}
        </span>
        <div>
          <h3>
            {importPreviewDecisionHeading(props.preview, props.importCommitted)}
          </h3>
          <p>
            {importPreviewDecisionCopy(
              props.preview,
              autoFiledCount,
              props.importCommitted,
            )}
          </p>
        </div>
        {!props.preview.alreadyImported && !props.importCommitted ? (
          <Button
            disabled={props.isImporting}
            onClick={props.onCommit}
            type="button"
          >
            {props.isImporting ? "Importing..." : "Import to ledger"}
          </Button>
        ) : null}
      </div>

      <dl className="import-facts">
        <div>
          <dt>Total rows</dt>
          <dd>{props.preview.rowCount}</dd>
        </div>
        <div>
          <dt>Auto-filed</dt>
          <dd>{autoFiledCount}</dd>
        </div>
        <div>
          <dt>Net cashflow</dt>
          <dd>
            {formatCurrencyFromMinorUnits(props.preview.netAmountMinorUnits)}
          </dd>
        </div>
        <div>
          <dt>Duplicates</dt>
          <dd>{props.preview.duplicateRowCount}</dd>
        </div>
      </dl>
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
                  <span className="resolved-label">{item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ReviewDecisionCard(props: {
  pending: boolean;
  transaction: Transaction;
  onDecision: (decidedKind: EntryKind) => void;
  onAllocationDecision: (choice: AllocationChoice) => void;
}) {
  if (
    props.transaction.reviewStatus === "confirmed" ||
    !props.transaction.reviewItemId
  ) {
    return null;
  }

  const choices = reviewChoicesForTransaction(props.transaction);
  const [recommendedChoice, ...alternativeChoices] = choices;
  const isMoneyIn = props.transaction.amountMinorUnits >= 0;

  return (
    <article className="review-card">
      <div className="review-transaction-copy">
        <div className="review-meta">
          <time dateTime={props.transaction.postedOn}>
            {props.transaction.postedOn}
          </time>
          <span>{props.transaction.source}</span>
          <span>Detected {formatEntryKind(props.transaction.kind)}</span>
        </div>
        <h3>{props.transaction.description}</h3>
      </div>

      <div className="review-amount-badge">
        <span>{isMoneyIn ? "Money in" : "Money out"}</span>
        <strong
          className={isMoneyIn ? "review-amount positive" : "review-amount"}
        >
          {formatCurrencyFromMinorUnits(props.transaction.amountMinorUnits)}
        </strong>
      </div>

      {recommendedChoice ? (
        <button
          aria-label={recommendedChoice.label}
          className="review-choice recommended"
          disabled={props.pending}
          onClick={() =>
            executeReviewChoice(recommendedChoice, {
              onAllocationDecision: props.onAllocationDecision,
              onDecision: props.onDecision,
            })
          }
          type="button"
        >
          <span className="choice-kicker">Recommended</span>
          <strong>
            {props.pending ? "Saving..." : recommendedChoice.label}
          </strong>
          <small>{recommendedChoice.description}</small>
        </button>
      ) : null}

      {alternativeChoices.length > 0 ? (
        <details className="review-alternatives">
          <summary>
            Other choices
            <span>{alternativeChoices.length}</span>
          </summary>
          <div className="review-choice-grid">
            {alternativeChoices.map((choice) => (
              <button
                aria-label={choice.label}
                className="review-choice"
                disabled={props.pending}
                key={choice.id}
                onClick={() =>
                  executeReviewChoice(choice, {
                    onAllocationDecision: props.onAllocationDecision,
                    onDecision: props.onDecision,
                  })
                }
                type="button"
              >
                <strong>{choice.label}</strong>
                <small>{choice.description}</small>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function AutoIdentifiedCard(props: { transaction: Transaction }) {
  const isMoneyIn = props.transaction.amountMinorUnits >= 0;

  return (
    <article className="review-card auto-identified-card">
      <div className="review-transaction-copy">
        <div className="review-meta">
          <time dateTime={props.transaction.postedOn}>
            {props.transaction.postedOn}
          </time>
          <span>{props.transaction.source}</span>
          <span>{formatPrivateRuleReason(props.transaction.reviewReason)}</span>
        </div>
        <h3>{props.transaction.description}</h3>
      </div>

      <div className="review-amount-badge">
        <span>{isMoneyIn ? "Money in" : "Money out"}</span>
        <strong
          className={isMoneyIn ? "review-amount positive" : "review-amount"}
        >
          {formatCurrencyFromMinorUnits(props.transaction.amountMinorUnits)}
        </strong>
      </div>

      <div className="auto-decision-pill">
        <span>Auto-filed</span>
        <strong>{formatEntryKind(props.transaction.kind)}</strong>
      </div>
    </article>
  );
}

type ReviewChoice =
  | {
      id: string;
      label: string;
      description: string;
      type: "kind";
      decidedKind: EntryKind;
    }
  | {
      id: string;
      label: string;
      description: string;
      type: "allocation";
      allocationChoice: AllocationChoice;
    };

type ReviewChoiceHandlers = {
  onDecision: (decidedKind: EntryKind) => void;
  onAllocationDecision: (choice: AllocationChoice) => void;
};

function isPrivateRuleTransaction(transaction: Transaction): boolean {
  return (
    transaction.reviewStatus === "confirmed" &&
    transaction.reviewReason?.startsWith("private_rule:") === true
  );
}

function formatPrivateRuleReason(reason: string | null): string {
  const ruleId = reason?.startsWith("private_rule:")
    ? reason.slice("private_rule:".length)
    : null;

  return ruleId ? `Private rule ${ruleId}` : "Private rule";
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
              <th>Actual spend</th>
              <th>Awaiting repayment</th>
              <th>Moved / saved</th>
              <th>Income</th>
              <th>Unresolved</th>
              <th>Review health</th>
            </tr>
          </thead>
          <tbody>
            {props.reports.map((report) => (
              <tr key={report.month}>
                <td>{formatMonth(report.month)}</td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(
                    report.actualPersonalSpendMinorUnits,
                  )}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(
                    report.sharedAwaitingRepaymentMinorUnits,
                  )}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(report.movedOrSavedMinorUnits)}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(
                    report.incomeNewMoneyMinorUnits,
                  )}
                </td>
                <td className="amount-cell">
                  {formatCurrencyFromMinorUnits(
                    report.unresolvedImpactMinorUnits,
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

function importPreviewTitle(preview: ImportPreview, importCommitted: boolean) {
  if (importCommitted) {
    return "Imported to ledger";
  }

  if (preview.alreadyImported) {
    return "This file is already imported";
  }

  if (preview.reviewItemCount === 0) {
    return "Ready to import";
  }

  return `${preview.reviewItemCount} row${preview.reviewItemCount === 1 ? "" : "s"} will need review`;
}

function importPreviewDecisionHeading(
  preview: ImportPreview,
  importCommitted: boolean,
) {
  if (importCommitted) {
    return "Import complete";
  }

  if (preview.alreadyImported) {
    return "Duplicate file";
  }

  if (preview.reviewItemCount === 0) {
    return "No action needed after import";
  }

  return "Review queue impact";
}

function importPreviewDecisionCopy(
  preview: ImportPreview,
  autoFiledCount: number,
  importCommitted: boolean,
) {
  if (importCommitted) {
    return preview.reviewItemCount === 0
      ? "The ledger is up to date and no rows were added to Review."
      : `${preview.reviewItemCount} rows are now waiting in Review. The other ${autoFiledCount} rows were filed automatically.`;
  }

  if (preview.alreadyImported) {
    return "The same source and file hash already exist, so importing it again is disabled.";
  }

  if (preview.reviewItemCount === 0) {
    return `All ${preview.rowCount} rows look classifiable. They will be added to the ledger without appearing in the review queue.`;
  }

  return `${preview.reviewItemCount} rows will appear in Review. The other ${autoFiledCount} rows will be filed automatically.`;
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
  { kind: "income", label: "income / new money" },
  { kind: "spend", label: "personal spend" },
  { kind: "transfer", label: "transfer, saving, or investment" },
  { kind: "credit_card_payment", label: "credit-card payment" },
  { kind: "reimbursement", label: "refund or repayment" },
];

const spendCorrectionKinds = new Set<EntryKind>([
  "transfer",
  "credit_card_payment",
  "reimbursement",
]);

function kindCorrectionOptionsForTransaction(
  transaction: Transaction,
): { kind: EntryKind; label: string }[] {
  const allowedKinds =
    transaction.amountMinorUnits > 0
      ? new Set<EntryKind>(["income", "reimbursement", "transfer"])
      : transaction.kind === "spend"
        ? spendCorrectionKinds
        : new Set<EntryKind>(["spend", "transfer", "credit_card_payment"]);

  return decisionKindOptions
    .filter((option) => option.kind !== transaction.kind)
    .filter((option) => allowedKinds.has(option.kind))
    .map((option) => ({
      kind: option.kind,
      label: `Treat as ${option.label}`,
    }));
}

const entryKindLabels: Record<EntryKind, string> = {
  income: "income / new money",
  spend: "personal spend",
  transfer: "transfer, saving, or investment",
  credit_card_payment: "credit-card payment",
  reimbursement: "refund or repayment",
  split_settlement: "shared spend",
};

function formatEntryKind(kind: EntryKind): string {
  return entryKindLabels[kind];
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
    fullAllocationChoice(
      "Counts as my personal spend",
      "personal",
      amountMinorUnits,
    ),
    fullAllocationChoice("Not personal budget", "excluded", amountMinorUnits),
    fullAllocationChoice(
      "Old business / reimbursable",
      "business",
      amountMinorUnits,
      "business",
    ),
    {
      label: "Shared 50/50 - friend owes me",
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
      label: "Shared 50/50 - partner owes me",
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

function reviewChoicesForTransaction(transaction: Transaction): ReviewChoice[] {
  const currentKindChoice = reviewChoiceForKind(
    transaction.kind,
    `Use ${formatEntryKind(transaction.kind)}`,
  );
  const kindChoices = kindCorrectionOptionsForTransaction(transaction).map(
    (option) => reviewChoiceForKind(option.kind, option.label),
  );
  const allocationChoices = allocationChoicesForTransaction(transaction).map(
    reviewChoiceForAllocation,
  );

  if (transaction.amountMinorUnits >= 0) {
    const reimbursementChoice = kindChoices.find(
      (choice) =>
        choice.type === "kind" && choice.decidedKind === "reimbursement",
    );
    const transferChoice = kindChoices.find(
      (choice) => choice.type === "kind" && choice.decidedKind === "transfer",
    );

    return compactReviewChoices([
      transaction.kind === "reimbursement"
        ? currentKindChoice
        : reimbursementChoice,
      currentKindChoice,
      transferChoice,
      ...kindChoices,
    ]);
  }

  if (transaction.kind === "credit_card_payment") {
    return compactReviewChoices([
      allocationChoices.find((choice) => choice.id.includes("card-payment")),
      currentKindChoice,
      ...kindChoices,
      ...allocationChoices.filter(
        (choice) => !choice.id.includes("card-payment"),
      ),
    ]);
  }

  if (transaction.kind === "split_settlement") {
    const sharedChoice = allocationChoices.find((choice) =>
      choice.id.includes("shared-50-50"),
    );

    return compactReviewChoices([
      sharedChoice,
      ...allocationChoices.filter((choice) => choice !== sharedChoice),
      currentKindChoice,
      ...kindChoices,
    ]);
  }

  if (transaction.kind === "spend") {
    return compactReviewChoices([
      allocationChoices[0],
      ...allocationChoices.slice(1),
      ...kindChoices,
    ]);
  }

  return compactReviewChoices([
    currentKindChoice,
    ...kindChoices,
    ...allocationChoices,
  ]);
}

function compactReviewChoices(
  choices: readonly (ReviewChoice | undefined)[],
): ReviewChoice[] {
  const seen = new Set<string>();
  const compacted: ReviewChoice[] = [];

  for (const choice of choices) {
    if (!choice || seen.has(choice.id)) {
      continue;
    }

    seen.add(choice.id);
    compacted.push(choice);
  }

  return compacted;
}

function reviewChoiceForKind(kind: EntryKind, label: string): ReviewChoice {
  return {
    id: `kind-${kind}`,
    label,
    description: descriptionForKindChoice(kind),
    type: "kind",
    decidedKind: kind,
  };
}

function reviewChoiceForAllocation(
  allocationChoice: AllocationChoice,
): ReviewChoice {
  return {
    id: `allocation-${slugify(allocationChoice.label)}`,
    label: allocationChoice.label,
    description: descriptionForAllocationChoice(allocationChoice),
    type: "allocation",
    allocationChoice,
  };
}

function executeReviewChoice(
  choice: ReviewChoice,
  handlers: ReviewChoiceHandlers,
) {
  if (choice.type === "kind") {
    handlers.onDecision(choice.decidedKind);
    return;
  }

  handlers.onAllocationDecision(choice.allocationChoice);
}

function descriptionForKindChoice(kind: EntryKind): string {
  switch (kind) {
    case "credit_card_payment":
      return "Keeps this out of spend and treats it as card balance movement.";
    case "income":
      return "Adds this as income / new money. It will not reduce spending.";
    case "reimbursement":
      return "Treats this as money coming back, not new income.";
    case "spend":
      return "Uses the detected spend type without adding a split.";
    case "split_settlement":
      return "Keeps it flagged as shared spend for later split detail.";
    case "transfer":
      return "Keeps it out of spend and income as moved, saved, or invested money.";
  }
}

function descriptionForAllocationChoice(choice: AllocationChoice): string {
  const amountMinorUnits = choice.allocations?.reduce(
    (total, allocation) => total + allocation.amountMinorUnits,
    0,
  );
  const personalShare = choice.allocations?.find(
    (allocation) => allocation.purpose === "personal",
  );
  const owedShare = choice.allocations?.find(
    (allocation) =>
      allocation.purpose === "friend" || allocation.purpose === "partner",
  );

  if (
    choice.settlements?.some((settlement) => settlement.type === "card_payment")
  ) {
    return "Clears card liability and keeps the payment out of actual spend.";
  }

  if (personalShare && owedShare) {
    return `${formatCurrencyFromMinorUnits(personalShare.amountMinorUnits)} actual spend · ${formatCurrencyFromMinorUnits(owedShare.amountMinorUnits)} awaiting repayment.`;
  }

  if (
    choice.allocations?.some((allocation) => allocation.purpose === "personal")
  ) {
    return `${formatCurrencyFromMinorUnits(amountMinorUnits ?? 0)} added to actual personal spend.`;
  }

  if (
    choice.allocations?.some((allocation) => allocation.purpose === "excluded")
  ) {
    return `${formatCurrencyFromMinorUnits(amountMinorUnits ?? 0)} kept out of the personal budget.`;
  }

  if (
    choice.allocations?.some((allocation) => allocation.purpose === "business")
  ) {
    return `${formatCurrencyFromMinorUnits(amountMinorUnits ?? 0)} tracked outside personal spend.`;
  }

  return "Records the economic effect without counting it all as personal spend.";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
