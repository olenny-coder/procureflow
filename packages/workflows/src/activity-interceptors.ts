/**
 * Activity-side interceptor (Node runtime). It reads the actor/request context
 * from activity arguments and exposes it through AsyncLocalStorage so structured
 * logs and audit helpers automatically include actorId + requestId.
 */
import { Context as ActivityContext } from "@temporalio/activity";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  ActivityInterceptors,
  ActivityOutboundCallsInterceptor,
} from "@temporalio/worker";
import type { Next } from "@temporalio/common";
import { getActorContext, runWithActorContext, updateActorContext } from "./context";

function readField(source: unknown, field: string): string | undefined {
  if (source && typeof source === "object" && field in source) {
    const value = (source as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

class ActorContextInboundInterceptor implements ActivityInboundCallsInterceptor {
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    const first = input.args[0];
    const workflowId = ActivityContext.current().info.workflowExecution?.workflowId;
    const context = {
      actorId: readField(first, "actorId"),
      actorRole: readField(first, "actorRole"),
      requestId: readField(first, "requestId"),
      workflowId,
    };
    return runWithActorContext(context, () => next(input) as Promise<unknown>);
  }
}

class ActorContextOutboundInterceptor implements ActivityOutboundCallsInterceptor {
  getLogAttributes(
    input: Record<string, unknown>,
    next: Next<ActivityOutboundCallsInterceptor, "getLogAttributes">,
  ): Record<string, unknown> {
    const base = next(input);
    const context = getActorContext();
    return {
      ...base,
      ...(context.actorId ? { actorId: context.actorId } : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
    };
  }
}

export function createActivityInterceptors(): ActivityInterceptors {
  return {
    inbound: new ActorContextInboundInterceptor(),
    outbound: new ActorContextOutboundInterceptor(),
  };
}

/** Exported so long-running activities can enrich the context mid-execution. */
export function setActivityContext(patch: { requestId?: string; actorId?: string }): void {
  updateActorContext(patch);
}
