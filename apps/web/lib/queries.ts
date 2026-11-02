import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@procureflow/db";
import {
  approvalTasks,
  auditEvents,
  policies,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  users,
  vendors,
} from "@procureflow/db/schema";
import type {
  RequestStatus,
  RiskLevel,
  Role,
  TaskStatus,
  Urgency,
  VendorStatus,
} from "@procureflow/shared";

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export interface RequestSummary {
  id: string;
  title: string;
  status: RequestStatus;
  department: string;
  totalAmountCents: number;
  currency: string;
  urgency: Urgency;
  revision: number;
  createdAt: string;
  updatedAt: string;
  vendorName: string;
  vendorRiskLevel: RiskLevel;
  requesterName: string;
  workflowId: string | null;
}

export async function listMyRequests(
  userId: string,
  limit = 20,
  status?: RequestStatus,
): Promise<RequestSummary[]> {
  return listRequests({ requesterId: userId, limit, status });
}

export async function listAllRequests(
  limit = 50,
  status?: RequestStatus,
): Promise<RequestSummary[]> {
  return listRequests({ limit, status });
}

async function listRequests(options: {
  requesterId?: string;
  limit: number;
  status?: RequestStatus;
}): Promise<RequestSummary[]> {
  const db = getDb();
  const conditions = [];
  if (options.requesterId) conditions.push(eq(purchaseRequests.requesterId, options.requesterId));
  if (options.status) conditions.push(eq(purchaseRequests.status, options.status));
  const rows = await db
    .select({
      request: purchaseRequests,
      vendorName: vendors.name,
      vendorRiskLevel: vendors.riskLevel,
      requesterName: users.name,
    })
    .from(purchaseRequests)
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .innerJoin(users, eq(users.id, purchaseRequests.requesterId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(purchaseRequests.updatedAt))
    .limit(options.limit);

  return rows.map((row) => ({
    id: row.request.id,
    title: row.request.title,
    status: row.request.status,
    department: row.request.department,
    totalAmountCents: row.request.totalAmountCents,
    currency: row.request.currency,
    urgency: row.request.urgency,
    revision: row.request.revision,
    createdAt: row.request.createdAt.toISOString(),
    updatedAt: row.request.updatedAt.toISOString(),
    vendorName: row.vendorName,
    vendorRiskLevel: row.vendorRiskLevel,
    requesterName: row.requesterName,
    workflowId: row.request.workflowId,
  }));
}

export interface PendingApprovalItem {
  taskId: string;
  requestId: string;
  stepOrder: number;
  dueAt: string;
  status: TaskStatus;
  title: string;
  requesterName: string;
  department: string;
  totalAmountCents: number;
  currency: string;
  vendorName: string;
  vendorRiskLevel: RiskLevel;
  urgency: Urgency;
  escalated: boolean;
}

export async function getPendingApprovals(user: { id: string; role: Role }, limit = 50): Promise<PendingApprovalItem[]> {
  const db = getDb();
  const conditions = [
    inArray(approvalTasks.status, ["PENDING", "ESCALATED"]),
    inArray(purchaseRequests.status, ["SUBMITTED", "IN_APPROVAL"]),
    eq(approvalTasks.stepOrder, purchaseRequests.currentStep),
  ];
  if (user.role !== "ADMIN") {
    conditions.push(eq(approvalTasks.approverRole, user.role));
  }
  const rows = await db
    .select({
      task: approvalTasks,
      request: purchaseRequests,
      vendor: vendors,
      requester: users,
    })
    .from(approvalTasks)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, approvalTasks.requestId))
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .innerJoin(users, eq(users.id, purchaseRequests.requesterId))
    .where(and(...conditions))
    .orderBy(asc(approvalTasks.dueAt))
    .limit(limit);

  return rows.map((row) => ({
    taskId: row.task.id,
    requestId: row.request.id,
    stepOrder: row.task.stepOrder,
    dueAt: row.task.dueAt.toISOString(),
    status: row.task.status,
    title: row.request.title,
    requesterName: row.requester.name,
    department: row.request.department,
    totalAmountCents: row.request.totalAmountCents,
    currency: row.request.currency,
    vendorName: row.vendor.name,
    vendorRiskLevel: row.vendor.riskLevel,
    urgency: row.request.urgency,
    escalated: row.task.status === "ESCALATED" || row.task.escalationCount > 0,
  }));
}

export interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  status: string;
  issuedAt: string;
  erpReference: string | null;
  requestId: string;
  title: string;
  vendorName: string;
  requesterName: string;
  totalAmountCents: number;
  currency: string;
}

export async function getRecentPurchaseOrders(limit = 8): Promise<PurchaseOrderListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      po: purchaseOrders,
      request: purchaseRequests,
      vendorName: vendors.name,
      requesterName: users.name,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseOrders.requestId))
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .innerJoin(users, eq(users.id, purchaseRequests.requesterId))
    .orderBy(desc(purchaseOrders.issuedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.po.id,
    poNumber: row.po.poNumber,
    status: row.po.status,
    issuedAt: row.po.issuedAt.toISOString(),
    erpReference: row.po.erpReference,
    requestId: row.request.id,
    title: row.request.title,
    vendorName: row.vendorName,
    requesterName: row.requesterName,
    totalAmountCents: row.request.totalAmountCents,
    currency: row.request.currency,
  }));
}

export interface AuditListItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string | null;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

async function selectAudit(options: {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit: number;
  offset?: number;
}): Promise<AuditListItem[]> {
  const db = getDb();
  const actor = alias(users, "audit_actor");
  const conditions = [];
  if (options.entityType) conditions.push(eq(auditEvents.entityType, options.entityType));
  if (options.entityId) conditions.push(eq(auditEvents.entityId, options.entityId));
  if (options.action) conditions.push(ilike(auditEvents.action, `%${options.action}%`));

  const rows = await db
    .select({
      event: auditEvents,
      actorName: actor.name,
    })
    .from(auditEvents)
    .leftJoin(actor, eq(actor.id, auditEvents.actorId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditEvents.createdAt))
    .limit(options.limit)
    .offset(options.offset ?? 0);

  return rows.map((row) => ({
    id: row.event.id,
    entityType: row.event.entityType,
    entityId: row.event.entityId,
    action: row.event.action,
    actorName: row.actorName ?? null,
    actorId: row.event.actorId,
    metadata: row.event.metadata,
    createdAt: row.event.createdAt.toISOString(),
  }));
}

export async function getRecentAudit(limit = 10): Promise<AuditListItem[]> {
  return selectAudit({ limit });
}

/** Audit feed scoped to the requester's own purchase requests. */
export async function getRecentAuditForRequester(userId: string, limit = 10): Promise<AuditListItem[]> {
  const db = getDb();
  const requestRows = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.requesterId, userId));
  if (requestRows.length === 0) return [];
  const ids = requestRows.map((row) => row.id);
  const actor = alias(users, "audit_actor");
  const rows = await db
    .select({ event: auditEvents, actorName: actor.name })
    .from(auditEvents)
    .leftJoin(actor, eq(actor.id, auditEvents.actorId))
    .where(and(eq(auditEvents.entityType, "PURCHASE_REQUEST"), inArray(auditEvents.entityId, ids)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.event.id,
    entityType: row.event.entityType,
    entityId: row.event.entityId,
    action: row.event.action,
    actorName: row.actorName ?? null,
    actorId: row.event.actorId,
    metadata: row.event.metadata,
    createdAt: row.event.createdAt.toISOString(),
  }));
}

export async function getAuditForEntity(entityType: string, entityId: string, limit = 100): Promise<AuditListItem[]> {
  return selectAudit({ entityType, entityId, limit });
}

