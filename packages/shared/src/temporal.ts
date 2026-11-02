/**
 * Temporal contract shared by the web API (client), the worker and tests.
 * This file is plain TypeScript so both the Next.js server and the workflow
 * bundle can import it without pulling in Node-only modules.
 */
import type { RiskLevel, Role, TaskStatus } from "./domain";

export const TASK_QUEUE_DEFAULT = "procureflow";

export const WORKFLOW_NAMES = {
  purchaseRequest: "purchaseRequestWorkflow",
  vendorOnboarding: "vendorOnboardingWorkflow",
  notificationOutbox: "notificationOutboxWorkflow",
} as const;

export const WORKFLOW_IDS = {
  purchaseRequest: (requestId: string, revision = 1) =>
    revision <= 1 ? `purchase-request-${requestId}` : `purchase-request-${requestId}-r${revision}`,
  vendorOnboarding: (vendorId: string) => `vendor-onboarding-${vendorId}`,
} as const;

export const SIGNALS = {
  approve: "approve",
  reject: "reject",
  requestChanges: "requestChanges",
  resubmit: "resubmit",
} as const;

export const QUERIES = {
  getState: "getState",
} as const;

export const VENDOR_SIGNALS = {
  decide: "decide",
} as const;

export const VENDOR_QUERIES = {
  getVendorState: "getVendorState",
} as const;

/** gRPC metadata forwarded by the client interceptor and read by the worker. */
export const TEMPORAL_HEADERS = {
  actorId: "x-procureflow-actor-id",
  actorRole: "x-procureflow-actor-role",
  requestId: "x-procureflow-request-id",
  correlationId: "x-procureflow-correlation-id",
} as const;

/**
 * Custom search attributes auto-registered by the reworked Temporal server.
 * They are only upserted when TEMPORAL_REWORK_ENABLED=true because stock
 * Temporal rejects unregistered attributes.
 */
export const PROCUREFLOW_SEARCH_ATTRIBUTES = {
  department: "ProcureFlowDepartment",
  risk: "ProcureFlowRisk",
  status: "ProcureFlowStatus",
} as const;

export interface PurchaseRequestWorkflowInput {
  requestId: string;
  actorId: string;
  actorRole: Role;
  /** True only when connected to the reworked server with auto-registered SAs. */
  reworkSearchAttributes: boolean;
}

export interface DecisionSignalInput {
  taskId: string;
  actorId: string;
  actorRole?: Role;
  comment?: string;
}

export interface ResubmitSignalInput {
  actorId: string;
  actorRole?: Role;
  comment?: string;
}

export interface WorkflowApprovalStep {
  taskId: string;
  stepOrder: number;
  role: Role;
  status: TaskStatus;
  dueAt: string;
  escalationCount: number;
}

export interface PendingApproval {
  taskId: string;
  stepOrder: number;
  role: Role;
  dueAt: string;
}

/** Result returned by the getState query. */
export interface PurchaseRequestWorkflowState {
  requestId: string;
  workflowId: string;
  status: string;
  currentStep: number;
  revision: number;
  chain: WorkflowApprovalStep[];
  pendingTask: PendingApproval | null;
  autoApprove: boolean;
  policyExplanation: string;
  auditSummary: string[];
  lastDecision: {
    action: string;
    actorId: string;
    comment?: string;
    at: string;
  } | null;
  updatedAt: string;
}

export interface VendorOnboardingWorkflowInput {
  vendorId: string;
  actorId: string;
}

export interface VendorDecisionSignalInput {
  decision: "APPROVE" | "BLOCK";
  actorId: string;
  actorRole?: Role;
  comment?: string;
  riskLevel?: RiskLevel;
}

export interface VendorOnboardingWorkflowState {
  vendorId: string;
  workflowId: string;
  status: string;
  pendingReview: boolean;
  decision: "APPROVE" | "BLOCK" | null;
  actorId: string | null;
  auditSummary: string[];
  updatedAt: string;
}
