/**
 * Workflow-side interceptor module (runs inside the deterministic workflow
 * sandbox, so it may only import @temporalio/workflow and pure packages).
 *
 * It attaches the acting user / request context from workflow arguments and
 * signal payloads to every workflow log line. Registered through Worker
 * `interceptors.workflowModules` when PROCUREFLOW_AUDIT_INTERCEPTOR_ENABLED=true.
 */
import type {
  SignalInput,
  WorkflowExecuteInput,
  WorkflowInboundCallsInterceptor,
  WorkflowInterceptors,
  WorkflowOutboundCallsInterceptor,
} from "@temporalio/workflow";
import { log } from "@temporalio/workflow";
import type { Next } from "@temporalio/common";

interface WorkflowAuditContext {
  actorId?: string;
  actorRole?: string;
  requestId?: string;
}

function readField(source: unknown, field: string): string | undefined {
  if (source && typeof source === "object" && field in source) {
    const value = (source as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

class AuditWorkflowInboundInterceptor implements WorkflowInboundCallsInterceptor {
  constructor(private readonly context: WorkflowAuditContext) {}

  async execute(
    input: WorkflowExecuteInput,
    next: Next<WorkflowInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    const first = input.args[0];
    this.context.actorId = readField(first, "actorId");
    this.context.actorRole = readField(first, "actorRole");
    this.context.requestId = readField(first, "requestId");
    log.info("workflow_execute", {
      actorId: this.context.actorId ?? null,
      actorRole: this.context.actorRole ?? null,
      requestId: this.context.requestId ?? null,
    });
    return next(input);
  }

  async handleSignal(
    input: SignalInput,
    next: Next<WorkflowInboundCallsInterceptor, "handleSignal">,
  ): Promise<void> {
    const signal = input.args[0];
    const actorId = readField(signal, "actorId");
    const actorRole = readField(signal, "actorRole");
    if (actorId) this.context.actorId = actorId;
    if (actorRole) this.context.actorRole = actorRole;
    log.info("workflow_signal_received", {
      signal: input.signalName,
      actorId: actorId ?? null,
      actorRole: actorRole ?? this.context.actorRole ?? null,
      requestId: this.context.requestId ?? null,
    });
    await next(input);
  }
}

class AuditWorkflowOutboundInterceptor implements WorkflowOutboundCallsInterceptor {
  constructor(private readonly context: WorkflowAuditContext) {}

  getLogAttributes(
    input: Record<string, unknown>,
    next: Next<WorkflowOutboundCallsInterceptor, "getLogAttributes">,
  ): Record<string, unknown> {
    const base = next(input);
    return {
      ...base,
      ...(this.context.actorId ? { actorId: this.context.actorId } : {}),
      ...(this.context.actorRole ? { actorRole: this.context.actorRole } : {}),
      ...(this.context.requestId ? { requestId: this.context.requestId } : {}),
    };
  }
}

export function interceptors(): WorkflowInterceptors {
  const context: WorkflowAuditContext = {};
  return {
    inbound: [new AuditWorkflowInboundInterceptor(context)],
    outbound: [new AuditWorkflowOutboundInterceptor(context)],
  };
}
