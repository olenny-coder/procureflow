import path from "node:path";
import { envBool, envString } from "@procureflow/shared";
import { REPO_ROOT } from "@procureflow/shared/load-env";
import { createAiRiskAdapter } from "./ai";
import { createEmailAdapter } from "./email";
import { createErpAdapter } from "./erp";
import { createSlackAdapter } from "./slack";
import { createStorageAdapter } from "./storage";
import type { AdapterRegistry } from "./types";

export interface AdapterConfig {
  emailKind: string;
  emailFrom: string;
  resendApiKey?: string;
  slackWebhookUrl?: string;
  erpKind: string;
  erpDirectory: string;
  storageKind: string;
  storageDirectory: string;
  aiRiskEnabled: boolean;
}

function resolveDataPath(value: string, fallback: string): string {
  const configured = value || fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(REPO_ROOT, configured);
}

export function adapterConfigFromEnv(): AdapterConfig {
  return {
    emailKind: envString("EMAIL_ADAPTER", "console"),
    emailFrom: envString("EMAIL_FROM", "procureflow@example.com"),
    resendApiKey: envString("RESEND_API_KEY") || undefined,
    slackWebhookUrl: envString("SLACK_WEBHOOK_URL") || undefined,
    erpKind: envString("ERP_ADAPTER", "csv"),
    erpDirectory: resolveDataPath(envString("ERP_CSV_DIR", ".data/erp"), ".data/erp"),
    storageKind: envString("STORAGE_ADAPTER", "local"),
    storageDirectory: resolveDataPath(envString("STORAGE_DIR", ".data/storage"), ".data/storage"),
    aiRiskEnabled: envBool("AI_RISK_SUMMARY_ENABLED", true),
  };
}

export function buildAdapters(config: AdapterConfig = adapterConfigFromEnv()): AdapterRegistry {
  return {
    email: createEmailAdapter({
      kind: config.emailKind,
      from: config.emailFrom,
      resendApiKey: config.resendApiKey,
    }),
    slack: createSlackAdapter(config.slackWebhookUrl),
    erp: createErpAdapter(config.erpKind, config.erpDirectory),
    storage: createStorageAdapter(config.storageKind, config.storageDirectory),
    aiRisk: createAiRiskAdapter(config.aiRiskEnabled),
  };
}

let active: AdapterRegistry | null = null;

/** Called by the Worker Plugin before the Worker is created. */
export function configureAdapters(config: AdapterConfig = adapterConfigFromEnv()): AdapterRegistry {
  active = buildAdapters(config);
  return active;
}

export function setAdapters(adapters: AdapterRegistry): void {
  active = adapters;
}

/**
 * Activities resolve adapters lazily so the Worker Plugin (or a test) can swap
 * implementations without activities being re-imported or workflow code changing.
 */
export function getAdapters(): AdapterRegistry {
  if (!active) active = buildAdapters();
  return active;
}

export function resetAdapters(): void {
  active = null;
}
