import {
  condition,
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
  upsertSearchAttributes,
  workflowInfo,
} from "@temporalio/workflow";
import { PROCUREFLOW_SEARCH_ATTRIBUTES } from "@procureflow/shared/temporal";
import type {
  DecisionSignalInput,
  PurchaseRequestWorkflowInput,
  PurchaseRequestWorkflowState,
  ResubmitSignalInput,
  VendorDecisionSignalInput,
  VendorOnboardingWorkflowInput,
  VendorOnboardingWorkflowState,
  WorkflowApprovalStep,
} from "@procureflow/shared/temporal";
import type { Role } from "@procureflow/shared/domain";
import type {
  OutboxActivities,
  PurchaseRequestActivities,
  RequestSnapshot,
  VendorActivities,
} from "./activity-types";

const NON_RETRYABLE = [
  "RequestNotFound",
  "RequestNotSubmittable",
  "RequestNotResubmittable",
  "RequestHasNoItems",
  "RequestTotalMismatch",
  "NotRequestOwner",
  "VendorBlocked",
  "VendorNotFound",
  "ActorNotFound",
  "ApprovalTaskNotFound",
  "ApprovalTaskNotPending",
  "ApprovalOutOfOrder",
  "ApprovalRoleMismatch",
  "RequestNotInApproval",
  "SelfApprovalDenied",
  "EmptyApprovalChain",
  "PurchaseOrderNotFound",
  "VendorReviewRoleMismatch",
] as const;

type CoreActivities = Pick<
  PurchaseRequestActivities,
  | "validateAndSubmitRequest"
  | "evaluateRequestPolicy"
  | "createApprovalPlan"
  | "recordApprovalDecision"
  | "escalateApprovalTask"
  | "expireApprovalTask"
  | "finalizeApproval"
  | "issuePurchaseOrder"
  | "resubmitRequest"
>;

const core = proxyActivities<CoreActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumInterval: "30 seconds",
    maximumAttempts: 5,
    nonRetryableErrorTypes: [...NON_RETRYABLE],
  },
});

type NotificationActivities = Pick<
  PurchaseRequestActivities,
  "sendApprovalNotification" | "notifyRequester" | "notifyFinance"
>;

const notifications = proxyActivities<NotificationActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    maximumAttempts: 4,
    nonRetryableErrorTypes: ["RequestNotFound"],
  },
});

const erp = proxyActivities<Pick<PurchaseRequestActivities, "syncPurchaseOrderToErp">>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    maximumAttempts: 3,
  },
});

const vendorActivities = proxyActivities<VendorActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumInterval: "30 seconds",
    maximumAttempts: 5,
    nonRetryableErrorTypes: [...NON_RETRYABLE],
  },
});

const outboxActivities = proxyActivities<OutboxActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "30 seconds",
    maximumAttempts: 3,
  },
});

export const approve = defineSignal<[DecisionSignalInput]>("approve");
export const reject = defineSignal<[DecisionSignalInput]>("reject");
export const requestChanges = defineSignal<[DecisionSignalInput]>("requestChanges");
export const resubmit = defineSignal<[ResubmitSignalInput]>("resubmit");
export const getState = defineQuery<PurchaseRequestWorkflowState>("getState");

export const decideVendor = defineSignal<[VendorDecisionSignalInput]>("decide");
export const getVendorState = defineQuery<VendorOnboardingWorkflowState>("getVendorState");

export interface PurchaseRequestWorkflowResult {
  status: string;
  poNumber?: string;
  poStatus?: string;
  revision: number;
}

