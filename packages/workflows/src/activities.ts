import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { ApplicationFailure, Context as ActivityContext } from "@temporalio/activity";
import { getDb } from "@procureflow/db";
import {
  approvalTasks,
  auditEvents,
  notificationOutbox,
  policies,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  users,
  vendors,
} from "@procureflow/db/schema";
import {
  AUDIT_ACTIONS,
  formatMoney,
  getTemporalConfig,
  type PolicyDefinition,
} from "@procureflow/shared";
import { evaluatePolicy } from "@procureflow/shared/policy";
import { getAdapters } from "@procureflow/integrations";
import { logger } from "./logger";
import type {
  BeginVendorReviewInput,
  CompleteVendorReviewInput,
  CompleteVendorReviewResult,
  CreateApprovalPlanInput,
  CreateApprovalPlanResult,
  DrainOutboxInput,
  DrainOutboxResult,
  EscalateApprovalInput,
  EscalateApprovalResult,
  EvaluatePolicyInput,
  EvaluatePolicyResult,
  ExpireApprovalInput,
  ExpireVendorReviewInput,
  FinalizeApprovalInput,
  FinalizeApprovalResult,
  IssuePurchaseOrderInput,
  IssuePurchaseOrderResult,
  NotificationDispatchResult,
  NotificationResult,
  NotifyFinanceInput,
  NotifyRequesterInput,
  PurchaseRequestActivities,
  RecordAuditInput,
  RecordDecisionInput,
  RecordDecisionResult,
  RequestSnapshot,
  ResubmitInput,
  ResubmitResult,
  SendApprovalNotificationInput,
  SyncPurchaseOrderInput,
  SyncPurchaseOrderResult,
  ValidateAndSubmitInput,
  ValidateAndSubmitResult,
  VendorActivities,
  VendorReviewSnapshot,
} from "./activity-types";
import type { ApprovalStep, Role } from "@procureflow/shared";

type Db = ReturnType<typeof getDb>;

function nonRetryable(type: string, message: string): never {
  throw ApplicationFailure.nonRetryable(message, type);
}

function appUrl(): string {
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

async function loadRequest(db: Db, requestId: string) {
  const [row] = await db
    .select({ request: purchaseRequests, vendor: vendors, requester: users })
    .from(purchaseRequests)
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .innerJoin(users, eq(users.id, purchaseRequests.requesterId))
    .where(eq(purchaseRequests.id, requestId))
    .limit(1);

  if (!row) nonRetryable("RequestNotFound", `Purchase request ${requestId} does not exist`);

  const items = await db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.requestId, requestId))
    .orderBy(asc(purchaseRequestItems.createdAt));

  return { ...row, items };
}

function snapshotFrom(
  row: Awaited<ReturnType<typeof loadRequest>>,
  overrides: { status?: string; revision?: number } = {},
): RequestSnapshot {
  return {
    requestId: row.request.id,
    requesterId: row.request.requesterId,
    requesterName: row.requester.name,
    requesterEmail: row.requester.email,
    department: row.request.department,
    title: row.request.title,
    justification: row.request.justification,
    urgency: row.request.urgency,
    category: row.request.category,
    vendorId: row.vendor.id,
    vendorName: row.vendor.name,
    vendorContactEmail: row.vendor.contactEmail,
    vendorStatus: row.vendor.status,
    vendorRiskLevel: row.vendor.riskLevel,
    currency: row.request.currency,
    totalAmountCents: row.request.totalAmountCents,
    status: overrides.status ?? row.request.status,
    revision: overrides.revision ?? row.request.revision,
    items: row.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
    })),
  };
}

async function appendAudit(db: Db, input: RecordAuditInput): Promise<string | null> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      metadata: input.metadata ?? {},
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing({ target: auditEvents.dedupeKey })
    .returning({ id: auditEvents.id });
  return row?.id ?? null;
}

interface DeliveryInput {
  channel: "EMAIL" | "SLACK" | "IN_APP";
  recipient: string;
  subject: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

/** Outbox-backed delivery. Retries reuse a FAILED row instead of dropping it. */
async function deliverNotification(db: Db, input: DeliveryInput): Promise<string> {
  const adapters = getAdapters();
  const existing = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, input.dedupeKey))
    .limit(1);

  let row = existing[0];
  if (row?.status === "SENT") return row.id;

  if (!row) {
    const [inserted] = await db
      .insert(notificationOutbox)
      .values({
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        status: "PENDING",
        dedupeKey: input.dedupeKey,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
      .returning();
    row = inserted;
    if (!row) {
      const [found] = await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.dedupeKey, input.dedupeKey))
        .limit(1);
      row = found;
    }
  }

  if (!row) throw new Error("Failed to create or load outbox notification");

  try {
    if (input.channel === "EMAIL") {
      await adapters.email.send({ to: input.recipient, subject: input.subject, body: input.body });
    } else if (input.channel === "SLACK") {
      await adapters.slack.send({ text: `${input.subject}\n${input.body}` });
    }
    await db
      .update(notificationOutbox)
      .set({ status: "SENT", sentAt: new Date(), error: null })
      .where(eq(notificationOutbox.id, row.id));
    logger.info("notification_sent", { outboxId: row.id, channel: input.channel });
    return row.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(notificationOutbox)
      .set({ status: "FAILED", error: message.slice(0, 1_000) })
      .where(eq(notificationOutbox.id, row.id));
    logger.error("notification_failed", { outboxId: row.id, channel: input.channel, error: message });
    throw error;
  }
}

