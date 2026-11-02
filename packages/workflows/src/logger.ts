import { getActorContext } from "./context";

type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}): void {
  const context = getActorContext();
  const payload: Fields = {
    level,
    time: new Date().toISOString(),
    msg,
    service: "procureflow-worker",
    ...(context.actorId ? { actorId: context.actorId } : {}),
    ...(context.actorRole ? { actorRole: context.actorRole } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.workflowId ? { workflowId: context.workflowId } : {}),
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
