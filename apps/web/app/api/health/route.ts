import { sql } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { getTemporalConfig } from "@procureflow/shared";
import { getTemporalHealth } from "@/lib/temporal";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("database check timed out")), 3_000)),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const started = Date.now();
  const [database, temporal] = await Promise.all([checkDatabase(), getTemporalHealth()]);
  const config = getTemporalConfig();
  const healthy = database.ok && temporal.ok;

  return json(
    {
      status: healthy ? "ok" : "degraded",
      service: "procureflow-web",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - started,
      checks: {
        database: {
          ok: database.ok,
          latencyMs: database.latencyMs,
          ...(database.error ? { error: database.error } : {}),
        },
        temporal: {
          ok: temporal.ok,
          address: temporal.address,
          namespace: temporal.namespace,
          taskQueue: temporal.taskQueue,
          serverVersion: temporal.serverVersion,
          reworkEnabled: temporal.reworkEnabled,
          ...(temporal.error ? { error: temporal.error } : {}),
        },
      },
      temporalReworkEnabled: config.reworkEnabled,
    },
    healthy ? 200 : 503,
  );
}
