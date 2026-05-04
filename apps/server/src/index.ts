import { serve } from "@hono/node-server";
import { Hono } from "hono";

import {
  exampleTransactions,
  toReviewTransaction,
} from "@personal-finance/core";

const app = new Hono();

app.get("/api/health", (context) => context.json({ ok: true }));
app.get("/api/transactions", (context) =>
  context.json(exampleTransactions.map(toReviewTransaction)),
);

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: 8787,
  },
  (info) => {
    console.log(
      `personal-finance API listening on http://${info.address}:${info.port}`,
    );
  },
);
