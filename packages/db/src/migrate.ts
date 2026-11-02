import "@procureflow/shared/load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDatabaseConfig } from "@procureflow/shared";
import { createDb } from "./client";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = getDatabaseConfig();
  const handle = createDb({ ...config, url: config.directUrl });
  const started = Date.now();
  try {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "db_migrate_start",
        migrationsFolder: path.join(here, "..", "migrations"),
        target: config.directUrl.replace(/:\/\/[^@]+@/, "://***@"),
      }),
    );
    await migrate(handle.db, { migrationsFolder: path.join(here, "..", "migrations") });
    console.log(
      JSON.stringify({
        level: "info",
        msg: "db_migrate_complete",
        durationMs: Date.now() - started,
      }),
    );
  } finally {
    await handle.client.end({ timeout: 10 });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "db_migrate_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
