import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { getDatabaseConfig, type DatabaseConfig } from "@procureflow/shared";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  client: Sql;
}

/**
 * Create a postgres.js + Drizzle handle. `prepare: false` is required for
 * PgBouncer-style pooled endpoints (Neon pooled URLs); direct connections keep
 * prepared statements for performance.
 */
export function createDb(overrides: Partial<DatabaseConfig> = {}): DbHandle {
  const config = { ...getDatabaseConfig(), ...overrides };
  const client = postgres(config.url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: !config.pooled,
    ssl: config.ssl ? "require" : false,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

// Next.js dev mode reloads modules; keep a single pool across reloads.
const globalForDb = globalThis as unknown as { __procureflowDb?: DbHandle };

export function getDb(): Database {
  if (!globalForDb.__procureflowDb) {
    globalForDb.__procureflowDb = createDb();
  }
  return globalForDb.__procureflowDb.db;
}

export function getDbHandle(): DbHandle {
  if (!globalForDb.__procureflowDb) {
    globalForDb.__procureflowDb = createDb();
  }
  return globalForDb.__procureflowDb;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__procureflowDb) {
    await globalForDb.__procureflowDb.client.end({ timeout: 5 });
    globalForDb.__procureflowDb = undefined;
  }
}