async function usersForRole(db: Db, role: Role) {
  let recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.role, role), eq(users.active, true)));

  if (recipients.length === 0 && role !== "ADMIN") {
    recipients = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.active, true)));
  }
  return recipients;
}

export async function validateAndSubmitRequest(
  input: ValidateAndSubmitInput,
): Promise<ValidateAndSubmitResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);

  if (row.request.requesterId !== input.actorId) {
    nonRetryable("NotRequestOwner", "Only the requester can submit this purchase request");
  }
  if (["APPROVED", "PO_ISSUED", "REJECTED", "CANCELLED"].includes(row.request.status)) {
    nonRetryable(
      "RequestNotSubmittable",
      `Purchase request ${input.requestId} is ${row.request.status} and cannot be submitted`,
    );
  }
  if (row.vendor.status === "BLOCKED") {
    nonRetryable("VendorBlocked", `Vendor ${row.vendor.name} is blocked and cannot be used`);
  }
  if (row.items.length === 0) {
    nonRetryable("RequestHasNoItems", "A purchase request must have at least one line item");
  }

  const computedTotal = row.items.reduce((sum, item) => sum + item.totalPriceCents, 0);
  if (computedTotal !== row.request.totalAmountCents) {
    nonRetryable(
      "RequestTotalMismatch",
      `Stored total ${row.request.totalAmountCents} does not match line items ${computedTotal}`,
    );
  }

  if (["SUBMITTED", "IN_APPROVAL"].includes(row.request.status)) {
    logger.info("request_submit_replayed", { requestId: input.requestId, workflowId: input.workflowId });
    return { snapshot: snapshotFrom(row), replayed: true };
  }

  const isResubmission = row.request.status === "CHANGES_REQUESTED";
  const revision = isResubmission ? row.request.revision + 1 : row.request.revision;
  await db
    .update(purchaseRequests)
    .set({
      status: "SUBMITTED",
      currentStep: 0,
      revision,
      workflowId: input.workflowId,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(purchaseRequests.id, input.requestId));

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: isResubmission ? AUDIT_ACTIONS.REQUEST_RESUBMITTED : AUDIT_ACTIONS.REQUEST_SUBMITTED,
    actorId: input.actorId,
    metadata: {
      totalAmountCents: row.request.totalAmountCents,
      currency: row.request.currency,
      vendorStatus: row.vendor.status,
      vendorRiskLevel: row.vendor.riskLevel,
      revision,
    },
    dedupeKey: `${input.workflowId}:submitted:${revision}`,
  });

  logger.info("request_submitted", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    totalAmountCents: row.request.totalAmountCents,
    revision,
  });

  return { snapshot: snapshotFrom(row, { status: "SUBMITTED", revision }), replayed: false };
}

export async function evaluateRequestPolicy(input: EvaluatePolicyInput): Promise<EvaluatePolicyResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);
  const policyRows = await db.select().from(policies).where(eq(policies.enabled, true));
  const adapters = getAdapters();

  const definitions: PolicyDefinition[] = policyRows.map((policy) => ({
    id: policy.id,
    name: policy.name,
    description: policy.description,
    priority: policy.priority,
    enabled: policy.enabled,
    conditions: policy.conditions ?? {},
    approvers: policy.approvers ?? [],
  }));

  const evaluation = evaluatePolicy(definitions, {
    totalAmountCents: row.request.totalAmountCents,
    department: row.request.department,
    vendorRiskLevel: row.vendor.riskLevel,
    vendorStatus: row.vendor.status,
    urgency: row.request.urgency,
    category: row.request.category,
  });

  const riskSummary = await adapters.aiRisk.summarize({
    vendorName: row.vendor.name,
    riskLevel: row.vendor.riskLevel,
    vendorStatus: row.vendor.status,
    amountCents: row.request.totalAmountCents,
    category: row.request.category,
    website: row.vendor.website,
  });

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.POLICY_EVALUATED,
    actorId: null,
    metadata: {
      chain: evaluation.chain.map((step) => ({ role: step.role, dueInHours: step.dueInHours })),
      matchedRules: evaluation.matchedRuleNames,
      fallbackApplied: evaluation.fallbackApplied,
      autoApprove: evaluation.autoApprove,
      riskSummary,
      aiAdapter: adapters.aiRisk.name,
    },
    dedupeKey: `${input.workflowId}:policy:${row.request.revision}`,
  });

  logger.info("policy_evaluated", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    autoApprove: evaluation.autoApprove,
    chain: evaluation.chain.map((step) => step.role),
    matchedRules: evaluation.matchedRuleIds,
  });

  return { evaluation, riskSummary, aiAdapter: adapters.aiRisk.name };
}

