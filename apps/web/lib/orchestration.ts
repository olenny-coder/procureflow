import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
  type ConnectionOptions,
} from "@temporalio/client";
import {
  getOrchestrationConfig,
  type DecisionSignalInput,
  type PurchaseRequestWorkflowInput,
  type PurchaseRequestWorkflowState,
  type ResubmitSignalInput,
  type Role,
  type VendorDecisionSignalInput,
  type VendorOnboardingWorkflowState,
  QUERIES,
  SIGNALS,
  VENDOR_QUERIES,
  VENDOR_SIGNALS,
  WORKFLOW_IDS,
  WORKFLOW_NAMES,
} from "@procureflow/shared";

let clientPromise: Promise<Client> | undefined;

function connectionOptions(): ConnectionOptions {
  const config = getOrchestrationConfig();
  return {
    address: config.address,
    ...(config.tls ? { tls: true } : {}),
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  };
}

export function getOrchestrationClient(): Promise<Client> {
  if (!clientPromise) {
    const config = getOrchestrationConfig();
    clientPromise = (async () => {
      const connection = await Connection.connect(connectionOptions());
      return new Client({ connection, namespace: config.namespace });
    })().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

export function requestWorkflowId(requestId: string, revision: number, storedWorkflowId?: string | null): string {
  return storedWorkflowId || WORKFLOW_IDS.purchaseRequest(requestId, revision);
}

export interface StartWorkflowResult {
  workflowId: string;
  runId: string;
  alreadyRunning: boolean;
}

export async function startPurchaseRequestWorkflow(params: {
  requestId: string;
  actorId: string;
  actorRole: Role;
  workflowId: string;
}): Promise<StartWorkflowResult> {
  const config = getOrchestrationConfig();
  const client = await getOrchestrationClient();
  const input: PurchaseRequestWorkflowInput = {
    requestId: params.requestId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    reworkSearchAttributes: config.reworkEnabled,
  };
  try {
    const handle = await client.workflow.start(WORKFLOW_NAMES.purchaseRequest, {
      taskQueue: config.taskQueue,
      workflowId: params.workflowId,
      args: [input],
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId, alreadyRunning: false };
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return { workflowId: params.workflowId, runId: "", alreadyRunning: true };
    }
    throw error;
  }
}

function signalName(action: "APPROVE" | "REJECT" | "REQUEST_CHANGES"): string {
  if (action === "APPROVE") return SIGNALS.approve;
  if (action === "REJECT") return SIGNALS.reject;
  return SIGNALS.requestChanges;
}

export async function signalApprovalDecision(params: {
  workflowId: string;
  action: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
  taskId: string;
  actorId: string;
  actorRole: Role;
  comment?: string;
}): Promise<void> {
  const client = await getOrchestrationClient();
  const handle = client.workflow.getHandle(params.workflowId);
  const input: DecisionSignalInput = {
    taskId: params.taskId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    comment: params.comment,
  };
  await handle.signal(signalName(params.action), input);
}

export async function signalResubmission(params: {
  workflowId: string;
  actorId: string;
  actorRole: Role;
  comment?: string;
}): Promise<void> {
  const client = await getOrchestrationClient();
  const handle = client.workflow.getHandle(params.workflowId);
  const input: ResubmitSignalInput = {
    actorId: params.actorId,
    actorRole: params.actorRole,
    comment: params.comment,
  };
  await handle.signal(SIGNALS.resubmit, input);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function queryPurchaseRequestState(
  workflowId: string,
): Promise<PurchaseRequestWorkflowState | null> {
  try {
    const client = await withTimeout(getOrchestrationClient(), 2_500, "orchestration_client");
    const handle = client.workflow.getHandle(workflowId);
    return await withTimeout(
      handle.query<PurchaseRequestWorkflowState>(QUERIES.getState),
      2_500,
      "workflow_query",
    );
  } catch {
    return null;
  }
}

export async function startVendorOnboarding(params: {
  vendorId: string;
  actorId: string;
}): Promise<StartWorkflowResult> {
  const config = getOrchestrationConfig();
  const client = await getOrchestrationClient();
  const workflowId = WORKFLOW_IDS.vendorOnboarding(params.vendorId);
  try {
    const handle = await client.workflow.start(WORKFLOW_NAMES.vendorOnboarding, {
      taskQueue: config.taskQueue,
      workflowId,
      args: [{ vendorId: params.vendorId, actorId: params.actorId }],
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId, alreadyRunning: false };
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return { workflowId, runId: "", alreadyRunning: true };
    }
    throw error;
  }
}

export async function signalVendorDecision(params: {
  vendorId: string;
  actorId: string;
  actorRole: Role;
  decision: "APPROVE" | "BLOCK";
  comment?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
}): Promise<void> {
  const client = await getOrchestrationClient();
  const workflowId = WORKFLOW_IDS.vendorOnboarding(params.vendorId);
  const input: VendorDecisionSignalInput = {
    actorId: params.actorId,
    actorRole: params.actorRole,
    decision: params.decision,
    comment: params.comment,
    riskLevel: params.riskLevel,
  };

  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(VENDOR_SIGNALS.decide, input);
  } catch (error) {
    // Seeded / legacy vendors may not have a running workflow yet. Start one and
    // deliver the decision so the activity remains the single writer of state.
    const name = error instanceof Error ? error.name : "";
    if (!name.includes("NotFound")) throw error;
    await startVendorOnboarding({ vendorId: params.vendorId, actorId: params.actorId });
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(VENDOR_SIGNALS.decide, input);
  }
}

export async function queryVendorState(workflowId: string): Promise<VendorOnboardingWorkflowState | null> {
  try {
    const client = await withTimeout(getOrchestrationClient(), 2_500, "orchestration_client");
    const handle = client.workflow.getHandle(workflowId);
    return await withTimeout(
      handle.query<VendorOnboardingWorkflowState>(VENDOR_QUERIES.getVendorState),
      2_500,
      "vendor_query",
    );
  } catch {
    return null;
  }
}

export async function startNotificationOutboxWorkflow(limit: number): Promise<{ workflowId: string; runId: string }> {
  const config = getOrchestrationConfig();
  const client = await getOrchestrationClient();
  const workflowId = `notification-outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const handle = await client.workflow.start(WORKFLOW_NAMES.notificationOutbox, {
    taskQueue: config.taskQueue,
    workflowId,
    args: [{ limit }],
  });
  return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
}

export interface OrchestrationHealth {
  ok: boolean;
  address: string;
  namespace: string;
  taskQueue: string;
  reworkEnabled: boolean;
  serverVersion?: string;
  error?: string;
}

export async function getOrchestrationHealth(): Promise<OrchestrationHealth> {
  const config = getOrchestrationConfig();
  let connection: Connection | undefined;
  try {
    connection = await withTimeout(Connection.connect(connectionOptions()), 3_000, "orchestration_connect");
    const info = await withTimeout(
      connection.workflowService.getSystemInfo({}),
      3_000,
      "orchestration_system_info",
    );
    return {
      ok: true,
      address: config.address,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      reworkEnabled: config.reworkEnabled,
      serverVersion: info.serverVersion,
    };
  } catch (error) {
    return {
      ok: false,
      address: config.address,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      reworkEnabled: config.reworkEnabled,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}
