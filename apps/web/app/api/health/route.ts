import { sql } from "drizzle-orm";
import { getDb } from "@procureflow/db";
import { getOrchestrationConfig } from "@procureflow/shared";
import { getOrchestrationHealth } from "@/lib/orchestration";
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
  const [database, orchestration] = await Promise.all([checkDatabase(), getOrchestrationHealth()]);
  const config = getOrchestrationConfig();
  const healthy = database.ok && orchestration.ok;

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
        orchestration: {
          ok: orchestration.ok,
          address: orchestration.address,
          namespace: orchestration.namespace,
          taskQueue: orchestration.taskQueue,
          engineVersion: orchestration.serverVersion,
          searchAttributesEnabled: orchestration.searchAttributesEnabled,
          ...(orchestration.error ? { error: orchestration.error } : {}),
        },
      },
      features: { searchAttributes: config.searchAttributesEnabled },
    },
    healthy ? 200 : 503,
  );
}