export async function createApprovalPlan(
  input: CreateApprovalPlanInput,
): Promise<CreateApprovalPlanResult> {
  const db = getDb();
  if (input.chain.length === 0) {
    nonRetryable("EmptyApprovalChain", "createApprovalPlan requires at least one approval step");
  }
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, input.requestId))
      .limit(1);
    if (!request) nonRetryable("RequestNotFound", `Purchase request ${input.requestId} does not exist`);

    await tx
      .update(approvalTasks)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(approvalTasks.requestId, input.requestId),
          inArray(approvalTasks.status, ["PENDING", "ESCALATED"]),
        ),
      );

    const created: Array<{ taskId: string; stepOrder: number; role: Role; dueAt: string }> = [];
    for (const step of input.chain) {
      const dueAt = new Date(now + step.dueInHours * 3_600_000);
      const [task] = await tx
        .insert(approvalTasks)
        .values({
          requestId: input.requestId,
          stepOrder: step.stepOrder,
          approverRole: step.role,
          status: "PENDING",
          dueAt,
          escalationCount: 0,
          workflowId: input.workflowId,
        })
        .onConflictDoUpdate({
          target: [approvalTasks.requestId, approvalTasks.stepOrder],
          set: {
            approverRole: step.role,
            approverUserId: null,
            status: "PENDING",
            comment: null,
            dueAt,
            actedAt: null,
            actedBy: null,
            escalationCount: 0,
            workflowId: input.workflowId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: approvalTasks.id, stepOrder: approvalTasks.stepOrder, role: approvalTasks.approverRole });
      if (!task) throw new Error("Failed to create approval task");
      created.push({
        taskId: task.id,
        stepOrder: task.stepOrder,
        role: (task.role ?? step.role) as Role,
        dueAt: dueAt.toISOString(),
      });
    }

    await tx
      .update(approvalTasks)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(approvalTasks.requestId, input.requestId),
          gt(approvalTasks.stepOrder, input.chain.length),
        ),
      );

    await tx
      .update(purchaseRequests)
      .set({ status: "IN_APPROVAL", currentStep: 1, updatedAt: new Date() })
      .where(eq(purchaseRequests.id, input.requestId));

    return { tasks: created, status: "IN_APPROVAL", currentStep: 1 };
  });

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.APPROVAL_TASKS_CREATED,
    actorId: null,
    metadata: { tasks: result.tasks.map((task) => ({ step: task.stepOrder, role: task.role })) },
    dedupeKey: `${input.workflowId}:tasks:${result.tasks.map((task) => task.taskId).join(":")}`,
  });

  logger.info("approval_plan_created", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    steps: result.tasks.map((task) => task.role),
  });
  return result;
}

export async function sendApprovalNotification(
  input: SendApprovalNotificationInput,
): Promise<NotificationDispatchResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);
  const recipients = await usersForRole(db, input.role);
  const outboxIds: string[] = [];
  const link = `${appUrl()}/requests/${input.requestId}`;
  const dueText = new Date(input.dueAt).toISOString();

  for (const recipient of recipients) {
    const id = await deliverNotification(db, {
      channel: "EMAIL",
      recipient: recipient.email,
      subject: `${input.escalation ? "Escalated approval" : "Approval needed"}: ${row.request.title}`,
      body: [
        `Hi ${recipient.name},`,
        "",
        `${row.requester.name} submitted "${row.request.title}" for ${formatMoney(
          row.request.totalAmountCents,
          row.request.currency,
        )}.`,
        `Vendor: ${row.vendor.name} (${row.vendor.status}, ${row.vendor.riskLevel} risk).`,
        `Your ${input.role.toLowerCase()} approval is step ${input.stepOrder}. Due: ${dueText}.`,
        "",
        `Review it in ProcureFlow: ${link}`,
      ].join("\n"),
      dedupeKey: `${input.workflowId}:approval-email:${input.taskId}:${recipient.id}:${
        input.escalation ? "escalated" : "initial"
      }`,
      metadata: { requestId: input.requestId, taskId: input.taskId, stepOrder: input.stepOrder },
    });
    outboxIds.push(id);
  }

  const slackId = await deliverNotification(db, {
    channel: "SLACK",
    recipient: "slack-webhook",
    subject: `Approval needed: ${row.request.title}`,
    body: `${formatMoney(row.request.totalAmountCents, row.request.currency)} - ${
      row.vendor.name
    } - step ${input.stepOrder} (${input.role}). ${link}`,
    dedupeKey: `${input.workflowId}:approval-slack:${input.taskId}:${
      input.escalation ? "escalated" : "initial"
    }`,
    metadata: { requestId: input.requestId, taskId: input.taskId },
  });
  outboxIds.push(slackId);

  return { outboxIds, recipients: recipients.length, skipped: recipients.length === 0 };
}

