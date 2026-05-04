import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(serverRoot, "../..");

export type ServerConfig = {
  databasePath: string;
  hostname: string;
  port: number;
};

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return {
    databasePath: resolve(
      env.PERSONAL_FINANCE_DB_PATH ??
        resolve(repositoryRoot, "storage/personal-finance.sqlite"),
    ),
    hostname: env.HOST ?? "127.0.0.1",
    port: Number.parseInt(env.PORT ?? "8787", 10),
  };
}
