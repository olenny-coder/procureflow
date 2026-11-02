import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowHandle } from "@temporalio/client";
import type {
  PurchaseRequestWorkflowState,
  Role,
} from "@procureflow/shared";

const WORKFLOWS_PATH = fileURLToPath(new URL("../src/workflows.ts", import.meta.url));

interface PlanStep {
  role: Role;
  dueInHours: number;
}

interface MockTask {
  taskId: string;
  stepOrder: number;
  role: Role;
  dueAt: string;
  status: string;
}

interface MockState {
  status: string;
  currentStep: number;
  revision: number;
  tasks: MockTask[];
  poNumber: string | null;
  decisionCount: number;
}

const SNAPSHOT = {
  requestId: "req-1",
  requesterId: "user-requester",
  requesterName: "Riley Requester",
  requesterEmail: "requester@example.com",
  department: "Engineering",
  title: "Test laptops",
  justification: "Two engineers need development laptops.",
  urgency: "NORMAL" as const,
  category: "IT_HARDWARE",
  vendorId: "vendor-1",
  vendorName: "Acme Cloud",
  vendorContactEmail: "sales@acme.example.com",
  vendorStatus: "APPROVED" as const,
  vendorRiskLevel: "LOW" as const,
  currency: "USD",
  totalAmountCents: 290_000,
  status: "SUBMITTED",
  revision: 1,
  items: [
    { description: "14-inch laptop", quantity: 2, unitPriceCents: 145_000, totalPriceCents: 290_000 },
  ],
};