export async function recordApprovalDecision(
  input: RecordDecisionInput,
): Promise<RecordDecisionResult> {
  const db = getDb();
  const [task] = await db
    .select()
    .from(approvalTasks)
    .where(and(eq(approvalTasks.id, input.taskId), eq(approvalTasks.requestId, input.requestId)))
    .limit(1);
  if (!task) nonRetryable("ApprovalTaskNotFound", `Approval task ${input.taskId} does not exist`);

  const [request] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, input.requestId))
    .limit(1);
  if (!request) nonRetryable("RequestNotFound", `Purchase request ${input.requestId} does not exist`);

  const [actor] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.actorId), eq(users.active, true)))
    .limit(1);
  if (!actor) nonRetryable("ActorNotFound", "The approving user is not active or does not exist");
  if (input.actorId === request.requesterId) {
    nonRetryable("SelfApprovalDenied", "Requesters cannot approve their own purchase requests");
  }
  if (task.approverRole && actor.role !== task.approverRole && actor.role !== "ADMIN") {
    nonRetryable(
      "ApprovalRoleMismatch",
      `This task requires the ${task.approverRole} role; you are ${actor.role}`,
    );
  }

  const targetStatus =
    input.action === "APPROVE"
      ? "APPROVED"
      : input.action === "REJECT"
        ? "REJECTED"
        : "CHANGES_REQUESTED";

  if (task.status === targetStatus) {
    const nextTask = await loadTask(db, input.requestId, task.stepOrder + 1);
    return {
      status: request.status,
      currentStep: request.currentStep,
      taskStatus: task.status,
      allApproved: request.status === "APPROVED",
      nextTask: nextTask && nextTask.status === "PENDING" ? toCreatedTask(nextTask) : null,
    };
  }

  if (!["PENDING", "ESCALATED"].includes(task.status)) {
    nonRetryable(
      "ApprovalTaskNotPending",
      `Approval task ${input.taskId} is ${task.status} and can no longer be acted on`,
    );
  }
  if (request.currentStep !== task.stepOrder) {
    nonRetryable(
      "ApprovalOutOfOrder",
      `Step ${task.stepOrder} is not the active approval step (current step ${request.currentStep})`,
    );
  }
  if (!["SUBMITTED", "IN_APPROVAL"].includes(request.status)) {
    nonRetryable(
      "RequestNotInApproval",
      `Purchase request is ${request.status} and cannot accept approval decisions`,
    );
  }

  const outcome = await db.transaction(async (tx) => {
    await tx
      .update(approvalTasks)
      .set({
        status: targetStatus,
        comment: input.comment ?? null,
        actedAt: new Date(),
        actedBy: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(approvalTasks.id, input.taskId));

    if (input.action === "APPROVE") {
      const [next] = await tx
        .select()
        .from(approvalTasks)
        .where(
          and(
            eq(approvalTasks.requestId, input.requestId),
            eq(approvalTasks.stepOrder, task.stepOrder + 1),
          ),
        )
        .limit(1);

      if (next && next.status === "PENDING") {
        await tx
          .update(purchaseRequests)
          .set({ status: "IN_APPROVAL", currentStep: next.stepOrder, updatedAt: new Date() })
          .where(eq(purchaseRequests.id, input.requestId));
        return { status: "IN_APPROVAL", currentStep: next.stepOrder, nextTask: next };
      }

      await tx
        .update(purchaseRequests)
        .set({ status: "APPROVED", currentStep: task.stepOrder, updatedAt: new Date() })
        .where(eq(purchaseRequests.id, input.requestId));
      return { status: "APPROVED", currentStep: task.stepOrder, nextTask: null };
    }

    await tx
      .update(approvalTasks)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(approvalTasks.requestId, input.requestId),
          ne(approvalTasks.id, input.taskId),
          inArray(approvalTasks.status, ["PENDING", "ESCALATED"]),
        ),
      );

    await tx
      .update(purchaseRequests)
      .set({ status: targetStatus, updatedAt: new Date() })
      .where(eq(purchaseRequests.id, input.requestId));

    return { status: targetStatus, currentStep: request.currentStep, nextTask: null };
  });

  const auditAction =
    input.action === "APPROVE"
      ? AUDIT_ACTIONS.APPROVAL_GRANTED
      : input.action === "REJECT"
        ? AUDIT_ACTIONS.APPROVAL_REJECTED
        : AUDIT_ACTIONS.CHANGES_REQUESTED;

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: auditAction,
    actorId: input.actorId,
    metadata: {
      taskId: input.taskId,
      stepOrder: task.stepOrder,
      role: task.approverRole,
      comment: input.comment ?? null,
      resultingStatus: outcome.status,
    },
    dedupeKey: `${input.workflowId}:decision:${input.taskId}:${input.action}`,
  });

  logger.info("approval_decision_recorded", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    taskId: input.taskId,
    action: input.action,
    resultingStatus: outcome.status,
    actorId: input.actorId,
  });

  const nextTask = outcome.nextTask
    ? {
        taskId: outcome.nextTask.id,
        stepOrder: outcome.nextTask.stepOrder,
        role: (outcome.nextTask.approverRole ?? "APPROVER") as Role,
        dueAt: outcome.nextTask.dueAt.toISOString(),
      }
    : null;

  return {
    status: outcome.status,
    currentStep: outcome.currentStep,
    taskStatus: targetStatus,
    allApproved: outcome.status === "APPROVED",
    nextTask,
  };
}

