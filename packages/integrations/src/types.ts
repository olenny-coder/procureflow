/**
 * Integration adapter contracts. Activities depend only on these interfaces;
 * the Worker Plugin decides which concrete implementation is active, so swapping
 * email/Slack/ERP/storage/AI providers never touches workflow code.
 */
import type { RiskLevel, VendorStatus } from "@procureflow/shared";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSendResult {
  id: string;
  skipped?: boolean;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface SlackMessage {
  text: string;
  channel?: string;
}

export interface SlackSendResult {
  ok: boolean;
  skipped?: boolean;
}

export interface SlackAdapter {
  readonly name: string;
  send(message: SlackMessage): Promise<SlackSendResult>;
}

export interface ErpPurchaseOrder {
  poNumber: string;
  requestId: string;
  vendorName: string;
  amountCents: number;
  currency: string;
  issuedAt: string;
  lineItems: Array<{ description: string; quantity: number; unitPriceCents: number }>;
}

export interface ErpSyncResult {
  reference: string | null;
  skipped?: boolean;
}

export interface ErpAdapter {
  readonly name: string;
  syncPurchaseOrder(order: ErpPurchaseOrder): Promise<ErpSyncResult>;
}

export interface StoragePutResult {
  key: string;
  url: string;
}

export interface StorageAdapter {
  readonly name: string;
  put(key: string, data: Uint8Array | string): Promise<StoragePutResult>;
  get(key: string): Promise<Uint8Array | null>;
}

export interface AiRiskInput {
  vendorName: string;
  riskLevel: RiskLevel;
  vendorStatus: VendorStatus;
  amountCents: number;
  category: string;
  website?: string | null;
}

export interface AiRiskSummaryAdapter {
  readonly name: string;
  summarize(input: AiRiskInput): Promise<string>;
}

export interface AdapterRegistry {
  email: EmailAdapter;
  slack: SlackAdapter;
  erp: ErpAdapter;
  storage: StorageAdapter;
  aiRisk: AiRiskSummaryAdapter;
}
