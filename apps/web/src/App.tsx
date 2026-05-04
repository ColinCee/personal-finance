import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";

import { fetchTransactions, type Transaction } from "./api";
import "./styles.css";

const queryClient = new QueryClient();

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
        <p className="eyebrow">Local-first finance workspace</p>
        <h1>Personal Finance</h1>
        <p>
          Import bank exports, review uncertain transactions, and separate real
          spending from transfers, Amex payments, reimbursements, and
          joint-account settlements.
        </p>
        <nav>
          <a href="/">Dashboard</a>
          <a href="/review">Review inbox</a>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}

function Dashboard() {
  const transactions = useTransactions();
  const personalSpendMinorUnits = transactions.data
    ?.filter((transaction) => transaction.affectsPersonalSpend)
    .reduce((total, transaction) => total + transaction.amountMinorUnits, 0);

  return (
    <section className="grid">
      <SummaryCard
        label="Review inbox"
        value={`${transactions.data?.length ?? 0} items`}
      />
      <SummaryCard
        label="Net personal spend"
        value={formatCurrencyFromMinorUnits(personalSpendMinorUnits ?? 0)}
        hint="Fake fixture data only"
      />
      <SummaryCard
        label="Current focus"
        value="Model first"
        hint="UI stays thin over rules"
      />
    </section>
  );
}

function ReviewInbox() {
  const transactions = useTransactions();
  const columns = useMemo(() => {
    const column = createColumnHelper<Transaction>();

    return [
      column.accessor("postedOn", { header: "Date" }),
      column.accessor("description", { header: "Description" }),
      column.accessor("kind", { header: "Detected kind" }),
      column.accessor("amountMinorUnits", {
        header: "Amount",
        cell: (info) => formatCurrencyFromMinorUnits(info.getValue()),
      }),
      column.accessor("reviewStatus", { header: "Review" }),
    ];
  }, []);

  const table = useReactTable({
    data: transactions.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (transactions.isLoading) {
    return <p className="panel">Loading transactions...</p>;
  }

  if (transactions.isError) {
    return <p className="panel error">{transactions.error.message}</p>;
  }

  return (
    <section className="panel">
      <h2>Review inbox</h2>
      <p>
        This is where imports will surface suspected transfers, reimbursements,
        Amex payments, and split settlements before they affect reports.
      </p>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

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

function formatCurrencyFromMinorUnits(amountMinorUnits: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountMinorUnits / 100);
}