function toCreatedTask(task: typeof approvalTasks.$inferSelect) {
  return {
    taskId: task.id,
    stepOrder: task.stepOrder,
    role: (task.approverRole ?? "APPROVER") as Role,
    dueAt: task.dueAt.toISOString(),
  };
}

async function loadTask(db: Db, requestId: string, stepOrder: number) {
  const [task] = await db
    .select()
    .from(approvalTasks)
    .where(and(eq(approvalTasks.requestId, requestId), eq(approvalTasks.stepOrder, stepOrder)))
    .limit(1);
  return task ?? null;
}

export async function escalateApprovalTask(
  input: EscalateApprovalInput,
): Promise<EscalateApprovalResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);
  const task = await loadTask(db, input.requestId, input.stepOrder);
  if (!task) nonRetryable("ApprovalTaskNotFound", `Approval task ${input.taskId} does not exist`);

  if (task.escalationCount >= 1) {
    // Activity retry after a successful escalation: tell the workflow to resume
    // waiting on the (already extended) admin SLA instead of expiring the request.
    return {
      taskId: task.id,
      role: (task.approverRole ?? "ADMIN") as Role,
      dueAt: task.dueAt.toISOString(),
      escalationCount: task.escalationCount,
      canEscalate: true,
    };
  }

  if (task.approverRole === "ADMIN") {
    return {
      taskId: task.id,
      role: "ADMIN",
      dueAt: task.dueAt.toISOString(),
      escalationCount: task.escalationCount,
      canEscalate: false,
    };
  }

  const dueAt = new Date(Date.now() + 24 * 3_600_000);
  await db
    .update(approvalTasks)
    .set({
      approverRole: "ADMIN",
      status: "PENDING",
      dueAt,
      escalationCount: sql`${approvalTasks.escalationCount} + 1`,
      comment: null,
      actedAt: null,
      actedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(approvalTasks.id, task.id));

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.APPROVAL_ESCALATED,
    actorId: input.actorId ?? null,
    metadata: {
      taskId: task.id,
      stepOrder: task.stepOrder,
      fromRole: task.approverRole,
      toRole: "ADMIN",
      previousDueAt: task.dueAt.toISOString(),
      newDueAt: dueAt.toISOString(),
      requester: row.requester.name,
    },
    dedupeKey: `${input.workflowId}:escalation:${task.id}`,
  });

  logger.warn("approval_escalated", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    taskId: task.id,
    fromRole: task.approverRole,
    newDueAt: dueAt.toISOString(),
  });

  return {
    taskId: task.id,
    role: "ADMIN",
    dueAt: dueAt.toISOString(),
    escalationCount: 1,
    canEscalate: true,
  };
}

export async function expireApprovalTask(input: ExpireApprovalInput): Promise<{ status: string }> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(approvalTasks)
      .set({
        status: "ESCALATED",
        comment: input.reason,
        actedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(approvalTasks.id, input.taskId));
    await tx
      .update(approvalTasks)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(approvalTasks.requestId, input.requestId),
          ne(approvalTasks.id, input.taskId),
          inArray(approvalTasks.status, ["PENDING", "ESCALATED"]),
        ),
      );
    await tx
      .update(purchaseRequests)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(purchaseRequests.id, input.requestId));
  });

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.APPROVAL_EXPIRED,
    actorId: null,
    metadata: { taskId: input.taskId, stepOrder: input.stepOrder, reason: input.reason },
    dedupeKey: `${input.workflowId}:expired:${input.taskId}`,
  });

  logger.warn("approval_expired", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    taskId: input.taskId,
  });

  return { status: "REJECTED" };
}

export async function finalizeApproval(
  input: FinalizeApprovalInput,
): Promise<FinalizeApprovalResult> {
  const db = getDb();
  const [request] = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, input.requestId))
    .limit(1);
  if (!request) nonRetryable("RequestNotFound", `Purchase request ${input.requestId} does not exist`);

  if (request.status !== "PO_ISSUED") {
    await db
      .update(purchaseRequests)
      .set({ status: "APPROVED", updatedAt: new Date() })
      .where(eq(purchaseRequests.id, input.requestId));
  }

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.REQUEST_APPROVED,
    actorId: input.actorId,
    metadata: { revision: request.revision },
    dedupeKey: `${input.workflowId}:approved:${request.revision}`,
  });

  return { status: "APPROVED" };
}