interface BufferedDecision extends DecisionSignalInput {
  action: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function setSearchAttributes(
  enabled: boolean,
  values: { department: string; risk: string; status: string },
): void {
  if (!enabled) return;
  upsertSearchAttributes({
    [PROCUREFLOW_SEARCH_ATTRIBUTES.department]: [values.department],
    [PROCUREFLOW_SEARCH_ATTRIBUTES.risk]: [values.risk],
    [PROCUREFLOW_SEARCH_ATTRIBUTES.status]: [values.status],
  });
}

function chainFromSnapshot(
  snapshot: RequestSnapshot,
  tasks: Array<{ taskId: string; stepOrder: number; role: Role; dueAt: string }>,
): WorkflowApprovalStep[] {
  return tasks.map((task) => ({
    taskId: task.taskId,
    stepOrder: task.stepOrder,
    role: task.role,
    status: "PENDING",
    dueAt: task.dueAt,
    escalationCount: 0,
  }));
}

/**
 * Durable approval orchestration for one purchase request.
 *
 * Workflow ID: purchase-request-<requestId> (revision 1). All side effects live
 * in activities; this function only performs deterministic control flow.
 */
export async function purchaseRequestWorkflow(
  input: PurchaseRequestWorkflowInput,
): Promise<PurchaseRequestWorkflowResult> {
  const info = workflowInfo();
  const decisions: BufferedDecision[] = [];
  const resubmissions: ResubmitSignalInput[] = [];

  let state: PurchaseRequestWorkflowState = {
    requestId: input.requestId,
    workflowId: info.workflowId,
    status: "SUBMITTED",
    currentStep: 0,
    revision: 1,
    chain: [],
    pendingTask: null,
    autoApprove: false,
    policyExplanation: "",
    auditSummary: [],
    lastDecision: null,
    updatedAt: iso(Date.now()),
  };

  const record = (summary: string): void => {
    state.auditSummary.push(`${iso(Date.now())} ${summary}`);
    state.updatedAt = iso(Date.now());
  };

  setHandler(approve, (decision: DecisionSignalInput) => {
    decisions.push({ ...decision, action: "APPROVE" });
  });
  setHandler(reject, (decision: DecisionSignalInput) => {
    decisions.push({ ...decision, action: "REJECT" });
  });
  setHandler(requestChanges, (decision: DecisionSignalInput) => {
    decisions.push({ ...decision, action: "REQUEST_CHANGES" });
  });
  setHandler(resubmit, (signal: ResubmitSignalInput) => {
    resubmissions.push(signal);
  });
  setHandler(getState, () => ({
    ...state,
    chain: state.chain.map((step) => ({ ...step })),
    pendingTask: state.pendingTask ? { ...state.pendingTask } : null,
    auditSummary: [...state.auditSummary],
  }));

  let lastActorId = input.actorId;
  let snapshot: RequestSnapshot;

  const submitted = await core.validateAndSubmitRequest({
    requestId: input.requestId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    workflowId: info.workflowId,
  });
  snapshot = submitted.snapshot;
  state.status = snapshot.status;
  state.revision = snapshot.revision;
  record(`Submitted request "${snapshot.title}" for ${snapshot.vendorName}`);
  setSearchAttributes(input.reworkSearchAttributes, {
    department: snapshot.department,
    risk: snapshot.vendorRiskLevel,
    status: state.status,
  });

  try {
    await notifications.notifyRequester({
      requestId: input.requestId,
      workflowId: info.workflowId,
      kind: "submitted",
      subject: `Request received: ${snapshot.title}`,
      body: `Your purchase request "${snapshot.title}" was submitted and is being evaluated against Procurement policy.`,
    });
  } catch (error) {
    log.warn("requester_submitted_notification_failed", {
      requestId: input.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Outer loop: one iteration per approval cycle. A cycle repeats after a
  // CHANGES_REQUESTED decision is resubmitted.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const policy = await core.evaluateRequestPolicy({
      requestId: input.requestId,
      workflowId: info.workflowId,
    });
    state.autoApprove = policy.evaluation.autoApprove;
    state.policyExplanation = policy.evaluation.explanation;
    record(`Policy evaluation: ${policy.evaluation.explanation}`);

    if (policy.evaluation.autoApprove) {
      await core.finalizeApproval({
        requestId: input.requestId,
        workflowId: info.workflowId,
        actorId: lastActorId,
      });
      state.status = "APPROVED";
      state.pendingTask = null;
      record("Auto-approved by policy");
      return await issueAndComplete(input, info.workflowId, snapshot, lastActorId, state, record, input.reworkSearchAttributes);
    }

    const plan = await core.createApprovalPlan({
      requestId: input.requestId,
      workflowId: info.workflowId,
      chain: policy.evaluation.chain,
    });
    if (plan.tasks.length === 0) {
      throw new Error("Policy evaluation produced a human approval chain but no tasks");
    }

    state.chain = chainFromSnapshot(snapshot, plan.tasks);
    state.status = "IN_APPROVAL";
    state.currentStep = 1;
    const firstTask = plan.tasks[0]!;
    state.pendingTask = {
      taskId: firstTask.taskId,
      stepOrder: firstTask.stepOrder,
      role: firstTask.role,
      dueAt: firstTask.dueAt,
    };
    record(`Approval chain created: ${plan.tasks.map((task) => task.role).join(" -> ")}`);
    setSearchAttributes(input.reworkSearchAttributes, {
      department: snapshot.department,
      risk: snapshot.vendorRiskLevel,
      status: state.status,
    });

    await notifications.sendApprovalNotification({
      requestId: input.requestId,
      workflowId: info.workflowId,
      taskId: firstTask.taskId,
      stepOrder: firstTask.stepOrder,
      role: firstTask.role,
      dueAt: firstTask.dueAt,
    });
    record(`Awaiting ${firstTask.role} approval (step ${firstTask.stepOrder})`);

    let currentTask = firstTask;
    let escalated = false;
    let outcome: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "EXPIRED" | null = null;

    while (outcome === null) {
      const dueMs = Date.parse(currentTask.dueAt);
      const remaining = dueMs - Date.now();
      if (remaining > 0) {
        await condition(() => decisions.length > 0, remaining);
      }

      const index = decisions.findIndex((decision) => decision.taskId === currentTask.taskId);
      if (index === -1) {
        if (Date.parse(currentTask.dueAt) > Date.now()) {
          continue;
        }
        if (!escalated) {
          const escalation = await core.escalateApprovalTask({
            requestId: input.requestId,
            workflowId: info.workflowId,
            taskId: currentTask.taskId,
            stepOrder: currentTask.stepOrder,
          });
          if (escalation.canEscalate) {
            escalated = true;
            currentTask = {
              taskId: escalation.taskId,
              stepOrder: currentTask.stepOrder,
              role: escalation.role,
              dueAt: escalation.dueAt,
            };
            state.chain = state.chain.map((step) =>
              step.taskId === currentTask.taskId
                ? {
                    ...step,
                    role: escalation.role,
                    dueAt: escalation.dueAt,
                    status: "PENDING",
                    escalationCount: escalation.escalationCount,
                  }
                : step,
            );
            state.pendingTask = {
              taskId: currentTask.taskId,
              stepOrder: currentTask.stepOrder,
              role: currentTask.role,
              dueAt: currentTask.dueAt,
            };
            record(`Approval escalated to ${escalation.role} after SLA expiry`);
            await notifications.sendApprovalNotification({
              requestId: input.requestId,
              workflowId: info.workflowId,
              taskId: currentTask.taskId,
              stepOrder: currentTask.stepOrder,
              role: currentTask.role,
              dueAt: currentTask.dueAt,
              escalation: true,
            });
            continue;
          }
        }

        await core.expireApprovalTask({
          requestId: input.requestId,
          workflowId: info.workflowId,
          taskId: currentTask.taskId,
          stepOrder: currentTask.stepOrder,
          reason: "Approval SLA expired after escalation to admin",
        });
        state.status = "REJECTED";
        state.pendingTask = null;
        state.chain = state.chain.map((step) =>
          step.taskId === currentTask.taskId ? { ...step, status: "ESCALATED" } : step,
        );
        record("Approval SLA expired; request rejected");
        outcome = "EXPIRED";
        break;
      }

      const decision = decisions.splice(index, 1)[0]!;
      const result = await core.recordApprovalDecision({
        requestId: input.requestId,
        workflowId: info.workflowId,
        taskId: currentTask.taskId,
        stepOrder: currentTask.stepOrder,
        action: decision.action,
        actorId: decision.actorId,
        comment: decision.comment,
      });

      lastActorId = decision.actorId;
      state.lastDecision = {
        action: decision.action,
        actorId: decision.actorId,
        comment: decision.comment,
        at: iso(Date.now()),
      };
      state.status = result.status;
      state.currentStep = result.currentStep;
      state.chain = state.chain.map((step) =>
        step.taskId === currentTask.taskId ? { ...step, status: result.taskStatus } : step,
      );
      setSearchAttributes(input.reworkSearchAttributes, {
        department: snapshot.department,
        risk: snapshot.vendorRiskLevel,
        status: state.status,
      });
      record(`${decision.action} recorded by ${decision.actorId} at step ${currentTask.stepOrder}`);

      if (decision.action === "APPROVE") {
        if (result.allApproved) {
          state.pendingTask = null;
          outcome = "APPROVED";
          break;
        }
        if (!result.nextTask) {
          throw new Error("Approval result reported more steps but returned no next task");
        }
        currentTask = result.nextTask;
        escalated = false;
        state.pendingTask = {
          taskId: currentTask.taskId,
          stepOrder: currentTask.stepOrder,
          role: currentTask.role,
          dueAt: currentTask.dueAt,
        };
        await notifications.sendApprovalNotification({
          requestId: input.requestId,
          workflowId: info.workflowId,
          taskId: currentTask.taskId,
          stepOrder: currentTask.stepOrder,
          role: currentTask.role,
          dueAt: currentTask.dueAt,
        });
        record(`Advanced to ${currentTask.role} approval (step ${currentTask.stepOrder})`);
        continue;
      }

      state.pendingTask = null;
      outcome = decision.action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
    }

    if (outcome === "APPROVED") {
      await core.finalizeApproval({
        requestId: input.requestId,
        workflowId: info.workflowId,
        actorId: lastActorId,
      });
      state.status = "APPROVED";
      record("Final approval recorded; issuing purchase order");
      return await issueAndComplete(
        input,
        info.workflowId,
        snapshot,
        lastActorId,
        state,
        record,
        input.reworkSearchAttributes,
      );
    }

    if (outcome === "REJECTED" || outcome === "EXPIRED") {
      try {
        await notifications.notifyRequester({
          requestId: input.requestId,
          workflowId: info.workflowId,
          kind: "rejected",
          subject: `Purchase request rejected: ${snapshot.title}`,
          body:
            outcome === "EXPIRED"
              ? "Approval did not complete within the escalation SLA, so the request was closed as rejected. You can submit a new request."
              : "Your purchase request was rejected. Review the approval comments in ProcureFlow and submit a new request if needed.",
        });
      } catch (error) {
        log.warn("requester_rejection_notification_failed", {
          requestId: input.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      record(`Request closed as ${outcome}`);
      return { status: state.status === "REJECTED" ? "REJECTED" : outcome, revision: state.revision };
    }

    // CHANGES_REQUESTED: wait for the requester to edit and resubmit.
    state.status = "CHANGES_REQUESTED";
    state.pendingTask = null;
    state.currentStep = 0;
    record("Changes requested; awaiting requester resubmission");

    try {
      await notifications.notifyRequester({
        requestId: input.requestId,
        workflowId: info.workflowId,
        kind: "changes-requested",
        subject: `Changes requested: ${snapshot.title}`,
        body: "An approver requested changes to your purchase request. Update the request and resubmit it in ProcureFlow.",
      });
    } catch (error) {
      log.warn("requester_changes_notification_failed", {
        requestId: input.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const resubmissionWindowMs = 30 * 24 * 3_600_000;
    await condition(() => resubmissions.length > 0, resubmissionWindowMs);
    const resubmission = resubmissions.shift();
    if (!resubmission) {
      record("Resubmission window expired; workflow completed with CHANGES_REQUESTED");
      return { status: "CHANGES_REQUESTED", revision: state.revision };
    }

    const resubmitted = await core.resubmitRequest({
      requestId: input.requestId,
      workflowId: info.workflowId,
      actorId: resubmission.actorId,
      comment: resubmission.comment,
    });
    lastActorId = resubmission.actorId;
    state.revision = resubmitted.revision;
    state.status = "SUBMITTED";
    state.chain = [];
    state.pendingTask = null;
    state.autoApprove = false;
    record(`Resubmitted as revision ${resubmitted.revision}`);
    setSearchAttributes(input.reworkSearchAttributes, {
      department: snapshot.department,
      risk: snapshot.vendorRiskLevel,
      status: state.status,
    });
  }
}

async function issueAndComplete(
  input: PurchaseRequestWorkflowInput,
  workflowId: string,
  snapshot: RequestSnapshot,
  actorId: string,
  state: PurchaseRequestWorkflowState,
  record: (summary: string) => void,
  reworkSearchAttributes: boolean,
): Promise<PurchaseRequestWorkflowResult> {
  const po = await core.issuePurchaseOrder({
    requestId: input.requestId,
    workflowId,
    actorId,
  });
  state.status = "PO_ISSUED";
  state.pendingTask = null;
  setSearchAttributes(reworkSearchAttributes, {
    department: snapshot.department,
    risk: snapshot.vendorRiskLevel,
    status: state.status,
  });
  record(`Purchase order ${po.poNumber} issued`);

  let poStatus = po.status;
  try {
    const sync = await erp.syncPurchaseOrderToErp({
      requestId: input.requestId,
      workflowId,
      poNumber: po.poNumber,
    });
    poStatus = sync.status;
    if (sync.status === "SYNCED") {
      record(`PO synced to ERP as ${sync.erpReference ?? "reference unavailable"}`);
    } else if (sync.status === "FAILED") {
      record("ERP sync failed; PO remains issued and can be retried by finance");
    } else {
      record("ERP sync skipped by adapter configuration");
    }
  } catch (error) {
    record("ERP sync activity failed; PO remains issued");
    log.warn("po_sync_activity_failed", {
      requestId: input.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await notifications.notifyRequester({
      requestId: input.requestId,
      workflowId,
      kind: "po-issued",
      subject: `PO issued: ${po.poNumber}`,
      body: `Purchase order ${po.poNumber} has been issued for "${snapshot.title}". ERP status: ${poStatus}.`,
    });
    await notifications.notifyFinance({
      requestId: input.requestId,
      workflowId,
      poNumber: po.poNumber,
    });
  } catch (error) {
    log.warn("po_notifications_failed", {
      requestId: input.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  record(`Approval chain complete (${actorId})`);
  return { status: "PO_ISSUED", poNumber: po.poNumber, poStatus, revision: state.revision };
}

/**
 * Vendor onboarding workflow: compliance review of a vendor before it can be
 * used for purchases. Uses the same durable human-in-the-loop pattern as the
 * purchase request workflow.
 */
export async function vendorOnboardingWorkflow(
  input: VendorOnboardingWorkflowInput,
): Promise<{ status: string; decision: string | null }> {
  const info = workflowInfo();
  const decisions: VendorDecisionSignalInput[] = [];

  const state: VendorOnboardingWorkflowState = {
    vendorId: input.vendorId,
    workflowId: info.workflowId,
    status: "PENDING_REVIEW",
    pendingReview: true,
    decision: null,
    actorId: null,
    auditSummary: [],
    updatedAt: iso(Date.now()),
  };
  const record = (summary: string): void => {
    state.auditSummary.push(`${iso(Date.now())} ${summary}`);
    state.updatedAt = iso(Date.now());
  };

  setHandler(decideVendor, (decision: VendorDecisionSignalInput) => {
    decisions.push(decision);
  });
  setHandler(getVendorState, () => ({
    ...state,
    auditSummary: [...state.auditSummary],
  }));

  const review = await vendorActivities.beginVendorReview({
    vendorId: input.vendorId,
    actorId: input.actorId,
    workflowId: info.workflowId,
  });
  state.status = review.status;
  state.pendingReview = true;
  record(`Vendor review started for ${review.name}`);

  const slaMs = 7 * 24 * 3_600_000;
  await condition(() => decisions.length > 0, slaMs);
  const decision = decisions.shift();
  if (!decision) {
    await vendorActivities.expireVendorReview({
      vendorId: input.vendorId,
      workflowId: info.workflowId,
    });
    state.pendingReview = false;
    record("Vendor review SLA expired");
    return { status: "PENDING_REVIEW", decision: null };
  }

  const result = await vendorActivities.completeVendorReview({
    vendorId: input.vendorId,
    workflowId: info.workflowId,
    actorId: decision.actorId,
    decision: decision.decision,
    comment: decision.comment,
    riskLevel: decision.riskLevel,
  });
  state.status = result.status;
  state.pendingReview = false;
  state.decision = decision.decision;
  state.actorId = decision.actorId;
  record(`Vendor ${result.status.toLowerCase()} by ${decision.actorId} (risk ${result.riskLevel})`);

  return { status: result.status, decision: decision.decision };
}

/**
 * Internal ops workflow used by /api/internal/outbox to retry failed or pending
 * notifications through the same adapter-backed activity the worker uses.
 */
export async function notificationOutboxWorkflow(input: {
  limit: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  return outboxActivities.drainNotificationOutbox({ limit: input.limit });
}
