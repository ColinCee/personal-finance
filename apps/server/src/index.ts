import { serve } from "@hono/node-server";

import { loadServerConfig } from "./config/env";
import { createDatabaseConnection } from "./db/client";
import { runMigrations } from "./db/migrate";
import { createApp } from "./app";
import { loadLocalClassificationRules } from "./services/local-classification-rules";

const config = loadServerConfig();
const connection = createDatabaseConnection(config.databasePath);

runMigrations(connection.db);

const app = createApp(connection.db, {
  localClassificationRulesProvider: () =>
    loadLocalClassificationRules(config.localClassificationRulesPath),
});

serve(
  {
    fetch: app.fetch,
    hostname: config.hostname,
    port: config.port,
  },
  (info) => {
    console.log(
      `personal-finance API listening on http://${info.address}:${info.port}`,
    );
  },
);