function generatePoNumber(): string {
  const year = new Date().getUTCFullYear();
  const suffix = Array.from({ length: 6 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `PO-${year}-${suffix}`;
}

export async function issuePurchaseOrder(
  input: IssuePurchaseOrderInput,
): Promise<IssuePurchaseOrderResult> {
  const db = getDb();
  const existing = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.requestId, input.requestId))
    .limit(1);
  if (existing[0]) {
    const po = existing[0];
    return {
      poId: po.id,
      poNumber: po.poNumber,
      status: po.status,
      issuedAt: po.issuedAt.toISOString(),
      erpReference: po.erpReference,
      amountCents: 0,
    };
  }

  const row = await loadRequest(db, input.requestId);
  let created: typeof purchaseOrders.$inferSelect | undefined;

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      const [po] = await db
        .insert(purchaseOrders)
        .values({
          requestId: input.requestId,
          poNumber: generatePoNumber(),
          status: "ISSUED",
          issuedAt: new Date(),
        })
        .returning();
      created = po;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("purchase_orders_number_unique") && !message.includes("duplicate key")) {
        throw error;
      }
      logger.warn("po_number_collision_retry", { requestId: input.requestId, attempt });
    }
  }

  if (!created) {
    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.requestId, input.requestId))
      .limit(1);
    if (!po) throw new Error("Unable to issue purchase order");
    created = po;
  }

  await db
    .update(purchaseRequests)
    .set({ status: "PO_ISSUED", updatedAt: new Date() })
    .where(eq(purchaseRequests.id, input.requestId));

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.PO_ISSUED,
    actorId: input.actorId,
    metadata: {
      poNumber: created.poNumber,
      totalAmountCents: row.request.totalAmountCents,
      vendor: row.vendor.name,
    },
    dedupeKey: `${input.workflowId}:po-issued:${created.id}`,
  });

  logger.info("purchase_order_issued", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    poNumber: created.poNumber,
  });

  return {
    poId: created.id,
    poNumber: created.poNumber,
    status: created.status,
    issuedAt: created.issuedAt.toISOString(),
    erpReference: created.erpReference,
    amountCents: row.request.totalAmountCents,
  };
}

export async function syncPurchaseOrderToErp(
  input: SyncPurchaseOrderInput,
): Promise<SyncPurchaseOrderResult> {
  const db = getDb();
  const adapters = getAdapters();
  ActivityContext.current().heartbeat({ phase: "loading", poNumber: input.poNumber });

  const [row] = await db
    .select({ po: purchaseOrders, request: purchaseRequests, vendor: vendors })
    .from(purchaseOrders)
    .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseOrders.requestId))
    .innerJoin(vendors, eq(vendors.id, purchaseRequests.vendorId))
    .where(eq(purchaseOrders.requestId, input.requestId))
    .limit(1);
  if (!row) nonRetryable("PurchaseOrderNotFound", `No purchase order for request ${input.requestId}`);

  const items = await db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.requestId, input.requestId));

  ActivityContext.current().heartbeat({ phase: "syncing", poNumber: input.poNumber });
  try {
    const result = await adapters.erp.syncPurchaseOrder({
      poNumber: row.po.poNumber,
      requestId: input.requestId,
      vendorName: row.vendor.name,
      amountCents: row.request.totalAmountCents,
      currency: row.request.currency,
      issuedAt: row.po.issuedAt.toISOString(),
      lineItems: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    });

    if (!result.reference) {
      logger.info("po_sync_skipped", {
        requestId: input.requestId,
        workflowId: input.workflowId,
        poNumber: row.po.poNumber,
        adapter: adapters.erp.name,
      });
      return { status: "ISSUED", erpReference: null };
    }

    await db
      .update(purchaseOrders)
      .set({ status: "SYNCED", erpReference: result.reference, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, row.po.id));

    await appendAudit(db, {
      entityType: "PURCHASE_REQUEST",
      entityId: input.requestId,
      action: AUDIT_ACTIONS.PO_SYNCED,
      actorId: null,
      metadata: { poNumber: row.po.poNumber, erpReference: result.reference, adapter: adapters.erp.name },
      dedupeKey: `${input.workflowId}:po-synced:${row.po.id}`,
    });

    logger.info("po_synced", {
      requestId: input.requestId,
      workflowId: input.workflowId,
      poNumber: row.po.poNumber,
      erpReference: result.reference,
    });
    ActivityContext.current().heartbeat({ phase: "synced", poNumber: input.poNumber });
    return { status: "SYNCED", erpReference: result.reference };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(purchaseOrders)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, row.po.id));
    await appendAudit(db, {
      entityType: "PURCHASE_REQUEST",
      entityId: input.requestId,
      action: AUDIT_ACTIONS.PO_SYNC_FAILED,
      actorId: null,
      metadata: { poNumber: row.po.poNumber, error: message.slice(0, 1_000) },
      dedupeKey: `${input.workflowId}:po-sync-failed:${row.po.id}`,
    });
    logger.error("po_sync_failed", {
      requestId: input.requestId,
      workflowId: input.workflowId,
      poNumber: row.po.poNumber,
      error: message,
    });
    return { status: "FAILED", erpReference: null, error: message };
  }
}