export async function getAuditPage(options: {
  entityType?: string;
  entityId?: string;
  action?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AuditListItem[]; total: number }> {
  const db = getDb();
  const conditions = [];
  if (options.entityType) conditions.push(eq(auditEvents.entityType, options.entityType));
  if (options.entityId) conditions.push(eq(auditEvents.entityId, options.entityId));
  if (options.action) conditions.push(ilike(auditEvents.action, `%${options.action}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(auditEvents).where(where);
  const items = await selectAudit({
    limit: options.pageSize,
    offset: (options.page - 1) * options.pageSize,
    ...(options.entityType ? { entityType: options.entityType } : {}),
    ...(options.entityId ? { entityId: options.entityId } : {}),
    ...(options.action ? { action: options.action } : {}),
  });
  return { items, total: Number(totalRow?.value ?? 0) };
}

export interface RequestDetail {
  id: string;
  title: string;
  justification: string;
  status: RequestStatus;
  department: string;
  category: string;
  urgency: Urgency;
  currency: string;
  totalAmountCents: number;
  currentStep: number;
  revision: number;
  workflowId: string | null;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  vendorId: string;
  vendorName: string;
  vendorStatus: VendorStatus;
  vendorRiskLevel: RiskLevel;
  vendorWebsite: string | null;
  vendorContactEmail: string;
  vendorRiskSummary: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
  }>;
  approvalTasks: Array<{
    id: string;
    stepOrder: number;
    approverRole: Role | null;
    status: TaskStatus;
    comment: string | null;
    dueAt: string;
    actedAt: string | null;
    actedByName: string | null;
    escalationCount: number;
  }>;
  purchaseOrder: {
    id: string;
    poNumber: string;
    status: string;
    issuedAt: string;
    erpReference: string | null;
  } | null;
  audit: AuditListItem[];
}

export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ request: purchaseRequests, vendor: vendors, requester: users })
    .from(purchaseRequests)
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .innerJoin(users, eq(users.id, purchaseRequests.requesterId))
    .where(eq(purchaseRequests.id, id))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.requestId, id))
    .orderBy(asc(purchaseRequestItems.createdAt));

  const actor = alias(users, "task_actor");
  const tasks = await db
    .select({ task: approvalTasks, actorName: actor.name })
    .from(approvalTasks)
    .leftJoin(actor, eq(actor.id, approvalTasks.actedBy))
    .where(eq(approvalTasks.requestId, id))
    .orderBy(asc(approvalTasks.stepOrder));

  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.requestId, id))
    .limit(1);

  const audit = await getAuditForEntity("PURCHASE_REQUEST", id);

  return {
    id: row.request.id,
    title: row.request.title,
    justification: row.request.justification,
    status: row.request.status,
    department: row.request.department,
    category: row.request.category,
    urgency: row.request.urgency,
    currency: row.request.currency,
    totalAmountCents: row.request.totalAmountCents,
    currentStep: row.request.currentStep,
    revision: row.request.revision,
    workflowId: row.request.workflowId,
    requesterId: row.request.requesterId,
    requesterName: row.requester.name,
    requesterEmail: row.requester.email,
    vendorId: row.vendor.id,
    vendorName: row.vendor.name,
    vendorStatus: row.vendor.status,
    vendorRiskLevel: row.vendor.riskLevel,
    vendorWebsite: row.vendor.website,
    vendorContactEmail: row.vendor.contactEmail,
    vendorRiskSummary: row.vendor.riskSummary,
    createdAt: row.request.createdAt.toISOString(),
    updatedAt: row.request.updatedAt.toISOString(),
    submittedAt: iso(row.request.submittedAt),
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
    })),
    approvalTasks: tasks.map((entry) => ({
      id: entry.task.id,
      stepOrder: entry.task.stepOrder,
      approverRole: entry.task.approverRole,
      status: entry.task.status,
      comment: entry.task.comment,
      dueAt: entry.task.dueAt.toISOString(),
      actedAt: iso(entry.task.actedAt),
      actedByName: entry.actorName ?? null,
      escalationCount: entry.task.escalationCount,
    })),
    purchaseOrder: po
      ? {
          id: po.id,
          poNumber: po.poNumber,
          status: po.status,
          issuedAt: po.issuedAt.toISOString(),
          erpReference: po.erpReference,
        }
      : null,
    audit,
  };
}

export interface VendorOption {
  id: string;
  name: string;
  status: VendorStatus;
  riskLevel: RiskLevel;
  contactEmail: string;
  website: string | null;
}

export async function getVendorOptions(): Promise<VendorOption[]> {
  const db = getDb();
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      status: vendors.status,
      riskLevel: vendors.riskLevel,
      contactEmail: vendors.contactEmail,
      website: vendors.website,
    })
    .from(vendors)
    .orderBy(asc(vendors.name));
}

export interface VendorDirectoryItem {
  id: string;
  name: string;
  website: string | null;
  contactEmail: string;
  status: VendorStatus;
  riskLevel: RiskLevel;
  taxId: string | null;
  bankAccountMasked: string | null;
  riskSummary: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listVendors(): Promise<VendorDirectoryItem[]> {
  const db = getDb();
  const creator = alias(users, "vendor_creator");
  const rows = await db
    .select({ vendor: vendors, creatorName: creator.name })
    .from(vendors)
    .leftJoin(creator, eq(creator.id, vendors.createdBy))
    .orderBy(desc(vendors.createdAt));

  return rows.map((row) => ({
    id: row.vendor.id,
    name: row.vendor.name,
    website: row.vendor.website,
    contactEmail: row.vendor.contactEmail,
    status: row.vendor.status,
    riskLevel: row.vendor.riskLevel,
    taxId: row.vendor.taxId,
    bankAccountMasked: row.vendor.bankAccountMasked,
    riskSummary: row.vendor.riskSummary,
    createdByName: row.creatorName ?? null,
    createdAt: row.vendor.createdAt.toISOString(),
    updatedAt: row.vendor.updatedAt.toISOString(),
  }));
}

export interface PolicyListItem {
  id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  conditions: Record<string, unknown>;
  approvers: Array<{ role: Role; dueInHours: number }>;
  updatedAt: string;
}

export async function listPolicies(): Promise<PolicyListItem[]> {
  const db = getDb();
  const rows = await db.select().from(policies).orderBy(asc(policies.priority));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    enabled: row.enabled,
    conditions: row.conditions as Record<string, unknown>,
    approvers: row.approvers,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export interface DashboardStats {
  openRequests: number;
  pendingApprovals: number;
  poValue30dCents: number;
  riskyVendors: number;
}

export async function getDashboardStats(user: { id: string; role: Role }): Promise<DashboardStats> {
  const db = getDb();
  const [open] = await db
    .select({ value: count() })
    .from(purchaseRequests)
    .where(
      and(
        eq(purchaseRequests.requesterId, user.id),
        inArray(purchaseRequests.status, ["DRAFT", "SUBMITTED", "IN_APPROVAL", "CHANGES_REQUESTED"]),
      ),
    );

  const approvalConditions = [
    inArray(approvalTasks.status, ["PENDING", "ESCALATED"]),
    inArray(purchaseRequests.status, ["SUBMITTED", "IN_APPROVAL"]),
    eq(approvalTasks.stepOrder, purchaseRequests.currentStep),
  ];
  if (user.role !== "ADMIN") approvalConditions.push(eq(approvalTasks.approverRole, user.role));
  const [pending] = await db
    .select({ value: count() })
    .from(approvalTasks)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, approvalTasks.requestId))
    .where(and(...approvalConditions));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const [poValue] = await db
    .select({
      value: sql<number>`coalesce(sum(${purchaseRequests.totalAmountCents}), 0)::int`,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseOrders.requestId))
    .where(gte(purchaseOrders.issuedAt, thirtyDaysAgo));

  const [risky] = await db
    .select({ value: count() })
    .from(vendors)
    .where(or(eq(vendors.riskLevel, "HIGH"), eq(vendors.status, "PENDING_REVIEW"), eq(vendors.status, "BLOCKED")));

  return {
    openRequests: Number(open?.value ?? 0),
    pendingApprovals: Number(pending?.value ?? 0),
    poValue30dCents: Number(poValue?.value ?? 0),
    riskyVendors: Number(risky?.value ?? 0),
  };
}

export async function getRequestForWorkflow(requestId: string) {
  const db = getDb();
  const [row] = await db
    .select({ request: purchaseRequests, vendor: vendors })
    .from(purchaseRequests)
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .where(eq(purchaseRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

export async function getApprovalTaskForApi(taskId: string) {
  const db = getDb();
  const [row] = await db
    .select({ task: approvalTasks, request: purchaseRequests, vendor: vendors })
    .from(approvalTasks)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, approvalTasks.requestId))
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .where(eq(approvalTasks.id, taskId))
    .limit(1);
  return row ?? null;
}

export async function getVendorForApi(vendorId: string) {
  const db = getDb();
  const [row] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  return row ?? null;
}

export async function getPolicyForApi(policyId: string) {
  const db = getDb();
  const [row] = await db.select().from(policies).where(eq(policies.id, policyId)).limit(1);
  return row ?? null;
}
