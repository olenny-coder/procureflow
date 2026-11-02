/**
 * Domain vocabulary shared by the web app, worker and database package.
 * All values are plain data: keep this module free of Node-only imports so it
 * can be consumed by client components.
 */

export const ROLES = ["REQUESTER", "APPROVER", "FINANCE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  REQUESTER: "Requester",
  APPROVER: "Approver",
  FINANCE: "Finance",
  ADMIN: "Admin",
};

export const VENDOR_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "BLOCKED"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  BLOCKED: "Blocked",
};

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const URGENCIES = ["LOW", "NORMAL", "HIGH"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const REQUEST_CATEGORIES = [
  "GENERAL",
  "IT_HARDWARE",
  "SOFTWARE",
  "PROFESSIONAL_SERVICES",
  "OFFICE",
  "MARKETING",
  "TRAVEL",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "General",
  IT_HARDWARE: "IT hardware",
  SOFTWARE: "Software & SaaS",
  PROFESSIONAL_SERVICES: "Professional services",
  OFFICE: "Office & facilities",
  MARKETING: "Marketing",
  TRAVEL: "Travel",
};

export const REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_APPROVAL",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "PO_ISSUED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_APPROVAL: "In approval",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PO_ISSUED: "PO issued",
  CANCELLED: "Cancelled",
};

/** Statuses in which a purchase request may be edited by its requester. */
export const EDITABLE_REQUEST_STATUSES: RequestStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

export const TASK_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "ESCALATED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PO_STATUSES = ["ISSUED", "SYNCED", "FAILED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["EMAIL", "SLACK", "IN_APP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const DECISION_ACTIONS = ["APPROVE", "REJECT", "REQUEST_CHANGES"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/**
 * Canonical approval order. The policy engine always emits steps in this order
 * so that a manager reviews before finance and finance before admin/compliance.
 */
export const ROLE_APPROVAL_ORDER: Role[] = ["APPROVER", "FINANCE", "ADMIN", "REQUESTER"];

export const AUDIT_ACTIONS = {
  REQUEST_CREATED: "REQUEST_CREATED",
  REQUEST_UPDATED: "REQUEST_UPDATED",
  REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  POLICY_EVALUATED: "POLICY_EVALUATED",
  APPROVAL_TASKS_CREATED: "APPROVAL_TASKS_CREATED",
  APPROVAL_GRANTED: "APPROVAL_GRANTED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  APPROVAL_ESCALATED: "APPROVAL_ESCALATED",
  APPROVAL_EXPIRED: "APPROVAL_EXPIRED",
  REQUEST_RESUBMITTED: "REQUEST_RESUBMITTED",
  REQUEST_APPROVED: "REQUEST_APPROVED",
  PO_ISSUED: "PO_ISSUED",
  PO_SYNCED: "PO_SYNCED",
  PO_SYNC_FAILED: "PO_SYNC_FAILED",
  NOTIFICATION_SENT: "NOTIFICATION_SENT",
  VENDOR_CREATED: "VENDOR_CREATED",
  VENDOR_UPDATED: "VENDOR_UPDATED",
  VENDOR_REVIEW_STARTED: "VENDOR_REVIEW_STARTED",
  VENDOR_APPROVED: "VENDOR_APPROVED",
  VENDOR_BLOCKED: "VENDOR_BLOCKED",
  VENDOR_REVIEW_EXPIRED: "VENDOR_REVIEW_EXPIRED",
  VENDOR_RISK_SUMMARY: "VENDOR_RISK_SUMMARY",
  POLICY_CREATED: "POLICY_CREATED",
  POLICY_UPDATED: "POLICY_UPDATED",
  REQUEST_CANCELLED: "REQUEST_CANCELLED",
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEventView {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorName?: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApprovalTaskView {
  id: string;
  requestId: string;
  stepOrder: number;
  approverRole: Role | null;
  approverUserId: string | null;
  status: TaskStatus;
  comment: string | null;
  dueAt: string;
  actedAt: string | null;
  actedBy: string | null;
  escalationCount: number;
}

export interface PurchaseOrderView {
  id: string;
  requestId: string;
  poNumber: string;
  status: PoStatus;
  issuedAt: string;
  erpReference: string | null;
}

export interface VendorView {
  id: string;
  name: string;
  website: string | null;
  contactEmail: string;
  status: VendorStatus;
  riskLevel: RiskLevel;
  taxId: string | null;
  bankAccountMasked: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestItemView {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
}

export interface PurchaseRequestView {
  id: string;
  requesterId: string;
  requesterName?: string;
  department: string;
  title: string;
  justification: string;
  urgency: Urgency;
  category: string;
  vendorId: string;
  vendorName?: string;
  vendorRiskLevel?: RiskLevel;
  currency: string;
  totalAmountCents: number;
  status: RequestStatus;
  currentStep: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  items?: PurchaseRequestItemView[];
  approvalTasks?: ApprovalTaskView[];
  purchaseOrder?: PurchaseOrderView | null;
}

/** Format integer minor units (cents) as a currency string. */
export function formatMoney(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

/** Convert a user-entered decimal amount to integer cents without float drift. */
export function dollarsToCents(value: number | string): number {
  const raw = typeof value === "string" ? value.trim() : value.toFixed(2);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    return Math.round(Number(value) * 100);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2] ?? "0");
  const fraction = Number((match[3] ?? "").padEnd(2, "0"));
  return sign * (whole * 100 + fraction);
}

export function centsToDollars(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return "now";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