export async function resubmitRequest(input: ResubmitInput): Promise<ResubmitResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);

  if (row.request.requesterId !== input.actorId) {
    nonRetryable("NotRequestOwner", "Only the requester can resubmit this purchase request");
  }
  if (["SUBMITTED", "IN_APPROVAL"].includes(row.request.status)) {
    return { status: row.request.status, revision: row.request.revision };
  }
  if (row.request.status !== "CHANGES_REQUESTED") {
    nonRetryable(
      "RequestNotResubmittable",
      `Purchase request is ${row.request.status}; only CHANGES_REQUESTED requests can be resubmitted`,
    );
  }

  const nextRevision = row.request.revision + 1;
  await db
    .update(purchaseRequests)
    .set({
      revision: nextRevision,
      status: "SUBMITTED",
      currentStep: 0,
      workflowId: input.workflowId,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(purchaseRequests.id, input.requestId));

  await appendAudit(db, {
    entityType: "PURCHASE_REQUEST",
    entityId: input.requestId,
    action: AUDIT_ACTIONS.REQUEST_RESUBMITTED,
    actorId: input.actorId,
    metadata: { revision: nextRevision, comment: input.comment ?? null },
    dedupeKey: `${input.workflowId}:resubmitted:${nextRevision}`,
  });

  logger.info("request_resubmitted", {
    requestId: input.requestId,
    workflowId: input.workflowId,
    revision: nextRevision,
  });

  return { status: "SUBMITTED", revision: nextRevision };
}

export async function notifyRequester(input: NotifyRequesterInput): Promise<NotificationResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);
  await deliverNotification(db, {
    channel: "EMAIL",
    recipient: row.requester.email,
    subject: input.subject,
    body: input.body,
    dedupeKey: `${input.workflowId}:requester:${input.kind}:${row.request.revision}`,
    metadata: { requestId: input.requestId, kind: input.kind },
  });
  return { recipients: 1, skipped: false };
}

export async function notifyFinance(input: NotifyFinanceInput): Promise<NotificationResult> {
  const db = getDb();
  const row = await loadRequest(db, input.requestId);
  const recipients = await usersForRole(db, "FINANCE");
  for (const recipient of recipients) {
    await deliverNotification(db, {
      channel: "EMAIL",
      recipient: recipient.email,
      subject: `PO issued: ${input.poNumber}`,
      body: [
        `Hi ${recipient.name},`,
        "",
        `PO ${input.poNumber} was issued for "${row.request.title}" (${formatMoney(
          row.request.totalAmountCents,
          row.request.currency,
        )}).`,
        `Requester: ${row.requester.name}. Vendor: ${row.vendor.name}.`,
        "",
        `${appUrl()}/requests/${input.requestId}`,
      ].join("\n"),
      dedupeKey: `${input.workflowId}:finance-po:${input.poNumber}:${recipient.id}`,
      metadata: { requestId: input.requestId, poNumber: input.poNumber },
    });
  }
  return { recipients: recipients.length, skipped: recipients.length === 0 };
}

export async function writeAuditEvent(input: RecordAuditInput): Promise<{ id: string | null }> {
  const id = await appendAudit(getDb(), input);
  return { id };
}

/** Vendor onboarding: start compliance review. */
export async function beginVendorReview(input: BeginVendorReviewInput): Promise<VendorReviewSnapshot> {
  const db = getDb();
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
  if (!vendor) nonRetryable("VendorNotFound", `Vendor ${input.vendorId} does not exist`);
  if (vendor.status === "BLOCKED") {
    nonRetryable("VendorBlocked", `Vendor ${vendor.name} is blocked`);
  }

  if (vendor.status !== "PENDING_REVIEW") {
    await db
      .update(vendors)
      .set({ status: "PENDING_REVIEW", updatedAt: new Date() })
      .where(eq(vendors.id, input.vendorId));
  }

  await appendAudit(db, {
    entityType: "VENDOR",
    entityId: input.vendorId,
    action: AUDIT_ACTIONS.VENDOR_REVIEW_STARTED,
    actorId: input.actorId,
    metadata: { vendorName: vendor.name, previousStatus: vendor.status },
    dedupeKey: `${input.workflowId}:review-started`,
  });

  const reviewers = await usersForRole(db, "ADMIN");
  for (const reviewer of reviewers) {
    await deliverNotification(db, {
      channel: "EMAIL",
      recipient: reviewer.email,
      subject: `Vendor review needed: ${vendor.name}`,
      body: [
        `Hi ${reviewer.name},`,
        "",
        `${vendor.name} has been submitted for vendor onboarding review.`,
        `Contact: ${vendor.contactEmail}. Website: ${vendor.website ?? "n/a"}.`,
        `Declared risk: ${vendor.riskLevel}. Tax ID: ${vendor.taxId ?? "not provided"}.`,
        "",
        `${appUrl()}/vendors`,
      ].join("\n"),
      dedupeKey: `${input.workflowId}:review-email:${reviewer.id}`,
      metadata: { vendorId: input.vendorId },
    });
  }

  return {
    vendorId: vendor.id,
    name: vendor.name,
    status: "PENDING_REVIEW",
    riskLevel: vendor.riskLevel,
    createdBy: vendor.createdBy,
  };
}

