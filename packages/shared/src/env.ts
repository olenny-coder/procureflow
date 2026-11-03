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

export interface WorkflowEngineConfig {
  address: string;
  namespace: string;
  taskQueue: string;
  tls: boolean;
  apiKey?: string;
  searchAttributesEnabled: boolean;
  uiUrl: string;
}

function legacyEnv(name: string): string {
  return envString(name);
}

/**
 * Canonical workflow-engine configuration.
 *
 * Legacy environment names are still read as a migration fallback, so existing
 * deployments can adopt the neutral names without a coordinated deploy.
 */
export function getWorkflowEngineConfig(): WorkflowEngineConfig {
  return {
    address:
      envString("WORKFLOW_ENGINE_ADDRESS") ||
      legacyEnv("TEMPORAL_ADDRESS") ||
      "127.0.0.1:7233",
    namespace:
      envString("WORKFLOW_ENGINE_NAMESPACE") || legacyEnv("TEMPORAL_NAMESPACE") || "default",
    taskQueue:
      envString("WORKFLOW_ENGINE_TASK_QUEUE") ||
      legacyEnv("TEMPORAL_TASK_QUEUE") ||
      "procureflow",
    tls: envBool("WORKFLOW_ENGINE_TLS", envBool("TEMPORAL_TLS", false)),
    apiKey: envString("WORKFLOW_ENGINE_API_KEY") || legacyEnv("TEMPORAL_API_KEY") || undefined,
    searchAttributesEnabled: envBool(
      "WORKFLOW_ENGINE_SEARCH_ATTRIBUTES",
      envBool("TEMPORAL_REWORK_ENABLED", false),
    ),
    uiUrl:
      envString("WORKFLOW_ENGINE_UI_URL") ||
      legacyEnv("TEMPORAL_UI_URL") ||
      "http://localhost:8233",
  };
}

/** Short alias used by app-layer modules. */
export const getOrchestrationConfig = getWorkflowEngineConfig;

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
