import { AsyncLocalStorage } from "node:async_hooks";

export interface ActorContext {
  actorId?: string;
  actorRole?: string;
  requestId?: string;
  workflowId?: string;
  correlationId?: string;
}

const storage = new AsyncLocalStorage<ActorContext>();

export function runWithActorContext<T>(context: ActorContext, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...context }, fn);
}

export function getActorContext(): ActorContext {
  return storage.getStore() ?? {};
}

export function updateActorContext(patch: Partial<ActorContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
}
