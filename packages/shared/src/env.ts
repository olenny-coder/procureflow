/**
 * Typed, lazy access to environment configuration. Values are read on each call
 * so tests can mutate process.env; nothing here is bundled into client code.
 */

export function envString(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : value;
}

export function envBool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface TemporalConfig {
  address: string;
  namespace: string;
  taskQueue: string;
  tls: boolean;
  apiKey?: string;
  reworkEnabled: boolean;
  uiUrl: string;
}

export function getTemporalConfig(): TemporalConfig {
  return {
    address: envString("TEMPORAL_ADDRESS", "127.0.0.1:7233"),
    namespace: envString("TEMPORAL_NAMESPACE", "default"),
    taskQueue: envString("TEMPORAL_TASK_QUEUE", "procureflow"),
    tls: envBool("TEMPORAL_TLS", false),
    apiKey: envString("TEMPORAL_API_KEY") || undefined,
    reworkEnabled: envBool("TEMPORAL_REWORK_ENABLED", false),
    uiUrl: envString("TEMPORAL_UI_URL", "http://localhost:8233"),
  };
}

export interface DatabaseConfig {
  url: string;
  directUrl: string;
  ssl: boolean;
  pooled: boolean;
}

export function getDatabaseConfig(): DatabaseConfig {
  const url = envString(
    "DATABASE_URL",
    "postgresql://procureflow:procureflow@localhost:5432/procureflow",
  );
  const directUrl = envString("DIRECT_URL", url);
  return {
    url,
    directUrl,
    ssl: envBool("DATABASE_SSL", false),
    pooled: envBool("DATABASE_POOLED", false),
  };
}
