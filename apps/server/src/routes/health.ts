import { Hono } from "hono";

export function createHealthRoutes() {
  const routes = new Hono();

  routes.get("/health", (context) => context.json({ ok: true }));

  return routes;
}