function createHarness(plan: PlanStep[]) {
  const state: MockState = {
    status: "DRAFT",
    currentStep: 0,
    revision: 1,
    tasks: [],
    poNumber: null,
    decisionCount: 0,
  };
  const calls = {
    validate: 0,
    evaluate: 0,
    plan: 0,
    notifications: 0,
    escalate: 0,
    expire: 0,
    finalize: 0,
    po: 0,
    erp: 0,
    resubmit: 0,
    requesterNotifications: 0,
  };

  const activities = {
    async validateAndSubmitRequest() {
      calls.validate += 1;
      state.status = "SUBMITTED";
      return { snapshot: { ...SNAPSHOT, revision: state.revision }, replayed: false };
    },
    async evaluateRequestPolicy() {
      calls.evaluate += 1;
      const autoApprove = plan.length === 0;
      return {
        evaluation: {
          autoApprove,
          chain: plan.map((step, index) => ({
            stepOrder: index + 1,
            role: step.role,
            dueInHours: step.dueInHours,
            ruleIds: ["test-rule"],
            ruleNames: ["Test rule"],
          })),
          matchedRuleIds: ["test-rule"],
          matchedRuleNames: ["Test rule"],
          fallbackApplied: false,
          explanation: autoApprove ? "Auto-approve test" : "Approval chain test",
        },
        riskSummary: "Deterministic test risk summary",
        aiAdapter: "mock",
      };
    },
    async createApprovalPlan(input: { chain: PlanStep[] }) {
      calls.plan += 1;
      const now = Date.now();
      state.tasks = input.chain.map((step, index) => ({
        taskId: `task-${index + 1}`,
        stepOrder: index + 1,
        role: step.role,
        dueAt: new Date(now + step.dueInHours * 3_600_000).toISOString(),
        status: "PENDING",
      }));
      state.status = "IN_APPROVAL";
      state.currentStep = 1;
      return {
        tasks: state.tasks.map((task) => ({
          taskId: task.taskId,
          stepOrder: task.stepOrder,
          role: task.role,
          dueAt: task.dueAt,
        })),
        status: "IN_APPROVAL",
        currentStep: 1,
      };
    },
    async sendApprovalNotification() {
      calls.notifications += 1;
      return { outboxIds: [], recipients: 1, skipped: false };
    },
    async recordApprovalDecision(input: {
      taskId: string;
      action: string;
    }) {
      state.decisionCount += 1;
      const task = state.tasks.find((entry) => entry.taskId === input.taskId);
      if (!task) throw new Error(`Unknown task ${input.taskId}`);
      task.status =
        input.action === "APPROVE"
          ? "APPROVED"
          : input.action === "REJECT"
            ? "REJECTED"
            : "CHANGES_REQUESTED";

      if (input.action === "APPROVE") {
        const next = state.tasks.find((entry) => entry.stepOrder === task.stepOrder + 1);
        if (next) {
          state.currentStep = next.stepOrder;
          state.status = "IN_APPROVAL";
          return {
            status: "IN_APPROVAL",
            currentStep: next.stepOrder,
            taskStatus: "APPROVED",
            allApproved: false,
            nextTask: {
              taskId: next.taskId,
              stepOrder: next.stepOrder,
              role: next.role,
              dueAt: next.dueAt,
            },
          };
        }
        state.status = "APPROVED";
        return {
          status: "APPROVED",
          currentStep: task.stepOrder,
          taskStatus: "APPROVED",
          allApproved: true,
          nextTask: null,
        };
      }

      state.status = input.action === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
      return {
        status: state.status,
        currentStep: state.currentStep,
        taskStatus: task.status,
        allApproved: false,
        nextTask: null,
      };
    },
    async escalateApprovalTask() {
      calls.escalate += 1;
      const task = state.tasks[0]!;
      task.role = "ADMIN";
      task.dueAt = new Date(Date.now() + 3_600_000).toISOString();
      return {
        taskId: task.taskId,
        role: "ADMIN",
        dueAt: task.dueAt,
        escalationCount: 1,
        canEscalate: true,
      };
    },
    async expireApprovalTask() {
      calls.expire += 1;
      state.status = "REJECTED";
      return { status: "REJECTED" };
    },
    async finalizeApproval() {
      calls.finalize += 1;
      state.status = "APPROVED";
      return { status: "APPROVED" };
    },
    async issuePurchaseOrder() {
      calls.po += 1;
      state.poNumber = "PO-TEST-0001";
      state.status = "PO_ISSUED";
      return {
        poId: "po-1",
        poNumber: state.poNumber,
        status: "ISSUED",
        issuedAt: new Date().toISOString(),
        erpReference: null,
        amountCents: 290_000,
      };
    },
    async syncPurchaseOrderToErp() {
      calls.erp += 1;
      return { status: "SYNCED", erpReference: "CSV-PO-TEST-0001" };
    },
    async notifyRequester() {
      calls.requesterNotifications += 1;
      return { recipients: 1, skipped: false };
    },
    async notifyFinance() {
      return { recipients: 1, skipped: false };
    },
    async resubmitRequest() {
      calls.resubmit += 1;
      state.revision += 1;
      state.status = "SUBMITTED";
      state.currentStep = 0;
      return { status: "SUBMITTED", revision: state.revision };
    },
  };

  return { state, calls, activities };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(
  handle: WorkflowHandle,
  predicate: (state: PurchaseRequestWorkflowState) => boolean,
  timeoutMs = 20_000,
): Promise<PurchaseRequestWorkflowState> {
  const deadline = Date.now() + timeoutMs;
  let last: PurchaseRequestWorkflowState | null = null;
  while (Date.now() < deadline) {
    last = await handle.query<PurchaseRequestWorkflowState>("getState");
    if (predicate(last)) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for workflow state. Last: ${JSON.stringify(last)}`);
}

describe("PurchaseRequestWorkflow", () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createLocal();
  }, 180_000);

  afterAll(async () => {
    await env.teardown();
  });

  async function runScenario(
    plan: PlanStep[],
    scenario: (handle: WorkflowHandle, harness: ReturnType<typeof createHarness>) => Promise<void>,
  ): Promise<void> {
    const harness = createHarness(plan);
    const taskQueue = `procureflow-test-${Math.random().toString(36).slice(2)}`;
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: harness.activities,
    });

    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start("purchaseRequestWorkflow", {
        taskQueue,
        workflowId: `test-${Math.random().toString(36).slice(2)}`,
        args: [
          {
            requestId: "req-1",
            actorId: "user-requester",
            actorRole: "REQUESTER",
            reworkSearchAttributes: false,
          },
        ],
      });
      await scenario(handle, harness);
    });
  }

  it("runs manager + finance approval and issues a PO", async () => {
    await runScenario([{ role: "APPROVER", dueInHours: 24 }, { role: "FINANCE", dueInHours: 24 }], async (handle, harness) => {
      await waitForState(handle, (state) => state.pendingTask?.role === "APPROVER");
      await handle.signal("approve", {
        taskId: "task-1",
        actorId: "user-approver",
        actorRole: "APPROVER",
        comment: "Approved",
      });
      await waitForState(handle, (state) => state.pendingTask?.role === "FINANCE");
      await handle.signal("approve", {
        taskId: "task-2",
        actorId: "user-finance",
        actorRole: "FINANCE",
        comment: "Budget confirmed",
      });

      const result = await handle.result();
      expect(result).toMatchObject({ status: "PO_ISSUED", poNumber: "PO-TEST-0001" });
      expect(harness.calls.po).toBe(1);
      expect(harness.calls.erp).toBe(1);
      expect(harness.calls.finalize).toBe(1);
      expect(harness.state.status).toBe("PO_ISSUED");
    });
  });

  it("closes the request on rejection without issuing a PO", async () => {
    await runScenario([{ role: "APPROVER", dueInHours: 24 }, { role: "FINANCE", dueInHours: 24 }], async (handle, harness) => {
      await waitForState(handle, (state) => state.pendingTask?.role === "APPROVER");
      await handle.signal("reject", {
        taskId: "task-1",
        actorId: "user-approver",
        actorRole: "APPROVER",
        comment: "Not in this quarter's budget",
      });
      const result = await handle.result();
      expect(result.status).toBe("REJECTED");
      expect(harness.calls.po).toBe(0);
      expect(harness.state.status).toBe("REJECTED");
    });
  });

  it("supports changes requested and resubmission through a signal", async () => {
    await runScenario([{ role: "APPROVER", dueInHours: 24 }], async (handle, harness) => {
      await waitForState(handle, (state) => state.pendingTask?.role === "APPROVER");
      await handle.signal("requestChanges", {
        taskId: "task-1",
        actorId: "user-approver",
        actorRole: "APPROVER",
        comment: "Please add a vendor quote",
      });
      await waitForState(handle, (state) => state.status === "CHANGES_REQUESTED");
      await handle.signal("resubmit", {
        actorId: "user-requester",
        actorRole: "REQUESTER",
        comment: "Quote attached in the justification",
      });
      await waitForState(handle, (state) => state.pendingTask?.role === "APPROVER" && state.revision === 2);
      await handle.signal("approve", {
        taskId: "task-1",
        actorId: "user-approver",
        actorRole: "APPROVER",
        comment: "Looks good now",
      });
      const result = await handle.result();
      expect(result.status).toBe("PO_ISSUED");
      expect(harness.calls.resubmit).toBe(1);
      expect(harness.calls.po).toBe(1);
    });
  });

  it("escalates an overdue approval to admin, then completes", async () => {
    await runScenario([{ role: "APPROVER", dueInHours: 0.0005 }], async (handle, harness) => {
      await waitForState(handle, (state) => state.pendingTask?.role === "APPROVER");
      const escalated = await waitForState(
        handle,
        (state) => state.pendingTask?.role === "ADMIN",
        20_000,
      );
      expect(escalated.chain[0]?.escalationCount).toBe(1);
      expect(harness.calls.escalate).toBe(1);

      await handle.signal("approve", {
        taskId: "task-1",
        actorId: "user-admin",
        actorRole: "ADMIN",
        comment: "Approved after escalation",
      });
      const result = await handle.result();
      expect(result.status).toBe("PO_ISSUED");
    });
  });

  it("auto-approves and issues a PO when policy returns an empty chain", async () => {
    await runScenario([], async (handle, harness) => {
      const result = await handle.result();
      expect(result.status).toBe("PO_ISSUED");
      expect(harness.calls.plan).toBe(0);
      expect(harness.calls.po).toBe(1);
      expect(harness.calls.finalize).toBe(1);
    });
  });
});