export async function completeVendorReview(
  input: CompleteVendorReviewInput,
): Promise<CompleteVendorReviewResult> {
  const db = getDb();
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
  if (!vendor) nonRetryable("VendorNotFound", `Vendor ${input.vendorId} does not exist`);

  const [actor] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.actorId), eq(users.active, true)))
    .limit(1);
  if (!actor) nonRetryable("ActorNotFound", "Reviewer does not exist or is inactive");
  if (actor.role !== "ADMIN" && actor.role !== "FINANCE") {
    nonRetryable("VendorReviewRoleMismatch", "Only finance or admin users can review vendors");
  }

  const nextStatus = input.decision === "APPROVE" ? "APPROVED" : "BLOCKED";
  const riskLevel = input.riskLevel ?? vendor.riskLevel;
  const adapters = getAdapters();
  const riskSummary = await adapters.aiRisk.summarize({
    vendorName: vendor.name,
    riskLevel,
    vendorStatus: nextStatus,
    amountCents: 0,
    category: "VENDOR_ONBOARDING",
    website: vendor.website,
  });

  await db
    .update(vendors)
    .set({ status: nextStatus, riskLevel, riskSummary, updatedAt: new Date() })
    .where(eq(vendors.id, input.vendorId));

  await appendAudit(db, {
    entityType: "VENDOR",
    entityId: input.vendorId,
    action:
      input.decision === "APPROVE" ? AUDIT_ACTIONS.VENDOR_APPROVED : AUDIT_ACTIONS.VENDOR_BLOCKED,
    actorId: input.actorId,
    metadata: { comment: input.comment ?? null, riskLevel, previousStatus: vendor.status },
    dedupeKey: `${input.workflowId}:decision:${input.decision}`,
  });

  const [creator] = await db.select().from(users).where(eq(users.id, vendor.createdBy)).limit(1);
  if (creator) {
    await deliverNotification(db, {
      channel: "EMAIL",
      recipient: creator.email,
      subject: `Vendor ${nextStatus.toLowerCase()}: ${vendor.name}`,
      body: [
        `Hi ${creator.name},`,
        "",
        `${vendor.name} was ${nextStatus.toLowerCase()} by ${actor.name}.`,
        `Risk level: ${riskLevel}. ${input.comment ?? ""}`,
        "",
        `${appUrl()}/vendors`,
      ].join("\n"),
      dedupeKey: `${input.workflowId}:vendor-decision-email:${creator.id}`,
      metadata: { vendorId: input.vendorId, decision: input.decision },
    });
  }

  logger.info("vendor_review_completed", {
    vendorId: input.vendorId,
    workflowId: input.workflowId,
    decision: input.decision,
    actorId: input.actorId,
  });

  return { status: nextStatus, riskLevel, riskSummary };
}

export async function expireVendorReview(input: ExpireVendorReviewInput): Promise<{ status: string }> {
  const db = getDb();
  await appendAudit(db, {
    entityType: "VENDOR",
    entityId: input.vendorId,
    action: AUDIT_ACTIONS.VENDOR_REVIEW_EXPIRED,
    actorId: null,
    metadata: { reason: "Compliance review SLA expired" },
    dedupeKey: `${input.workflowId}:review-expired`,
  });
  return { status: "PENDING_REVIEW" };
}

/** Retry send for rows left PENDING/FAILED (internal ops route). */
export async function drainNotificationOutbox(input: DrainOutboxInput): Promise<DrainOutboxResult> {
  const db = getDb();
  const adapters = getAdapters();
  const rows = await db
    .select()
    .from(notificationOutbox)
    .where(inArray(notificationOutbox.status, ["PENDING", "FAILED"]))
    .limit(input.limit);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (row.channel === "EMAIL") {
        await adapters.email.send({ to: row.recipient, subject: row.subject, body: row.body });
      } else if (row.channel === "SLACK") {
        await adapters.slack.send({ text: `${row.subject}\n${row.body}` });
      }
      await db
        .update(notificationOutbox)
        .set({ status: "SENT", sentAt: new Date(), error: null })
        .where(eq(notificationOutbox.id, row.id));
      sent += 1;
    } catch (error) {
      failed += 1;
      await db
        .update(notificationOutbox)
        .set({
          status: "FAILED",
          error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
        })
        .where(eq(notificationOutbox.id, row.id));
    }
  }
  return { processed: rows.length, sent, failed };
}

export function createActivities(): PurchaseRequestActivities {
  return {
    validateAndSubmitRequest,
    evaluateRequestPolicy,
    createApprovalPlan,
    sendApprovalNotification,
    recordApprovalDecision,
    escalateApprovalTask,
    expireApprovalTask,
    finalizeApproval,
    issuePurchaseOrder,
    syncPurchaseOrderToErp,
    resubmitRequest,
    notifyRequester,
    notifyFinance,
    writeAuditEvent,
  };
}

export function createVendorActivities(): VendorActivities {
  return {
    beginVendorReview,
    completeVendorReview,
    expireVendorReview,
  };
}

export function createOutboxActivities() {
  return { drainNotificationOutbox };
}
