import type {
  AuditEventView,
  PolicyApprover,
  RiskLevel,
  Role,
  TaskStatus,
  VendorStatus,
} from "@procureflow/shared";
import type { ApprovalStep, PolicyEvaluation } from "@procureflow/shared";

/** Serialisable request snapshot returned by validation activities. */
export interface RequestSnapshot {
  requestId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  title: string;
  justification: string;
  urgency: "LOW" | "NORMAL" | "HIGH";
  category: string;
  vendorId: string;
  vendorName: string;
  vendorContactEmail: string;
  vendorStatus: VendorStatus;
  vendorRiskLevel: RiskLevel;
  currency: string;
  totalAmountCents: number;
  status: string;
  revision: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }>;
}

export interface ValidateAndSubmitInput {
  requestId: string;
  actorId: string;
  actorRole: Role;
  workflowId: string;
}

export interface ValidateAndSubmitResult {
  snapshot: RequestSnapshot;
  replayed: boolean;
}

export interface EvaluatePolicyInput {
  requestId: string;
  workflowId: string;
}

export interface EvaluatePolicyResult {
  evaluation: PolicyEvaluation;
  riskSummary: string;
  aiAdapter: string;
}

export interface CreateApprovalPlanInput {
  requestId: string;
  workflowId: string;
  chain: ApprovalStep[];
}

export interface CreatedApprovalTask {
  taskId: string;
  stepOrder: number;
  role: Role;
  dueAt: string;
}

export interface CreateApprovalPlanResult {
  tasks: CreatedApprovalTask[];
  status: string;
  currentStep: number;
}

export interface SendApprovalNotificationInput {
  requestId: string;
  workflowId: string;
  taskId: string;
  stepOrder: number;
  role: Role;
  dueAt: string;
  escalation?: boolean;
}

export interface NotificationDispatchResult {
  outboxIds: string[];
  recipients: number;
  skipped: boolean;
}

export interface RecordDecisionInput {
  requestId: string;
  workflowId: string;
  taskId: string;
  stepOrder: number;
  action: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
  actorId: string;
  comment?: string;
}

export interface RecordDecisionResult {
  status: string;
  currentStep: number;
  taskStatus: TaskStatus;
  allApproved: boolean;
  nextTask: CreatedApprovalTask | null;
}

export interface EscalateApprovalInput {
  requestId: string;
  workflowId: string;
  taskId: string;
  stepOrder: number;
  actorId?: string;
}

export interface EscalateApprovalResult {
  taskId: string;
  role: Role;
  dueAt: string;
  escalationCount: number;
  canEscalate: boolean;
}

export interface ExpireApprovalInput {
  requestId: string;
  workflowId: string;
  taskId: string;
  stepOrder: number;
  reason: string;
}

export interface FinalizeApprovalInput {
  requestId: string;
  workflowId: string;
  actorId: string;
}

export interface FinalizeApprovalResult {
  status: string;
}

export interface IssuePurchaseOrderInput {
  requestId: string;
  workflowId: string;
  actorId: string;
}

export interface IssuePurchaseOrderResult {
  poId: string;
  poNumber: string;
  status: string;
  issuedAt: string;
  erpReference: string | null;
  amountCents: number;
}

export interface SyncPurchaseOrderInput {
  requestId: string;
  workflowId: string;
  poNumber: string;
}

export interface SyncPurchaseOrderResult {
  status: string;
  erpReference: string | null;
  error?: string;
}

export interface ResubmitInput {
  requestId: string;
  workflowId: string;
  actorId: string;
  comment?: string;
}

export interface ResubmitResult {
  status: string;
  revision: number;
}

export interface NotifyRequesterInput {
  requestId: string;
  workflowId: string;
  kind: string;
  subject: string;
  body: string;
}

export interface NotifyFinanceInput {
  requestId: string;
  workflowId: string;
  poNumber: string;
}

export interface NotificationResult {
  recipients: number;
  skipped: boolean;
}

export interface RecordAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
}

/** Vendor onboarding activity contracts. */
export interface BeginVendorReviewInput {
  vendorId: string;
  actorId: string;
  workflowId: string;
}

export interface VendorReviewSnapshot {
  vendorId: string;
  name: string;
  status: string;
  riskLevel: RiskLevel;
  createdBy: string;
}

export interface CompleteVendorReviewInput {
  vendorId: string;
  workflowId: string;
  actorId: string;
  decision: "APPROVE" | "BLOCK";
  comment?: string;
  riskLevel?: RiskLevel;
}

export interface CompleteVendorReviewResult {
  status: string;
  riskLevel: RiskLevel;
  riskSummary: string;
}

export interface ExpireVendorReviewInput {
  vendorId: string;
  workflowId: string;
}

export interface DrainOutboxInput {
  limit: number;
}

export interface DrainOutboxResult {
  processed: number;
  sent: number;
  failed: number;
}

/** Activity interface consumed by workflows through proxyActivities. */
export interface PurchaseRequestActivities {
  validateAndSubmitRequest(input: ValidateAndSubmitInput): Promise<ValidateAndSubmitResult>;
  evaluateRequestPolicy(input: EvaluatePolicyInput): Promise<EvaluatePolicyResult>;
  createApprovalPlan(input: CreateApprovalPlanInput): Promise<CreateApprovalPlanResult>;
  sendApprovalNotification(input: SendApprovalNotificationInput): Promise<NotificationDispatchResult>;
  recordApprovalDecision(input: RecordDecisionInput): Promise<RecordDecisionResult>;
  escalateApprovalTask(input: EscalateApprovalInput): Promise<EscalateApprovalResult>;
  expireApprovalTask(input: ExpireApprovalInput): Promise<{ status: string }>;
  finalizeApproval(input: FinalizeApprovalInput): Promise<FinalizeApprovalResult>;
  issuePurchaseOrder(input: IssuePurchaseOrderInput): Promise<IssuePurchaseOrderResult>;
  syncPurchaseOrderToErp(input: SyncPurchaseOrderInput): Promise<SyncPurchaseOrderResult>;
  resubmitRequest(input: ResubmitInput): Promise<ResubmitResult>;
  notifyRequester(input: NotifyRequesterInput): Promise<NotificationResult>;
  notifyFinance(input: NotifyFinanceInput): Promise<NotificationResult>;
  writeAuditEvent(input: RecordAuditInput): Promise<{ id: string | null }>;
}

export interface VendorActivities {
  beginVendorReview(input: BeginVendorReviewInput): Promise<VendorReviewSnapshot>;
  completeVendorReview(input: CompleteVendorReviewInput): Promise<CompleteVendorReviewResult>;
  expireVendorReview(input: ExpireVendorReviewInput): Promise<{ status: string }>;
}

export interface OutboxActivities {
  drainNotificationOutbox(input: DrainOutboxInput): Promise<DrainOutboxResult>;
}

export type AuditList = AuditEventView[];

export interface PolicyRowInput {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown>;
  approvers: PolicyApprover[];
}
